# nsr-api routes for CINDA, the Computer Index of Nuclear Reaction Data (brief 65, new-worker-1). lambda_function.py
# sends every path starting /cinda to route(path, query) -> (status, body). DuckDB (its own connection) reads
# s3://nsr-lake-613473203863/lake/cinda/<snapshot>/ (scripts/parse/cinda/parse.py): lines/ is one Parquet file sorted by
# target_za in row groups of 10,000, so a target opens only its row groups, as /exfor/points reads its points; the three
# dictionaries are small and load into memory on first use.
#   GET /cinda?target=U-235&reaction=N,F&quantity=CS&emin=1e3&emax=2e7&lab=ORL&type=expt&year=1990..2000&author=Smith
#             &origin=cinda|exfor|nsr&nsr=1990SM01&exfor=10001&sort=reaction|year&page=1       100 lines a page
#       Field syntax as the EXFOR routes: ";" separates alternatives (OR), a leading "^" excludes, "*" is a wildcard,
#       "a..b" is a range (year). target takes U-235, 92-U-235, 235U or U235 (U-0 natural, U-* every uranium target).
#       quantity matches the CINDA code or the old CINDA code; lab matches the code or the name anywhere ("ORL", "Oak
#       Ridge"); type takes expt, theo, eval, revw, comp or the letter. Energies in eV; a line matches when its range meets
#       [emin, emax] (lines whose energy is a word, as Maxw or NDG, drop out of an energy search).
#   GET /cinda/block/{block_id}          every line of one CINDA block
#   GET /cinda/pickers/{quantities|labs|types}   codes with their names and line counts (labs: the named ones)
import os
import re

import duckdb

from lambda_function import range_clause, terms, text_clause

BUCKET = os.environ.get("BUCKET", "nsr-lake-613473203863")
SNAPSHOT = os.environ.get("CINDA_SNAPSHOT", "2024-04-26")
ROOT = f"s3://{BUCKET}/lake/cinda/{SNAPSHOT}"
LINES = f"{ROOT}/lines/part-00000.parquet"
PAGE = 100
HERE = os.path.dirname(os.path.abspath(__file__))
ELEMENTS = ("NN H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb "
            "Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta "
            "W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt "
            "Ds Rg Cn Nh Fl Mc Lv Ts Og").split()
Z_OF = {e.upper(): z for z, e in enumerate(ELEMENTS)}
TYPES = {"EXPT": "E", "THEO": "T", "EVAL": "D", "REVW": "R", "COMP": "C"}
COLUMNS = ["block_id", "line_no", "target", "target_za", "reaction", "quantity", "quantity_word", "old_quantity",
           "e_min_ev", "e_max_ev", "energy_text", "lab", "lab_name", "work_type", "origin", "reference_text", "year",
           "author", "comment", "nsr_key", "nsr_resolved", "exfor_entry", "exfor_subentry", "exfor_resolved",
           "date_entered"]
SORTS = {"reaction": "target_za, target, reaction, quantity, year, block_id, line_no",
         "year": "year DESC NULLS LAST, target_za, block_id, line_no"}
PICKERS = {"quantities": ("dict_quantities", "lines DESC, code", "WHERE code <> '' AND lines > 0"),
           "labs": ("dict_labs", "lines DESC, code", "WHERE name <> ''"),
           "types": ("dict_types", "lines DESC", "")}
_con = None
_pickers = {}


def con():
    """One DuckDB per container: httpfs from the package (DUCKDB_EXT_DIR overrides, for tests), Lambda's credentials."""
    global _con
    if _con is None:
        c = duckdb.connect(config={"home_directory": "/tmp",
                                   "extension_directory": os.environ.get("DUCKDB_EXT_DIR", f"{HERE}/duckdb_ext"),
                                   "temp_directory": "/tmp/duckdb-cinda", "threads": 2})
        c.execute("LOAD httpfs")
        for s in ("enable_object_cache", "enable_http_metadata_cache"):  # keep the Parquet footer per container
            try:
                c.execute(f"SET {s} = true")
            except duckdb.Error:
                pass
        key, secret, token = (os.environ["AWS_ACCESS_KEY_ID"], os.environ["AWS_SECRET_ACCESS_KEY"],
                              os.environ.get("AWS_SESSION_TOKEN", ""))
        c.execute(f"CREATE SECRET lake (TYPE s3, KEY_ID '{key}', SECRET '{secret}', SESSION_TOKEN '{token}', "
                  "REGION 'us-east-2')")
        _con = c
    return _con


def target_form(t):
    """235U, U235, u-235 -> U-235; 92-U-235 and wildcards pass through."""
    m = re.fullmatch(r"(\d{1,3})\s*([A-Za-z]{1,2})", t) or None
    if m:
        return f"{m.group(2)}-{m.group(1)}"
    m = re.fullmatch(r"([A-Za-z]{1,2})(\d{1,3})", t)
    return f"{m.group(1)}-{m.group(2)}" if m else t


def target_za(t):
    """The target_za span a target term covers, for row-group pruning: (lo, hi), or None when it cannot be told."""
    m = re.fullmatch(r"(?:\d{1,3}-)?([A-Za-z]{1,2})-(\d{1,3}|\*)", t)
    if not m or m.group(1).upper() not in Z_OF:
        return None
    z = Z_OF[m.group(1).upper()]
    return (z * 1000, z * 1000 + 999) if m.group(2) == "*" else (z * 1000 + int(m.group(2)),) * 2


def where_of(q):
    where, params = [], []
    if q.get("target"):
        inc, exc = terms(q["target"])
        forms = [target_form(t) for t in inc] + ["^" + target_form(t) for t in exc]
        text_clause(";".join(forms), ["target", "target_full"], where, params)
        spans = [target_za(target_form(t)) for t in inc]
        if inc and all(spans):  # every alternative names a Z: read only its row groups
            where.append("(" + " OR ".join("target_za BETWEEN ? AND ?" for _ in spans) + ")")
            for lo, hi in spans:
                params += [lo, hi]
    if q.get("reaction"):
        text_clause(q["reaction"], ["reaction"], where, params)
    if q.get("quantity"):
        text_clause(q["quantity"], ["quantity", "old_quantity"], where, params)
    if q.get("lab"):
        inc, exc = terms(q["lab"])
        wrap = lambda t: t if "*" in t else f"*{t}*"  # noqa: E731
        text_clause(";".join([wrap(t) for t in inc] + ["^" + wrap(t) for t in exc]), ["lab", "lab_name"], where, params)
    if q.get("type"):
        inc, exc = terms(q["type"])
        code = lambda t: TYPES.get(t.upper(), t.upper())  # noqa: E731
        if inc:
            where.append(f"work_type_code IN ({', '.join('?' * len(inc))})")
            params += [code(t) for t in inc]
        for t in exc:
            where.append("work_type_code <> ?")
            params.append(code(t))
    if q.get("year"):
        range_clause(q["year"], "year", where, params)
    if q.get("author"):
        text_clause(q["author"], ["author"], where, params)
    if q.get("origin"):
        inc = [t.strip().lower() for t in re.split(r"[;,|]", q["origin"]) if t.strip()]
        where.append(f"origin IN ({', '.join('?' * len(inc))})")
        params += inc
    for k, col in (("nsr", "nsr_key"), ("exfor", "exfor_entry")):
        if q.get(k):
            text_clause(q[k], [col], where, params)
    emin = float(q["emin"]) if (q.get("emin") or "").strip() else None
    emax = float(q["emax"]) if (q.get("emax") or "").strip() else None
    if emin is not None:
        where.append("coalesce(e_max_ev, e_min_ev) >= ?")
        params.append(emin)
    if emax is not None:
        where.append("e_min_ev <= ?")
        params.append(emax)
    return " AND ".join(where) or "TRUE", params


def rows_of(cur):
    names = [d[0] for d in cur.description]
    return [dict(zip(names, r)) for r in cur.fetchall()]


def search(q):
    w, params = where_of(q)
    page = max(1, int(q.get("page") or 1))
    order = SORTS.get(q.get("sort") or "reaction", SORTS["reaction"])
    c = con().cursor()
    src = f"read_parquet('{LINES}')"
    total = c.execute(f"SELECT count(*) FROM {src} WHERE {w}", params).fetchone()[0]
    rows = rows_of(c.execute(f"SELECT {', '.join(COLUMNS)} FROM {src} WHERE {w} ORDER BY {order} LIMIT {PAGE} OFFSET ?",
                             params + [(page - 1) * PAGE]))
    return 200, {"total": total, "page": page, "page_size": PAGE, "pages": (total + PAGE - 1) // PAGE,
                 "snapshot": SNAPSHOT, "rows": rows}


def block(bid):
    c = con().cursor()
    rows = rows_of(c.execute(f"SELECT {', '.join(COLUMNS)}, lab_name, reader, serial, ref_type, ref_code, ref_volume, "
                             f"ref_page, pub_date, ext_reaction, ext_product, ext_lab, source_file "
                             f"FROM read_parquet('{LINES}') WHERE block_id = ? ORDER BY line_no", [int(bid)]))
    if not rows:
        return 404, {"error": f"no CINDA block {bid}"}
    return 200, {"block_id": int(bid), "snapshot": SNAPSHOT, "lines": len(rows), "rows": rows}


def picker(name):
    if name not in PICKERS:
        return 404, {"error": f"pickers: {', '.join(PICKERS)}"}
    if name not in _pickers:
        folder, order, where = PICKERS[name]
        _pickers[name] = rows_of(con().cursor().execute(
            f"SELECT * FROM read_parquet('{ROOT}/{folder}/*.parquet') {where} ORDER BY {order}"))
    return 200, {"name": name, "snapshot": SNAPSHOT, "rows": _pickers[name]}


def route(path, q):
    q = q or {}
    p = path.rstrip("/")
    try:
        if p == "/cinda":
            return search(q)
        m = re.fullmatch(r"/cinda/block/(\d+)", p)
        if m:
            return block(m.group(1))
        m = re.fullmatch(r"/cinda/pickers/([^/]+)", p)
        if m:
            return picker(m.group(1))
        return 404, {"error": "routes: /cinda, /cinda/block/{block_id}, /cinda/pickers/{quantities|labs|types}"}
    except (ValueError, duckdb.Error) as e:
        return 400, {"error": str(e)[:500]}
