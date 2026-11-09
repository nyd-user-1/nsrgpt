# Run dataset.py's routes and keyword_search.py's /nsr/{key}/text on a box with the box's own credentials, before
# deploying (brief 34). httpfs comes from DUCKDB_EXT_DIR (INSTALL httpfs there first); the PDFs from fonts/ beside the
# modules, or DATASET_FONTS.
#   DUCKDB_EXT_DIR=/opt/duckdb_ext /opt/nsrapi/bin/python -I test_dataset.py <folder with the modules and fonts/>
import json, os, sys, time
import boto3

c = boto3.Session(region_name="us-east-2").get_credentials().get_frozen_credentials()
os.environ.update(AWS_ACCESS_KEY_ID=c.access_key, AWS_SECRET_ACCESS_KEY=c.secret_key, AWS_SESSION_TOKEN=c.token or "")
sys.path.insert(0, sys.argv[1])
import dataset as D
import keyword_search as K

ADOPTED = "60CO:ADOPTED%20LEVELS,%20GAMMAS"
for mod, path, q in [(D, "/dataset/ensdf", {"nucid": "60CO"}), (D, "/dataset/xundl", {"mass": "60"}),
                     (D, f"/dataset/ensdf/{ADOPTED}", {}), (D, f"/dataset/ensdf/{ADOPTED}", {}),
                     (D, "/dataset/ensdf/60CO:60FE%20B-%20DECAY", {}), (D, f"/dataset/ensdf/{ADOPTED}/text", {}),
                     (D, f"/dataset/ensdf/{ADOPTED}/md", {}), (D, f"/dataset/ensdf/{ADOPTED}/pdf", {}),
                     (D, "/dataset/ensdf/208PB:ADOPTED%20LEVELS,%20GAMMAS/pdf", {}),
                     (D, "/dataset/ensdf/60CO:NOPE", {}), (D, "/dataset/xundl/60NI:60NI%20NOPE", {}),
                     (D, "/exfor/entry/10001", {}), (D, "/exfor/entry/10001/text", {}), (D, "/exfor/entry/ZZZZZ", {}),
                     (D, "/endf/material/B-VIII.1/9228", {}), (D, "/endf/material/B-VIII.1/9228", {"mf": "3", "mt": "18"}),
                     (D, "/endf/material/B-VIII.1/9228/text", {"mf": "3", "mt": "18"}),
                     (D, "/endf/material/B-VII.1/2631", {"sub": "neutrons"}), (D, "/endf/material/B-II/1192", {}),
                     (K, "/nsr/2011CH57", {}), (K, "/nsr/2011CH57/text", {})]:
    t = time.time()
    out = mod.route(path, q)
    ms = (time.time() - t) * 1000
    if isinstance(out, dict):
        body = out["body"]
        print(path, q, out["statusCode"], f"{ms:.0f} ms", out["headers"]["Content-Type"], f"{len(body)} chars")
        if path.endswith("/pdf"):
            open(f"/tmp/{path.split('/')[3].replace('%20', '_')[:30]}.pdf", "wb").write(__import__("base64").b64decode(body))
        else:
            print("   ", body[:600].replace("\n", "\n    "))
        continue
    status, b = out
    text = json.dumps(b, default=str, separators=(",", ":"))
    summary = {k: (v if not isinstance(v, (list, dict)) else f"{type(v).__name__}[{len(v)}]") for k, v in b.items()}
    print(path, q, status, f"{ms:.0f} ms", f"{len(text)} bytes", json.dumps(summary, default=str)[:400])
    if status == 200 and path.startswith("/dataset/ensdf/"):
        print("    header", json.dumps(b["header"], default=str)[:400])
        print("    level", json.dumps(b["levels"][1] if len(b["levels"]) > 1 else None, default=str)[:300])
        print("    gamma", json.dumps(b["gammas"][:2], default=str)[:400])
        print("    refs", b["references"][:3], "| cards", b["cards"][:2])
        print("    graph", json.dumps(b["graph"], default=str)[:400])
    if status == 200 and "rows" in b:
        print("    first", json.dumps(b["rows"][:2], default=str)[:400])
    if status == 200 and path.startswith(("/exfor/entry", "/endf/material")):
        print("    ", json.dumps({k: v for k, v in b.items() if k not in ("x4",)}, default=str)[:700])

# The other records' Markdown and PDF (brief 34 follow-up), through the handler as the Lambda runs them.
import base64
import lambda_function as F
for path, q in [("/exfor/entry/10001/md", {}), ("/exfor/entry/10001/pdf", {}), ("/exfor/subentry/10001002/md", {}),
                ("/exfor/subentry/10001002/pdf", {}), ("/endf/material/B-VIII.1/9228/md", {"mf": "3", "mt": "18"}),
                ("/endf/material/B-VIII.1/9228/pdf", {}), ("/endf/material/B-VIII.1/9228", {}), ("/nsr/2011CH57/md", {}),
                ("/nsr/2011CH57/pdf", {}), ("/exfor/subentry/99999999/md", {})]:
    t = time.time()
    out = F.lambda_handler({"rawPath": path, "queryStringParameters": q}, None)
    ms = (time.time() - t) * 1000
    body = out["body"]
    print(path, q, out["statusCode"], f"{ms:.0f} ms", out["headers"].get("Content-Type"), f"{len(body)} chars")
    if path.endswith("/pdf") and out["statusCode"] == 200:
        open("/tmp/" + path.strip("/").replace("/", "-") + ".pdf", "wb").write(base64.b64decode(body))
    elif path.endswith("/md"):
        print("   ", body[:500].replace("\n", "\n    "))
    else:
        print("   ", body[:200])
