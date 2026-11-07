"""The search on AWS Lambda (function nsr-search, New account, us-east-2), behind a function URL with
IAM auth. The first call after an idle spell copies the data from S3 to /tmp and loads it; later calls
answer from memory. POST /search {q, k, mode: semantic|keyword|hybrid}; POST /similar {key, k}; GET /health. Both check the x-api-key header."""
import base64, json, os

from core import NsrSearch, fetch

ART = "/tmp/art"
_search = None


def _reply(code, body):
    return {"statusCode": code, "headers": {"Content-Type": "application/json"}, "body": json.dumps(body)}


def handler(event, context):
    global _search
    headers = {k.lower(): v for k, v in (event.get("headers") or {}).items()}
    if headers.get("x-api-key") != os.environ.get("NSR_SEARCH_KEY"):
        return _reply(401, {"error": "bad key"})
    warm = _search is not None
    if _search is None:
        fetch(ART)
        _search = NsrSearch(ART)
    path = event.get("rawPath", "/")
    if path.endswith("/health"):
        return _reply(200, {"ok": True, "loaded": True, "warm": warm, "load_s": _search.load_s})
    body = event.get("body") or "{}"
    if event.get("isBase64Encoded"):
        body = base64.b64decode(body).decode()
    req = json.loads(body)
    if path.endswith("/similar"):
        out = _search.similar(str(req.get("key", "")), int(req.get("k", 6)))
        out["warm"] = warm
        return _reply(200, out)
    q = str(req.get("q", "")).strip()[:500]
    if not q:
        return _reply(400, {"error": "q required"})
    out = _search.search(q, int(req.get("k", 8)), str(req.get("mode", "semantic")))
    out["warm"] = warm
    return _reply(200, out)
