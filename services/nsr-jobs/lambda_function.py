# nsr-jobs: the job runner (brief 51). Lambda (Python 3.12) behind nsr-api's API Gateway HTTP API and CloudFront, routes
# /jobs and /jobs/{proxy+}. A job is a row in DynamoDB nsrgpt-jobs; the work runs on EC2 nsr-jobs-1, which this Lambda
# starts when it is stopped and which stops itself after 30 idle minutes.
#   POST /jobs                       {kind: "broaden", params: {release, name | mat, sub, mt, temps_k}} -> 202 {id, status}
#                                    {kind: "gnds", params: {release, name | mat, sub}} (brief 60): the material compiled
#                                    from ENDF-6 to GNDS 2.0 by LLNL FUDGE; when lake/gnds/ already holds it (the
#                                    precompiled set, lake/gnds/<release>/index.json) the answer is 200 {precompiled:
#                                    true, url, cov_url, ...} and no job runs; or {kind: "gnds", params: {file_key}}: an
#                                    uploaded ENDF-6 file (files/pdfs/workspace/<yyyy-mm>/<name>, up to 50 MB)
#                                    x-nsr-write-key must match NSR_WRITE_KEY (as /community); the app proxies it. A
#                                    queued, running or done job of the same kind, release, material, sub and mt whose
#                                    temps_k include every requested one is returned instead (200, reused: true);
#                                    {fresh: true} in the body runs it again
#   GET  /jobs/{id}                  the row; when done, result_url and one url per temperature
#   GET  /jobs/{id}/result           lake/jobs/<id>/result.json
#   GET  /jobs/{id}/result?temp_k=300&emin=9e3&emax=1.8e4   one temperature's series, cut to the window (eV)
#   GET  /jobs?status=done           the newest 50 rows with that status (default: every status), newest first
# On POST the row is written queued and this Lambda invokes itself asynchronously ({"start": id}); that call starts the
# box if needed, waits for SSM, sends "/opt/jobs/run.sh <id>" and returns without waiting for the job (run.sh and
# broaden.py on the box mark the row running, then done or failed).
import base64
import bisect
import datetime
import hmac
import json
import os
import re
import secrets
import time

import boto3

REGION, BUCKET, TABLE = "us-east-2", "nsr-lake-613473203863", "nsrgpt-jobs"
BOX = os.environ.get("JOB_BOX", "")
CDN = os.environ.get("CDN", "https://daw1qggkn69lv.cloudfront.net")
KINDS = {"broaden", "gnds"}
RELEASES = ["B-VIII.1", "B-VIII.0", "B-VII.1", "B-VII.0", "B-VI.8", "JEFF-3.3", "JENDL-5", "TENDL-2023", "CENDL-3.2"]
GNDS_RELEASES = RELEASES + ["B-V", "B-IV", "B-III", "B-II"]  # every ENDF-6 release in the lake (brief 60)
UPLOAD = re.compile(r"files/pdfs/workspace/\d{4}-\d{2}/[^/\\]{1,200}")
_index = {}
STATUSES = ("queued", "running", "done", "failed")
db = boto3.client("dynamodb", region_name=REGION)
_clients = {}


def client(name):
    if name not in _clients:
        _clients[name] = boto3.client(name, region_name=REGION)
    return _clients[name]


def now():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def reply(status, body, cache=False):
    return {"statusCode": status, "body": json.dumps(body, separators=(",", ":")),
            "headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*",
                        "Cache-Control": "public, max-age=3600" if cache and status == 200 else "no-store"}}


def row_of(item):
    out = {k: v.get("S") for k, v in item.items()}
    for k in ("params", "timings", "summary"):
        if out.get(k):
            out[k] = json.loads(out[k])
    if out.get("status") == "done":
        base = f"{CDN}/jobs/{out['id']}/result"
        out["result_url"] = base
        if out.get("kind") == "gnds":
            s = out.get("summary") or {}
            out.update(url=s.get("url"), cov_url=s.get("cov_url"))
            return out
        out["result_urls"] = {f"{s['temp_k']:g}": f"{base}?temp_k={s['temp_k']:g}"
                              for s in (out.get("summary") or {}).get("series", [])}
    return out


def set_fields(jid, **kw):
    names, vals, sets = {}, {}, []
    for i, (k, v) in enumerate(kw.items()):
        names[f"#k{i}"], vals[f":v{i}"] = k, {"S": v if isinstance(v, str) else json.dumps(v)}
        sets.append(f"#k{i} = :v{i}")
    db.update_item(TableName=TABLE, Key={"id": {"S": jid}}, UpdateExpression="SET " + ", ".join(sets),
                   ExpressionAttributeNames=names, ExpressionAttributeValues=vals)


def material_name(s):  # copied from services/nsr-api/structure.py
    t = re.sub(r"[\s_]", "", s or "")
    m = re.fullmatch(r"([A-Za-z]{1,2})-?(\d{1,3}|nat)(m\d?)?", t, re.I) or None
    if m:
        sym, a, iso = m.group(1), m.group(2), m.group(3) or ""
    else:
        m = re.fullmatch(r"(\d{1,3})(m\d?)?-?([A-Za-z]{1,2})", t, re.I)
        if not m:
            return s.strip()
        a, iso, sym = m.group(1), m.group(2) or "", m.group(3)
    a = "nat" if a.lower() == "nat" or a == "0" else str(int(a))
    return f"{sym[0].upper()}{sym[1:].lower()}-{a}{iso.lower()}"


def check_gnds(p):
    if p.get("file_key"):  # an uploaded ENDF-6 file (services/nsr-api/community.py /files), compiled as uploaded
        key = str(p["file_key"])
        if not UPLOAD.fullmatch(key) or ".." in key:
            raise ValueError("params.file_key is an upload's key: files/pdfs/workspace/<yyyy-mm>/<name>")
        try:
            h = client("s3").head_object(Bucket=BUCKET, Key=key)
        except Exception:  # noqa: BLE001
            h = None
        if not h:
            raise ValueError(f"no upload at {key}")
        if h["ContentLength"] > 50 * 1024 * 1024:
            raise ValueError("an upload compiles up to 50 MB")
        # the ETag keeps a re-upload under the same key from reusing the earlier job
        return {"file_key": key, "etag": h["ETag"].strip('"'), "bytes": h["ContentLength"]}
    if p.get("release") not in GNDS_RELEASES:
        raise ValueError(f"params.release is one of {', '.join(GNDS_RELEASES)}")
    if not (p.get("name") or p.get("mat")):
        raise ValueError("params.name (U-235) or params.mat (9228) is required")
    out = {"release": p["release"], "sub": (p.get("sub") or "neutrons").strip().lower()}
    if p.get("name"):
        out["name"] = material_name(str(p["name"])[:40])
    if p.get("mat"):
        out["mat"] = int(p["mat"])
    return out


def precompiled(params):
    """The material's row in lake/gnds/<release>/index.json (scripts/gnds/compile.py --manifest), if any."""
    rel = params["release"]
    if rel not in _index:
        try:
            doc = json.loads(client("s3").get_object(Bucket=BUCKET, Key=f"lake/gnds/{rel}/index.json")["Body"].read())
            _index[rel] = doc.get("files", [])
        except Exception:  # noqa: BLE001  (not compiled yet)
            return None
    want = (params.get("name") or "").upper()
    for r in _index[rel]:
        if r["sublibrary"] == params["sub"] and ((params.get("mat") and r["mat"] == params["mat"]) or
                                                 (want and r["name"].upper() == want)):
            return {**r, "release": rel, "url": f"{CDN}/{r['key']}",
                    "cov_url": f"{CDN}/{r['cov_key']}" if r.get("cov_key") else None}
    return None

def check(body):
    kind = body.get("kind")
    if kind not in KINDS:
        raise ValueError(f"kind is one of {', '.join(sorted(KINDS))}")
    p = body.get("params") or {}
    if kind == "gnds":
        return kind, check_gnds(p)
    if p.get("release") not in RELEASES:
        raise ValueError(f"params.release is one of {', '.join(RELEASES)}")
    if not (p.get("name") or p.get("mat")):
        raise ValueError("params.name (U-235) or params.mat (9228) is required")
    try:
        mt = int(p.get("mt"))
        temps = [float(t) for t in (p.get("temps_k") or [300])]
    except (TypeError, ValueError):
        raise ValueError("params.mt is a whole number and params.temps_k a list of kelvin temperatures")
    if not temps or len(temps) > 4 or any(not 0 < t <= 5000 for t in temps):
        raise ValueError("params.temps_k holds one to four temperatures above 0 and up to 5000 K")
    out = {"release": p["release"], "sub": (p.get("sub") or "neutrons").strip().lower(), "mt": mt, "temps_k": temps}
    if p.get("name"):
        out["name"] = str(p["name"])[:40]
    if p.get("mat"):
        out["mat"] = int(p["mat"])
    return kind, out


def covers(have, want):
    """have serves want: the same job but for temps_k, and have's temperatures include all of want's."""
    strip = lambda p: {k: v for k, v in p.items() if k != "temps_k"}  # noqa: E731
    return strip(have) == strip(want) and set(want.get("temps_k") or []) <= set(have.get("temps_k") or [])


def existing(kind, params):
    """The newest queued, running or done job that covers this kind and these params, if any."""
    for s in ("running", "queued", "done"):
        r = db.query(TableName=TABLE, IndexName="status-created_at", KeyConditionExpression="#s = :s",
                     ExpressionAttributeNames={"#s": "status"}, ExpressionAttributeValues={":s": {"S": s}},
                     ScanIndexForward=False, Limit=200)
        for it in r.get("Items", []):
            if it.get("kind", {}).get("S") == kind and covers(json.loads(it.get("params", {}).get("S") or "{}"), params):
                return it
    return None


def submit(body, context):
    kind, params = check(body)
    if kind == "gnds" and "release" in params and not body.get("fresh"):
        pre = precompiled(params)
        if pre:
            return reply(200, {"precompiled": True, "status": "done", "kind": kind, "params": params, **pre})
    if not body.get("fresh"):
        it = existing(kind, params)
        if it:
            return reply(200, {**row_of(it), "reused": True})
    jid = "j" + datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d%H%M%S") + secrets.token_hex(3)
    created = now()
    db.put_item(TableName=TABLE, Item={"id": {"S": jid}, "kind": {"S": kind}, "params": {"S": json.dumps(params)},
                                       "status": {"S": "queued"}, "created_at": {"S": created},
                                       "owner": {"S": "write-key"}})
    client("lambda").invoke(FunctionName=context.function_name, InvocationType="Event",
                            Payload=json.dumps({"start": jid, "kind": kind}).encode())
    return reply(202, {"id": jid, "status": "queued", "created_at": created, "kind": kind, "params": params})


def start(jid, kind="broaden"):
    """Start the box if it is stopped, wait until SSM sees it, send the job. Runs in the asynchronous invocation."""
    ec2, ssm = client("ec2"), client("ssm")
    try:
        t = time.time()
        state = ec2.describe_instances(InstanceIds=[BOX])["Reservations"][0]["Instances"][0]["State"]["Name"]
        if state == "stopping":
            ec2.get_waiter("instance_stopped").wait(InstanceIds=[BOX], WaiterConfig={"Delay": 5, "MaxAttempts": 60})
            state = "stopped"
        if state == "stopped":
            ec2.start_instances(InstanceIds=[BOX])
        if state != "running":
            ec2.get_waiter("instance_running").wait(InstanceIds=[BOX], WaiterConfig={"Delay": 3, "MaxAttempts": 100})
        for _ in range(100):  # SSM agent online
            info = ssm.describe_instance_information(Filters=[{"Key": "InstanceIds", "Values": [BOX]}])
            if info["InstanceInformationList"] and info["InstanceInformationList"][0]["PingStatus"] == "Online":
                break
            time.sleep(3)
        cmd = ssm.send_command(InstanceIds=[BOX], DocumentName="AWS-RunShellScript",
                               Parameters={"commands": [f"/opt/jobs/run.sh {jid} {kind}"], "executionTimeout": ["3600"]},
                               Comment=f"nsr-jobs {jid}")["Command"]["CommandId"]
        set_fields(jid, ssm_command_id=cmd, box_state_at_submit=state, box_ready_s=f"{time.time() - t:.1f}")
    except Exception as e:  # noqa: BLE001
        set_fields(jid, status="failed", finished_at=now(), error=f"could not start the job: {type(e).__name__}: {e}"[:2000])


def series(jid, q):
    """result.json, or one temperature's series cut to [emin, emax] with the point on each side."""
    s3 = client("s3")
    if not q.get("temp_k"):
        return json.loads(s3.get_object(Bucket=BUCKET, Key=f"lake/jobs/{jid}/result.json")["Body"].read())
    temp = float(q["temp_k"])
    doc = json.loads(s3.get_object(Bucket=BUCKET, Key=f"lake/jobs/{jid}/{temp:g}K.json")["Body"].read())
    emin = float(q["emin"]) if q.get("emin") else None
    emax = float(q["emax"]) if q.get("emax") else None
    if emin is not None or emax is not None:
        e = doc["energy_ev"]
        lo = bisect.bisect_left(e, emin) if emin is not None else 0
        hi = bisect.bisect_right(e, emax) if emax is not None else len(e)
        lo, hi = max(0, lo - 1), min(len(e), hi + 1)
        doc.update(energy_ev=e[lo:hi], xs_barn=doc["xs_barn"][lo:hi], n_window=hi - lo,
                   window={"emin_ev": emin, "emax_ev": emax})
    return doc


def lambda_handler(event, context):
    if "start" in event:
        start(event["start"], event.get("kind") or "broaden")
        return {"started": event["start"]}
    method = (event.get("requestContext", {}).get("http", {}).get("method") or "GET").upper()
    path = (event.get("rawPath") or "/").rstrip("/")
    q = event.get("queryStringParameters") or {}
    headers = {k.lower(): v for k, v in (event.get("headers") or {}).items()}
    try:
        if path == "/jobs" and method == "POST":
            want = os.environ.get("NSR_WRITE_KEY", "")
            if not want or not hmac.compare_digest(headers.get("x-nsr-write-key", ""), want):
                return reply(403, {"error": "POST /jobs answers the app's server only"})
            raw = event.get("body") or ""
            if event.get("isBase64Encoded") and raw:
                raw = base64.b64decode(raw).decode()
            return submit(json.loads(raw or "{}"), context)
        if path == "/jobs" and method == "GET":
            sts = [q["status"]] if q.get("status") in STATUSES else list(STATUSES)
            rows = []
            for s in sts:
                r = db.query(TableName=TABLE, IndexName="status-created_at", KeyConditionExpression="#s = :s",
                             ExpressionAttributeNames={"#s": "status"}, ExpressionAttributeValues={":s": {"S": s}},
                             ScanIndexForward=False, Limit=50)
                rows += [row_of(i) for i in r.get("Items", [])]
            rows.sort(key=lambda r: r.get("created_at", ""), reverse=True)
            return reply(200, {"jobs": rows[:50]})
        m = re.fullmatch(r"/jobs/(j[0-9a-f]{20})(/result)?", path)
        if m and method == "GET":
            if m.group(2):
                return reply(200, series(m.group(1), q), cache=True)
            item = db.get_item(TableName=TABLE, Key={"id": {"S": m.group(1)}}, ConsistentRead=True).get("Item")
            if not item:
                return reply(404, {"error": f"no job {m.group(1)}"})
            return reply(200, row_of(item))
        return reply(404, {"error": "routes: POST /jobs, GET /jobs, GET /jobs/{id}, GET /jobs/{id}/result"})
    except client("s3").exceptions.NoSuchKey:
        return reply(404, {"error": "no result for that job and temperature"})
    except (ValueError, json.JSONDecodeError) as e:
        return reply(400, {"error": str(e)[:500]})
