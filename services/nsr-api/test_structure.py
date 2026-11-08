# Run structure.py's routes on the parse box with the box's own credentials, before deploying (brief 17). Copied from
# test_box.py (parsing-2). httpfs comes from DUCKDB_EXT_DIR (INSTALL httpfs there first).
#   DUCKDB_EXT_DIR=/opt/duckdb_ext /opt/parse/bin/python -I test_structure.py /opt/parse/scripts/nsr-api
import sys, os, json, time
import boto3

c = boto3.Session().get_credentials().get_frozen_credentials()
os.environ.update(AWS_ACCESS_KEY_ID=c.access_key, AWS_SECRET_ACCESS_KEY=c.secret_key, AWS_SESSION_TOKEN=c.token or "")
sys.path.insert(0, sys.argv[1])
import structure as S

for path, q in [("/nuclide/137Cs", {}), ("/nuclide/cs-137", {"levels": "5"}), ("/nuclide/60Co/gammas", {}),
                ("/nuclide/CS137/levels", {"page": "1"}), ("/nuclide/Xx-999", {}),
                ("/endf/materials", {"release": "B-VIII.1", "sublibrary": "neutrons", "z": "92"}),
                ("/endf/xs", {"name": "U-235", "mt": "18"}), ("/endf/xs", {"name": "U-235", "mt": "18"}),
                ("/endf/xs", {"name": "u235", "mt": "18", "compare": "B-VIII.0,B-VII.1"}),
                ("/endf/xs", {"name": "Fe-56", "mt": "102", "compare": "JEFF-3.3"}), ("/endf/mt", {})]:
    t = time.time()
    status, b = S.route(path, q)
    ms = (time.time() - t) * 1000
    body = json.dumps(b, default=str, separators=(",", ":"))
    summary = {k: (v if not isinstance(v, (list, dict)) else f"{type(v).__name__}[{len(v)}]") for k, v in b.items()}
    print(path, q, status, f"{ms:.0f} ms", f"{len(body)} bytes", json.dumps(summary, default=str)[:300])
    if path.startswith("/endf/xs"):
        for s in b.get("series", []):
            print("   ", s.get("release"), s.get("held"), s.get("n_points"), s.get("e_min"), s.get("e_max"),
                  (s.get("energy_ev") or [])[:2], (s.get("xs_barn") or [])[:2], s.get("note", ""))
    if path == "/nuclide/137Cs":
        print("   ", json.dumps(b["nuclide"], default=str)[:400])
        print("   ", json.dumps(b["decays"], default=str)[:400])
