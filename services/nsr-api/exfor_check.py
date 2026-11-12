# /exfor/check (brief 71, elpis-check, 2026-11-11): the EXFOR TRANS checker behind /elpis/checker.
#   POST /exfor/check?name=<file name>     the file in the body (text, or base64 from the gateway); the gateway caps it
#                                          near 6 MB
#   POST /exfor/check/upload               the write key's holder (the app's server) gets a presigned PUT to
#                                          lake/_work/exfor-check/<id> for a larger file ...
#   GET  /exfor/check?key=<id>&name=       ... and checks it from there (20 MB at most)
# Each answer (brief 77): JANIS's own checker's messages (janis_check: Lambda nsr-trans-check) and summary, and `held`, the
# date of each entry the lake already holds (J4 entries, 2026-10-28), so the page can say a file revises a held entry.
# Brief 71's own checker (scripts/exfor-check/check.py, exfor_check_core.py) is no longer called; its dictionaries are
# exfor_check_dicts.py, built by scripts/exfor-check/dicts.py. IAM: exfor_check-policy.json (inline nsr-api-exfor-check).
import base64, hmac, json, os, re, time, uuid



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


def janis_check(data, name):
    """Brief 77 step 12: JANIS's own TRANS checker (Lambda nsr-trans-check, NEA's janis-trans-checker.jar) on the file,
    through the lake: the file under lake/_work/exfor-check/janis/, a presigned GET for the Lambda, JANIS's XML log back.
    Its <warning> and <exception> (JANIS's errors) become the page's rows, with the entry and subentry the line sits in."""
    import xml.etree.ElementTree as ET
    import boto3
    key = PREFIX + "janis/" + str(uuid.uuid4())
    s3().put_object(Bucket=BUCKET, Key=key, Body=data)
    url = s3().generate_presigned_url("get_object", Params={"Bucket": BUCKET, "Key": key}, ExpiresIn=600)
    r = boto3.client("lambda").invoke(FunctionName="nsr-trans-check",
                                      Payload=json.dumps({"url": url, "name": name or "file"}).encode())
    out = json.loads(r["Payload"].read() or b"{}")
    if not out.get("log"):
        raise RuntimeError("JANIS's checker wrote no log: " + (out.get("stderr") or out.get("errorMessage") or "")[-400:])
    text = data.decode("latin-1", "replace").replace("\r", "").split("\n")
    # entry and subentry of each line, from the file's own ENTRY and SUBENT records
    at, entries, ent, sub = [], [], "", ""
    for i, line in enumerate(text, start=1):
        kw = line[:10].strip()
        if kw == "ENTRY":
            ent, sub = line[17:22].strip(), ""
            entries.append({"entry": ent, "line": i, "subentries": []})
        elif kw in ("SUBENT", "NOSUBENT"):
            s = line[11:22].strip()
            ent, sub = s[:5] or ent, s[5:8]
            if entries and sub:
                entries[-1]["subentries"].append(sub)
        at.append((ent, sub))
    root = ET.fromstring(out["log"].encode("latin-1", "replace"))
    messages = []
    for el in root:
        if el.tag not in ("warning", "exception"):
            continue
        pos = el.find("position")
        line = int(pos.get("line")) if pos is not None and pos.get("line") else 0
        e, s = at[line - 1] if 0 < line <= len(at) else ("", "")
        messages.append({"line": line, "entry": e, "subent": s, "severity": "error" if el.tag == "exception" else "warning",
                         "rule": "", "code": "" if el.get("msg2") in (None, "null") else el.get("msg2"), "message": el.get("msg1") or ""})
    errors = sum(m["severity"] == "error" for m in messages)
    return {"messages": messages, "entries": entries, "rules": {}, "log": out["log"],
            "dictionary": "JANIS 4.1 TRANS Checker",
            "summary": {"entries": len(entries), "subentries": sum(len(x["subentries"]) for x in entries), "errors": errors,
                        "warnings": len(messages) - errors, "lines": len(text), "bytes": len(data), "seconds": out.get("seconds")}}


def answer(data, name):
    t0 = time.time()
    try:
        res = janis_check(data, name)
    except Exception as e:  # noqa: BLE001
        return reply(502, {"error": f"JANIS's checker failed: {e}"})
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
