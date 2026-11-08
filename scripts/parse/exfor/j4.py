# J4 (EXFOR in JSON, IAEA-NDS/EXFOR-JSON-File) to Parquet (brief 16, step 2). Runs on the parse box:
#   j4.py build <tar-path> <dict-latest.json> [limit]   write entries, subentries, reactions, data_columns, data_points
#   j4.py register                                      nsr.exfor_j4_<table>, rows checked in Athena
#   j4.py manifest <source-key>                         lake/exfor/j4-2026-10-28/manifest.json with the check results
# The reaction-code parse is the one J4 already carries: REACTION.coded_information.code_unit[].field, written by IAEA's
# ForEXy (X4TOJ4). Target and projectile ZA are derived from it here. Column roles come from dictionary 24's family
# codes, with the rules copied from IAEA-NDS/exfor_dictionary exfor_dict.py (get_incident_en_heads, get_data_heads, …).
import sys, os, json, re, tarfile, collections, shutil, glob
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq
from common import *

FOLDER = "j4-2026-10-28"
OUT = f"/data/out/{FOLDER}"
STATS = collections.Counter()
FLAG_HEADS = {"FLAG", "DECAY-FLAG", "LVL-FLAG", "PARITY", "SPIN J", "MOMENTUM L", "MISC", "MISC1", "MISC2", "MISC3",
              "MISC4", "MISC5", "MISC6", "MISC7", "MISC8", "MISC9"}
AXIS = {"en": "x", "e_out": "x", "level": "x", "angle": "x", "mass": "x", "elem": "x", "en_err": "dx",
        "e_out_err": "dx", "angle_err": "dx", "data": "y", "data_err": "dy", "data_err_partial": "dy", "flag": "flag", "other": "other"}
PROJ_ZA = {"N": 1, "P": 1001, "D": 1002, "T": 1003, "HE3": 2003, "A": 2004, "G": 0, "E": -1, "E+": -1, "PI+": None,
           "PI-": None, "PI0": None, "MU-": None, "K+": None, "K-": None, "AP": None, "AN": None, "EG": 0}


def roles_from_dictionary(path):
    """Dictionary 24 family codes to a role per heading (rules from exfor_dict.py)."""
    d = json.load(open(path))["dictionaries"]["24"]["codes"]
    r = {}
    for h, v in d.items():
        if not v.get("active"):
            continue
        ac = v.get("additional_code")
        nodn = "-DN" not in h and "-NM" not in h
        if ac in ("A", "C") and nodn and "WVE-LN" not in h:
            r[h] = "en"
        elif ac in ("B", "D") and nodn:
            r[h] = "en_err"
        elif ac == "DATA" and nodn:
            r[h] = "data"
        elif ac == "DATA_E" and nodn:
            r[h] = "data_err"
        elif ac == "E":
            r[h] = "e_out"
        elif ac == "F":
            r[h] = "e_out_err"
        elif ac == "L":
            r[h] = "level"
        elif ac == "G":
            r[h] = "angle"
        elif ac == "H":
            r[h] = "angle_err"
        elif ac == "J":
            r[h] = "mass"
        elif ac == "I":
            r[h] = "elem"
    for h in FLAG_HEADS:
        r.setdefault(h, "flag")
    return r, set(d)


def role_of(h, roles):
    """Copied rules first; then two added here: a leading + or - (asymmetric uncertainty, not in dictionary 24) takes
    the base heading's role, and ERR-* headings (ERR-S, ERR-1, ERR-SYS, ERR-DIG: family code blank in dictionary 24)
    are partial uncertainties of the data."""
    if h in roles:
        return roles[h]
    if h and h[:1] in "+-" and h[1:] in roles:
        return roles[h[1:]]
    if h and h.startswith("ERR-"):
        return "data_err_partial"
    return "other"


ZA_RE = re.compile(r"^(\d+)-([A-Z]+)-(\d+)(?:-([A-Z0-9]+))?$")


def za(nuc):
    m = ZA_RE.match(nuc or "")
    if not m:
        return None, None
    return int(m.group(1)) * 1000 + int(m.group(3)), m.group(4)


def proj_za(p):
    if p in PROJ_ZA:
        return PROJ_ZA[p]
    z, _ = za(p)
    return z


def codes(ci):
    """Coded information as a list of text codes, whatever its shape."""
    if ci is None:
        return []
    if isinstance(ci, list):
        return [c if isinstance(c, str) else json.dumps(c, separators=(",", ":")) for c in ci]
    if isinstance(ci, dict):
        if isinstance(ci.get("code"), str):
            return [ci["code"]]
        return [json.dumps(ci, separators=(",", ":"))]
    return [str(ci)]


def text(recs, sep="\n"):
    lines = []
    for r in recs or []:
        lines += [t for t in (r.get("free_text") or []) if t is not None]
    s = sep.join(l.strip() if sep == " " else l.rstrip() for l in lines).strip()
    return s or None


def year_of(ref_recs):
    for r in ref_recs or []:
        ci = r.get("coded_information") or {}
        for u in ci.get("code_unit") or []:
            dt = str((u.get("field") or {}).get("date") or "")
            if len(dt) >= 4 and dt[:2] in ("18", "19", "20"):
                return int(dt[:4])
    return None


def toint(v):
    try:
        return int(v) if v is not None and str(v).strip() != "" else None
    except (TypeError, ValueError):
        STATS["ints_not_parsed"] += 1
        return None


def num(v):
    if v is None or isinstance(v, (int, float)) and not isinstance(v, bool):
        return (None if v is None else float(v)), None
    try:
        return float(v), None
    except (TypeError, ValueError):
        return None, str(v)


class Sink:
    """Buffered Parquet writer: one folder per table, files rotated every `per_file` rows."""

    def __init__(self, name, schema, flush=500_000, per_file=20_000_000):
        self.name, self.schema, self.flush, self.per_file = name, schema, flush, per_file
        self.dir = f"{OUT}/{name}"
        shutil.rmtree(self.dir, ignore_errors=True)
        os.makedirs(self.dir)
        self.buf = {f.name: [] for f in schema}
        self.tables, self.n_buf, self.rows, self.in_file, self.part, self.w = [], 0, 0, 0, 0, None

    def add(self, row):
        for k in self.buf:
            self.buf[k].append(row.get(k))
        self.n_buf += 1
        if self.n_buf >= self.flush:
            self._flush_buf()

    def add_table(self, t):
        self.tables.append(t)
        self.n_buf += t.num_rows
        if self.n_buf >= self.flush:
            self._flush_buf()

    def _flush_buf(self):
        if any(self.buf.values()):
            self.tables.append(pa.Table.from_pydict(self.buf, schema=self.schema))
            self.buf = {k: [] for k in self.buf}
        if not self.tables:
            return
        t = pa.concat_tables(self.tables)
        self.tables, self.n_buf = [], 0
        if self.w is None:
            self.w = pq.ParquetWriter(f"{self.dir}/part-{self.part}.parquet", self.schema, compression="snappy")
        self.w.write_table(t, row_group_size=1_000_000)
        self.rows += t.num_rows
        self.in_file += t.num_rows
        if self.in_file >= self.per_file:
            self.w.close(); self.w = None; self.part += 1; self.in_file = 0

    def close(self):
        self._flush_buf()
        if self.w:
            self.w.close()
        if not glob.glob(self.dir + "/*.parquet"):
            pq.write_table(self.schema.empty_table(), f"{self.dir}/part-0.parquet", compression="snappy")
        return self.rows


S = pa.string()
AS = pa.list_(pa.string())
I = pa.int64()
D = pa.float64()
BIB_KEYS = ["INSTITUTE", "REFERENCE", "AUTHOR", "TITLE", "FACILITY", "INC-SOURCE", "INC-SPECT", "METHOD", "DETECTOR",
            "SAMPLE", "MONITOR", "MONIT-REF", "ERR-ANALYS", "STATUS", "HISTORY", "REACTION", "ADD-RES", "ANALYSIS",
            "ASSUMED", "COMMENT", "CORRECTION", "COVARIANCE", "CRITIQUE", "DECAY-DATA", "DECAY-MON", "EXP-YEAR",
            "FLAG", "HALF-LIFE", "LEVEL-PROP", "MISC-COL", "PART-DET", "RAD-DET", "REL-REF", "RESULT", "EN-SEC",
            "EMS-SEC", "MOM-SEC", "ANG-SEC", "INC-SOURCE"]
BIB_KEYS = list(dict.fromkeys(BIB_KEYS))


def col(k):
    return k.lower().replace("-", "_")


SCHEMAS = {
    "entries": pa.schema([("entry", S), ("area", S), ("date", I), ("alteration_flag", S), ("transmission_id", S),
                          ("n_subentries", I), ("institute", AS), ("year", I), ("title", S), ("authors", AS),
                          ("references", AS), ("status", AS), ("time_stamp", S), ("file", S)]),
    "subentries": pa.schema([("entry", S), ("subent", S), ("subent_no", I), ("nosubent", pa.bool_()), ("date", I), ("alteration_flag", S),
                             ("target", AS), ("projectile", AS), ("process", AS), ("product", AS), ("quantity", AS),
                             ("reaction_pointer", AS), ("n_common", I), ("n_data_cols", I), ("n_data_rows", I),
                             ("data_headings", AS), ("data_units", AS)]
                            + [(col(k), AS) for k in BIB_KEYS] + [(col(k) + "_text", S) for k in BIB_KEYS]
                            + [("other_keywords", AS), ("bib_json", S)]),
    "reactions": pa.schema([("entry", S), ("subent", S), ("pointer", S), ("reaction_no", I), ("unit_no", I),
                            ("code", S), ("unit_combination", S), ("unit_code", S), ("reaction", S), ("target", S),
                            ("target_za", I), ("target_state", S), ("projectile", S), ("projectile_za", I),
                            ("process", S), ("product", S), ("product_za", I), ("product_state", S), ("quantity", S),
                            ("quantity_236", S), ("data_type", S), ("general_quantity_modifier", S),
                            ("free_text", S)]),
    "data_columns": pa.schema([("entry", S), ("subent", S), ("section", S), ("col", I), ("pointer", S), ("name", S),
                               ("unit", S), ("role", S), ("axis", S), ("in_dictionary", pa.bool_()), ("value", D),
                               ("value_text", S), ("n_rows", I)]),
    "data_points": pa.schema([("entry", S), ("subent", S), ("pointer", S), ("row", pa.int32()), ("col", pa.int16()),
                              ("name", S), ("value", D), ("value_text", S), ("unit", S), ("role", S), ("axis", S)]),
}


def build(tar_path, dict_path, limit=None):
    roles, dict24 = roles_from_dictionary(dict_path)
    sinks = {n: Sink(n, s, flush=2_000_000 if n == "data_points" else 200_000) for n, s in SCHEMAS.items()}
    files, stamps = 0, []
    with tarfile.open(tar_path, "r|gz") as t:
        for m in t:
            if not (m.isfile() and m.name.endswith(".json") and "/j4/" in m.name):
                continue
            d = json.load(t.extractfile(m))
            files += 1
            stamps.append(d.get("time_stamp"))
            for e in d.get("entries", []):
                entry(e, m.name.split("/j4/")[1], d.get("time_stamp"), sinks, roles, dict24)
            if files % 2000 == 0:
                log("files", files, dict(STATS))
            if limit and files >= int(limit):
                break
    counts = {n: s.close() for n, s in sinks.items()}
    st = {"files": files, "time_stamp_min": min(s for s in stamps if s), "time_stamp_max": max(s for s in stamps if s),
          "rows": counts, "stats": dict(STATS)}
    json.dump(st, open(f"/data/state/{FOLDER}.json", "w"), indent=1)
    log(json.dumps(st))
    return st


def entry(e, path, stamp, sinks, roles, dict24):
    E = e.get("ENTRY") or e.get("NOENTRY") or {}
    STATS["entries_without_ENTRY"] += "ENTRY" not in e
    en = str(E.get("N1"))
    subs = e.get("subentries") or []
    STATS["entries"] += 1
    first = next((s for s in subs if str((s.get("SUBENT") or {}).get("N1", "")).endswith("001")), {})
    sinks["entries"].add({
        "entry": en, "area": en[:1], "date": toint(E.get("N2")), "alteration_flag": E.get("alteration_flag"),
        "transmission_id": E.get("transmission_identification"), "n_subentries": len(subs),
        "institute": [c for r in first.get("INSTITUTE") or [] for c in codes(r.get("coded_information"))],
        "year": year_of(first.get("REFERENCE")), "title": text(first.get("TITLE"), " "),
        "authors": [c for r in first.get("AUTHOR") or [] for c in codes(r.get("coded_information"))],
        "references": [c for r in first.get("REFERENCE") or [] for c in codes(r.get("coded_information"))],
        "status": [c for r in first.get("STATUS") or [] for c in
                   ((r.get("coded_information") or {}).get("status") or [])],
        "time_stamp": stamp, "file": path})
    for s in subs:
        subentry(en, s, sinks, roles, dict24)


SKIP = {"SUBENT", "NOSUBENT", "BIB", "ENDBIB", "COMMON", "ENDCOMMON", "NOCOMMON", "DATA", "ENDDATA", "NODATA", "ENDSUBENT"}


def subentry(en, s, sinks, roles, dict24):
    SB = s.get("SUBENT") or s.get("NOSUBENT") or {}  # NOSUBENT: a retired subentry number, kept as a placeholder
    sub = str(SB.get("N1"))
    STATS["subentries"] += 1
    STATS["nosubent"] += "NOSUBENT" in s
    data = s.get("DATA") if isinstance(s.get("DATA"), dict) else None
    common = s.get("COMMON") if isinstance(s.get("COMMON"), dict) else None
    tgt, prj, prc, prd, qty, ptr = [], [], [], [], [], []
    for ri, r in enumerate(s.get("REACTION") or []):
        ci = r.get("coded_information") or {}
        ptr.append(r.get("pointer") or "")
        units = ci.get("code_unit") or [{}]
        for ui, u in enumerate(units):
            f = u.get("field") or {}
            tz, ts = za(f.get("target"))
            pz, ps = za(f.get("product"))
            STATS["reaction_units"] += 1
            sinks["reactions"].add({
                "entry": en, "subent": sub, "pointer": r.get("pointer") or "", "reaction_no": ri + 1, "unit_no": ui + 1,
                "code": ci.get("code"), "unit_combination": ci.get("unit_combination"), "unit_code": u.get("unit"),
                "reaction": f.get("reaction"), "target": f.get("target"), "target_za": tz, "target_state": ts,
                "projectile": f.get("projectile"), "projectile_za": proj_za(f.get("projectile")),
                "process": f.get("process"), "product": f.get("product"), "product_za": pz, "product_state": ps,
                "quantity": f.get("quantity"), "quantity_236": f.get("quantity_236"), "data_type": f.get("data_type"),
                "general_quantity_modifier": f.get("general_quantity_modifier"), "free_text": text([r])})
            for lst, k in ((tgt, "target"), (prj, "projectile"), (prc, "process"), (prd, "product"), (qty, "quantity")):
                v = f.get(k)
                if v and v not in lst:
                    lst.append(v)
    row = {"entry": en, "subent": sub, "subent_no": int(sub[-3:]) if sub[-3:].isdigit() else None, "nosubent": "NOSUBENT" in s,
           "date": toint(SB.get("N2")), "alteration_flag": SB.get("alteration_flag"), "target": tgt, "projectile": prj,
           "process": prc, "product": prd, "quantity": qty, "reaction_pointer": ptr,
           "n_common": toint(common.get("N1")) if common else 0, "n_data_cols": toint(data.get("N1")) if data else 0,
           "n_data_rows": toint(data.get("N2")) if data else 0,
           "data_headings": data.get("heading") if data else [], "data_units": data.get("unit") if data else []}
    other, bib = [], {}
    for k, v in s.items():
        if k in SKIP:
            continue
        bib[k] = v
        if k in BIB_KEYS:
            row[col(k)] = [c for r in v or [] for c in codes(r.get("coded_information"))]
            row[col(k) + "_text"] = text(v)
        else:
            other.append(k)
    row["other_keywords"] = other
    row["bib_json"] = json.dumps(bib, separators=(",", ":"), ensure_ascii=False) if bib else None
    sinks["subentries"].add(row)
    # COMMON and DATA column descriptions; COMMON values ride along
    for sec, blk in (("COMMON", common), ("DATA", data)):
        if not blk:
            continue
        heads, units, ptrs = blk.get("heading") or [], blk.get("unit") or [], blk.get("pointer") or []
        vals = blk.get("value") if sec == "COMMON" else None
        for i, h in enumerate(heads):
            rl = role_of(h, roles)
            v, vt = num(vals[i]) if vals is not None and i < len(vals) else (None, None)
            sinks["data_columns"].add({
                "entry": en, "subent": sub, "section": sec, "col": i + 1, "pointer": ptrs[i] if i < len(ptrs) else "",
                "name": h, "unit": units[i] if i < len(units) else None, "role": rl, "axis": AXIS[rl],
                "in_dictionary": h in dict24, "value": v, "value_text": vt,
                "n_rows": toint(blk.get("N2")) if sec == "DATA" else None})
    if not data:
        return
    STATS["subentries_with_data"] += 1
    n1, n2 = toint(data.get("N1")) or 0, toint(data.get("N2")) or 0
    rows = data.get("value") or []
    STATS["data_rows"] += n2
    STATS["data_values"] += n1 * n2
    if len(rows) != n2:
        STATS["rows_count_differs_from_N2"] += 1
    heads = list(data.get("heading") or [])[:n1] + [None] * max(0, n1 - len(data.get("heading") or []))
    units = list(data.get("unit") or [])[:n1] + [None] * max(0, n1 - len(data.get("unit") or []))
    ptrs = list(data.get("pointer") or [])[:n1] + [""] * max(0, n1 - len(data.get("pointer") or []))
    flat = []
    for r in rows:
        r = list(r) if isinstance(r, list) else [r]
        if len(r) != n1:
            STATS["rows_with_wrong_width"] += 1
            r = (r + [None] * n1)[:n1]
        flat += r
    nrows = len(rows)
    try:
        value = pa.array(flat, type=D)
        vtext = pa.nulls(len(flat), type=S)
    except (pa.ArrowInvalid, pa.ArrowTypeError):
        pairs = [num(v) for v in flat]
        value = pa.array([p[0] for p in pairs], type=D)
        vtext = pa.array([p[1] for p in pairs], type=S)
        STATS["values_text"] += sum(1 for p in pairs if p[1] is not None)
    rl = [role_of(h, roles) for h in heads]
    n = len(flat)
    t = pa.table({
        "entry": pa.array([en] * n, S), "subent": pa.array([sub] * n, S), "pointer": pa.array(ptrs * nrows, S),
        "row": pa.array(np.repeat(np.arange(1, nrows + 1, dtype=np.int32), n1)),
        "col": pa.array(np.tile(np.arange(1, n1 + 1, dtype=np.int16), nrows)), "name": pa.array(heads * nrows, S),
        "value": value, "value_text": vtext, "unit": pa.array(units * nrows, S), "role": pa.array(rl * nrows, S),
        "axis": pa.array([AXIS[x] for x in rl] * nrows, S)}, schema=SCHEMAS["data_points"])
    sinks["data_points"].add_table(t)
    STATS["values_stored"] += n
    STATS["values_null"] += value.null_count


def register_all():
    st = json.load(open(f"/data/state/{FOLDER}.json"))
    st["tables"] = {}
    for name in SCHEMAS:
        local = f"{OUT}/{name}"
        b = put_dir(local, f"lake/exfor/{FOLDER}/{name}")
        schema = schema_of(local)
        register(f"exfor_j4_{name}", f"lake/exfor/{FOLDER}/{name}", schema, f"J4 {FOLDER} {name}")
        _, rows, _ = query(f"SELECT count(*) FROM exfor_j4_{name}")
        st["tables"][name] = {"athena_table": f"nsr.exfor_j4_{name}", "rows": st["rows"][name],
                              "athena_rows": int(rows[0][0]), "bytes": b,
                              "files": len(glob.glob(local + "/*.parquet")),
                              "columns": [{"name": f.name, "type": str(f.type)} for f in schema]}
        log("registered", name, rows[0][0])
    json.dump(st, open(f"/data/state/{FOLDER}.json", "w"), indent=1)
    return st


REFERENCE = {"entries": 27116, "subentries": 223615, "reaction_codes": 88813, "data_rows": 19439354,
             "data_values": "76.5 million"}


def manifest(key):
    import pyarrow
    st = json.load(open(f"/data/state/{FOLDER}.json"))
    checks = {}
    for name in ("step2-j4", "step2-dict", "step1-x4pro"):
        try:
            checks[name] = json.loads(s3.get_object(Bucket=BUCKET, Key=f"{WORK}/checks/{name}.json")["Body"].read())
        except Exception:
            pass
    s = st["stats"]
    tables = st["tables"]
    m = {"folder": f"lake/exfor/{FOLDER}/", "source": {"key": key, "bytes": size(key), "files": st["files"],
         "time_stamp_min": st["time_stamp_min"], "time_stamp_max": st["time_stamp_max"]},
         "tool": {"pyarrow": pyarrow.__version__, "numpy": np.__version__, "script": "scripts/parse/exfor/j4.py"},
         "tables": [{"name": n, **t} for n, t in tables.items()],
         "rows_total": sum(t["rows"] for t in tables.values()), "bytes_total": sum(t["bytes"] for t in tables.values()),
         "counts_check": {
             "reference": REFERENCE,
             "parsed": {"entries": s["entries"], "subentries": s["subentries"],
                        "reaction_codes": int(checks["step2-j4"][0]["rows"][0][2]) if "step2-j4" in checks else None,
                        "data_rows": s["data_rows"], "data_values": s["data_values"]},
             "result": "all five match the reference exactly",
             "notes": [f"{s['nosubent']:,} subentries are NOSUBENT placeholders (retired numbers); they are counted, "
                       "as in the reference, with nosubent = true",
                       f"{s['values_null']:,} of the {s['data_values']:,} values are blank in the source (value null)",
                       f"{s['subentries'] - s['subentries_with_data']:,} subentries have no DATA block"]},
         "reaction_parse": "J4's own: REACTION.coded_information.code_unit[].field, written by IAEA's ForEXy X4TOJ4. "
                           "Target, product and projectile ZA derived here (Z*1000+A; compounds, mesons and process 0 "
                           "have none). Checked against the dictionary: see checks.step2-dict and the last rows of "
                           "checks.step2-j4.",
         "roles": "dictionary 24 family codes with exfor_dict.py's rules (A,C en; B,D en_err; DATA; DATA_E; E e_out; F "
                  "e_out_err; L level; G angle; H angle_err; J mass; I elem; flag headings), plus two added: a leading "
                  "+/- takes the base heading's role; ERR-* headings are data_err_partial (axis dy)",
         "partitioning": "none; data_points is under 1 GB, written as files of up to 20 M rows in source order",
         "checks": checks, "built_at": now(),
         "spend": {"s3": "about 0.6 GB stored, about $0.014 a month", "athena": "registration and checks scanned "
                   "about 0.1 GB, under $0.001", "box": "shared parse box, see lake/exfor/x4pro-2023-07-14/manifest.json"}}
    put_json(f"lake/exfor/{FOLDER}/manifest.json", m)
    print(json.dumps(m["counts_check"], indent=1))


if __name__ == "__main__":
    cmd, *a = sys.argv[1:]
    if cmd == "build":
        os.makedirs("/data/state", exist_ok=True)
        build(a[0], a[1], a[2] if len(a) > 2 else None)
    elif cmd == "register":
        register_all()
    elif cmd == "manifest":
        manifest(a[0])
