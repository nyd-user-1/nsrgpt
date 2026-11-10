"""One Athena query from the box, its rows printed as JSON lines (brief 56). The SQL is the first argument.
  /opt/parse/bin/python -I q.py "SELECT ..."
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lake  # noqa: E402

rows, scanned = lake.rows(sys.argv[1])
for r in rows:
    print(json.dumps(r, default=str))
print(json.dumps({"rows": len(rows), "bytes_scanned": scanned}))
