# Run brief 18's verification queries against a local search.duckdb on the box: top hits and timings.
#   test_queries.py /data/search/search.duckdb
import sys, time
import duckdb

con = duckdb.connect(sys.argv[1], read_only=True, config={"extension_directory": "/opt/duckdb_ext"})
con.execute("LOAD fts")
SQL = """WITH s AS (SELECT * FROM (SELECT rid, fts_main_docs.match_bm25(rid, ?) AS score FROM docs) WHERE score IS NOT NULL)
         SELECT d.type, d.id, d.name, left(d.title, 60), round(s.score, 2), count(*) OVER () AS total
         FROM s JOIN docs d USING (rid) ORDER BY s.score DESC LIMIT 5"""
for q in ["U-235 fission", "60Co gammas", "10001002", "JEFF-3.3 Fe-56", "Janssens 2011", "Cs-137 half-life",
          "subentry 10001002"]:
    for run in (1, 2):
        t = time.time()
        rows = con.execute(SQL, [q]).fetchall()
        ms = (time.time() - t) * 1000
    print(f"== {q!r}  {ms:.0f} ms (second run)  total {rows[0][5] if rows else 0}")
    for r in rows:
        print("   ", r[:5])
t = time.time()
rows = con.execute("SELECT name, kind, weight FROM suggest WHERE key LIKE ? ORDER BY weight DESC LIMIT 10",
                   ["cs-1%"]).fetchall()
print(f"== suggest 'Cs-1'  {(time.time() - t) * 1000:.0f} ms", rows)
print(con.execute("SELECT schema_name, table_name, estimated_size FROM duckdb_tables() ORDER BY 3 DESC").fetchall())
