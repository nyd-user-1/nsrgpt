# Run brief 56's routes (resonances.py, library.py, icrp.py, counts.py, /endf/cov's resolved band, the card's links) on a
# box with its own credentials before deploying. Copied from test_structure.py.
#   DUCKDB_EXT_DIR=/opt/duckdb_ext /opt/parse/bin/python -I test_layers.py /opt/parse/scripts/nsr-api
import sys, os, json, time
import boto3

c = boto3.Session().get_credentials().get_frozen_credentials()
os.environ.update(AWS_ACCESS_KEY_ID=c.access_key, AWS_SECRET_ACCESS_KEY=c.secret_key, AWS_SESSION_TOKEN=c.token or "")
sys.path.insert(0, sys.argv[1])
import lambda_function as L

CASES = [("/endf/resonances", {"name": "U-235", "release": "B-VIII.1"}),
         ("/endf/resonances", {"name": "U-235", "release": "B-VIII.1"}),
         ("/endf/resonances", {"name": "Fe-56", "release": "B-VIII.1", "range": "1"}),
         ("/endf/resonances/cov", {"name": "Pu-240", "release": "B-VIII.1", "matrix": "1"}),
         ("/endf/resonances/cov", {"name": "U-235", "release": "B-VIII.0"}),
         ("/endf/cov", {"name": "Pu-240", "mt": "102", "release": "B-VIII.1"}),
         ("/endf/cov", {"name": "Pu-240", "mt": "18", "release": "B-VIII.1,B-VIII.0"}),
         ("/endf/cov", {"name": "Ni-58", "mt": "2", "release": "B-VIII.1"}),
         ("/endf/fy", {"name": "U-235", "release": "B-VIII.1", "mt": "454"}),
         ("/endf/fy", {"name": "U-235", "release": "JEFF-3.3", "mt": "459", "energy_ev": "5e5"}),
         ("/endf/decay", {"name": "Co-60", "release": "B-VIII.1"}),
         ("/endf/decay", {"name": "Cs-137", "release": "JENDL-5"}),
         ("/endf/decay-vs-ensdf", {"release": "B-VIII.1", "sort": "sigmas"}),
         ("/icrp/nuclide/Ac-225", {}), ("/icrp/radiations/225Ac", {"type": "A"}), ("/icrp/chain/Ac-225", {}),
         ("/icrp/vs-ensdf", {"sort": "sigmas"}), ("/nuclide/137Cs", {"levels": "2"}), ("/counts", {}), ("/counts", {})]
for path, q in CASES:
    t = time.time()
    r = L.lambda_handler({"rawPath": path, "queryStringParameters": q}, None)
    ms = (time.time() - t) * 1000
    b = json.loads(r["body"])
    summary = {k: (v if not isinstance(v, (list, dict)) else f"{type(v).__name__}[{len(v)}]") for k, v in b.items()}
    print(path, q, r["statusCode"], f"{ms:.0f} ms", f"{len(r['body'])} bytes", json.dumps(summary, default=str)[:400])
    for k in ("ranges", "resonances", "unresolved", "uncertainties", "products", "modes", "members", "rows"):
        if isinstance(b.get(k), list) and b[k]:
            print("   ", k, json.dumps(b[k][0], default=str)[:300])
    if path == "/endf/cov":
        for s in b.get("series", []):
            print("   ", s.get("release"), "groups", len(s.get("groups", [])), "resolved", json.dumps(s.get("resolved"), default=str)[:700])
    if path.startswith("/nuclide"):
        print("   ", {k: b.get(k) for k in ("fy_releases", "decay_releases", "icrp")})
    if path == "/counts":
        print("   ", json.dumps(b, default=str)[:1500])
    if b.get("matrix"):
        print("    matrix", len(b["matrix"]["rows"]), b["matrix"]["rows"][:3])
