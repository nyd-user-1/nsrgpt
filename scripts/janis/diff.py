"""Brief 75 C5: where Elpis's book index and rails differ from JANIS's own book pages. Runs on a box (python3 with boto3).

  python3 diff.py

Reads lake/janis/reference/<book>.json (crawl.py --mode reference: JANIS's pages as fetched) and Elpis's index,
public/elpis/book-<p>.json (copied to lake/_work/janis/elpis-index/), and applies Elpis's own rules as the code states
them (2026-11-12, main):
- lib/elpis.ts railMts: a nuclide's rail is every MT the lake holds (m) and every MT JANIS's book lists (j), sorted by
  number; railElements: elements by Z, nuclides in index order.
- components/elpis/ElpisBook.tsx: the lines are every release the index holds for (nuclide, MT), or for an MT the lake
  lacks, the releases whose MT 5 produces the residual (x); on load only those in ON_BY_DEFAULT are on, unless none is;
  the Plotter's release is the first of the lines on in NEWEST's order.
Release names: JANIS's label with "ENDF/" dropped and slashes and spaces turned to hyphens (the lake's rule).
Writes lake/janis/reference/diff.json: counts per book and every differing item. Facts only; no fixes.
"""
import json
import re
import time

import boto3

B, REGION = "nsr-lake-613473203863", "us-east-2"
REF, IDX = "lake/janis/reference", "lake/_work/janis/elpis-index"
BOOKS = {"neutrons": "n", "gammas": "g", "protons": "p", "deuterons": "d", "tritons": "t", "he3": "h", "alphas": "a"}
ON_BY_DEFAULT = {"B-VIII.1", "B-VIII.0", "JEFF-4.0", "JEFF-3.3", "JENDL-5", "JENDL-4.0u", "JENDL-HE-2007", "TENDL-2023",
                 "CENDL-3.2", "PADF-2007", "BROND-3.1", "EAF-2010", "IRDFF-II"}
NEWEST = ["B-VIII.1", "JENDL-5", "JEFF-4.0", "TENDL-2023", "B-VIII.0", "JEFF-3.3", "CENDL-3.2", "BROND-3.1", "JENDL-4.0u",
          "IRDFF-II", "B-VII.1"]
s3 = boto3.client("s3", region_name=REGION)


def lake_name(janis_label):
    return re.sub(r"[/ ]+", "-", janis_label.replace("ENDF/", "", 1))


def get(key):
    return json.loads(s3.get_object(Bucket=B, Key=key)["Body"].read())


def mt_of(reac):
    m = re.fullmatch(r"MT(\d+)", reac or "")
    return int(m.group(1)) if m else None


def bits(releases, mask):
    m = int(mask)
    return [r for i, r in enumerate(releases) if (m >> i) & 1]


# lib/elpis.ts residualZa, MT_PARTICLES, ZA_OF, PROJ_ZA and parseBookNuclide, ported unchanged.
MT_PARTICLES = {
    11: "2N+D", 16: "2N", 17: "3N", 22: "N+A", 23: "N+3A", 24: "2N+A", 25: "3N+A", 28: "N+P", 29: "N+2A", 30: "2N+2A",
    32: "N+D", 33: "N+T", 34: "N+HE3", 35: "N+D+2A", 36: "N+T+2A", 37: "4N", 41: "2N+P", 42: "3N+P", 44: "N+2P",
    45: "N+P+A", 102: "G", 103: "P", 104: "D", 105: "T", 106: "HE3", 107: "A", 108: "2A", 109: "3A", 111: "2P",
    112: "P+A", 113: "T+2A", 114: "D+2A", 115: "P+D", 116: "P+T", 117: "D+A", 152: "5N", 153: "6N", 154: "2N+T",
    155: "T+A", 156: "4N+P", 157: "3N+D", 158: "N+D+A", 159: "2N+P+A", 160: "7N", 161: "8N", 162: "5N+P", 163: "6N+P",
    164: "7N+P", 165: "4N+A", 166: "5N+A", 167: "6N+A", 168: "7N+A", 169: "4N+D", 170: "5N+D", 171: "6N+D",
    172: "3N+T", 173: "4N+T", 174: "5N+T", 175: "6N+T", 176: "2N+HE3", 177: "3N+HE3", 178: "4N+HE3", 179: "3N+2P",
    180: "3N+2A", 181: "3N+P+A", 182: "D+T", 183: "N+P+D", 184: "N+P+T", 185: "N+D+T", 186: "N+P+HE3",
    187: "N+D+HE3", 188: "N+T+HE3", 189: "N+T+A", 190: "2N+2P", 191: "P+HE3", 192: "D+HE3", 193: "HE3+A",
    194: "4N+2P", 195: "4N+2A", 196: "4N+P+A", 197: "3P", 198: "N+3P", 199: "3N+2P+A", 200: "5N+2P",
}
ZA_OF = {"N": (0, 1), "P": (1, 1), "D": (1, 2), "T": (1, 3), "HE3": (2, 3), "A": (2, 4), "G": (0, 0)}
PROJ_ZA = {"n": (0, 1), "g": (0, 0), "p": (1, 1), "d": (1, 2), "t": (1, 3), "h": (2, 3), "a": (2, 4)}


def parse_book_nuclide(s):
    m = re.fullmatch(r"(\d{1,3})-([A-Za-z]{1,3})-(\d{1,3}|Nat)(m\d?)?", s)
    if not m:
        return None
    return int(m.group(1)), ("Nat" if m.group(3) == "Nat" else int(m.group(3)))


def residual(key, label, mt):
    nuc = parse_book_nuclide(label)
    if not nuc:
        return None
    z, a = nuc
    if a == "Nat" or (mt == 4 and key == "n"):
        return None
    out = "N" if mt == 4 else MT_PARTICLES.get(mt)
    if not out or key not in PROJ_ZA:
        return None
    rz, ra = z + PROJ_ZA[key][0], a + PROJ_ZA[key][1]
    for t in out.split("+"):
        m = re.fullmatch(r"(\d*)(HE3|[A-Z])", t)
        if not m:
            return None
        k = int(m.group(1)) if m.group(1) else 1
        rz -= k * ZA_OF[m.group(2)][0]
        ra -= k * ZA_OF[m.group(2)][1]
    return rz * 1000 + ra if rz >= 0 and ra > 0 and ra >= rz else None


def elpis_lines(p, idx, n, mt):
    mine = dict(x.split(":") for x in n.get("m", "").split()) if n.get("m") else {}
    if str(mt) in mine:
        return bits(idx["releases"], mine[str(mt)]), False
    made = dict(x.split(":") for x in n.get("x", "").split()) if n.get("x") else {}
    za = residual(p, n["l"], mt)
    if za is not None and str(za) in made:
        return bits(idx["releases"], made[str(za)]), True
    return [], False


def main():
    out = {"built": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "books": {}}
    for book, p in BOOKS.items():
        ref = get(f"{REF}/{book}.json")
        idx = get(f"{IDX}/book-{p}.json")
        by_l = {n["l"]: n for n in idx["nuclides"]}
        j_rail = ref["left_rail"]
        j_labels = [r["nuclide"] for r in j_rail]
        # nuclides
        missing = [l for l in j_labels if l not in by_l]
        no_j = [l for l in j_labels if l in by_l and not by_l[l].get("j")]
        janis_in_elpis = [n["l"] for n in sorted(idx["nuclides"], key=lambda n: int(n["l"].split("-")[0]))
                          if n["l"] in set(j_labels)]
        order_nuc = [{"position": i, "janis": a, "elpis": b} for i, (a, b) in enumerate(zip(j_labels, janis_in_elpis)) if a != b]
        elpis_extra_nuclides = sum(1 for n in idx["nuclides"] if n["l"] not in set(j_labels))
        # MTs per nuclide
        mt_items, extra_rail_mts, order_mt = [], 0, []
        for r in j_rail:
            j_mts = [mt_of(m["reac"]) for m in r["mts"]]
            n = by_l.get(r["nuclide"])
            e_j = [int(x) for x in n["j"].split()] if n and n.get("j") else []
            e_m = [int(x.split(":")[0]) for x in n["m"].split()] if n and n.get("m") else []
            rail = sorted(set(e_m) | set(e_j))
            jset = set(x for x in j_mts if x is not None)
            if jset != set(e_j) or None in j_mts:
                mt_items.append({"nuclide": r["nuclide"], "janis": [m["reac"] for m in r["mts"]], "elpis_j": e_j})
            extra = [x for x in rail if x not in jset]
            extra_rail_mts += len(extra)
            seq = [x for x in rail if x in jset]
            if seq != [x for x in j_mts if x is not None]:
                order_mt.append({"nuclide": r["nuclide"], "janis": j_mts, "elpis": seq})
        # libraries drawn and default release, per page
        lib_items, default_items, pages_cmp = [], [], 0
        for rec in ref["page_records"]:
            mt = mt_of(rec["reac"])
            n = by_l.get(rec["nuclide"])
            if mt is None or n is None:
                continue
            pages_cmp += 1
            j_libs = [lake_name(x) for x in rec["libraries"]]
            lines, prod = elpis_lines(p, idx, n, mt)
            on = [r for r in lines if r in ON_BY_DEFAULT] or lines
            on_sorted = sorted(on, key=lambda r: NEWEST.index(r) if r in NEWEST else len(NEWEST))
            e_default = on_sorted[0] if on_sorted else None
            j_default = lake_name(rec["default_release"]) if rec.get("default_release") else None
            not_drawn = [x for x in j_libs if x not in on]
            extra = [x for x in on if x not in j_libs]
            if not_drawn or extra:
                lib_items.append({"page": rec["page"], "nuclide": rec["nuclide"], "mt": mt, "janis": j_libs, "elpis_on": on,
                                  "elpis_off": [r for r in lines if r not in on], "janis_not_drawn_by_elpis": not_drawn,
                                  "elpis_extra": extra, "production": prod})
            if j_default != e_default:
                default_items.append({"page": rec["page"], "nuclide": rec["nuclide"], "mt": mt, "janis": j_default,
                                      "elpis": e_default})
        counts = {"janis_nuclides": len(j_labels), "janis_pages": len(ref["page_records"]),
                  "nuclides_missing_from_elpis": len(missing), "nuclides_without_janis_mts": len(no_j),
                  "nuclide_order_positions_differing": len(order_nuc), "elpis_nuclides_janis_lacks": elpis_extra_nuclides,
                  "nuclides_whose_mts_differ": len(mt_items), "rail_mts_janis_lacks": extra_rail_mts,
                  "nuclides_whose_mt_order_differs": len(order_mt), "pages_compared": pages_cmp,
                  "pages_libraries_differ": len(lib_items),
                  "pages_janis_library_not_drawn": sum(1 for x in lib_items if x["janis_not_drawn_by_elpis"]),
                  "pages_elpis_draws_more": sum(1 for x in lib_items if x["elpis_extra"]),
                  "pages_default_release_differs": len(default_items)}
        out["books"][book] = {"counts": counts, "nuclides_missing_from_elpis": missing, "nuclides_without_janis_mts": no_j,
                              "nuclide_order": order_nuc[:200], "mts": mt_items, "mt_order": order_mt,
                              "libraries": lib_items, "default_release": default_items}
        print(json.dumps({book: counts}), flush=True)
    s3.put_object(Bucket=B, Key=f"{REF}/diff.json", Body=json.dumps(out, ensure_ascii=False).encode(),
                  ContentType="application/json")


if __name__ == "__main__":
    main()
