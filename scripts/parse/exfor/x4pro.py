# X4Pro (IAEA's EXFOR as one SQLite database) to Parquet, table for table (brief 16, step 1). Runs on the parse box:
#   x4pro.py inventory <zip-key> <build>          unzip, then list every table: columns, declared types, indexes, rows
#   x4pro.py convert <build> <folder> [table …]   each table 1:1 to Parquet (DuckDB), up to lake/exfor/<folder>/<table>/
#   x4pro.py register <build> <folder> [prefix]   nsr.<prefix><table> (default exfor_) for each converted table, rows checked
#   x4pro.py manifest <build> <folder> <zip-key> [notes-key]   lake/exfor/<folder>/manifest.json (+ notes JSON from S3)
# A table DuckDB can't read with its declared types (a column holding mixed types, or text that isn't UTF-8) is read
# with Python's sqlite3 instead: a mixed column becomes text, non-UTF-8 text is decoded as Latin-1; both are recorded.
import sys, os, glob, json, shutil, subprocess, sqlite3
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # run with python -I; common.py sits beside this file
import duckdb
import pyarrow as pa
import pyarrow.parquet as pq
from common import *

DATA = "/data"


def state_path(folder):
    return f"{DATA}/state/{folder}.json"


def load_state(folder):
    p = state_path(folder)
    return json.load(open(p)) if os.path.exists(p) else {}


def save_state(folder, st):
    os.makedirs(f"{DATA}/state", exist_ok=True)
    json.dump(st, open(state_path(folder), "w"), indent=1)


def dbfiles(build):
    out = []
    for p in sorted(glob.glob(f"{DATA}/{build}/**/*", recursive=True)):
        if os.path.isfile(p):
            with open(p, "rb") as f:
                if f.read(16) == b"SQLite format 3\x00":
                    out.append(p)
    return out


def inventory(key, build):
    z = get(key, f"{DATA}/zips/{key.rsplit('/', 1)[-1]}")
    d = f"{DATA}/{build}"
    if not dbfiles(build):
        os.makedirs(d, exist_ok=True)
        subprocess.run(["unzip", "-q", "-o", z, "-d", d], check=True)
    files = [{"path": os.path.relpath(p, d), "bytes": os.path.getsize(p)}
             for p in sorted(glob.glob(d + "/**/*", recursive=True)) if os.path.isfile(p)]
    inv = {"source": key, "source_bytes": os.path.getsize(z), "files": files, "databases": []}
    for db in dbfiles(build):
        c = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
        tabs = []
        for name, typ, sql in c.execute("SELECT name, type, sql FROM sqlite_master WHERE type IN ('table','view') "
                                        "AND name NOT LIKE 'sqlite_%' ORDER BY name"):
            cols = [{"name": r[1], "type": r[2], "notnull": r[3], "pk": r[5]}
                    for r in c.execute(f'PRAGMA table_info("{name}")')]
            idx = [r[0] for r in c.execute("SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name=? AND sql "
                                           "IS NOT NULL", (name,))]
            rows = c.execute(f'SELECT count(*) FROM "{name}"').fetchone()[0]
            tabs.append({"name": name, "kind": typ, "rows": rows, "columns": cols, "indexes": idx, "sql": sql})
            log(build, name, typ, rows)
        inv["databases"].append({"path": os.path.relpath(db, d), "bytes": os.path.getsize(db), "tables": tabs})
    put_json(f"{WORK}/inventory/{build}.json", inv)
    for db in inv["databases"]:
        print(db["path"], db["bytes"])
        for t in db["tables"]:
            print(f'  {t["name"]:32} {t["kind"]:5} {t["rows"]:>12,}  ' + ", ".join(f'{c["name"]} {c["type"]}' for c in t["columns"]))
    return inv


def text_factory(b):
    try:
        return b.decode("utf-8")
    except UnicodeDecodeError:
        return b.decode("latin-1")


def arrow_type(decl, kinds):
    """The Parquet type for one SQLite column: its declared type, or text when the stored values disagree with it."""
    d = (decl or "").upper()
    kinds = set(kinds) - {"null"}
    if "INT" in d:
        return pa.int64() if kinds <= {"integer"} else pa.string()
    if any(k in d for k in ("REAL", "FLOA", "DOUB")):
        return pa.float64() if kinds <= {"integer", "real"} else pa.string()
    if "BLOB" in d:
        return pa.binary() if kinds <= {"blob"} else pa.string()
    if d in ("", "NUMERIC") or "NUM" in d or "DEC" in d:
        if kinds <= {"integer"}:
            return pa.int64()
        if kinds <= {"integer", "real"}:
            return pa.float64()
        if kinds <= {"blob"}:
            return pa.binary()
        return pa.string()
    return pa.string() if kinds <= {"text"} or "blob" not in kinds else pa.binary()


def convert_python(db, t, out, note):
    """Fallback reader: Python sqlite3 to pyarrow, column types from what the column holds."""
    c = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    c.text_factory = text_factory
    cols = [(r[1], r[2]) for r in c.execute(f'PRAGMA table_info("{t}")')]
    fields, mixed = [], []
    for name, decl in cols:
        kinds = [r[0] for r in c.execute(f'SELECT DISTINCT typeof("{name}") FROM "{t}"')]
        at = arrow_type(decl, kinds)
        fields.append(pa.field(name, at))
        if at == pa.string() and set(kinds) - {"null", "text"}:
            mixed.append(f"{name} (declared {decl or 'none'}, holds {'/'.join(sorted(set(kinds) - {'null'}))})")
    schema = pa.schema(fields)
    os.makedirs(out, exist_ok=True)
    n, part, w, in_part = 0, 0, None, 0
    cur = c.execute(f'SELECT * FROM "{t}"')
    while True:
        batch = cur.fetchmany(200_000)
        if not batch:
            break
        arrays = []
        for i, f in enumerate(fields):
            vals = [r[i] for r in batch]
            if f.type == pa.string():
                vals = [None if v is None else (v if isinstance(v, str) else
                        (text_factory(v) if isinstance(v, bytes) else repr(v) if isinstance(v, float) else str(v)))
                        for v in vals]
            arrays.append(pa.array(vals, type=f.type))
        tb = pa.Table.from_arrays(arrays, schema=schema)
        if w is None:
            w = pq.ParquetWriter(f"{out}/part-{part}.parquet", schema, compression="snappy")
        w.write_table(tb, row_group_size=500_000)
        n += len(batch); in_part += len(batch)
        if in_part >= 5_000_000:
            w.close(); w = None; part += 1; in_part = 0
    if w:
        w.close()
    if n == 0:
        pq.write_table(pa.Table.from_arrays([pa.array([], type=f.type) for f in fields], schema=schema),
                       f"{out}/part-0.parquet", compression="snappy")
    note.update({"reader": "python-sqlite3", "mixed_columns_as_text": mixed})
    return n


def convert(build, folder, only):
    st = load_state(folder)
    [db] = dbfiles(build)
    con = duckdb.connect(config={"extension_directory": "/opt/duckdb_ext", "memory_limit": "5GB",
                                 "temp_directory": f"{DATA}/tmp", "threads": 2})
    con.sql("LOAD sqlite")
    src = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    tables = [r[0] for r in src.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' "
                                        "ORDER BY name")]
    for t in tables:
        if only and t not in only:
            continue
        if not only and st.get(t, {}).get("uploaded"):
            continue
        out = f"{DATA}/out/{folder}/{t}"
        shutil.rmtree(out, ignore_errors=True)
        os.makedirs(out)
        note = {"reader": "duckdb"}
        log("convert", t)
        try:
            dbq = db.replace("'", "''")
            n = con.execute(f"COPY (SELECT * FROM sqlite_scan('{dbq}', '{t}')) TO '{out}' (FORMAT PARQUET, "
                            "COMPRESSION SNAPPY, ROW_GROUP_SIZE 500000, FILE_SIZE_BYTES '400MB', "
                            "FILENAME_PATTERN 'part-{i}', OVERWRITE_OR_IGNORE)").fetchone()[0]
        except duckdb.Error as e:
            log("duckdb failed on", t, str(e)[:300])
            note["duckdb_error"] = str(e)[:300]
            shutil.rmtree(out, ignore_errors=True)
            n = convert_python(db, t, out, note)
        if not glob.glob(out + "/*.parquet"):  # empty table: DuckDB writes no file, so write the schema alone
            con.execute(f"COPY (SELECT * FROM sqlite_scan('{dbq}', '{t}') LIMIT 0) TO '{out}/part-0.parquet' "
                        "(FORMAT PARQUET, COMPRESSION SNAPPY)")
        b = put_dir(out, f"lake/exfor/{folder}/{t}")
        schema = schema_of(out)
        st[t] = {"rows": n, "bytes": b, "files": len(glob.glob(out + "/*.parquet")), **note,
                 "columns": [{"name": f.name, "type": str(f.type)} for f in schema], "uploaded": True}
        save_state(folder, st)
        log("done", t, n, b)
    return st


def register_all(build, folder, prefix="exfor_"):
    st = load_state(folder)
    for t, info in st.items():
        name = prefix + t.lower()
        out = f"{DATA}/out/{folder}/{t}"
        register(name, f"lake/exfor/{folder}/{t}", schema_of(out), f"X4Pro {build} table {t}")
        _, rows, _ = query(f"SELECT count(*) FROM \"{name}\"")
        info["athena_table"] = f"nsr.{name}"
        info["athena_rows"] = int(rows[0][0])
        info["rows_match"] = info["athena_rows"] == info["rows"]
        save_state(folder, st)
        log("registered", name, info["athena_rows"], "match" if info["rows_match"] else "MISMATCH")
    return st


def manifest(build, folder, key, extra=None):
    st = load_state(folder)
    inv = json.load(open(f"{DATA}/state/inventory-{build}.json")) if os.path.exists(
        f"{DATA}/state/inventory-{build}.json") else None
    src = {t["name"]: t for db in (inv or {}).get("databases", []) for t in db["tables"]}
    m = {"folder": f"lake/exfor/{folder}/", "source": {"key": key, "bytes": size(key),
         "database_files": [{"path": db["path"], "bytes": db["bytes"]} for db in (inv or {}).get("databases", [])]},
         "tool": {"duckdb": duckdb.__version__, "pyarrow": pa.__version__, "sqlite": sqlite3.sqlite_version,
                  "script": "scripts/parse/exfor/x4pro.py"},
         "tables": [{"name": t, **{k: v for k, v in i.items() if k != "uploaded"},
                     "sqlite_columns": [f'{c["name"]} {c["type"]}' for c in src.get(t, {}).get("columns", [])],
                     "sqlite_indexes": src.get(t, {}).get("indexes", [])} for t, i in sorted(st.items())],
         "views_not_converted": [{"name": v["name"], "rows_in_source": v["rows"], "sql": v["sql"]}
                                 for v in src.values() if v["kind"] == "view"],
         "rows_total": sum(i["rows"] for i in st.values()), "bytes_total": sum(i["bytes"] for i in st.values()),
         "built_at": now(), **(extra or {})}
    put_json(f"lake/exfor/{folder}/manifest.json", m)
    return m


if __name__ == "__main__":
    cmd, *args = sys.argv[1:]
    if cmd == "inventory":
        inv = inventory(args[0], args[1])
        os.makedirs(f"{DATA}/state", exist_ok=True)
        json.dump(inv, open(f"{DATA}/state/inventory-{args[1]}.json", "w"), indent=1)
    elif cmd == "convert":
        convert(args[0], args[1], set(args[2:]))
    elif cmd == "register":
        register_all(args[0], args[1], *(args[2:3]))
    elif cmd == "manifest":
        extra = json.loads(s3.get_object(Bucket=BUCKET, Key=args[3])["Body"].read()) if len(args) > 3 else None
        print(json.dumps(manifest(args[0], args[1], args[2], extra), indent=1)[:3000])
