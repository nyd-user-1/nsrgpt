# keyword_search: the keyword search routes of nsr-api (brief 18). lambda_function.py sends /search, /suggest and /nsr
# here (MODULES). One DuckDB file holds the index: lake/serve/search/<version>/search.duckdb, built by
# scripts/parse/search/index.py (DuckDB full-text search, BM25, no stemming, nuclide names kept whole). A cold start
# copies it to /tmp in one S3 read and opens it read-only; the response says how long that took.
#   GET /search?q=U-235 fission&type=exfor_dataset,nsr&limit=25   {q, hits: [{type, id, name, title, score, url_path}],
#                                                                  total, took_ms}; limit default 25, max 200
#   GET /suggest?q=Cs-1                                            up to 10 names starting with q (nuclides, reactions,
#                                                                  authors), most-cited first
#   GET /nsr/{key}                                                 one NSR reference (lake/serve/search/<version>/nsr/)
import os, re, time
import boto3
import duckdb
from boto3.s3.transfer import TransferConfig

BUCKET = os.environ.get("BUCKET", "nsr-lake-613473203863")
VERSION = os.environ.get("SEARCH_VERSION", "2026-11-08")
KEY = f"lake/serve/search/{VERSION}/search.duckdb"
LOCAL = "/tmp/search.duckdb"
NSR = f"s3://{BUCKET}/lake/serve/search/{VERSION}/nsr/*"
HERE = os.path.dirname(os.path.abspath(__file__))
_con, _nsr = None, None
_cold = {}

# fts_main_docs.match_bm25's own formula (DuckDB 2.0 fts: BM25F with one field, k = 1.2, b = 0.75), written over the
# index tables so it reads only the documents that hold a query term instead of scoring every row. Same hits and the
# same scores as the macro (scripts/parse/search/test_direct.py checks it), about 2.5 times faster.
SEARCH = """WITH raw AS (SELECT DISTINCT unnest(fts_main_docs.tokenize(?)) AS t),
tokens AS (SELECT DISTINCT stem(t, 'none') AS t FROM raw WHERE t IS NOT NULL AND t <> ''),
qt AS (SELECT dict.termid, dict.df FROM fts_main_docs.dict AS dict JOIN tokens ON dict.term = tokens.t),
tf AS (SELECT termid, docid, count(*) AS tf FROM fts_main_docs.terms WHERE termid IN (SELECT termid FROM qt)
       GROUP BY termid, docid),
st AS (SELECT num_docs, list_extract(avg_field_lens, 1) AS avgdl FROM fts_main_docs.stats),
ntf AS (SELECT tf.docid, qt.df, tf.tf / (0.25 + 0.75 * list_extract(fd.field_lens, 1) / st.avgdl) AS ntf
        FROM tf JOIN qt USING (termid) JOIN fts_main_docs.docs AS fd ON fd.docid = tf.docid CROSS JOIN st),
sc AS (SELECT ntf.docid, sum(log(((st.num_docs - ntf.df) + 0.5) / (ntf.df + 0.5) + 1) * (ntf.ntf * 2.2) / (ntf.ntf + 1.2))
              AS score FROM ntf CROSS JOIN st GROUP BY ntf.docid),
hits AS (SELECT sc.docid, sc.score, fd.name AS rid FROM sc JOIN fts_main_docs.docs AS fd USING (docid) {join}),
top AS (SELECT rid, score, count(*) OVER () AS total FROM hits ORDER BY score DESC, rid LIMIT {limit})
SELECT d.type, d.id, d.name, d.title, top.score, d.url_path, top.total FROM top JOIN docs AS d USING (rid)
ORDER BY top.score DESC, top.rid"""


def con():
    """The index, copied from S3 to /tmp once per container and opened read-only."""
    global _con
    if _con is None:
        t0 = time.time()
        s3 = boto3.client("s3")
        size = s3.head_object(Bucket=BUCKET, Key=KEY)["ContentLength"]
        if not (os.path.exists(LOCAL) and os.path.getsize(LOCAL) == size):
            s3.download_file(BUCKET, KEY, LOCAL + ".part",
                             Config=TransferConfig(multipart_chunksize=16 * 2**20, max_concurrency=16))
            os.replace(LOCAL + ".part", LOCAL)
        t1 = time.time()
        c = duckdb.connect(LOCAL, read_only=True, config={"extension_directory": f"{HERE}/duckdb_ext",
                                                          "home_directory": "/tmp"})
        c.execute("LOAD fts")
        _con = c
        _cold.update(bytes=size, copy_ms=round((t1 - t0) * 1000), open_ms=round((time.time() - t1) * 1000))
    return _con


def nsr_con():
    """In-memory DuckDB with httpfs for the NSR detail table."""
    global _nsr
    if _nsr is None:
        c = duckdb.connect(config={"home_directory": "/tmp", "extension_directory": f"{HERE}/duckdb_ext"})
        c.execute("LOAD httpfs")
        key, secret, token = (os.environ["AWS_ACCESS_KEY_ID"], os.environ["AWS_SECRET_ACCESS_KEY"],
                              os.environ.get("AWS_SESSION_TOKEN", ""))
        c.execute(f"CREATE SECRET lake (TYPE s3, KEY_ID '{key}', SECRET '{secret}', SESSION_TOKEN '{token}', "
                  "REGION 'us-east-2')")
        _nsr = c
    return _nsr


def cold_info():
    info = dict(_cold)
    _cold.clear()  # reported once, on the request that paid for it
    return info


def search(q):
    t0 = time.time()
    text = (q.get("q") or "").strip()
    if not text:
        return 400, {"error": "q is required, e.g. /search?q=U-235 fission"}
    limit = min(200, max(1, int(q.get("limit") or 25)))
    types = [t.strip() for t in (q.get("type") or "").split(",") if t.strip()]
    join = (f"JOIN docs AS dt ON dt.rid = fd.name WHERE dt.type IN ({', '.join('?' * len(types))})" if types else "")
    c = con()
    t1 = time.time()
    rows = c.execute(SEARCH.format(join=join, limit=limit), [text] + types).fetchall()
    body = {"q": text, "hits": [{"type": r[0], "id": r[1], "name": r[2], "title": r[3], "score": round(r[4], 4),
                                 "url_path": r[5]} for r in rows],
            "total": rows[0][6] if rows else 0, "took_ms": round((time.time() - t1) * 1000)}
    info = cold_info()
    if info:
        body["cold_start"] = {**info, "total_ms": round((time.time() - t0) * 1000)}
    return 200, body


def suggest(q):
    t0 = time.time()
    p = (q.get("q") or "").strip().lower()
    if not p:
        return 200, {"q": "", "names": [], "suggestions": []}
    pat = p.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
    c = con()
    t1 = time.time()
    rows = c.execute("SELECT name, kind, weight FROM suggest WHERE key LIKE ? ESCAPE '\\' "
                     "ORDER BY weight DESC, key LIMIT 10", [pat]).fetchall()
    body = {"q": q.get("q").strip(), "names": [r[0] for r in rows],
            "suggestions": [{"name": r[0], "kind": r[1], "records": r[2]} for r in rows],
            "took_ms": round((time.time() - t1) * 1000)}
    info = cold_info()
    if info:
        body["cold_start"] = {**info, "total_ms": round((time.time() - t0) * 1000)}
    return 200, body


def nsr(key):
    key = key.strip().upper()
    if not re.fullmatch(r"[0-9]{4}[A-Z0-9]{2,6}", key):
        return 400, {"error": "an NSR key number looks like 2011JA06"}
    cur = nsr_con().execute(f"SELECT * FROM read_parquet('{NSR}') WHERE key_number = ?", [key])
    names = [d[0] for d in cur.description]
    rows = cur.fetchall()
    if not rows:
        return 404, {"error": f"no NSR reference {key}"}
    return 200, dict(zip(names, rows[0]))


def route(path, q):
    p = path.rstrip("/")
    if p == "/search":
        return search(q)
    if p == "/suggest":
        return suggest(q)
    m = re.fullmatch(r"/nsr/([^/]+)", p)
    if m:
        return nsr(m.group(1))
    return 404, {"error": "routes here: /search?q=, /suggest?q=, /nsr/{key}"}
