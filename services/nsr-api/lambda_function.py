# nsr-api: the cached EXFOR API (brief 16, step 4). Lambda (Python 3.12) behind an API Gateway HTTP API and CloudFront,
# which caches each response for an hour keyed on the query string. DuckDB with httpfs reads the serving Parquet straight
# from s3://nsr-lake-613473203863/lake/serve/exfor/<version>/ and the J4 tables under lake/exfor/ (read-only role).
#   GET /exfor/search?target=U-235&reaction=N,F&quantity=SIG&product=…&energy=1e6..2e7&emin=…&emax=…&year=1990..2000
#                    &author=…&institute=…&acc=…&sort=reaction|year|acc&page=1      100 rows a page
#       Field syntax as on nds.iaea.org/exfor: ";" separates alternatives (OR), a leading "^" excludes, "*" is a
#       wildcard, "a..b" is a range. Energies are incident energies in eV.
#   GET /exfor/subentry/{id}      id = subentry (10003002) or dataset (subentry + pointer): bib and data points
#   GET /exfor/pickers/{name}     targets, reactions or quantities, with counts
import json, os, re, time
import duckdb

BUCKET = os.environ.get("BUCKET", "nsr-lake-613473203863")
VERSION = os.environ.get("SERVE_VERSION", "2026-10-28")
J4 = os.environ.get("J4_FOLDER", "j4-2026-10-28")
SERVE = f"s3://{BUCKET}/lake/serve/exfor/{VERSION}"
LAKE = f"s3://{BUCKET}/lake/exfor/{J4}"
PAGE = 100
PICKERS = ("targets", "reactions", "quantities")
HERE = os.path.dirname(os.path.abspath(__file__))
_con = None
_pickers = {}

COLUMNS = ["dataset", "entry", "subent", "pointer", "target_sym", "target", "reaction", "quantity", "sf6", "code",
           "product", "energy_min_ev", "energy_max_ev", "year", "first_author", "n_authors", "institute", "reference",
           "points", "has_c5", "units", "subentry_date"]
SORTS = {"reaction": "target_za, target, reaction, quantity, year, dataset", "year": "year DESC, dataset",
         "acc": "dataset"}


def con():
    """One DuckDB per container: httpfs from the package, Lambda's credentials, the search index held in memory."""
    global _con
    if _con is None:
        c = duckdb.connect(config={"home_directory": "/tmp", "extension_directory": f"{HERE}/duckdb_ext",
                                   "temp_directory": "/tmp/duckdb", "threads": 2})
        c.execute("LOAD httpfs")
        key, secret, token = (os.environ["AWS_ACCESS_KEY_ID"], os.environ["AWS_SECRET_ACCESS_KEY"],
                              os.environ.get("AWS_SESSION_TOKEN", ""))
        c.execute(f"CREATE SECRET lake (TYPE s3, KEY_ID '{key}', SECRET '{secret}', SESSION_TOKEN '{token}', "
                  "REGION 'us-east-2')")
        c.execute(f"CREATE TABLE si AS SELECT * FROM read_parquet('{SERVE}/search_index/*')")
        _con = c
    return _con


def terms(v):
    """IAEA field syntax: ';' alternatives, '^' excludes. Returns (include, exclude) lists."""
    inc, exc = [], []
    for t in (v or "").split(";"):
        t = t.strip()
        if not t:
            continue
        (exc if t.startswith("^") else inc).append(t.lstrip("^").strip())
    return inc, exc


def like(t):
    t = t.upper().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_").replace("*", "%")
    return t


def text_clause(v, cols, where, params):
    inc, exc = terms(v)

    def one(t):
        parts = []
        for c in cols:
            parts.append(f"upper(coalesce(CAST({c} AS VARCHAR), '')) LIKE ? ESCAPE '\\'")
            params.append(like(t))
        return "(" + " OR ".join(parts) + ")"
    if inc:
        where.append("(" + " OR ".join(one(t) for t in inc) + ")")
    for t in exc:
        where.append("NOT " + one(t))


def num(s):
    return float(s.strip()) if s and s.strip() else None


def range_clause(v, col, where, params):
    inc, exc = terms(v)

    def one(t):
        if ".." in t:
            a, b = (num(x) for x in t.split("..", 1))
            parts = []
            if a is not None:
                parts.append(f"{col} >= ?"); params.append(a)
            if b is not None:
                parts.append(f"{col} <= ?"); params.append(b)
            return "(" + " AND ".join(parts or ["TRUE"]) + ")"
        params.append(num(t))
        return f"{col} = ?"
    if inc:
        where.append("(" + " OR ".join(one(t) for t in inc) + ")")
    for t in exc:
        where.append("NOT " + one(t))


def search(q):
    where, params = [], []
    if q.get("target"):
        text_clause(q["target"], ["target_sym", "target"], where, params)
    if q.get("reaction"):
        text_clause(q["reaction"], ["reaction", "code"], where, params)
    if q.get("quantity"):
        text_clause(q["quantity"], ["sf6", "quantity"], where, params)
    if q.get("product"):
        text_clause(q["product"], ["product", "regexp_replace(product, '^[0-9]+-', '')"], where, params)
    if q.get("author"):
        text_clause(q["author"], ["first_author"], where, params)
    if q.get("institute"):
        text_clause(q["institute"], ["institute"], where, params)
    if q.get("acc"):
        text_clause(";".join(t if "*" in t else t + "*" for t in q["acc"].split(";")), ["dataset"], where, params)
    if q.get("year"):
        range_clause(q["year"], "year", where, params)
    emin, emax = num(q.get("emin")), num(q.get("emax"))
    if q.get("energy") and ".." in q["energy"]:
        a, b = q["energy"].split("..", 1)
        emin, emax = num(a), num(b)
    elif q.get("energy"):
        emin = emax = num(q["energy"])
    if emin is not None:
        where.append("energy_max_ev >= ?"); params.append(emin)
    if emax is not None:
        where.append("energy_min_ev <= ?"); params.append(emax)
    w = " AND ".join(where) or "TRUE"
    page = max(1, int(q.get("page") or 1))
    order = SORTS.get(q.get("sort") or "reaction", SORTS["reaction"])
    c = con().cursor()
    total = c.execute(f"SELECT count(*) FROM si WHERE {w}", params).fetchone()[0]
    rows = c.execute(f"SELECT {', '.join(COLUMNS)} FROM si WHERE {w} ORDER BY {order} LIMIT {PAGE} OFFSET ?",
                     params + [(page - 1) * PAGE]).fetchall()
    return {"total": total, "page": page, "page_size": PAGE, "pages": (total + PAGE - 1) // PAGE,
            "rows": [dict(zip(COLUMNS, r)) for r in rows]}


def records(c, sql, params):
    cur = c.execute(sql, params)
    names = [d[0] for d in cur.description]
    return [dict(zip(names, r)) for r in cur.fetchall()]


def subentry(sid):
    sid = sid.strip().upper()
    if not re.fullmatch(r"[0-9A-Z]{8}[0-9A-Z]?", sid):
        return 400, {"error": "id is a subentry (8 characters) or a dataset (subentry + pointer)"}
    sub, ptr = sid[:8], sid[8:]
    c = con().cursor()
    s = records(c, f"SELECT * FROM read_parquet('{LAKE}/subentries/*') WHERE subent = ?", [sub])
    if not s:
        return 404, {"error": f"no subentry {sub}"}
    s = s[0]
    e = records(c, f"SELECT * FROM read_parquet('{LAKE}/entries/*') WHERE entry = ?", [s["entry"]])
    first = records(c, f"SELECT subent, bib_json FROM read_parquet('{LAKE}/subentries/*') WHERE subent = ?",
                    [s["entry"] + "001"]) if not sub.endswith("001") else []
    cols = records(c, f"""SELECT section, col, pointer, name, unit, role, axis, value, value_text
                          FROM read_parquet('{LAKE}/data_columns/*') WHERE subent = ? ORDER BY section DESC, col""",
                   [sub])
    data_cols = [x for x in cols if x["section"] == "DATA"]
    pts = c.execute(f"""SELECT "row", col, coalesce(CAST(value AS VARCHAR), value_text) FROM
                        read_parquet('{LAKE}/data_points/*') WHERE subent = ? ORDER BY "row", col""", [sub]).fetchall()
    rows, cur, idx = [], None, {}
    for r, col, v in pts:
        if r != cur:
            rows.append([None] * len(data_cols)); cur = r
        rows[-1][col - 1] = None if v is None else (float(v) if re.fullmatch(r"[-+0-9.eE]+", v) else v)
    if ptr:  # a dataset: the columns for its pointer and the ones every pointer shares
        keep = [i for i, x in enumerate(data_cols) if x["pointer"] in ("", ptr)]
        data_cols = [data_cols[i] for i in keep]
        rows = [[r[i] for i in keep] for r in rows]
    bib = json.loads(s.pop("bib_json") or "{}")
    ds = records(c, f"SELECT {', '.join(COLUMNS)} FROM si WHERE subent = ?" + (" AND pointer = ?" if ptr else "")
                 + " ORDER BY dataset", [sub] + ([ptr] if ptr else []))
    return 200, {"id": sid, "subentry": {k: v for k, v in s.items() if v not in (None, [], "")},
                 "entry": e[0] if e else None, "datasets": ds, "bib": bib,
                 "entry_bib": json.loads(first[0]["bib_json"] or "{}") if first else None,
                 "common": [x for x in cols if x["section"] == "COMMON"],
                 "columns": data_cols, "rows": rows}


def picker(name):
    if name not in PICKERS:
        return 404, {"error": f"pickers: {', '.join(PICKERS)}"}
    if name not in _pickers:
        _pickers[name] = records(con().cursor(), f"SELECT * FROM read_parquet('{SERVE}/{name}/*') "
                                                 "ORDER BY datasets DESC", [])
    return 200, {"name": name, "version": VERSION, "rows": _pickers[name]}


def respond(status, body, t0):
    return {"statusCode": status,
            "headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*",
                        "Cache-Control": "public, max-age=3600" if status == 200 else "no-store",
                        "X-NSR-Ms": str(int((time.time() - t0) * 1000))},
            "body": json.dumps(body, default=str, separators=(",", ":"))}


def lambda_handler(event, context):
    t0 = time.time()
    path = event.get("rawPath") or event.get("path") or "/"
    q = event.get("queryStringParameters") or {}
    try:
        if path.rstrip("/") == "/exfor/search":
            return respond(200, search(q), t0)
        m = re.fullmatch(r"/exfor/subentry/([^/]+)/?", path)
        if m:
            return respond(*subentry(m.group(1)), t0)
        m = re.fullmatch(r"/exfor/pickers/([^/]+)/?", path)
        if m:
            return respond(*picker(m.group(1)), t0)
        return respond(404, {"error": "routes: /exfor/search, /exfor/subentry/{id}, /exfor/pickers/{name}"}, t0)
    except (ValueError, duckdb.Error) as e:
        return respond(400, {"error": str(e)[:500]}, t0)
