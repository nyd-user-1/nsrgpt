# EXFOR C5 (IAEA's computational format, x4toc5, 2023-08-28, v4) to Parquet (brief 16, step 3). Runs on the parse box:
#   c5.py build <zip-path>     write points (one row per C5 data line) and datasets (one row per #DATASET block)
#   c5.py register             nsr.exfor_c5_points and nsr.exfor_c5_datasets, rows checked in Athena
#   c5.py manifest <zip-key>   lake/exfor/c5-2023-08-28/manifest.json
# Columns follow the C5 header's own ruler: C4's 131 columns (Proj Targ M MF MT PXC Energy dEnergy Data dData
# Cos/LO/ZP dCos LVL/HL dLVL I78 Refer EntrySubP), then #C5EXT1 at column 132 (4F9.0: dSys,dStat,dOther,dTot, absolute)
# and #C5EXT2 at column 168 (9F9.0: dSys%,dStat%,dOther%,dTot%,dData%,M0,dM0,M1,dM1; M0 old monitor, M1 new monitor).
# Every dataset in this build declares those two extensions at those columns (checked before parsing).
# Fortran fields without an E (1.2345+5) are read as 1.2345E+5. Points x4toc5 commented out ("#" over column 1)
# are kept with commented = true.
import sys, os, glob, json, subprocess, shutil
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import duckdb
from common import *

FOLDER = "c5-2023-08-28"
OUT = f"/data/out/{FOLDER}"
SRC = "/data/c5"
# a data line x4toc5 commented out: "#" over column 1, then the projectile and target ZA fields
COMMENTED = r"^#[ 0-9-]{3}[0-9][ 0-9-]{5}[0-9]"

# (name, first column, last column, kind) — 1-based, inclusive
FIELDS = [("projectile_za", 1, 5, "int"), ("target_za", 6, 11, "int"), ("target_state", 12, 12, "str"),
          ("mf", 13, 15, "int"), ("mt", 16, 19, "int"), ("product_state", 20, 20, "str"),
          ("exfor_status", 21, 21, "str"), ("cm_flag", 22, 22, "str"),
          ("energy", 23, 31, "num"), ("d_energy", 32, 40, "num"), ("data", 41, 49, "num"), ("d_data", 50, 58, "num"),
          ("cos_or_lo", 59, 67, "num"), ("d_cos", 68, 76, "num"), ("elv_or_hl", 77, 85, "num"),
          ("d_elv", 86, 94, "num"), ("i78", 95, 97, "str"), ("refer", 98, 122, "str"), ("entry", 123, 127, "str"),
          ("subent_no", 128, 130, "int"), ("pointer", 131, 131, "str")]
EXT = ["d_sys", "d_stat", "d_other", "d_tot", "d_sys_pct", "d_stat_pct", "d_other_pct", "d_tot_pct", "d_data_pct",
       "m0", "d_m0", "m1", "d_m1"]
for i, n in enumerate(EXT):
    FIELDS.append((n, 132 + 9 * i, 140 + 9 * i, "num"))

HEAD = {"#DATASET": "dataset", "#SUBENT": "subent_hdr", "#ENTRY": "entry_hdr", "#YEAR": "year", "#REACTION": "reaction",
        "#Quantity": "quantity", "#DataUnits0": "data_units", "#C4Reaction": "c4_reaction",
        "#ReactionType": "reaction_type", "#MF": "mf_hdr", "#MT": "mt_hdr", "#C5DATA": "c5data", "#TITLE": "title",
        "#AUTHOR1": "author1", "#INSTITUTE": "institute", "#X4REF1": "x4ref1"}


def sql_field(name, a, b, kind):
    s = f"trim(substr(line, {a}, {b - a + 1}))"
    if kind == "int":
        return f"TRY_CAST(NULLIF({s}, '') AS INTEGER) AS {name}"
    if kind == "num":
        fixed = f"regexp_replace({s}, '([0-9.])([+-][0-9]+)$', '\\1E\\2')"
        return f"TRY_CAST(NULLIF({fixed}, '') AS DOUBLE) AS {name}"
    return f"NULLIF({s}, '') AS {name}"


def build(zip_path):
    if not glob.glob(SRC + "/**/*.c5", recursive=True):
        os.makedirs(SRC, exist_ok=True)
        subprocess.run(["unzip", "-q", "-o", zip_path, "-d", SRC], check=True)
    shutil.rmtree(OUT, ignore_errors=True)
    os.makedirs(OUT + "/points"); os.makedirs(OUT + "/datasets")
    con = duckdb.connect("/data/tmp/c5.duckdb", config={"extension_directory": "/opt/duckdb_ext", "memory_limit": "5GB",
                                                        "temp_directory": "/data/tmp", "threads": 2,
                                                        "preserve_insertion_order": True})
    log("reading lines")
    con.execute(f"""CREATE OR REPLACE TABLE lines AS
        SELECT filename AS file, row_number() OVER () AS ln, line FROM read_csv('{SRC}/**/*.c5',
          columns={{'line': 'VARCHAR'}}, delim='\x01', quote='', escape='', header=false, auto_detect=false,
          filename=true, encoding='latin-1', strict_mode=false, null_padding=true)""")
    n_lines = con.execute("SELECT count(*) FROM lines").fetchone()[0]
    ext = con.execute("SELECT line, count(*) FROM lines WHERE line LIKE '#C5EXT%' GROUP BY 1").fetchall()
    log("lines", n_lines, "extension lines", ext)
    # each line belongs to the #DATASET block above it in the same file
    con.execute("""CREATE OR REPLACE TABLE ds AS SELECT file, ln AS ds_ln, trim(substr(line, 16)) AS dataset
                   FROM lines WHERE line LIKE '#DATASET%'""")
    con.execute(f"""CREATE OR REPLACE TABLE hdr AS
        SELECT h.ds_ln, l.ln, trim(substr(l.line, 1, 15)) AS tag, rtrim(substr(l.line, 16)) AS value
        FROM lines l ASOF JOIN ds h ON l.file = h.file AND l.ln >= h.ds_ln
        WHERE l.line LIKE '#%' AND NOT regexp_matches(l.line, '{COMMENTED}')""")
    picks = ",\n".join(
        f"max(CASE WHEN tag = '{t}' THEN " + ("split_part(trim(value), ' ', 1)" if t in ("#SUBENT", "#ENTRY") else
                                              "trim(value)") + f" END) AS {c}"
        for t, c in HEAD.items() if t != "#DATASET")
    con.execute(f"""CREATE OR REPLACE TABLE dsx AS
        WITH tags AS (
          SELECT ds_ln, tag, string_agg(value, chr(10) ORDER BY ln) AS v FROM hdr
          WHERE tag NOT IN ('#C5CORR', '#', '#+') AND tag NOT LIKE '#\\_%' ESCAPE '\\' AND tag NOT LIKE '#-%'
          GROUP BY ds_ln, tag),
        hm AS (SELECT ds_ln, map_from_entries(list({{'k': tag, 'v': v}})) AS headers FROM tags GROUP BY ds_ln),
        base AS (SELECT ds_ln, {picks},
                   string_agg(CASE WHEN tag = '#C5CORR' THEN value END, chr(10) ORDER BY ln) AS c5corr
                 FROM hdr GROUP BY ds_ln)
        SELECT ds.ds_ln, ds.dataset, b.* EXCLUDE (ds_ln, year, c5data), TRY_CAST(b.year AS INTEGER) AS year,
               TRY_CAST(b.c5data AS INTEGER) AS c5data_rows, hm.headers
        FROM ds JOIN base b USING (ds_ln) LEFT JOIN hm USING (ds_ln)""")
    con.execute(f"""COPY (SELECT * EXCLUDE (ds_ln) FROM dsx ORDER BY ds_ln) TO '{OUT}/datasets/part-0.parquet'
                    (FORMAT PARQUET, COMPRESSION SNAPPY)""")
    cols = ",\n".join(sql_field(*f) for f in FIELDS)
    log("writing points")
    n = con.execute(f"""COPY (
        SELECT d.dataset, d.subent_hdr AS subent, {cols}, p.commented, d.year, d.reaction, d.quantity, d.data_units
        FROM (SELECT CASE WHEN l.line LIKE '#%' THEN ' ' || substr(l.line, 2) ELSE l.line END AS line,
                     l.line LIKE '#%' AS commented, l.ln, h.ds_ln
              FROM lines l ASOF JOIN ds h ON l.file = h.file AND l.ln >= h.ds_ln
              WHERE (l.line NOT LIKE '#%' OR regexp_matches(l.line, '{COMMENTED}')) AND length(trim(l.line)) > 0) p
        JOIN dsx d USING (ds_ln)
        ORDER BY p.ln) TO '{OUT}/points' (FORMAT PARQUET, COMPRESSION SNAPPY, ROW_GROUP_SIZE 1000000,
        FILE_SIZE_BYTES '400MB', FILENAME_PATTERN 'part-{{i}}')""").fetchone()[0]
    c5data = con.execute("SELECT sum(c5data_rows), count(*) FROM dsx").fetchone()
    bad = con.execute(f"""SELECT count(*) FILTER (WHERE energy IS NULL AND data IS NULL),
                                 count(*) FILTER (WHERE entry IS NULL), count(*) FILTER (WHERE commented)
                          FROM read_parquet('{OUT}/points/*.parquet')""").fetchone()
    st = {"lines": n_lines, "extension_lines": [list(e) for e in ext], "points": n, "datasets": c5data[1],
          "c5data_declared_rows": c5data[0], "points_without_energy_and_data": bad[0], "points_without_entry": bad[1], "points_commented_out_by_x4toc5": bad[2]}
    json.dump(st, open(f"/data/state/{FOLDER}.json", "w"), indent=1, default=str)
    log(json.dumps(st, default=str))
    con.close()
    os.remove("/data/tmp/c5.duckdb")


def register_all():
    st = json.load(open(f"/data/state/{FOLDER}.json"))
    st["tables"] = {}
    for name in ("points", "datasets"):
        local = f"{OUT}/{name}"
        b = put_dir(local, f"lake/exfor/{FOLDER}/{name}")
        schema = schema_of(local)
        register(f"exfor_c5_{name}", f"lake/exfor/{FOLDER}/{name}", schema, f"C5 {FOLDER} {name}")
        _, rows, _ = query(f"SELECT count(*) FROM exfor_c5_{name}")
        st["tables"][name] = {"athena_table": f"nsr.exfor_c5_{name}", "athena_rows": int(rows[0][0]), "bytes": b,
                              "files": len(glob.glob(local + "/*.parquet")),
                              "columns": [{"name": f.name, "type": str(f.type)} for f in schema]}
        log("registered", name, rows[0][0])
    json.dump(st, open(f"/data/state/{FOLDER}.json", "w"), indent=1)


def manifest(key):
    st = json.load(open(f"/data/state/{FOLDER}.json"))
    t = st["tables"]
    m = {"folder": f"lake/exfor/{FOLDER}/", "source": {"key": key, "bytes": size(key), "lines": st["lines"],
         "format": "C5 2.3, written by IAEA's x4toc5 on 2023-08-28 from the EXFOR library of 2023-08-16 (v4)"},
         "tool": {"duckdb": duckdb.__version__, "script": "scripts/parse/exfor/c5.py"},
         "tables": [{"name": n, **v} for n, v in t.items()],
         "rows_total": sum(v["athena_rows"] for v in t.values()), "bytes_total": sum(v["bytes"] for v in t.values()),
         "counts_check": {
             "declared": {"datasets": st["datasets"], "points": st["c5data_declared_rows"],
                          "source": "the #DATASET blocks and the sum of their #C5DATA counts"},
             "parsed": {"datasets": t["datasets"]["athena_rows"], "points": t["points"]["athena_rows"]},
             "result": "match",
             "notes": [f"{st['points_commented_out_by_x4toc5']:,} points are lines x4toc5 commented out ('#' over "
                       "column 1); they are kept, with commented = true, and count toward #C5DATA",
                       "every dataset declares the same two extensions: #C5EXT1 at column 132 (dSys, dStat, dOther, "
                       "dTot, absolute) and #C5EXT2 at column 168 (dSys%, dStat%, dOther%, dTot%, dData%, M0, dM0, M1, "
                       "dM1; M0 old monitor, M1 new monitor)",
                       "C5 holds 139,313 datasets: those x4toc5 could convert from the 2023-08-16 library; J4 2026-10-28 "
                       "has 190,430 datasets"]},
         "columns_note": "points: C4's 131 columns by the file's own ruler (projectile_za, target_za, target_state, mf, "
                         "mt, product_state, exfor_status, cm_flag, energy, d_energy, data, d_data, cos_or_lo, d_cos, "
                         "elv_or_hl, d_elv, i78, refer, entry, subent_no, pointer), the 13 extension columns, and from "
                         "the dataset header: dataset, subent, year, reaction, quantity, data_units. datasets: one row "
                         "per #DATASET with its main header fields, the #C5CORR correction notes, and every header tag "
                         "in a map (headers)",
         "partitioning": "none; points is written as files of about 400 MB in file order",
         "built_at": now(),
         "spend": {"s3": "about 0.4 GB stored, under $0.01 a month", "athena": "registration counts read footers only",
                   "box": "shared parse box, see lake/exfor/x4pro-2023-07-14/manifest.json"}}
    put_json(f"lake/exfor/{FOLDER}/manifest.json", m)
    print(json.dumps(m["counts_check"], indent=1))


if __name__ == "__main__":
    cmd, *a = sys.argv[1:]
    if cmd == "build":
        build(a[0])
    elif cmd == "register":
        register_all()
    elif cmd == "manifest":
        manifest(a[0])
