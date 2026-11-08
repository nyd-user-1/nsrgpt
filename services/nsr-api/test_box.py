# Run the nsr-api handler on the parse box with the box's own credentials, before deploying (brief 16).
#   /opt/parse/bin/python -I test_box.py /data/nsr-api/pkg
import sys, os, json, time
import boto3

c = boto3.Session().get_credentials().get_frozen_credentials()
os.environ.update(AWS_ACCESS_KEY_ID=c.access_key, AWS_SECRET_ACCESS_KEY=c.secret_key, AWS_SESSION_TOKEN=c.token or "")
sys.path.insert(0, sys.argv[1])
import lambda_function as L

for path, q in [("/exfor/search", {"target": "U-235", "quantity": "SIG"}),
                ("/exfor/search", {"target": "U-235", "quantity": "SIG", "reaction": "N,F", "energy": "1e6..2e7"}),
                ("/exfor/search", {"target": "Fe-56;^Fe-*", "page": "1"}),
                ("/exfor/subentry/10003002", {}), ("/exfor/subentry/O04060152", {}),
                ("/exfor/pickers/targets", {}), ("/exfor/pickers/quantities", {}),
                ("/search", {"q": "U-235 fission"}), ("/search", {"q": "60Co gammas"}), ("/search", {"q": "10001002"}),
                ("/search", {"q": "JEFF-3.3 Fe-56"}), ("/search", {"q": "Janssens 2011", "type": "nsr"}),
                ("/suggest", {"q": "Cs-1"}), ("/nsr/2011JA06", {}), ("/nuclide/137Cs", {})]:
    t = time.time()
    r = L.lambda_handler({"rawPath": path, "queryStringParameters": q}, None)
    b = json.loads(r["body"])
    summary = {k: (v if not isinstance(v, (list, dict)) else f"{type(v).__name__}[{len(v)}]") for k, v in b.items()}
    print(path, q, r["statusCode"], f"{(time.time() - t) * 1000:.0f} ms", json.dumps(summary)[:400])
    if b.get("hits"):
        print("   top:", [(h["type"], h["id"], h["name"]) for h in b["hits"][:3]], b.get("cold_start", ""))
    if path == "/exfor/search" and b.get("rows"):
        print("   first:", json.dumps(b["rows"][0])[:400])
    if "/subentry/" in path and r["statusCode"] == 200:
        print("   columns:", [x["name"] for x in b["columns"]], "rows:", len(b["rows"]), "first:", b["rows"][:2])
