"""Brief 57: a probe of the lake's shapes before the sweep (the EXFOR reaction field, units, the ENDF files' layout)."""
import sys, time, boto3, duckdb
B = "s3://nsr-lake-613473203863"
cr = boto3.Session().get_credentials().get_frozen_credentials()
c = duckdb.connect(config={"temp_directory": "/data/tmp/duckdb", "memory_limit": "6GB", "threads": 2,
                           "extension_directory": "/opt/duckdb_ext"})
c.execute("LOAD httpfs")
c.execute(f"CREATE SECRET lake (TYPE s3, KEY_ID '{cr.access_key}', SECRET '{cr.secret_key}', SESSION_TOKEN '{cr.token}', REGION 'us-east-2')")
def show(sql):
    t = time.time()
    try:
        r = c.execute(sql)
        cols = [d[0] for d in r.description]
        rows = r.fetchall()
        print(f"-- {sql[:160]}  ({time.time()-t:.1f}s)")
        print(" | ".join(cols))
        for x in rows: print(" | ".join(str(v) for v in x))
    except Exception as e:
        print("ERR", sql[:120], e)
    sys.stdout.flush()
for q in sys.argv[1:]:
    show(q)
