"""Run cinda.py's routes on a box before deploying (brief 65): the box role's credentials stand in for Lambda's.
  /opt/nsrapi/bin/python test_cinda.py      (in a folder holding cinda.py and lambda_function.py)"""
import json
import os
import time

import boto3

cr = boto3.Session().get_credentials().get_frozen_credentials()
os.environ.update(AWS_ACCESS_KEY_ID=cr.access_key, AWS_SECRET_ACCESS_KEY=cr.secret_key, AWS_SESSION_TOKEN=cr.token or "")
os.environ.setdefault("DUCKDB_EXT_DIR", "/opt/duckdb_ext")
import cinda  # noqa: E402

CASES = [
    ("/cinda", {"target": "U-235"}),
    ("/cinda", {"target": "U-235", "quantity": "CS", "emin": "1e6", "emax": "2e7", "type": "expt"}),
    ("/cinda", {"target": "235U", "page": "3"}),
    ("/cinda", {"target": "Fe-*", "reaction": "N,G", "year": "1990..2000"}),
    ("/cinda", {"author": "Mughabghab"}),
    ("/cinda", {"lab": "ORL", "target": "Pu-239"}),
    ("/cinda", {"origin": "nsr", "target": "Pb-208"}),
    ("/cinda", {}),
    ("/cinda/block/146447", {}),
    ("/cinda/pickers/quantities", {}),
    ("/cinda/pickers/labs", {}),
    ("/cinda/pickers/types", {}),
    ("/cinda/block/999999999", {}),
    ("/cinda", {"year": "abc"}),
]
for path, q in CASES:
    t = time.time()
    status, body = cinda.route(path, q)
    ms = int((time.time() - t) * 1000)
    rows = body.get("rows") or []
    print(f"{status} {ms:5d} ms {path} {q} total={body.get('total', body.get('lines'))} rows={len(rows)} "
          f"err={body.get('error', '')[:120]}")
    if rows and path == "/cinda" and q.get("target") == "U-235" and len(q) == 1:
        print("  ", json.dumps(rows[0], default=str)[:600])
    if path.startswith("/cinda/pickers") and rows:
        print("  ", json.dumps(rows[:3], default=str)[:300])
