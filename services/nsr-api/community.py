# community: the store behind the app's saves and uploads (brief 34, ui-layer). lambda_function.py sends /community and
# /files here (MODULES) with the whole event, since these routes write. Not cached: the app calls the API Gateway
# origin for them, and every response says no-store. Every request carries x-nsr-write-key, which must match the
# Lambda's NSR_WRITE_KEY (SSM /nsrgpt/devbox/nsr-api-write-key); the app holds it server-side, never in a page.
#   GET    /community[?kind=view|recipe|lab]   {views: [{id, name, saved_by, created_at, kind, state}]}, newest first;
#                                          no kind lists views and recipes (Lab canvases only with kind=lab)
#   GET    /community/{id}                 {view}
#   POST   /community                      {name, saved_by, state[, id, created_at]} -> {view}; kind from the state
#   DELETE /community/{id}                 {deleted: id}
#   GET    /files                          {files: [{key, name, size, modified}]} under files/pdfs/workspace/
#   POST   /files                          {name, type} -> {key, url}: a free key and a PUT URL for 10 minutes;
#                                          {key, type} -> {key, url} for a key the app already holds
# DynamoDB nsrgpt-views (on demand): key id; index kind-created_at. state is stored as a JSON string.
import base64
import datetime
import hmac
import json
import os
import re
import secrets
import time

import boto3
from botocore.exceptions import ClientError

TABLE = os.environ.get("VIEWS_TABLE", "nsrgpt-views")
BUCKET = os.environ.get("BUCKET", "nsr-lake-613473203863")
FILES = "files/pdfs/workspace/"
MAX_STATE = 350_000  # bytes of state JSON; DynamoDB holds 400 KB an item
_ddb = None
_s3 = None


def ddb():
    global _ddb
    if _ddb is None:
        _ddb = boto3.client("dynamodb", region_name="us-east-2")
    return _ddb


def s3():
    global _s3
    if _s3 is None:
        from botocore.config import Config
        _s3 = boto3.client("s3", region_name="us-east-2", config=Config(signature_version="s3v4"))
    return _s3


def reply(status, body):
    return {"statusCode": status, "headers": {"Content-Type": "application/json", "Cache-Control": "no-store"},
            "body": json.dumps(body, default=str, separators=(",", ":"))}


def row(item):
    return {"id": item["id"]["S"], "name": item.get("name", {}).get("S", ""), "saved_by": item.get("saved_by", {}).get("S", ""),
            "created_at": item.get("created_at", {}).get("S", ""), "kind": item.get("kind", {}).get("S", "view"),
            "state": json.loads(item.get("state", {}).get("S", "{}"))}


def kind_of(state):
    if state.get("kind") == "lab":  # a Lab canvas (brief 52), kept out of /graph's lists
        return "lab"
    return "recipe" if any((n or {}).get("type") == "prompt" for n in (state.get("nodes") or [])) else "view"


def list_views(kind=None):
    out = []
    for k in ([kind] if kind else ["view", "recipe"]):
        args = {"TableName": TABLE, "IndexName": "kind-created_at", "KeyConditionExpression": "kind = :k",
                "ExpressionAttributeValues": {":k": {"S": k}}, "ScanIndexForward": False}
        while True:
            r = ddb().query(**args)
            out += [row(i) for i in r.get("Items", [])]
            if "LastEvaluatedKey" not in r:
                break
            args["ExclusiveStartKey"] = r["LastEvaluatedKey"]
    return sorted(out, key=lambda v: v["created_at"], reverse=True)


def save_view(body):
    name = str(body.get("name") or "").strip()[:200]
    state = body.get("state")
    if not name or not isinstance(state, dict):
        return reply(400, {"error": "a save needs a name and a state"})
    blob = json.dumps(state, separators=(",", ":"))
    if len(blob.encode()) > MAX_STATE:
        return reply(413, {"error": f"the canvas is {len(blob.encode()) // 1000} KB; a save holds up to {MAX_STATE // 1000} KB"})
    vid = str(body.get("id") or f"{int(time.time() * 1000):x}{secrets.token_hex(3)}")[:64]
    created = str(body.get("created_at") or datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"))
    item = {"id": {"S": vid}, "name": {"S": name}, "saved_by": {"S": str(body.get("saved_by") or "anonymous")[:120]},
            "created_at": {"S": created}, "kind": {"S": kind_of(state)}, "state": {"S": blob}}
    ddb().put_item(TableName=TABLE, Item=item)
    return reply(200, {"view": row(item)})


# ---------------------------------------------------------------------------------------------

def clean_name(name):
    name = os.path.basename(str(name or "").replace("\\", "/")).strip()
    name = re.sub(r"[\x00-\x1f\x7f]", "", name)[:180]
    return name or "file"


def exists(key):
    try:
        s3().head_object(Bucket=BUCKET, Key=key)
        return True
    except ClientError:
        return False


def free_key(name):
    """files/pdfs/workspace/<yyyy-mm>/<name>, with -2, -3, … before the extension when the name is taken."""
    month = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m")
    stem, dot, ext = name.rpartition(".") if "." in name[1:] else (name, "", "")
    for i in range(1, 100):
        candidate = name if i == 1 else f"{stem}-{i}{dot}{ext}"
        key = f"{FILES}{month}/{candidate}"
        if not exists(key):
            return key
    raise ValueError("too many files with this name this month")


def list_files():
    out, token = [], None
    while True:
        args = {"Bucket": BUCKET, "Prefix": FILES}
        if token:
            args["ContinuationToken"] = token
        r = s3().list_objects_v2(**args)
        out += [{"key": o["Key"], "name": o["Key"].rsplit("/", 1)[-1], "size": o["Size"],
                 "modified": o["LastModified"].strftime("%Y-%m-%d")} for o in r.get("Contents", []) if not o["Key"].endswith("/")]
        token = r.get("NextContinuationToken")
        if not token:
            break
    return sorted(out, key=lambda f: f["modified"], reverse=True)


def presign(body):
    ctype = str(body.get("type") or "application/octet-stream")[:120]
    key = body.get("key")
    if key:
        key = str(key)
        if not key.startswith(FILES) or ".." in key or len(key) > 400:
            return reply(400, {"error": f"a file key starts {FILES}"})
    else:
        key = free_key(clean_name(body.get("name")))
    url = s3().generate_presigned_url("put_object", Params={"Bucket": BUCKET, "Key": key, "ContentType": ctype}, ExpiresIn=600)
    return reply(200, {"key": key, "url": url})


# ---------------------------------------------------------------------------------------------

def handle(event):
    want = os.environ.get("NSR_WRITE_KEY", "")
    headers = {k.lower(): v for k, v in (event.get("headers") or {}).items()}
    if not want or not hmac.compare_digest(headers.get("x-nsr-write-key", ""), want):
        return reply(403, {"error": "these routes answer the app's server only"})
    method = (event.get("requestContext", {}).get("http", {}).get("method") or event.get("httpMethod") or "GET").upper()
    path = (event.get("rawPath") or event.get("path") or "/").rstrip("/")
    q = event.get("queryStringParameters") or {}
    raw = event.get("body") or ""
    if event.get("isBase64Encoded") and raw:
        raw = base64.b64decode(raw).decode()
    try:
        body = json.loads(raw) if raw else {}
        if path == "/community":
            if method == "GET":
                kind = q.get("kind")
                return reply(200, {"views": list_views(kind if kind in ("view", "recipe", "lab") else None)})
            if method == "POST":
                return save_view(body)
        m = re.fullmatch(r"/community/([A-Za-z0-9_-]{1,64})", path)
        if m:
            if method == "GET":
                r = ddb().get_item(TableName=TABLE, Key={"id": {"S": m.group(1)}})
                return reply(200, {"view": row(r["Item"])}) if "Item" in r else reply(404, {"error": "not found"})
            if method == "DELETE":
                ddb().delete_item(TableName=TABLE, Key={"id": {"S": m.group(1)}})
                return reply(200, {"deleted": m.group(1)})
        if path == "/files":
            if method == "GET":
                return reply(200, {"files": list_files()})
            if method == "POST":
                return presign(body)
        return reply(404, {"error": "routes: GET|POST /community, GET|DELETE /community/{id}, GET|POST /files"})
    except (ValueError, json.JSONDecodeError) as e:
        return reply(400, {"error": str(e)[:300]})
    except ClientError as e:
        return reply(502, {"error": e.response.get("Error", {}).get("Message", "AWS error")[:300]})
