"""Brief 77 step 15 (whole pages): the JNS pages JANIS's engine wrote on the boxes (lake/janis/engine/book/<letter>/jns/),
restored by JANIS's own loader against NEA's server instead of the local base (PageExport.java with JANIS's factory NEA
connection), every series exported with JANIS's Tabler, computed series included (JANIS computes them on NEA's data), and
compared row by row with the page files Elpis serves. 10 pages a book, the same picks as verify.py.
Writes lake/janis/engine/compare/pages-vs-nea.json.

  python3 verify_pages.py [book letters]
"""
import gzip, json, os, subprocess, sys

import boto3

sys.path.insert(0, "/opt/engine")
from pages import read_csv, series_values  # noqa: E402

B = "nsr-lake-613473203863"
NEA = "HTTP:label=NEA|url=http://www.oecd-nea.org/"
LABEL = {"n": "neutrons", "g": "gammas", "p": "protons", "d": "deuterons", "t": "tritons", "h": "he3", "a": "alphas"}
DT = {"n": "N", "g": "G", "p": "P", "d": "D", "t": "T", "h": "HE3", "a": "A"}
s3 = boto3.client("s3", region_name="us-east-2")


def close(a, b):
    if a is None or b is None:
        return a is None and b is None
    return a == b or abs(a - b) <= 1e-9 * max(abs(a), abs(b))


def main():
    books = sys.argv[1] if len(sys.argv) > 1 else "ngpdtha"
    out = {"books": {}, "pages": []}
    for b in books:
        listing = json.loads(s3.get_object(Bucket=B, Key=f"lake/janis/book/{b}/pages.json")["Body"].read())["pages"]
        picks = [listing[int(i * len(listing) / 10)] for i in range(10)] if len(listing) >= 10 else listing
        jdir, xdir = f"/data/vp/{b}/jns", f"/data/vp/{b}/export"
        os.makedirs(jdir, exist_ok=True)
        for pg in picks:
            stem = f"book-{LABEL[b]}-{DT[b]}-{pg['mat']}-MT{pg['mt']}"
            s3.download_file(B, f"lake/janis/engine/book/{b}/jns/{stem}.jns", f"{jdir}/{stem}.jns")
        subprocess.run(["java", "-Djava.awt.headless=true", "-cp", "/opt/janis/*:/opt/engine/java", "PageExport", NEA, jdir, xdir],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=3600)
        st = {"pages": 0, "series": 0, "equal": 0, "differ": 0, "computed": 0, "computed_equal": 0, "missing_at_nea": 0}
        for pg in picks:
            stem = f"book-{LABEL[b]}-{DT[b]}-{pg['mat']}-MT{pg['mt']}"
            raw = s3.get_object(Bucket=B, Key=f"lake/janis/book/{b}/{pg['nuclide']}/{pg['mt']}.json")["Body"].read()
            try:
                raw = gzip.decompress(raw)
            except OSError:
                pass
            rec = json.loads(raw)
            idx = {}
            ip = f"{xdir}/{stem}/index.tsv"
            if os.path.exists(ip):
                for line in open(ip):
                    f = line.rstrip("\n").split("\t")
                    idx["~" + f[1].split("~", 1)[1]] = int(f[0])
            rows = []
            for s in rec["series"]:
                st["series"] += 1
                comp = bool(s.get("computed"))
                st["computed"] += comp
                i = idx.get(s["ref"])
                if i is None or not os.path.exists(f"{xdir}/{stem}/{i}.csv"):
                    st["missing_at_nea"] += 1
                    rows.append({"ref": s["ref"], "nea": "missing"})
                    continue
                nea = series_values(*read_csv(f"{xdir}/{stem}/{i}.csv"))
                eq = len(s.get("x") or []) == len(nea.get("x") or []) and all(close(a, c) for a, c in zip(s["x"], nea["x"])) and all(close(a, c) for a, c in zip(s["y"], nea["y"]))
                st["equal" if eq else "differ"] += 1
                st["computed_equal"] += comp and eq
                r = {"ref": s["ref"], "computed": comp, "rows": len(s.get("x") or []), "nea_rows": len(nea.get("x") or []), "equal": eq}
                if not eq:
                    d = [k for k, (a, c) in enumerate(zip(s.get("y") or [], nea.get("y") or [])) if not close(a, c)]
                    r["first_differences"] = [(k, s["x"][k], s["y"][k], nea["x"][k], nea["y"][k]) for k in d[:5]]
                rows.append(r)
            st["pages"] += 1
            out["pages"].append({"book": b, "nuclide": pg["nuclide"], "mt": pg["mt"], "series": rows})
        out["books"][b] = st
        print(b, st, flush=True)
    key = "lake/janis/engine/compare/pages-vs-nea.json" if books == "ngpdtha" else f"lake/janis/engine/compare/pages-vs-nea-{books}.json"
    s3.put_object(Bucket=B, Key=key, Body=json.dumps(out, indent=1).encode())


if __name__ == "__main__":
    main()
