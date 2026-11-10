"""Brief 51: the EXFOR points serving table, lake/serve/exfor/2026-10-28/points/target_z=<Z>/points.parquet, one file
per target element (Z = target_za // 1000; 0 for targets with no ZA) (Athena nsr.exfor_serve_points, partitioned by
target_z), one row per data point of every dataset in exfor_serve_search_index, read by nsr-api's
/exfor/points. Runs on the job box nsr-jobs-1 (DuckDB 2.0.0, /opt/jobs/venv):
  HOME=/root /opt/jobs/venv/bin/python -I points.py
Points come from C5 2023-08-28 (energies in eV, values in the base unit, C5's own uncertainty dData, else dTot; rows C5
marks commented are left out) and, for datasets C5 does not hold, from J4 2026-10-28: per data row the incident energy
(EN, EN-MEAN, EN-CM, EN-APRX in DATA, else EN or EN-MEAN in COMMON), its resolution or error (EN-RSL, EN-ERR,
EN-RSL-HW), the value (DATA, DATA-CM, DATA-APRX) and its error (DATA-ERR, ERR-T, +DATA-ERR; PER-CENT read as relative),
each converted with the dictionary's factor for its unit (EXFOR dictionary 25). Rows with no energy are left out.
Sorted by target_za, reaction, sf6 and energy, in row groups of 10,000, so a search with an energy window reads only the
row groups for its reactions and energies (DuckDB prunes on the row groups' min and max). Counts go to lake/_work/jobs/points-state.json.
"""
import json
import os
import time

import boto3
import duckdb

B = "s3://nsr-lake-613473203863"
SI = f"{B}/lake/serve/exfor/2026-10-28/search_index/*"
C5 = f"{B}/lake/exfor/c5-2023-08-28/points/*"
J4 = f"{B}/lake/exfor/j4-2026-10-28"
DU = f"{B}/lake/exfor/dictionary/data_units/part-0.parquet"
PREFIX = "lake/serve/exfor/2026-10-28/points"
OUT = "/data/tmp/points"
FAMILY_UNIT = {"B": "B", "DA": "B/SR", "E": "EV", "NO": "NO-DIM"}

t0 = time.time()
cr = boto3.Session().get_credentials().get_frozen_credentials()
c = duckdb.connect(config={"temp_directory": "/data/tmp/duckdb", "memory_limit": "5GB", "threads": 2,
                           "extension_directory": "/opt/duckdb_ext"})
c.execute("INSTALL httpfs")
c.execute("LOAD httpfs")
c.execute(f"CREATE SECRET lake (TYPE s3, KEY_ID '{cr.access_key}', SECRET '{cr.secret_key}', SESSION_TOKEN '{cr.token}', "
          "REGION 'us-east-2')")
q = c.execute
q(f"CREATE TABLE si AS SELECT dataset, entry, subent, pointer, target_za, reaction, sf6, has_c5 FROM read_parquet('{SI}')")
q(f"""CREATE TABLE c5 AS SELECT dataset, energy AS e_ev, d_energy AS de_ev, data AS xs, coalesce(d_data, d_tot) AS dxs,
      data_units AS units, coalesce(commented, false) AS commented FROM read_parquet('{C5}')""")
q(f"CREATE TABLE u AS SELECT code, unit_conversion_factor AS f, additional_code AS fam FROM read_parquet('{DU}') "
  "WHERE unit_conversion_factor IS NOT NULL")
q("CREATE TABLE need AS SELECT dataset, subent, pointer FROM si WHERE NOT has_c5")
q(f"""CREATE TABLE p AS SELECT d.subent, d.pointer, d."row", d.name, d.unit, d.role, d.value
      FROM read_parquet('{J4}/data_points/*') d WHERE d.value IS NOT NULL
      AND d.role IN ('en', 'data', 'data_err', 'en_err') AND d.subent IN (SELECT subent FROM need)""")
RANK = {"EN": 1, "EN-MEAN": 2, "EN-CM": 3, "EN-APRX": 4, "DATA": 1, "DATA-CM": 2, "DATA-APRX": 3,
        "DATA-ERR": 1, "ERR-T": 2, "+DATA-ERR": 3, "EN-RSL": 1, "EN-ERR": 2, "EN-RSL-HW": 3}
rank = "CASE p.name " + " ".join(f"WHEN '{k}' THEN {v}" for k, v in RANK.items()) + " END"
q(f"""CREATE TABLE pick AS SELECT * FROM (
      SELECT n.dataset, p."row", p.role, p.name, p.unit, p.value,
             row_number() OVER (PARTITION BY n.dataset, p."row", p.role ORDER BY {rank}, p.pointer DESC) AS k
      FROM p JOIN need n ON n.subent = p.subent AND (p.pointer = '' OR p.pointer = n.pointer)
      WHERE p.name IN ({", ".join(f"'{k}'" for k in RANK)})) WHERE k = 1""")
q(f"""CREATE TABLE cen AS SELECT n.dataset, min(c.value) AS v, min(c.unit) AS unit
      FROM read_parquet('{J4}/data_columns/*') c JOIN need n ON c.subent = n.subent AND (c.pointer = '' OR c.pointer = n.pointer)
      WHERE c.section = 'COMMON' AND c.role = 'en' AND c.name IN ('EN', 'EN-MEAN') AND c.value IS NOT NULL GROUP BY n.dataset""")
fam = "CASE uy.fam " + " ".join(f"WHEN '{k}' THEN '{v}'" for k, v in FAMILY_UNIT.items()) + " ELSE uy.fam END"
q(f"""CREATE TABLE j4 AS
      SELECT y.dataset, coalesce(e.value * ue.f, cen.v * uc.f) AS e_ev, de.value * ude.f AS de_ev, y.value * uy.f AS xs,
             CASE WHEN dy.unit = 'PER-CENT' THEN abs(y.value * uy.f) * dy.value / 100
                  WHEN udy.fam = uy.fam THEN dy.value * udy.f END AS dxs,
             {fam} AS units
      FROM pick y JOIN u uy ON uy.code = y.unit
      LEFT JOIN pick e ON e.dataset = y.dataset AND e."row" = y."row" AND e.role = 'en'
      LEFT JOIN u ue ON ue.code = e.unit AND ue.fam = 'E'
      LEFT JOIN pick de ON de.dataset = y.dataset AND de."row" = y."row" AND de.role = 'en_err'
      LEFT JOIN u ude ON ude.code = de.unit AND ude.fam = 'E'
      LEFT JOIN pick dy ON dy.dataset = y.dataset AND dy."row" = y."row" AND dy.role = 'data_err'
      LEFT JOIN u udy ON udy.code = dy.unit
      LEFT JOIN cen ON cen.dataset = y.dataset LEFT JOIN u uc ON uc.code = cen.unit AND uc.fam = 'E'
      WHERE y.role = 'data'""")
q("""CREATE TABLE pts AS
     SELECT s.dataset, s.entry, s.subent, s.target_za, s.reaction, s.sf6, x.source, x.e_ev, x.de_ev, x.xs AS xs_b,
            x.dxs AS dxs_b, x.units
     FROM (SELECT dataset, e_ev, de_ev, xs, dxs, units, 'C5' AS source FROM c5 WHERE NOT commented
           UNION ALL SELECT dataset, e_ev, de_ev, xs, dxs, units, 'J4' FROM j4 WHERE e_ev IS NOT NULL) x
     JOIN si s USING (dataset)""")
os.makedirs(OUT, exist_ok=True)
for f in os.listdir(OUT):
    os.remove(f"{OUT}/{f}")
zs = [r[0] for r in q("SELECT DISTINCT coalesce(CAST(target_za / 1000 AS INTEGER), 0) FROM pts ORDER BY 1").fetchall()]
for z in zs:  # one file per element: a query opens only its element's small footer
    q(f"COPY (SELECT * FROM pts WHERE coalesce(CAST(target_za / 1000 AS INTEGER), 0) = {z} "
      f"ORDER BY target_za, reaction, sf6, e_ev, dataset) TO '{OUT}/{z}.parquet' "
      "(FORMAT PARQUET, COMPRESSION SNAPPY, ROW_GROUP_SIZE 10000)")
one = lambda sql: q(sql).fetchone()[0]  # noqa: E731
state = {
    "built_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "seconds": round(time.time() - t0),
    "location": f"{B}/{PREFIX}/target_z=<Z>/points.parquet", "athena_table": "nsr.exfor_serve_points (partition target_z)",
    "files": len(zs), "target_z": zs, "bytes": sum(os.path.getsize(f"{OUT}/{z}.parquet") for z in zs),
    "rows": one("SELECT count(*) FROM pts"), "rows_c5": one("SELECT count(*) FROM pts WHERE source = 'C5'"),
    "rows_j4": one("SELECT count(*) FROM pts WHERE source = 'J4'"),
    "datasets": one("SELECT count(DISTINCT dataset) FROM pts"), "datasets_in_search_index": one("SELECT count(*) FROM si"),
    "c5_rows_commented_left_out": one("SELECT count(*) FROM c5 WHERE commented"),
    "c5_rows_not_in_search_index": one("SELECT count(*) FROM c5 WHERE dataset NOT IN (SELECT dataset FROM si)"),
    "j4_datasets_without_c5": one("SELECT count(*) FROM need"),
    "j4_rows_without_energy_left_out": one("SELECT count(*) FROM j4 WHERE e_ev IS NULL"),
    "row_group_rows": 10000, "sorted_by": ["target_za", "reaction", "sf6", "e_ev", "dataset"],
    "script": "scripts/parse/serve/points.py",
}
s3 = boto3.client("s3", region_name="us-east-2")
old = [o["Key"] for pg in s3.get_paginator("list_objects_v2").paginate(Bucket="nsr-lake-613473203863", Prefix=PREFIX + "/")
       for o in pg.get("Contents", [])]
for i in range(0, len(old), 1000):
    s3.delete_objects(Bucket="nsr-lake-613473203863", Delete={"Objects": [{"Key": k} for k in old[i:i + 1000]]})
for z in zs:
    s3.upload_file(f"{OUT}/{z}.parquet", "nsr-lake-613473203863", f"{PREFIX}/target_z={z}/points.parquet")
s3.put_object(Bucket="nsr-lake-613473203863", Key="lake/_work/jobs/points-state.json",
              Body=json.dumps(state, indent=1).encode(), ContentType="application/json")
print(json.dumps(state))
