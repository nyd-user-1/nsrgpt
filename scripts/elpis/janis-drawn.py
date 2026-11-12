"""Brief 73 (A9): for every book row JANIS lists and Elpis lacks (docs/analysis/elpis-missing-rows.html), open JANIS's
own book page (session cookie from the home page first, trap 7b) and record what it draws: the rows of its selection
tree with P ticked, each with its library, data type, MT and product as JANIS writes them in the row's refsStr.

  python janis-drawn.py <missing-rows.html> <rail dir> <out.json>
The rail dir holds lake/elpis/<date>/janis-rail-<book>.jsonl (JANIS's mat and reac ids for each MT label).
One request a second; a page that does not answer twice is recorded as an error, never skipped.
"""
import html as H
import http.cookiejar
import json
import re
import sys
import time
import urllib.request

BOOK = {"Neutrons": "neutrons", "Photons": "gammas", "Protons": "protons", "Deuterons": "deuterons", "Tritons": "tritons",
        "Helium-3": "he3", "Alphas": "alphas"}
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"
BASE = "https://www.oecd-nea.org/janisweb"


def opener():
    o = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    o.addheaders = [("User-Agent", UA)]
    o.open(BASE + "/", timeout=60).read()
    return o


def rows_of(page):
    m = re.search(r"selectionTreeRows = (\[.*?\]);\s*$", page, re.M)
    return json.loads(m.group(1)) if m else None


def main():
    src, rails, out = sys.argv[1:4]
    text = open(src, encoding="utf-8").read()
    want = []
    for sec in re.split(r"<h2>", text)[1:]:
        name = sec.split(" · ")[0]
        for tr in re.findall(r"<tr><td>(.*?)</td><td>(\d+)</td><td>(.*?)</td><td>(.*?)</td></tr>", sec):
            want.append({"book": BOOK[name], "nuclide": H.unescape(tr[0]), "mt": int(tr[1]), "reaction": H.unescape(tr[2]),
                         "residual": H.unescape(tr[3])})
    rail = {}
    for b in set(BOOK.values()):
        for ln in open(f"{rails}/janis-rail-{b}.jsonl", encoding="utf-8"):
            r = json.loads(ln)
            if "mts" in r:
                rail[(b, r["label"])] = r
    o = opener()
    res = []
    for w in want:
        z, sym, a = w["nuclide"].split("-", 2)
        lab = f"{sym}{a}"
        r = rail.get((w["book"], lab)) or rail.get((w["book"], w["nuclide"]))
        mt = next((m for m in (r or {}).get("mts", []) if m["label"].startswith(f"MT{w['mt']} ")), None)
        if not r or not mt:
            res.append({**w, "error": "not in JANIS's rail"})
            continue
        url = f"{BASE}/book/{w['book']}/{r['mat']}/{mt['reac']}"
        page = None
        for attempt in range(3):
            try:
                page = o.open(url, timeout=90).read().decode("utf-8", "replace")
                if rows_of(page) is not None:
                    break
            except Exception:  # noqa: BLE001
                pass
            time.sleep(3 * (attempt + 1))
            o = opener()
        rows = rows_of(page or "")
        if rows is None:
            res.append({**w, "url": url, "error": "page without a selection tree"})
            continue
        byid = {x["id"]: x for x in rows}
        drawn = []
        for x in rows:
            if x.get("tsSelecteds") and x["tsSelecteds"][0]:
                parent = byid.get(x["pid"], {})
                parts = x["refsStr"].strip("~").split("~")
                drawn.append({"label": x["label"], "group": parent.get("label"), "refs": x["refsStr"],
                              "library": parts[1] if len(parts) > 1 else None})
        libs = sorted({d["library"] for d in drawn if d["library"] and d["library"] != "EXFOR"})
        res.append({**w, "url": url, "mt_label": mt["label"], "libraries": libs, "exfor_sets": sum(d["library"] == "EXFOR" for d in drawn),
                    "drawn": drawn})
        print(w["book"], w["nuclide"], w["mt"], libs, flush=True)
        time.sleep(1)
    json.dump({"rows": res, "count": len(res)}, open(out, "w"), indent=1)
    print("rows", len(res), "errors", sum("error" in r for r in res))


if __name__ == "__main__":
    main()
