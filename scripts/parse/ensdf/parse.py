"""ENSDF or XUNDL release (a zip of 80-column card files) -> Parquet tables in the lake, registered in Athena (brief 15).

  /opt/parse/bin/python parse.py <ensdf|xundl> <release YYYY-MM-DD> <s3 key of the zip> [--no-upload]

Reads the files the way services/nsr-count does (latin-1; a blank card ends a dataset; the first card after it is the
identification record; a primary record has column 6 blank or "1" and column 7 blank), so the counts compare one to one.
Every card lands in `cards`. Each primary record lands in the table for its type (column 8); comment cards (column 7
C, D or T) in `comments`; continuation cards are attached to the record they continue (`continuation`, a JSON object).
Field positions are the ENSDF manual's (raw/nndc/2026-11-07/ensdf/). Numeric fields are doubles with the raw string
kept beside them (`<name>_raw`); uncertainties are converted from last-digit units where they are plain digits.
"""
import collections
import io
import json
import os
import re
import sys
import zipfile

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "box"))
import lake  # noqa: E402
from lake import S, D, I, L  # noqa: E402
import pyarrow as pa  # noqa: E402

DATASET, RELEASE, KEY = sys.argv[1], sys.argv[2], sys.argv[3]
UPLOAD = "--no-upload" not in sys.argv
WORK = f"/data/{DATASET}/{RELEASE}"
OUT = f"{WORK}/out"
PREFIX = f"lake/{DATASET}/{RELEASE}"
HERE = os.path.dirname(os.path.abspath(__file__))

ELEMENTS = ("NN H HE LI BE B C N O F NE NA MG AL SI P S CL AR K CA SC TI V CR MN FE CO NI CU ZN GA GE AS SE BR KR RB SR Y "
            "ZR NB MO TC RU RH PD AG CD IN SN SB TE I XE CS BA LA CE PR ND PM SM EU GD TB DY HO ER TM YB LU HF TA W RE OS IR "
            "PT AU HG TL PB BI PO AT RN FR RA AC TH PA U NP PU AM CM BK CF ES FM MD NO LR RF DB SG BH HS MT DS RG CN NH FL MC "
            "LV TS OG").split()
Z_OF = {sym: z for z, sym in enumerate(ELEMENTS)}

NUM = re.compile(r"^[+-]?(\d+\.?\d*|\.\d+)([Ee][+-]?\d+)?$")
HALF = re.compile(r"^(?:(<=|>=|<|>|~|AP |GT |LT |GE |LE |CA )\s*)?([+-]?(?:\d+\.?\d*|\.\d+)(?:[Ee][+-]?\d+)?)\s*([A-Za-z]+)?(?:\s.*)?$")
OP = re.compile(r"^(.+?)\s*(<=|>=|=|<|>|\s(?:EQ|AP|LT|GT|LE|GE|CA|SY)\s)\s*(.*)$")


def num(s):
    return float(s) if NUM.match(s) else None


def unc(value, u):
    """Uncertainty in last-digit units of `value` ('1234.5', '3') -> 0.3; None when either is not plain."""
    m = NUM.match(value or "")
    if not (m and u.isdigit()):
        return None
    mant, exp = m.group(1), int(m.group(2)[1:]) if m.group(2) else 0
    dec = len(mant.split(".")[1]) if "." in mant else 0
    return float(f"{u}e{exp - dec}")


def half_life(raw):
    m = HALF.match(raw)
    if not m:
        return None, None, None
    return float(m.group(2)), m.group(3), m.group(2)


# Field specs per record type: (name, first column, last column, kind), columns 1-based inclusive as in the manual.
# kind: s = string; v = double + <name>_raw; t = half-life (half_life, half_life_unit, half_life_raw);
# u:<v> = uncertainty of value <v> (double + <name>_raw).
SPEC = {
    "levels": [("energy_kev", 10, 19, "v"), ("energy_unc", 20, 21, "u:energy_kev"), ("jpi", 22, 39, "s"),
               ("half_life", 40, 49, "t"), ("half_life_unc", 50, 55, "u:half_life"), ("l", 56, 64, "s"),
               ("s", 65, 74, "v"), ("s_unc", 75, 76, "u:s"), ("flag", 77, 77, "s"), ("ms", 78, 79, "s"),
               ("question", 80, 80, "s")],
    "gammas": [("e_gamma", 10, 19, "v"), ("unc", 20, 21, "u:e_gamma"), ("ri", 22, 29, "v"), ("ri_unc", 30, 31, "u:ri"),
               ("mult", 32, 41, "s"), ("mr", 42, 49, "v"), ("mr_unc", 50, 55, "u:mr"), ("cc", 56, 62, "v"),
               ("cc_unc", 63, 64, "u:cc"), ("ti", 65, 74, "v"), ("ti_unc", 75, 76, "u:ti"), ("flag", 77, 77, "s"),
               ("coincidence", 78, 78, "s"), ("question", 80, 80, "s")],
    "betas": [("energy_kev", 10, 19, "v"), ("energy_unc", 20, 21, "u:energy_kev"), ("ib", 22, 29, "v"),
              ("ib_unc", 30, 31, "u:ib"), ("logft", 42, 49, "v"), ("logft_unc", 50, 55, "u:logft"),
              ("flag", 77, 77, "s"), ("un", 78, 79, "s"), ("question", 80, 80, "s")],
    "ec": [("energy_kev", 10, 19, "v"), ("energy_unc", 20, 21, "u:energy_kev"), ("ib", 22, 29, "v"),
           ("ib_unc", 30, 31, "u:ib"), ("ie", 32, 39, "v"), ("ie_unc", 40, 41, "u:ie"), ("logft", 42, 49, "v"),
           ("logft_unc", 50, 55, "u:logft"), ("ti", 65, 74, "v"), ("ti_unc", 75, 76, "u:ti"), ("flag", 77, 77, "s"),
           ("un", 78, 79, "s"), ("question", 80, 80, "s")],
    "alphas": [("energy_kev", 10, 19, "v"), ("energy_unc", 20, 21, "u:energy_kev"), ("ia", 22, 29, "v"),
               ("ia_unc", 30, 31, "u:ia"), ("hf", 32, 39, "v"), ("hf_unc", 40, 41, "u:hf"), ("flag", 77, 77, "s"),
               ("question", 80, 80, "s")],
    "delayed": [("particle", 9, 9, "s"), ("energy_kev", 10, 19, "v"), ("energy_unc", 20, 21, "u:energy_kev"),
                ("ip", 22, 29, "v"), ("ip_unc", 30, 31, "u:ip"), ("ei", 32, 39, "v"), ("half_life", 40, 49, "t"),
                ("half_life_unc", 50, 55, "u:half_life"), ("l", 56, 64, "s"), ("flag", 77, 77, "s"),
                ("coincidence", 78, 78, "s"), ("question", 80, 80, "s")],
    "parents": [("parent_seq", 9, 9, "s"), ("energy_kev", 10, 19, "v"), ("energy_unc", 20, 21, "u:energy_kev"),
                ("jpi", 22, 39, "s"), ("half_life", 40, 49, "t"), ("half_life_unc", 50, 55, "u:half_life"),
                ("qp", 65, 74, "v"), ("qp_unc", 75, 76, "u:qp"), ("ion", 77, 80, "s")],
    # N and PN share columns; on PN rows nr, nt and nb hold NR x BR, NT x BR and NB x BR (manual, PN record).
    "normalization": [("parent_seq", 9, 9, "s"), ("nr", 10, 19, "v"), ("nr_unc", 20, 21, "u:nr"), ("nt", 22, 29, "v"),
                      ("nt_unc", 30, 31, "u:nt"), ("br", 32, 39, "v"), ("br_unc", 40, 41, "u:br"), ("nb", 42, 49, "v"),
                      ("nb_unc", 50, 55, "u:nb"), ("np", 56, 62, "v"), ("np_unc", 63, 64, "u:np"),
                      ("com", 77, 77, "s"), ("opt", 78, 78, "s")],
    "qvalues": [("q_minus", 10, 19, "v"), ("q_minus_unc", 20, 21, "u:q_minus"), ("sn", 22, 29, "v"),
                ("sn_unc", 30, 31, "u:sn"), ("sp", 32, 39, "v"), ("sp_unc", 40, 41, "u:sp"), ("qa", 42, 49, "v"),
                ("qa_unc", 50, 55, "u:qa"), ("qref", 56, 80, "s")],
    "xrefs": [("dssym", 9, 9, "s"), ("xref_dsid", 10, 39, "s")],
    "references": [("keynum", 10, 17, "s"), ("reference", 18, 80, "s")],
    "history": [("text", 10, 80, "s")],
    "other_records": [("col7", 7, 7, "s"), ("rtype", 8, 8, "s"), ("col9", 9, 9, "s"), ("text", 10, 80, "s")],
}
TABLE_OF = {"L": "levels", "G": "gammas", "B": "betas", "E": "ec", "A": "alphas", "D": "delayed", "P": "parents",
            "N": "normalization", "Q": "qvalues", "X": "xrefs", "R": "references", "H": "history"}
LEVEL_FED = {"gammas", "betas", "ec", "alphas", "delayed"}  # carry the level they follow
COMMON = [("release", S), ("dataset_seq", I), ("nucid", S), ("dsid", S), ("card_seq", I)]


def schema_of(table):
    cols = list(COMMON)
    if table in ("levels",) or table in LEVEL_FED:
        cols.append(("level_seq", I))
    if table == "normalization":
        cols.append(("kind", S))
    if table == "other_records":
        cols.append(("counted", pa.bool_()))
    for name, a, b, kind in SPEC[table]:
        if kind == "s":
            cols.append((name, S))
        elif kind == "t":
            cols += [("half_life", D), ("half_life_unit", S), ("half_life_raw", S)]
        else:
            cols += [(name, D), (name + "_raw", S)]
    if table == "levels":
        cols.append(("band", S))
    if table == "history":
        cols.append(("fields", S))
    cols.append(("continuation", S))
    return pa.schema(cols)


SCHEMAS = {t: schema_of(t) for t in SPEC}
SCHEMAS["datasets"] = pa.schema([
    ("release", S), ("dataset_seq", I), ("file_name", S), ("line_no", I), ("nucid", S), ("a", I), ("element", S),
    ("z", I), ("dsid", S), ("dstype", S), ("dsref", S), ("publication", S), ("date", S), ("history", S),
    ("card_count", I), ("record_count", I), ("level_count", I), ("gamma_count", I)])
SCHEMAS["comments"] = pa.schema([
    ("release", S), ("dataset_seq", I), ("nucid", S), ("dsid", S), ("card_seq", I), ("card_count", I),
    ("level_seq", I), ("comment_type", S), ("rtype", S), ("psym", S), ("text", S)])
SCHEMAS["cards"] = pa.schema([
    ("release", S), ("dataset_seq", I), ("file_name", S), ("line_no", I), ("card_seq", I), ("nucid", S),
    ("continuation", S), ("col7", S), ("rtype", S), ("text", S)])


def fields(line, table, row):
    vals = {}
    for name, a, b, kind in SPEC[table]:
        raw = line[a - 1:b].strip()
        if kind == "s":
            row[name] = raw or None
        elif kind == "v":
            row[name], row[name + "_raw"] = num(raw), raw or None
            vals[name] = raw
        elif kind == "t":
            row["half_life"], row["half_life_unit"], vals["half_life"] = half_life(raw)
            row["half_life_raw"] = raw or None
        else:
            row[name], row[name + "_raw"] = unc(vals.get(kind[2:]), raw), raw or None
    return row


def cont_fields(texts):
    """Continuation text 'Q1=V1$Q2<V2$...' -> {"Q1": "V1", "Q2": "< V2"}; repeats get '#2', '#3'."""
    d = {}
    for t in texts:
        for part in t.split("$"):
            p = part.strip()
            if not p:
                continue
            m = OP.match(p)
            if m:
                k, op, v = m.group(1).strip(), m.group(2).strip(), m.group(3).strip()
                v = v if op == "=" else f"{op} {v}"
            else:
                k, v = p, None
            key, i = k, 2
            while key in d:
                key, i = f"{k}#{i}", i + 1
            d[key] = v
    return d


def nucid_parts(nucid):
    a_raw, el = nucid[:3].strip(), nucid[3:5].strip().upper()
    a = int(a_raw) if a_raw.isdigit() else None
    z = Z_OF.get(el) if el else None
    if el.isdigit():
        z = 100 + int(el)
    return a, el or None, z


def dstype(dsid):
    u = dsid.upper()
    if u.startswith("ADOPTED"):
        return "adopted"
    if u.startswith("COMMENTS"):
        return "comments"
    if u.startswith("REFERENCES"):
        return "references"
    if " DECAY" in u:
        return "decay"
    if "(" in u and ")" in u:
        return "reaction"
    return "other"


BAND = re.compile(r"^\$?\s*BAND\s*\(\s*([A-Za-z0-9])\s*\)\s*[:$]?\s*(.*)$")


def main():
    src = lake.download(KEY, f"{WORK}/src.zip")
    tables = {t: lake.Table(OUT, t, SCHEMAS[t]) for t in list(SPEC) + ["datasets", "comments", "cards"]}
    seen_types = collections.Counter()  # (col7, col8) of primary-position records, for the manifest
    orphans = collections.Counter()     # continuation cards with no matching record before them
    nsr_records = collections.Counter()  # nsr-count's own tally, side by side
    files = []
    ds = None
    dataset_seq = 0

    def end_dataset():
        nonlocal ds
        if ds is None:
            return
        dsid = ds["dsid"]
        bands = {}
        for c in ds["rows"]["comments"]:
            if c["rtype"] == "L":
                m = BAND.match(c["text"] or "")
                if m:
                    bands.setdefault(m.group(1), m.group(2).split("\n")[0].strip() or None)
        for t, rows in ds["rows"].items():
            for r in rows:
                r["dsid"] = dsid
                if "_cont" in r:
                    c = r.pop("_cont")
                    if t == "history":
                        r["fields"] = json.dumps(cont_fields([r["text"] or ""] + c), ensure_ascii=False)
                    r["continuation"] = json.dumps(cont_fields(c), ensure_ascii=False) if c else None
                if t == "levels":
                    r["band"] = bands.get(r["flag"]) if r["flag"] else None
                tables[t].add(r)
        head = ds["head"]
        head["dsid"], head["dstype"] = dsid, dstype(dsid)
        head["history"] = json.dumps([json.loads(r["fields"]) for r in ds["rows"]["history"]], ensure_ascii=False) \
            if ds["rows"]["history"] else None
        head["card_count"] = ds["card_seq"]
        head["record_count"] = ds["records"]
        head["level_count"] = len(ds["rows"]["levels"])
        head["gamma_count"] = len(ds["rows"]["gammas"])
        tables["datasets"].add(head)
        ds = None

    z = zipfile.ZipFile(src)
    for name in z.namelist():
        if name.endswith("/"):
            continue
        files.append(name)
        start = True
        line_no = 0
        with z.open(name) as f:
            for rawline in io.TextIOWrapper(f, encoding="latin-1"):
                text = rawline.rstrip("\n")
                line = text.ljust(80)
                line_no += 1
                if not line.strip():
                    tables["cards"].append((RELEASE, ds["seq"] if ds else None, name, line_no, None, None, None, None,
                                            None, text))
                    end_dataset()
                    start = True
                    continue
                if start:
                    end_dataset()
                    dataset_seq += 1
                    nucid = line[0:5].strip()
                    a, el, zz = nucid_parts(line[0:5])
                    ds = {"seq": dataset_seq, "nucid": nucid, "dsid": line[9:39].strip(), "card_seq": 1, "records": 0,
                          "level_seq": 0, "last": None, "last_comment": None,
                          "rows": {t: [] for t in list(SPEC) + ["comments"]},
                          "head": {"release": RELEASE, "dataset_seq": dataset_seq, "file_name": name, "line_no": line_no,
                                   "nucid": nucid, "a": a, "element": el, "z": zz, "dsref": line[39:65].strip() or None,
                                   "publication": line[65:74].strip() or None, "date": line[74:80].strip() or None}}
                    tables["cards"].append((RELEASE, dataset_seq, name, line_no, 1, nucid, line[5].strip() or None,
                                            line[6].strip() or None, line[7].strip() or None, text))
                    start = False
                    continue
                ds["card_seq"] += 1
                c6, c7, c8 = line[5], line[6], line[7]
                tables["cards"].append((RELEASE, ds["seq"], name, line_no, ds["card_seq"], line[0:5].strip(),
                                        c6.strip() or None, c7.strip() or None, c8.strip() or None, text))
                base = {"release": RELEASE, "dataset_seq": ds["seq"], "nucid": line[0:5].strip(),
                        "card_seq": ds["card_seq"]}
                if c6 in " 1" and c7 == " ":
                    nsr_records[c8 if c8 != " " else "(blank)"] += 1
                if c7 in "CcDdTt":  # comment card (continuations join the comment before them)
                    lc = ds["last_comment"]
                    if c6 not in " 1" and lc is not None:
                        lc["text"] = (lc["text"] or "") + "\n" + line[9:80].rstrip()
                        lc["card_count"] += 1
                    else:
                        lc = dict(base, card_count=1, level_seq=ds["level_seq"] or None, comment_type=c7,
                                  rtype=c8.strip() or None, psym=line[8].strip() or None, text=line[9:80].rstrip())
                        ds["rows"]["comments"].append(lc)
                        ds["last_comment"] = lc
                    continue
                if c6 not in " 1":  # continuation card
                    last = ds["last"]
                    if last is not None and last[0] == c8:
                        last[1]["_cont"].append(line[9:80].strip())
                    elif last is None and c8 == " ":  # identification-record continuation: the DSID goes on
                        more = line[9:39].strip()
                        ds["dsid"] = ds["dsid"] + ("" if ds["dsid"].endswith(",") else " ") + more
                    else:
                        orphans[(c7, c8)] += 1
                    continue
                seen_types[(c7, c8)] += 1
                if c7 == " " and c8 in TABLE_OF:
                    t = TABLE_OF[c8]
                    row = fields(line, t, dict(base))
                    if t == "normalization":
                        row["kind"] = "N"
                elif c7 in "Pp" and c8 == "N":
                    t = "normalization"
                    row = fields(line, t, dict(base))
                    row["kind"] = "PN"
                else:
                    t = "other_records"
                    row = fields(line, t, dict(base))
                    row["counted"] = c7 == " "
                if c7 == " ":
                    ds["records"] += 1
                if t == "levels":
                    ds["level_seq"] += 1
                    row["level_seq"] = ds["level_seq"]
                elif t in LEVEL_FED:
                    row["level_seq"] = ds["level_seq"] or None
                row["_cont"] = []
                ds["rows"][t].append(row)
                ds["last"] = (c8, row)
    end_dataset()

    stats = {t: tb.close() for t, tb in tables.items()}
    others = ["betas", "ec", "alphas", "delayed", "parents", "normalization", "qvalues", "xrefs", "references",
              "history", "other_records"]
    manifest = {
        "dataset": DATASET, "release": RELEASE, "built_at": lake.now(),
        "source": {"key": KEY, "bytes": os.path.getsize(src), "files": files},
        "parser": {"script": "scripts/parse/ensdf/parse.py", "kind": "fixed-column reader written from the ENSDF manual "
                   "(raw/nndc/2026-11-07/ensdf/); no published ENSDF parser is held", "python": sys.version.split()[0],
                   "pyarrow": pa.__version__},
        "record_types_seen": {f"{c7!r}{c8!r}": n for (c7, c8), n in seen_types.most_common()},
        "orphan_continuations": {f"{c7!r}{c8!r}": n for (c7, c8), n in orphans.most_common()},
        "nsr_count_records_in_same_pass": dict(nsr_records.most_common()),
        "tables": {},
        "others_tables": others,
    }
    for t, st in stats.items():
        manifest["tables"][f"{DATASET}_{t}"] = {"location": f"s3://{lake.BUCKET}/{PREFIX}/{t}/", **st}
    with open(f"{WORK}/manifest.local.json", "w") as f:
        json.dump(manifest, f, indent=1)
    print(json.dumps({t: s["rows"] for t, s in stats.items()}))
    if not UPLOAD:
        return
    for t in tables:
        lake.sync(f"{OUT}/{t}", f"{PREFIX}/{t}/")
    print("uploaded")




REFERENCE = {  # Lambda nsr-count, 2026-11-07 (brief 15)
    ("ensdf", "2026-11-05"): {"datasets": 20117, "levels": 568228, "gammas": 793431, "others": 129399, "records": 1491058},
    ("xundl", "2026-10-01"): {"datasets": 12547, "levels": 194604, "gammas": 257154, "others": 20176, "records": 471934},
}


def register():
    """Register every table in Athena (DDL saved to scripts/parse/ensdf/ddl/), COUNT(*) each, check the counts against
    the reference and nsr-count rerun on the same zip, and write lake/<dataset>/<release>/manifest.json."""
    import nsr_count
    with open(f"{WORK}/manifest.local.json") as f:
        manifest = json.load(f)
    ddl_dir = f"{HERE}/ddl"
    scanned, queries = 0, 0
    for t in SCHEMAS:
        name = f"{DATASET}_{t}"
        n, s = lake.register(name, SCHEMAS[t], f"s3://{lake.BUCKET}/{PREFIX}/{t}/", ddl_dir)
        manifest["tables"][name]["athena_count"] = n
        scanned += s
        queries += 1
        lake.s3.upload_file(f"{ddl_dir}/{name}.sql", lake.BUCKET, f"lake/_work/parse/ensdf/ddl/{name}.sql")
    tb = manifest["tables"]
    rows = lambda t: tb[f"{DATASET}_{t}"]["athena_count"]  # noqa: E731
    pn, uncounted = (lake.rows(f"SELECT COUNT(*) FROM {DATASET}_normalization WHERE kind = 'PN'")[0][0][0],
                     lake.rows(f"SELECT COUNT(*) FROM {DATASET}_other_records WHERE NOT counted")[0][0][0])
    queries += 2
    others = sum(rows(t) for t in manifest["others_tables"]) - int(pn) - int(uncounted)
    mine = {"datasets": rows("datasets"), "levels": rows("levels"), "gammas": rows("gammas"), "others": others,
            "records": rows("levels") + rows("gammas") + others}
    ref = REFERENCE.get((DATASET, RELEASE), {})
    rerun = nsr_count.ensdf(KEY)
    rec = rerun["records"]
    rerun_counts = {"datasets": rerun["datasets"], "levels": rec.get("L", 0), "gammas": rec.get("G", 0),
                    "others": sum(rec.values()) - rec.get("L", 0) - rec.get("G", 0), "records": sum(rec.values())}
    manifest["counts_check"] = {
        "reference": ref, "nsr_count_rerun": rerun_counts, "tables": mine,
        "match": {k: mine[k] == ref.get(k) for k in mine},
        "cards_vs_lines": {"cards_rows": rows("cards"), "nsr_count_lines": rerun["lines"]},
        "others_rule": "others = rows of " + ", ".join(manifest["others_tables"]) + f" minus {pn} PN rows (column 7 "
                       f"'P', which nsr-count skips) minus {uncounted} other_records rows with column 7 set (not counted)",
    }
    manifest["spend"] = {"athena_queries": queries + 1, "athena_bytes_scanned": scanned,
                         "athena_usd": round(max(scanned, queries * 10_485_760) / 1e12 * 5, 4),
                         "box": "nsr-parse-1, m7i-flex.large (Free Tier hours); 100 GB gp3 of which 70 GB over the free 30 GB, "
                                "about $0.008 an hour, shared across brief 15's datasets"}
    lake.put_json(f"{PREFIX}/manifest.json", manifest)
    print(json.dumps(manifest["counts_check"], indent=1))


if __name__ == "__main__":
    if "--register-only" not in sys.argv:
        main()
    if UPLOAD:
        register()
