# /exfor/check (brief 71, elpis-check, 2026-11-11): the EXFOR TRANS checker behind /elpis/checker.
#   POST /exfor/check?name=<file name>     the file in the body (text, or base64 from the gateway); the gateway caps it
#                                          near 6 MB
#   POST /exfor/check/upload               the write key's holder (the app's server) gets a presigned PUT to
#                                          lake/_work/exfor-check/<id> for a larger file ...
#   GET  /exfor/check?key=<id>&name=       ... and checks it from there (20 MB at most)
# Each answer: the checker's messages and summary (exfor_check_core.check), the rules the messages name, and `held`, the
# date of each entry the lake already holds (J4 entries, 2026-10-28), so the page can say a file revises a held entry.
# The checker is scripts/exfor-check/check.py (exfor_check_core.py links to it); its dictionaries are
# exfor_check_dicts.py, built by scripts/exfor-check/dicts.py. IAM: exfor_check-policy.json (inline nsr-api-exfor-check).
import base64, hmac, json, os, re, time, uuid

import exfor_check_core as core

BUCKET = os.environ.get("BUCKET", "nsr-lake-613473203863")
PREFIX = "lake/_work/exfor-check/"
MAX_KEY_BYTES = 20 * 1024 * 1024
_s3 = None


def s3():
    global _s3
    if _s3 is None:
        import boto3
        _s3 = boto3.client("s3")
    return _s3


def reply(status, body):
    return {"statusCode": status, "headers": {"content-type": "application/json", "cache-control": "no-store"},
            "body": json.dumps(body, separators=(",", ":"))}


def held(entries):
    """The lake's date for each accession number that it holds; {} when the lookup fails (the check still answers)."""
    accs = sorted({e["entry"] for e in entries if re.fullmatch(r"[0-9A-Z]{5}", e["entry"] or "")})[:500]
    if not accs:
        return {}
    try:
        import dataset
        rows = dataset.records(f"SELECT entry, date FROM read_parquet('{dataset.J4}/entries/*') WHERE entry IN "
                               f"({','.join('?' * len(accs))})", accs)
        return {r["entry"]: (str(r["date"]) if r.get("date") is not None else "") for r in rows}
    except Exception as e:  # noqa: BLE001
        print("held lookup failed:", e)
        return {}


def answer(data, name):
    t0 = time.time()
    res = core.check(data)
    res["name"] = (name or "file")[:120]
    res["held"] = held(res["entries"])
    res["summary"]["seconds_total"] = round(time.time() - t0, 3)
    return reply(200, res)


def handle(event):
    method = (event.get("requestContext", {}).get("http", {}).get("method") or event.get("httpMethod") or "GET").upper()
    path = (event.get("rawPath") or event.get("path") or "/").rstrip("/")
    q = event.get("queryStringParameters") or {}
    if path == "/exfor/check/upload" and method == "POST":
        want = os.environ.get("NSR_WRITE_KEY", "")
        headers = {k.lower(): v for k, v in (event.get("headers") or {}).items()}
        if not want or not hmac.compare_digest(headers.get("x-nsr-write-key", ""), want):
            return reply(403, {"error": "this route answers the app's server only"})
        key = str(uuid.uuid4())
        url = s3().generate_presigned_url("put_object", Params={"Bucket": BUCKET, "Key": PREFIX + key,
                                                                "ContentType": "application/octet-stream"}, ExpiresIn=600)
        return reply(200, {"key": key, "url": url})
    if path != "/exfor/check":
        return reply(404, {"error": "routes: POST /exfor/check, POST /exfor/check/upload, GET /exfor/check?key="})
    if method == "POST":
        raw = event.get("body") or ""
        data = base64.b64decode(raw) if event.get("isBase64Encoded") else raw.encode("latin-1", "replace")
        return answer(data, q.get("name"))
    if method == "GET" and q.get("key"):
        key = q["key"]
        if not re.fullmatch(r"[0-9a-f-]{36}", key):
            return reply(400, {"error": "key is the id the upload route gave"})
        try:
            head = s3().head_object(Bucket=BUCKET, Key=PREFIX + key)
        except Exception:  # noqa: BLE001
            return reply(404, {"error": "no uploaded file under that key"})
        if head["ContentLength"] > MAX_KEY_BYTES:
            return reply(413, {"error": f"the file is {head['ContentLength'] / 1e6:.1f} MB; I check files up to 20 MB"})
        data = s3().get_object(Bucket=BUCKET, Key=PREFIX + key)["Body"].read()
        return answer(data, q.get("name"))
    return reply(400, {"error": "POST the file to /exfor/check, or GET /exfor/check?key= after an upload"})
