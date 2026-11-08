# Pull the list from scripts/nndc/list.py into the NSR lake through Lambda nsr-fetch (services/nsr-fetch/), so the
# bytes go NNDC → AWS → S3 and never through the Mac. Steps:
#   1. HEAD every URL: size and status. Dead links (not 200) and the same file at a second URL (same name and
#      size) are set aside with the reason.
#   2. Files up to 2 GB go in batches, ~300 MB or 40 files per invocation, 24 invocations at a time.
#   3. Bigger files: this script opens a multipart upload, Lambdas fill 16 parts of 64 MB each in parallel
#      (parts mode), and this script completes it.
#   4. Errors are retried once through the proxy army (scripts/proxy/proxies.sh lines that answer NNDC).
#   5. manifest.json beside the files: every item with its status, bytes and sha256, the skips and dead links.
#   python3 -I scripts/nndc/pull.py <workdir> <lake-prefix>      # e.g. raw/nndc/2026-11-07; rerun skips done keys
import json, os, subprocess, sys, tempfile, time, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

os.chdir(sys.argv[1])
PREFIX = sys.argv[2].rstrip("/")
BUCKET = "nsr-lake-613473203863"
AWS = ["--profile", "nysgpt-new", "--region", "us-east-2"]
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
PART, BIG, PARTS_PER_CALL = 64 * 1024 * 1024, 2 * 1024 ** 3, 16
PROXY_LINES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 12, 13]  # lines that answered NNDC on 2026-11-07
log = open("pull.log", "a")


def say(*a):
    m = time.strftime("%H:%M:%S ") + " ".join(str(x) for x in a)
    print(m, flush=True); log.write(m + "\n"); log.flush()


def head(it):
    try:
        r = urllib.request.urlopen(urllib.request.Request(it["url"], method="HEAD", headers={"User-Agent": UA}), timeout=60)
        it["size"], it["http"] = int(r.headers.get("Content-Length") or -1), r.status
    except Exception as e:
        it["size"], it["http"] = -1, getattr(e, "code", str(e)[:120])
    return it


def invoke(payload):
    with tempfile.NamedTemporaryFile("w+", suffix=".json", delete=False) as out:
        pass
    p = subprocess.run(["aws", "lambda", "invoke", "--function-name", "nsr-fetch", *AWS, "--cli-binary-format", "raw-in-base64-out",
                        "--cli-read-timeout", "0", "--payload", json.dumps(payload), out.name],
                       capture_output=True, text=True)
    body = open(out.name).read(); os.unlink(out.name)
    if p.returncode != 0 or '"errorMessage"' in body[:200]:
        raise RuntimeError((p.stderr or body)[:300])
    return json.loads(body)


def s3api(*args):
    p = subprocess.run(["aws", "s3api", *args, *AWS, "--output", "json"], capture_output=True, text=True)
    if p.returncode != 0:
        raise RuntimeError(p.stderr[:300])
    return json.loads(p.stdout) if p.stdout.strip() else {}


def big_file(it, proxy=None):
    try:
        have = s3api("head-object", "--bucket", BUCKET, "--key", it["key"]).get("ContentLength")
        if have == it["size"]:
            return {"url": it["url"], "key": it["key"], "status": "skipped", "bytes": have}
    except RuntimeError:
        pass
    up = s3api("create-multipart-upload", "--bucket", BUCKET, "--key", it["key"], "--storage-class", "INTELLIGENT_TIERING",
               "--metadata", json.dumps({"source-url": it["url"][:1800]}))["UploadId"]
    size = it["size"]
    ranges = [[i + 1, o, min(o + PART, size) - 1] for i, o in enumerate(range(0, size, PART))]
    chunks = [ranges[i:i + PARTS_PER_CALL] for i in range(0, len(ranges), PARTS_PER_CALL)]
    parts = []
    try:
        with ThreadPoolExecutor(12) as ex:
            for r in ex.map(lambda c: invoke({"parts": {"url": it["url"], "key": it["key"], "upload_id": up, "ranges": c, "proxy": proxy}}), chunks):
                parts += r
        s3api("complete-multipart-upload", "--bucket", BUCKET, "--key", it["key"], "--upload-id", up,
              "--multipart-upload", json.dumps({"Parts": sorted(parts, key=lambda p: p["PartNumber"])}))
    except Exception as e:
        s3api("abort-multipart-upload", "--bucket", BUCKET, "--key", it["key"], "--upload-id", up)
        return {"url": it["url"], "key": it["key"], "status": "error", "error": str(e)[:300]}
    return {"url": it["url"], "key": it["key"], "status": "done", "bytes": size, "multipart": len(ranges)}


def batches(items):
    b, n = [], 0
    for it in items:
        if b and (n + max(it["size"], 0) > 300 * 1024 ** 2 or len(b) >= 40):
            yield b; b, n = [], 0
        b.append(it); n += max(it["size"], 0)
    if b:
        yield b


def run_small(items, proxy_round=False):
    out = []
    jobs = list(batches(items))
    with ThreadPoolExecutor(24) as ex:
        futs = {}
        for i, b in enumerate(jobs):
            payload = {"items": [{"url": x["url"], "key": x["key"], **({"proxy": PROXY_LINES[(i + j) % len(PROXY_LINES)]} if proxy_round else {})}
                                 for j, x in enumerate(b)]}
            futs[ex.submit(invoke, payload)] = b
        for k, f in enumerate(as_completed(futs)):
            try:
                out += f.result()
            except Exception as e:
                out += [{"url": x["url"], "key": x["key"], "status": "error", "error": str(e)[:300]} for x in futs[f]]
            if k % 10 == 0:
                say(f"batches {k + 1}/{len(jobs)}, results {len(out)}")
    return out


items = [json.loads(l) for l in open("list.jsonl")]
skipped = [json.loads(l) for l in open("skipped.jsonl")]
say(f"HEAD {len(items)} urls")
with ThreadPoolExecutor(12) as ex:
    items = list(ex.map(head, items))
dead = [i for i in items if i["http"] != 200]
live, seen = [], {}
for it in items:
    if it["http"] != 200:
        continue
    k = (it["url"].rsplit("/", 1)[-1], it["size"])
    if it["size"] > 1024 ** 2 and k in seen:
        skipped.append({"url": it["url"], "reason": "same file as " + seen[k]})
        continue
    seen[k] = it["url"]; live.append(it)
say(f"live {len(live)} ({sum(max(i['size'], 0) for i in live) / 1e9:.2f} GB), dead {len(dead)}, skipped {len(skipped)}")

small = [i for i in live if i["size"] <= BIG]
large = sorted([i for i in live if i["size"] > BIG], key=lambda i: -i["size"])
results = run_small(small)
for it in large:
    say(f"big {it['size'] / 1e9:.2f} GB {it['url']}")
    results.append(big_file(it))
errs = [r for r in results if r["status"] == "error"]
if errs:
    say(f"{len(errs)} errors; retrying through the proxy army")
    byurl = {i["url"]: i for i in live}
    retry = [byurl[r["url"]] for r in errs]
    keep = [r for r in results if r["status"] != "error"]
    again = run_small([i for i in retry if i["size"] <= BIG], proxy_round=True)
    again += [big_file(i, proxy=PROXY_LINES[n % len(PROXY_LINES)]) for n, i in enumerate(x for x in retry if x["size"] > BIG)]
    for r in again:
        r["via"] = "proxy"
    results = keep + again

sizes = {i["url"]: i for i in live}
manifest = {
    "source": "https://www.nndc.bnl.gov/", "pulled": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "prefix": PREFIX,
    "how": "scripts/nndc/crawl.py, list.py, pull.py in github.com/nyd-user-1/nsrgpt; Lambda nsr-fetch (us-east-2)",
    "counts": {s: sum(1 for r in results if r["status"] == s) for s in ("done", "skipped", "error")},
    "bytes": sum(r.get("bytes") or 0 for r in results if r["status"] in ("done", "skipped")),
    "files": sorted(({**r, "group": sizes[r["url"]]["group"]} for r in results), key=lambda r: r["key"]),
    "not_taken": skipped,
    "dead_links": [{"url": d["url"], "http": d["http"]} for d in dead],
}
json.dump(manifest, open("manifest.json", "w"), indent=1)
subprocess.run(["aws", "s3", "cp", "manifest.json", f"s3://{BUCKET}/{PREFIX}/manifest.json", *AWS, "--only-show-errors"], check=True)
say("manifest", manifest["counts"], f"{manifest['bytes'] / 1e9:.2f} GB")
