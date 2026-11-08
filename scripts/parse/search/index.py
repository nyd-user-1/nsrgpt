# Build the keyword index (brief 18): one DuckDB file, lake/serve/search/2026-11-08/search.duckdb, from nsr.search_docs
# (parsing-2's share) and docs_structure (parsing-1's, when present). Runs on the parse box:
#   index.py [--no-structure]
# 1. Read both docs folders from S3.
# 2. Write each record's searchable body: name, title, text, keywords, then every spelling of each nuclide it names
#    (U-235, 235U, U235; natural targets as Fe-nat, natFe) from z and a and from the nuclides found in its text, then
#    the other forms of a few words people type in either form (gamma/gammas, level/levels, half-life/half life, …).
# 3. DuckDB full-text search over the body: BM25, no stemming, no stop words, lower case, and tokens split on
#    anything but letters, digits and "-" so nuclide names stay whole ("u-235", "cs-137", "60co").
# 4. Drop the body (the index holds its own terms) and the staging table, sort the terms table by term, add the suggest table (nuclide names, reactions, author surnames
#    with counts, sorted), copy into a fresh file so dropped data takes no space, upload.
import sys, os, re, json, time, collections
here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(here))
from common import *
import duckdb
import pyarrow as pa
import pyarrow.parquet as pq

VERSION = "2026-11-08"
PREFIX = f"lake/serve/search/{VERSION}"
WORKDIR = "/data/search"
STAGE, FINAL = f"{WORKDIR}/stage.duckdb", f"{WORKDIR}/search.duckdb"
IGNORE = "[^a-z0-9-]+"
WORDS = [["gamma", "gammas", "gamma-ray", "gamma-rays", "gamma ray", "gamma rays"], ["level", "levels"],
         ["decay", "decays"], ["half-life", "half life", "halflife", "half-lives", "half lives"],
         ["cross section", "cross sections", "cross-section", "cross-sections"], ["resonance", "resonances"],
         ["yield", "yields"], ["spectrum", "spectra"], ["isotope", "isotopes", "nuclide", "nuclides"]]


def elements():
    path = "/data/tmp/elements.parquet"
    s3.download_file(BUCKET, "lake/exfor/dictionary/elements/part-0.parquet", path)
    t = pq.read_table(path).to_pylist()
    sym = {}
    for r in t:
        z, s = r["code"].split("-", 1)
        sym[int(z)] = (s[:1] + s[1:].lower(), r["description"])
    return sym  # z -> (symbol, name)


def spellings(sym, a, state=None):
    if a is None:
        return []
    if a == 0:
        return [f"{sym}-nat", f"nat{sym}", f"{sym}-0"]
    m = (state or "").lower() if (state or "").upper() in ("M", "M1", "M2", "G") else ""
    out = [f"{sym}-{a}", f"{a}{sym}", f"{sym}{a}"]
    if m:
        out += [f"{sym}-{a}{m}", f"{a}{sym}{m}", f"{a}m{sym}" if m.startswith("m") else ""]
    return [o for o in out if o]


def finder(syms):
    by_sym = {s.upper(): s for s, _ in syms.values()}
    pats = [re.compile(r"\b(\d{1,3})([A-Z][a-z]?)\b"),          # 235U, 60Co, 6He
            re.compile(r"\b([A-Z][a-z]?)-(\d{1,3})\b"),         # U-235, Cs-137
            re.compile(r"\b\d{1,3}-([A-Z]{1,2})-(\d{1,3})\b")]  # EXFOR 92-U-235, 27-CO-60
    nucid = re.compile(r"^\s*(\d{1,3})([A-Z]{1,2})\b")          # ENSDF/XUNDL nucid 60CO

    def find(text, ids=""):
        found = set()
        for m in pats[0].finditer(text or ""):
            if m.group(2).upper() in by_sym and 0 < int(m.group(1)) <= 300:
                found.add((by_sym[m.group(2).upper()], int(m.group(1))))
        for m in pats[1].finditer(text or ""):
            if m.group(1).upper() in by_sym and 0 < int(m.group(2)) <= 300:
                found.add((by_sym[m.group(1).upper()], int(m.group(2))))
        for m in pats[2].finditer(text or ""):
            if m.group(1) in by_sym:
                found.add((by_sym[m.group(1)], int(m.group(2))))
        m = nucid.match(ids or "")
        if m and m.group(2) in by_sym and 0 < int(m.group(1)) <= 300:
            found.add((by_sym[m.group(2)], int(m.group(1))))
        return found
    return find


def body_of(r, syms, find, nuc_counts):
    parts = [r["name"] or "", r["title"] or "", r["text"] or "", " ".join(r["keywords"] or [])]
    base = " ".join(parts)
    found = find(base, r["id"] if r["type"] in ("xundl_dataset", "ensdf_dataset", "dataset", "nuclide") else "")
    if r["z"] is not None and r["z"] in syms and r["a"] is not None:
        found.add((syms[r["z"]][0], int(r["a"])))
    extra = []
    for s, a in sorted(found):
        extra += spellings(s, a)
        nuc_counts[(s, a)] += 1
    if r["z"] is not None and r["z"] in syms:
        extra.append(syms[r["z"]][1])  # element name
    low = base.lower()
    for group in WORDS:
        if any(re.search(r"(?<![a-z])" + re.escape(w) + r"(?![a-z])", low) for w in group):
            extra += group
    return base + " " + " ".join(extra)


def build(with_structure=True):
    t0 = time.time()
    os.makedirs(WORKDIR, exist_ok=True)
    for f in (STAGE, FINAL):
        if os.path.exists(f):
            os.remove(f)
    c = boto3.Session().get_credentials().get_frozen_credentials()
    con = duckdb.connect(STAGE, config={"extension_directory": "/opt/duckdb_ext", "memory_limit": "5GB",
                                        "temp_directory": "/data/tmp", "threads": 2})
    con.execute("INSTALL fts"); con.execute("LOAD fts"); con.execute("LOAD httpfs")
    con.execute(f"CREATE SECRET lake (TYPE s3, KEY_ID '{c.access_key}', SECRET '{c.secret_key}', "
                f"SESSION_TOKEN '{c.token}', REGION '{REGION}')")
    sources = [f"s3://{BUCKET}/{PREFIX}/docs/*"]
    has_structure = bool(s3.list_objects_v2(Bucket=BUCKET, Prefix=f"{PREFIX}/docs_structure/", MaxKeys=1).get("KeyCount"))
    if with_structure and has_structure:
        sources.append(f"s3://{BUCKET}/{PREFIX}/docs_structure/*")
    src = "[" + ", ".join(f"'{s}'" for s in sources) + "]"
    con.execute(f"""CREATE TABLE src AS SELECT type, id, name, title, text, keywords, dataset,
                      TRY_CAST(z AS INTEGER) AS z, TRY_CAST(a AS INTEGER) AS a, TRY_CAST(mt AS INTEGER) AS mt,
                      TRY_CAST(year AS INTEGER) AS year, url_path
                    FROM read_parquet({src}, union_by_name = true)""")
    dropped = {}
    if len(sources) > 1:  # docs_structure carries its own ENSDF or XUNDL datasets: keep those, drop mine
        for name, mine in (("ENSDF", "ensdf_dataset"), ("XUNDL", "xundl_dataset")):
            theirs = con.execute("SELECT count(*) FROM src WHERE type <> ? AND type LIKE '%dataset%' AND "
                                 "(upper(dataset) = ? OR upper(split_part(id, ':', 1)) = ?)", [mine, name, name]).fetchone()[0]
            if theirs:
                dropped[mine] = con.execute("SELECT count(*) FROM src WHERE type = ?", [mine]).fetchone()[0]
                con.execute("DELETE FROM src WHERE type = ?", [mine])
    counts = dict(con.execute("SELECT type, count(*) FROM src GROUP BY 1 ORDER BY 1").fetchall())
    log("read", counts, f"{time.time() - t0:.0f}s")
    syms = elements()
    find = finder(syms)
    nuc_counts = collections.Counter()
    con.execute("""CREATE TABLE docs (rid INTEGER, type VARCHAR, id VARCHAR, name VARCHAR, title VARCHAR,
                   url_path VARCHAR, dataset VARCHAR, z SMALLINT, a SMALLINT, mt SMALLINT, year SMALLINT,
                   body VARCHAR)""")
    rid = 0
    reader = con.cursor().execute("SELECT * FROM src ORDER BY type, id").to_arrow_reader(100_000)  # own cursor: inserts run on con
    for batch in reader:
        rows = batch.to_pylist()
        out = {k: [] for k in ("rid", "type", "id", "name", "title", "url_path", "dataset", "z", "a", "mt", "year", "body")}
        for r in rows:
            out["rid"].append(rid); rid += 1
            for k in ("type", "id", "name", "title", "url_path", "dataset", "z", "a", "mt", "year"):
                out[k].append(r[k])
            out["body"].append(body_of(r, syms, find, nuc_counts))
        tb = pa.table(out)
        con.register("tb", tb)
        con.execute("INSERT INTO docs SELECT * FROM tb")
        con.unregister("tb")
    log("bodies", rid, f"{time.time() - t0:.0f}s")
    con.execute(f"PRAGMA create_fts_index('docs', 'rid', 'body', stemmer = 'none', stopwords = 'none', "
                f"ignore = '{IGNORE}', strip_accents = 1, lower = 1, overwrite = 1)")
    log("fts index", f"{time.time() - t0:.0f}s")
    # suggest: nuclide names (both spellings), reactions (U-235(n,f)), author surnames; weight = records naming them
    sug = collections.Counter()
    for (s, a), n in nuc_counts.items():
        if a > 0:
            sug[(f"{s}-{a}", "nuclide")] += n
            sug[(f"{a}{s}", "nuclide")] += n
    code = re.compile(r"^\d+-([A-Z]+)-(\d+)\(([^)]+)\)")
    for name, n in con.execute("SELECT name, count(*) FROM docs WHERE type = 'exfor_dataset' GROUP BY 1").fetchall():
        m = code.match(name or "")
        if m:
            sug[(f"{m.group(1)[:1]}{m.group(1)[1:].lower()}-{m.group(2)}({m.group(3).lower()})", "reaction")] += n
    authors = con.execute(f"""SELECT a, count(*) FROM (
          SELECT trim(unnest(string_split(authors, ';'))) AS a FROM
          read_parquet('s3://{BUCKET}/lake/nsr-database/2026-10-15/nsr/public.nsr/**/*.parquet') WHERE is_nsr
          UNION ALL SELECT unnest(authors) FROM read_parquet('s3://{BUCKET}/lake/exfor/j4-2026-10-28/entries/*'))
        WHERE a IS NOT NULL AND a <> '' GROUP BY 1""").fetchall()
    for a, n in authors:
        last = re.split(r"[.\s]", a.strip())[-1]
        if len(last) > 1 and last[0].isalpha():
            sug[(last[:1].upper() + last[1:].lower() if last.isupper() else last, "author")] += n
    con.execute("CREATE TABLE suggest (key VARCHAR, name VARCHAR, kind VARCHAR, weight INTEGER)")
    st = pa.table({"key": [k[0].lower() for k in sug], "name": [k[0] for k in sug], "kind": [k[1] for k in sug],
                   "weight": list(sug.values())})
    con.register("st", st)
    con.execute("INSERT INTO suggest SELECT * FROM st ORDER BY key, weight DESC")
    con.unregister("st")
    log("suggest", len(sug), f"{time.time() - t0:.0f}s")
    con.execute("ALTER TABLE docs DROP COLUMN body")
    con.execute("DROP TABLE src")
    # the terms table, one row per token, sorted by term so a query reads only its terms' blocks (same data, about
    # 40% faster on the box)
    con.execute("CREATE TABLE fts_main_docs.terms_s AS SELECT * FROM fts_main_docs.terms ORDER BY termid, docid")
    con.execute("DROP TABLE fts_main_docs.terms")
    con.execute("ALTER TABLE fts_main_docs.terms_s RENAME TO terms")
    con.execute("CHECKPOINT")
    con.execute(f"ATTACH '{FINAL}' AS final")
    con.execute("COPY FROM DATABASE stage TO final")
    con.execute("DETACH final")
    con.close()
    size_b = os.path.getsize(FINAL)
    log("final file", size_b, f"{time.time() - t0:.0f}s")
    s3.upload_file(FINAL, BUCKET, f"{PREFIX}/search.duckdb", Config=XFER)
    st = {"file": f"{PREFIX}/search.duckdb", "bytes": size_b, "sources": sources, "rows_by_type": counts,
          "docs": rid, "dropped_as_duplicates": dropped, "suggest_rows": len(sug), "build_s": round(time.time() - t0), "tokenizer":
          {"ignore": IGNORE, "stemmer": "none", "stopwords": "none", "lower": 1, "strip_accents": 1},
          "duckdb": duckdb.__version__, "built_at": now()}
    json.dump(st, open("/data/state/search-index.json", "w"), indent=1)
    put_json(f"lake/_work/parse/search/state/search-index.json", st)
    print(json.dumps(st))


if __name__ == "__main__":
    build("--no-structure" not in sys.argv)
