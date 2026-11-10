"""Brief 56: why endf-parserpy refuses an old tape's MF2 section: print the tail of its error, raw and after squeeze().
  /opt/parse/bin/python -I res_diag.py <release> <s3 key> <file part> <MAT>
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.argv = [sys.argv[0], sys.argv[1], sys.argv[2], "--mf=2,32", "--no-upload", f"--only={sys.argv[3]}"] + sys.argv[4:]
MAT = int(sys.argv[-1])
sys.argv = sys.argv[:-1]
import parse as P  # noqa: E402

for path, sub, lines in P.archive_files():
    if P.ONLY not in path:
        continue
    body = [x for x in lines if x[66:70].strip() == str(MAT) and x[70:72].strip() == "2" and x[72:75].strip() == "151"]
    print(path, len(body), "lines")
    for label, b in (("raw", body), ("squeezed", [P.squeeze(x) for x in body])):
        try:
            P.PARSER.parse([P.TPID] + b + [P.tail(MAT)[0].replace("99999", "    0")[:66] + f"{MAT:4d} 2  099999"] + P.tail(MAT),
                           include=((2, 151),))
            print(label, "parsed")
        except Exception as e:  # noqa: BLE001
            print(label, type(e).__name__, str(e)[-700:])
    print(body[:4])
    break
