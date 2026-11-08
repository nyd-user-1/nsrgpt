# Experiment: does storing the FTS terms table sorted by termid (so DuckDB's zone maps skip most of it) speed up
# match_bm25? Copies search.duckdb, re-sorts fts_main_docs.terms, times the same queries on both.
#   test_sorted.py /data/search/search.duckdb
import sys, time, shutil, os
import duckdb

src = sys.argv[1]
dst = src.replace(".duckdb", "-sorted.duckdb")
shutil.copy(src, dst)
c = duckdb.connect(dst, config={"extension_directory": "/opt/duckdb_ext"})
c.execute("LOAD fts")
print([(r[0], r[1], r[2]) for r in c.execute(
    "SELECT schema_name, table_name, estimated_size FROM duckdb_tables() ORDER BY estimated_size DESC").fetchall()])
c.execute("CREATE TABLE fts_main_docs.terms_s AS SELECT * FROM fts_main_docs.terms ORDER BY termid, docid")
c.execute("DROP TABLE fts_main_docs.terms")
c.execute("ALTER TABLE fts_main_docs.terms_s RENAME TO terms")
c.execute("CHECKPOINT")
c.close()
out = dst.replace("-sorted", "-sorted2")
if os.path.exists(out):
    os.remove(out)
c = duckdb.connect(dst, config={"extension_directory": "/opt/duckdb_ext"})
c.execute(f"ATTACH '{out}' AS o")
c.execute(f"COPY FROM DATABASE \"{os.path.basename(dst)[:-7]}\" TO o")
c.close()
print("sizes", os.path.getsize(src), os.path.getsize(out))
SQL = """WITH s AS (SELECT * FROM (SELECT rid, fts_main_docs.match_bm25(rid, ?) AS score FROM docs) WHERE score IS NOT NULL)
         SELECT d.type, d.id, round(s.score, 2), count(*) OVER () FROM s JOIN docs d USING (rid) ORDER BY s.score DESC LIMIT 25"""
for path in (src, out):
    c = duckdb.connect(path, read_only=True, config={"extension_directory": "/opt/duckdb_ext"})
    c.execute("LOAD fts")
    times = []
    for q in ["U-235 fission", "60Co gammas", "10001002", "JEFF-3.3 Fe-56", "Janssens 2011", "Cs-137 half-life"]:
        c.execute(SQL, [q]).fetchall()
        t = time.time(); top = c.execute(SQL, [q]).fetchall(); times.append(round((time.time() - t) * 1000))
        if path == out:
            print("  ", q, top[0][:3])
    print(path, "warm ms", times)
