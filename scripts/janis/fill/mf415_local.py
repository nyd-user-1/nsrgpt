"""Brief 73: Files 4-15 of a release on a box instead of the Lambda (TENDL is about 5 billion lines; through the Lambda
that would cost about $20 against the lanes' $3). The same code: services/nsr-endf-parse/lambda_function.py, imported,
its split, parse and collect jobs called in-process. Only the split text moves: the Lambda keeps it in
lake/_work/endf-split/<R>/, here it stays on the box's disk (/data/split/), so the box needs no write right there and
nothing is left in S3 to clean. Every other output is the Lambda's own, in the same keys: lake/endfb/<R>/<table>/<id>.parquet,
lake/endfb/<R>/mf4_15/sections/<id>.json, then collect registers the tables and writes the manifest's "mf4_15".

  python mf415_local.py <release> [--procs=2] [--cpp] [--as=<name>] [--limit=N] [--no-collect]
  --cpp: endf-parserpy's C++ parser (EndfParserCpp, same API) in place of EndfParserPy, for speed; --as: write the
  rows under another release name from the same split (an equivalence test against the Python parser's rows);
  --limit: the first N materials, longest first.
A material whose summary exists is skipped, so a killed run picks up where it stopped. One line per stage in
/data/mf415-local.log.
"""
import io
import json
import multiprocessing as mp
import os
import sys
import time

sys.path.insert(0, os.environ.get("NSR_ENDF_PARSE", "/opt/a73/services/nsr-endf-parse"))
os.environ.setdefault("AWS_LAMBDA_FUNCTION_NAME", "nsr-endf-parse")
import lambda_function as L  # noqa: E402

ROOT = "/data/split"
SPLIT = "lake/_work/endf-split/"


class Body(io.BytesIO):
    def read(self, *a):  # noqa: D401  boto3's StreamingBody.read()
        return super().read(*a)


class Paginator:
    def __init__(self, real, outer):
        self.real, self.outer = real, outer

    def paginate(self, Bucket, Prefix):  # noqa: N803
        if not Prefix.startswith(SPLIT):
            yield from self.real.paginate(Bucket=Bucket, Prefix=Prefix)
            return
        base = os.path.join(ROOT, Prefix)
        d = base if os.path.isdir(base) else os.path.dirname(base)
        out = []
        for dirpath, _, files in os.walk(d):
            for f in files:
                p = os.path.join(dirpath, f)
                k = os.path.relpath(p, ROOT)
                if k.startswith(Prefix):
                    out.append({"Key": k, "Size": os.path.getsize(p)})
        yield {"Contents": sorted(out, key=lambda o: o["Key"])}


class LocalSplit:
    """boto3's S3 client, with keys under lake/_work/endf-split/ kept on the box's disk."""

    def __init__(self, real):
        self.real = real

    def __getattr__(self, name):
        return getattr(self.real, name)

    def put_object(self, Bucket, Key, Body, **kw):  # noqa: N803
        if not Key.startswith(SPLIT):
            return self.real.put_object(Bucket=Bucket, Key=Key, Body=Body, **kw)
        p = os.path.join(ROOT, Key)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "wb") as f:
            f.write(Body if isinstance(Body, (bytes, bytearray)) else Body.encode())
        return {}

    def get_object(self, Bucket, Key, **kw):  # noqa: N803
        if not Key.startswith(SPLIT):
            return self.real.get_object(Bucket=Bucket, Key=Key, **kw)
        with open(os.path.join(ROOT, Key), "rb") as f:
            return {"Body": Body(f.read())}

    def get_paginator(self, name):
        return Paginator(self.real.get_paginator(name), self)


L.s3 = LocalSplit(L.s3)
CPP = "--cpp" in sys.argv
if CPP:
    from endf_parserpy import EndfParserCpp  # noqa: E402
    L.EndfParserPy = lambda **kw: EndfParserCpp(**kw)  # read_section makes a fresh parser after a failure
    L.PARSER = EndfParserCpp(array_type="list")


def fresh():
    """Each worker process its own S3 client (boto3 clients are not shared across fork)."""
    import boto3
    from botocore.config import Config
    L.s3 = LocalSplit(boto3.client("s3", region_name=L.REGION, config=Config(max_pool_connections=64, retries={"max_attempts": 10})))


def log(*a):
    line = time.strftime("%Y-%m-%dT%H:%M:%SZ ", time.gmtime()) + " ".join(str(x) for x in a)
    print(line, flush=True)
    with open("/data/mf415-local.log", "a") as f:
        f.write(line + "\n")


def do_split(args):
    release, part = args
    return L.split({"job": "split", "release": release, "part": part})


def do_parse(ev):
    try:
        r = L.parse(ev)  # (--as: the split is read under the source name and the rows written under the other)
        return ev["id"], r.get("lines"), r.get("rejects"), None
    except Exception as e:  # noqa: BLE001
        return ev["id"], 0, 0, f"{type(e).__name__}: {str(e)[:300]}"


def main():
    release = sys.argv[1]
    procs = int(next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--procs=")), "2"))
    t0 = time.time()
    parts = [k.rsplit("/", 1)[-1] for k, _ in L.list_keys(f"lake/endfb/{release}/records/") if k.endswith(".parquet")]
    have = {k.rsplit("/", 1)[-1].replace(".json", ".parquet") for k, _ in L.list_keys(f"{SPLIT}{release}/_index/")}
    todo = [p for p in parts if p not in have]
    log(release, "split", len(todo), "of", len(parts), "records parts")
    with mp.Pool(procs, initializer=fresh) as pool:
        for r in pool.imap_unordered(do_split, [(release, p) for p in todo]):
            log(release, "split part", r.get("part"), r.get("materials"), "materials", r.get("lines_kept"), "lines", r.get("seconds"), "s")
    mats, _ = L.split_index(release)
    AS = next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--as=")), None)
    LIMIT = int(next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--limit=")), "0"))
    target = AS or release
    if AS and not os.path.exists(os.path.join(ROOT, SPLIT, AS)):  # the split read under the other name
        os.symlink(os.path.join(ROOT, SPLIT, release), os.path.join(ROOT, SPLIT, AS))
    done = {k.rsplit("/", 1)[-1].rsplit(".json", 1)[0].split(".c")[0] for k, _ in L.list_keys(f"lake/endfb/{target}/mf4_15/sections/")}
    evs = [{"job": "parse", "release": target, "id": m["id"], "file_name": m["file_name"], "sublibrary": m["sublibrary"],
            "mat": m["mat"]} for m in sorted(mats.values(), key=lambda m: -m["lines"]) if m["id"] not in done]
    if LIMIT:
        evs = evs[:LIMIT]
    total = sum(m["lines"] for m in mats.values())
    log(release, "parse", len(evs), "of", len(mats), "materials,", total, "lines in all")
    n, lines, errors, t1 = 0, 0, [], time.time()
    with mp.Pool(procs, initializer=fresh, maxtasksperchild=50) as pool:
        for mid, nl, rej, err in pool.imap_unordered(do_parse, evs):
            n += 1
            lines += nl or 0
            if err:
                errors.append((mid, err))
            if n % 100 == 0 or n == len(evs):
                log(release, "parsed", n, "of", len(evs), lines, "lines", round(lines / max(1, time.time() - t1)), "lines/s", len(errors), "errors")
    if errors:
        log(release, "errors", json.dumps(errors[:20]))
        L.put_json(f"lake/_work/fill/mf415/{release}-local-errors.json", errors)
    if "--no-collect" in sys.argv or AS:
        log(release, "no collect", "parsed", n, "as", target)
        return
    out = L.collect({"job": "collect", "release": release})
    log(release, "collected", json.dumps(out)[:600])
    L.put_json(f"lake/_work/fill/mf415/{release}-local.json", {"release": release, "materials": len(mats), "parsed": n,
               "errors": len(errors), "lines": total, "minutes": round((time.time() - t0) / 60, 1), "procs": procs})


if __name__ == "__main__":
    main()
