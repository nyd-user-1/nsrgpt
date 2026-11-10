#!/bin/bash
# Brief 56: test --mf=2,32 on a few files of one release without uploading, and print what each table holds.
#   ./res_test.sh <release> <s3 key> <file substring>
cd "$(dirname "$0")"
/opt/parse/bin/python -I parse.py "$1" "$2" --mf=2,32 --no-upload --only="$3" 2>&1 | tail -20
/opt/parse/bin/python -I - "$1" <<'PY'
import sys, duckdb
out = f"/data/endfb/{sys.argv[1]}/mf2/out"
c = duckdb.connect()
for t in ("res_ranges", "res_params", "res_cov"):
    print("==", t, c.execute(f"SELECT count(*) FROM read_parquet('{out}/{t}/*.parquet')").fetchone())
print(c.execute(f"SELECT file_name, mat, range_index, el_ev, eh_ev, lru, lrf, spi, ap, nls, n_resonances, left(params, 160) FROM read_parquet('{out}/res_ranges/*.parquet') ORDER BY mat, range_index").fetchall())
print(c.execute(f"SELECT mat, range_index, unresolved, count(*), min(er_ev), max(er_ev), min(es_ev), max(es_ev) FROM read_parquet('{out}/res_params/*.parquet') GROUP BY ALL ORDER BY ALL").fetchall())
print(c.execute(f"SELECT * EXCLUDE (release, sublibrary, file_name) FROM read_parquet('{out}/res_params/*.parquet') LIMIT 3").fetchall())
print(c.execute(f"SELECT mat, range_index, lcomp, block, count(*), min(value), max(value) FROM read_parquet('{out}/res_cov/*.parquet') GROUP BY ALL ORDER BY ALL").fetchall())
print(c.execute(f"SELECT mat, block, row_param, col_param, row_name, col_name, row_er_ev, row_value, value, ndigit FROM read_parquet('{out}/res_cov/*.parquet') WHERE block IN ('unc', 'corr', 'cov') ORDER BY mat, block, row_param LIMIT 12").fetchall())
print(c.execute(f"SELECT mat, left(params, 400) FROM read_parquet('{out}/res_cov/*.parquet') WHERE block = 'range'").fetchall())
PY
python3 -c "import json; d=json.load(open('/data/endfb/$1/mf2_mf32.local.json')); print(d['sections_seen'], d['sections_parsed'], d['sections_rejected'], d['rejected'][:5])" 2>/dev/null || /opt/parse/bin/python -c "import json; d=json.load(open('/data/endfb/$1/mf2_mf32.local.json')); print(d['sections_seen'], d['sections_parsed'], d['sections_rejected'], d['rejected'][:5])"
