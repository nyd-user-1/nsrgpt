# Run the count checks in Athena from the parse box and save the results (brief 16).
#   checks.py <name>     runs checks/<name>.sql (statements split on ";"), prints each result, saves
#                        lake/_work/parse/exfor/checks/<name>.json
import sys, os, json, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *

name = sys.argv[1]
here = os.path.dirname(os.path.abspath(__file__))
sqls = [s.strip() for s in re.split(r";[ \t]*(?:\n|$)", open(f"{here}/checks/{name}.sql").read()) if s.strip()]
out = []
for s in sqls:
    label = s.splitlines()[0].lstrip("- ").strip() if s.startswith("--") else s[:80]
    _, rows, stats = query(s)

    out.append({"check": label, "sql": s, "rows": rows, "scanned_bytes": stats.get("DataScannedInBytes")})
    print("==", label, f"({stats.get('DataScannedInBytes', 0) / 1e6:.1f} MB scanned)")
    for r in rows[:60]:
        print("  ", " | ".join("" if v is None else str(v) for v in r))
put_json(f"{WORK}/checks/{name}.json", out)
