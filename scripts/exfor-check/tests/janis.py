"""JANIS Web's TRANS checker as the reference (brief 71): post a file to https://www.oecd-nea.org/janisweb/trans-checker,
the endpoint the NEA's own GitLab CI template (exfor/tools/exfor-ci-templates, trans_checker.yml) calls, and read its
messages back. One request at a time, two seconds apart, User-Agent NSRgpt-crawler/1.0."""
import html, re, subprocess, time

URL = "https://www.oecd-nea.org/janisweb/trans-checker"
_last = [0.0]


def post(path):
    import hashlib, json, os
    cache = os.environ.get("JANIS_CACHE", "/data/exfor-check/janis-cache")
    os.makedirs(cache, exist_ok=True)
    key = os.path.join(cache, hashlib.sha1(open(path, "rb").read()).hexdigest() + ".json")
    if os.path.exists(key):
        return json.load(open(key))
    out = _post(path)
    if out["ok"]:
        json.dump(out, open(key, "w"))
    return out


def _post(path):
    wait = 2.0 - (time.time() - _last[0])
    if wait > 0:
        time.sleep(wait)
    _last[0] = time.time()
    out = subprocess.run(["curl", "-sS", "-m", "300", "-A", "NSRgpt-crawler/1.0", "-F", f"trans=@{path}", URL],
                         capture_output=True, text=True, errors="replace").stdout
    return parse(out)


def parse(page):
    """{errors, warnings, messages: [{id, severity, message, detail, line}]} from the result page."""
    num = lambda w: int((re.search(r"<b>\s*(\d+)\s+" + w, page) or [0, 0])[1])
    cells = re.findall(r'<td[^>]*class="(exception|warning|exception_light|warning_light)"[^>]*>(.*?)</td>', page, re.S)
    txt = lambda s: re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s))).strip()
    msgs, cur = [], []
    for cls, body in cells:
        cur.append((cls, txt(body)))
        if cls.endswith("_light"):
            if len(cur) >= 3:
                detail = cur[-1][1]
                m = re.search(r"\(line (\d+)\)", detail)
                msgs.append({"id": cur[-3][1], "severity": "error" if cur[-3][0] == "exception" else "warning",
                             "message": cur[-2][1], "detail": re.sub(r"\s*\(line \d+\)", "", detail),
                             "line": int(m.group(1)) if m else None})
            cur = []
    return {"errors": num("error"), "warnings": num("warning"), "messages": msgs, "ok": "trans-checker" in page or bool(cells) or "error(s)" in page}
