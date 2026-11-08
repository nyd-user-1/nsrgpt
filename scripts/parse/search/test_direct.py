# Compare fts_main_docs.match_bm25 with the same BM25 written over the index tables directly (reads only documents
# holding a query term): same top hits and scores? how much faster?   test_direct.py /data/search/search.duckdb
import sys, time
import duckdb

MACRO = """WITH s AS (SELECT * FROM (SELECT rid, fts_main_docs.match_bm25(rid, ?) AS score FROM docs) WHERE score IS NOT NULL)
SELECT d.rid, s.score, count(*) OVER () FROM s JOIN docs d USING (rid) ORDER BY s.score DESC, d.rid LIMIT 25"""
# The macro's own formula (DuckDB 2.0 fts, BM25F with one field: k = 1.2, b = 0.75), restricted to documents holding a
# query term.
DIRECT = """WITH raw AS (SELECT DISTINCT unnest(fts_main_docs.tokenize(?)) AS t),
tokens AS (SELECT DISTINCT stem(t, 'none') AS t FROM raw WHERE t IS NOT NULL AND t <> ''),
qt AS (SELECT dict.termid, dict.df FROM fts_main_docs.dict AS dict JOIN tokens ON dict.term = tokens.t),
tf AS (SELECT termid, docid, count(*) AS tf FROM fts_main_docs.terms WHERE termid IN (SELECT termid FROM qt)
       GROUP BY termid, docid),
st AS (SELECT num_docs, list_extract(avg_field_lens, 1) AS avgdl FROM fts_main_docs.stats),
ntf AS (SELECT tf.docid, qt.df, tf.tf / (0.25 + 0.75 * list_extract(fd.field_lens, 1) / st.avgdl) AS ntf
        FROM tf JOIN qt USING (termid) JOIN fts_main_docs.docs AS fd ON fd.docid = tf.docid CROSS JOIN st),
sc AS (SELECT ntf.docid, sum(log(((st.num_docs - ntf.df) + 0.5) / (ntf.df + 0.5) + 1) * (ntf.ntf * 2.2) / (ntf.ntf + 1.2))
              AS score FROM ntf CROSS JOIN st GROUP BY ntf.docid),
top AS (SELECT docid, score, count(*) OVER () AS total FROM sc ORDER BY score DESC LIMIT 200)
SELECT fd.name AS rid, top.score, top.total FROM top JOIN fts_main_docs.docs AS fd USING (docid)
ORDER BY top.score DESC, fd.name LIMIT 25"""

c = duckdb.connect(sys.argv[1], read_only=True, config={"extension_directory": "/opt/duckdb_ext"})
c.execute("LOAD fts")
for q in ["U-235 fission", "60Co gammas", "10001002", "JEFF-3.3 Fe-56", "Janssens 2011", "Cs-137 half-life", "Cs"]:
    res = {}
    for name, sql in (("macro", MACRO), ("direct", DIRECT)):
        c.execute(sql, [q]).fetchall()
        t = time.time(); rows = c.execute(sql, [q]).fetchall(); ms = (time.time() - t) * 1000
        res[name] = (rows, ms)
    a, b = res["macro"][0], res["direct"][0]
    same = [r[0] for r in a] == [r[0] for r in b] and all(abs(x[1] - y[1]) < 1e-9 for x, y in zip(a, b))
    print(f"{q!r}: macro {res['macro'][1]:.0f} ms, direct {res['direct'][1]:.0f} ms, same top 25 and scores: {same}, "
          f"totals {a[0][2] if a else 0}/{b[0][2] if b else 0}")
    if not same:
        print("   macro ", [(r[0], round(r[1], 4)) for r in a[:5]])
        print("   direct", [(r[0], round(r[1], 4)) for r in b[:5]])
