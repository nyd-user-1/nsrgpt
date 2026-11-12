"""Brief 77 step 15 (values): for 10 pages a book (70), every library series and up to 5 EXFOR sets of the page file
JANIS's engine made, row by row against JANIS's own Tabler on NEA's server (NeaTable.java: JANIS's factory NEA connection,
the data JANIS Web shows). Computed series (calc[...]) open only inside their page on NEA's server, so they are counted,
not compared here. Writes lake/janis/engine/compare/values.json.

  python3 verify.py [book letters]     # on an engine box; NeaTable compiled in /opt/engine/java
"""
import gzip, json, os, subprocess, sys

import boto3

sys.path.insert(0, "/opt/engine")
from pages import read_csv, series_values  # noqa: E402

B = "nsr-lake-613473203863"
s3 = boto3.client("s3", region_name="us-east-2")


def page(book, nuclide, mt):
    raw = s3.get_object(Bucket=B, Key=f"lake/janis/book/{book}/{nuclide}/{mt}.json")["Body"].read()
    try:
        raw = gzip.decompress(raw)
    except OSError:
        pass
    return json.loads(raw)


def close(a, b):
    if a is None or b is None:
        return a is None and b is None
    return a == b or abs(a - b) <= 1e-9 * max(abs(a), abs(b))


def main():
    books = sys.argv[1] if len(sys.argv) > 1 else "ngpdtha"
    out = {"books": {}, "pages": []}
    work = "/data/verify"
    os.makedirs(work, exist_ok=True)
    for b in books:
        listing = json.loads(s3.get_object(Bucket=B, Key=f"lake/janis/book/{b}/pages.json")["Body"].read())["pages"]
        picks = [listing[int(i * len(listing) / 10)] for i in range(10)] if len(listing) >= 10 else listing
        stats = {"pages": 0, "series_compared": 0, "series_equal": 0, "series_differ": 0, "computed_not_compared": 0, "nea_errors": 0}
        for pg in picks:
            rec = page(b, pg["nuclide"], pg["mt"])
            todo, x4 = [], 0
            for s in rec["series"]:
                if s.get("computed"):
                    stats["computed_not_compared"] += 1
                    continue
                if s["kind"] == "exfor":
                    if x4 >= 5:
                        continue
                    x4 += 1
                todo.append(s)
            d = os.path.join(work, f"{b}-{pg['nuclide']}-{pg['mt']}")
            os.makedirs(d, exist_ok=True)
            open(os.path.join(d, "refs.txt"), "w").write("\n".join(s["ref"] for s in todo) + "\n")
            subprocess.run(["java", "-Djava.awt.headless=true", "-cp", "/opt/janis/*:/opt/engine/java", "NeaTable", d, os.path.join(d, "refs.txt")],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=1800)
            status = {}
            for line in open(os.path.join(d, "index.tsv")):
                i, ref, st = line.rstrip("\n").split("\t", 2)
                status[ref] = (int(i), st)
            rows = []
            for s in todo:
                i, st = status.get(s["ref"], (None, "missing"))
                if st != "ok":
                    stats["nea_errors"] += 1
                    rows.append({"ref": s["ref"], "nea": st})
                    continue
                nea = series_values(*read_csv(os.path.join(d, f"{i}.csv")))
                n = len(s.get("x") or [])
                eq = n == len(nea.get("x") or []) and all(close(a, c) for a, c in zip(s["x"], nea["x"])) and all(close(a, c) for a, c in zip(s["y"], nea["y"]))
                stats["series_compared"] += 1
                stats["series_equal" if eq else "series_differ"] += 1
                r = {"ref": s["ref"], "rows": n, "nea_rows": len(nea.get("x") or []), "equal": eq}
                if not eq:
                    diffs = [k for k, (a, c) in enumerate(zip(s.get("y") or [], nea.get("y") or [])) if not close(a, c)]
                    r["first_differences"] = [(k, s["x"][k], s["y"][k], nea["x"][k], nea["y"][k]) for k in diffs[:5]]
                rows.append(r)
            stats["pages"] += 1
            out["pages"].append({"book": b, "nuclide": pg["nuclide"], "mt": pg["mt"], "series": rows})
            print(b, pg["nuclide"], pg["mt"], sum(1 for r in rows if r.get("equal")), "/", len(rows), flush=True)
        out["books"][b] = stats
        print(b, stats, flush=True)
    key = "lake/janis/engine/compare/values.json" if books == "ngpdtha" else f"lake/janis/engine/compare/values-{books}.json"
    s3.put_object(Bucket=B, Key=key, Body=json.dumps(out, indent=1).encode())


if __name__ == "__main__":
    main()
