"""Brief 70: Files 4-15 of a release through the Lambda nsr-endf-parse (brief 64), driven from the fill box so the Mac
makes no calls: fanout split, wait for every part's index, fanout parse, wait for every material's summary (one
"missing" retry when it stalls), collect. One release after another; a line per stage in /data/mf415.log and
lake/_work/fill/mf415/<release>.json. The caller reserves the function's concurrency before and releases it after.

  python mf415.py <release> [<release>…] [--sub=neutrons]   # --sub: parse only that sublibrary's materials now
"""
import json
import sys
import time

import boto3
from botocore.config import Config

BUCKET = "nsr-lake-613473203863"
FN = "nsr-endf-parse"
s3 = boto3.client("s3", region_name="us-east-2")
lam = boto3.client("lambda", region_name="us-east-2", config=Config(read_timeout=900, connect_timeout=30, retries={"max_attempts": 0}))
SUB = next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--sub=")), None)


def log(*a):
    line = time.strftime("%Y-%m-%dT%H:%M:%SZ ", time.gmtime()) + " ".join(str(x) for x in a)
    print(line, flush=True)
    with open("/data/mf415.log", "a") as f:
        f.write(line + "\n")


def invoke(ev):
    r = lam.invoke(FunctionName=FN, InvocationType="RequestResponse", Payload=json.dumps(ev).encode())
    body = json.loads(r["Payload"].read() or b"null")
    if r.get("FunctionError"):
        raise RuntimeError(f"{ev['job']}: {str(body)[:400]}")
    return body


def keys(prefix):
    out = []
    for page in s3.get_paginator("list_objects_v2").paginate(Bucket=BUCKET, Prefix=prefix):
        out += [o["Key"] for o in page.get("Contents", [])]
    return out


def done_ids(release):
    return {k.rsplit("/", 1)[-1].rsplit(".json", 1)[0].split(".c")[0] for k in keys(f"lake/endfb/{release}/mf4_15/sections/")}


def wait(what, have, want, minutes, poll=20, stall=None):
    t0, last, last_t = time.time(), -1, time.time()
    while time.time() - t0 < minutes * 60:
        n = have()
        if n >= want:
            return n
        if n != last:
            last, last_t = n, time.time()
        elif stall and time.time() - last_t > stall:
            return n  # stalled
        time.sleep(poll)
    return have()


def split_ids(release, sub):
    """The materials in the split indexes (of one sublibrary when sub is given)."""
    ids = set()
    for k in keys(f"lake/_work/endf-split/{release}/_index/"):
        idx = json.loads(s3.get_object(Bucket=BUCKET, Key=k)["Body"].read())
        ids |= {r["id"] for r in idx.get("runs", []) if not sub or r.get("sublibrary") == sub}
    return sorted(ids)


def run(release):
    rec = {"release": release, "sub": SUB, "started": time.strftime("%FT%TZ", time.gmtime())}
    t0 = time.time()
    if not keys(f"lake/_work/endf-split/{release}/_index/"):
        out = invoke({"job": "fanout", "release": release, "stage": "split"})
        rec["split"] = out
        log(release, "split invoked", out)
        n = wait("split", lambda: len(keys(f"lake/_work/endf-split/{release}/_index/")), out["parts"], 30)
        log(release, "split indexes", n, "of", out["parts"])
    ev = {"job": "fanout", "release": release, "stage": "parse"}
    if SUB:
        ev["ids"] = split_ids(release, SUB)
        if not ev["ids"]:
            log(release, "no", SUB, "materials with Files 4-15")
            return
    out = invoke(ev)
    rec["parse"] = {k: v for k, v in out.items() if k != "longest"}
    want = out["materials"]
    log(release, "parse invoked", rec["parse"])
    mine = set(ev.get("ids", []))
    count = (lambda: len(done_ids(release) & mine)) if mine else (lambda: len(done_ids(release)))
    if want:
        n = wait("parse", count, want, 40, stall=240)
        if n < want:
            log(release, "parse stalled at", n, "of", want, "- missing retry")
            out2 = invoke({**ev, "missing": True})
            log(release, "missing invoked", {k: v for k, v in out2.items() if k != "longest"})
            n = wait("parse", count, want, 30, stall=300)
        log(release, "summaries", n, "of", want)
        rec["summaries"] = n
    if not SUB:  # collect once the whole release is parsed
        out = invoke({"job": "collect", "release": release})
        rec["collect"] = out if len(json.dumps(out)) < 20000 else {"note": "large"}
        log(release, "collected", json.dumps(out)[:600])
    rec["minutes"] = round((time.time() - t0) / 60, 1)
    s3.put_object(Bucket=BUCKET, Key=f"lake/_work/fill/mf415/{release}{'-' + SUB if SUB else ''}.json", Body=json.dumps(rec).encode())


if __name__ == "__main__":
    for r in [a for a in sys.argv[1:] if not a.startswith("--")]:
        try:
            run(r)
        except Exception as e:  # noqa: BLE001
            log(r, "FAILED", str(e)[:500])
