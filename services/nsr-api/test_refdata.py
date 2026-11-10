# Brief 62's routes (refdata.py) run on the dev box with its own credentials before a deploy, test_box.py's pattern.
#   /opt/nsrapi/bin/python -I test_refdata.py /data/nsr-api/pkg
import json, os, sys, time
import boto3

c = boto3.Session().get_credentials().get_frozen_credentials()
os.environ.update(AWS_ACCESS_KEY_ID=c.access_key, AWS_SECRET_ACCESS_KEY=c.secret_key, AWS_SESSION_TOKEN=c.token or "")
sys.path.insert(0, sys.argv[1])
import lambda_function as L

for path, q in [("/stopping", {"projectile": "p"}), ("/stopping", {"projectile": "p", "target": "Mo", "emin": "0.1", "emax": "10"}),
                ("/stopping", {"projectile": "a", "target": "Au"}), ("/ripl/levels", {"name": "Co-60"}),
                ("/ripl/masses", {"name": "Co-60"}), ("/ripl/masses", {"name": "Co"}),
                ("/betashape", {"name": "Sb-131"}), ("/betashape", {"name": "Cs-137", "mode": "bm", "level": "0"}),
                ("/benchmarks", {}), ("/benchmarks", {"benchmark": "hmf001", "library": "jendl5"})]:
    t = time.time()
    r = L.lambda_handler({"rawPath": path, "queryStringParameters": q}, None)
    b = json.loads(r["body"])
    summary = {k: (v if not isinstance(v, (list, dict)) else f"{type(v).__name__}[{len(v)}]") for k, v in b.items()}
    print(path, q, r["statusCode"], f"{(time.time() - t) * 1000:.0f} ms", json.dumps(summary)[:300])
    for k in ("points", "levels", "masses", "spectra", "benchmarks", "targets"):
        if isinstance(b.get(k), list) and b[k]:
            print("   first:", json.dumps(b[k][0])[:300])
