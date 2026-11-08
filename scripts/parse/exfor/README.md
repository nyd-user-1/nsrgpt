# EXFOR into the lake (brief 16)

X4Pro, J4, C5 and the EXFOR dictionary as Parquet under `s3://nsr-lake-613473203863/lake/exfor/`, registered in Athena
database `nsr`; serving tables under `lake/serve/exfor/` (scripts in `../serve/`); the API in `services/nsr-api/`.

| Folder | Athena | Script |
| --- | --- | --- |
| `lake/exfor/x4pro-2023-07-14/` | `exfor_<table>` (74) | `x4pro.py` |
| `lake/exfor/x4pro-2025-11-05/` | `exfor_x25_<table>` (74; point tables empty) | `x4pro.py` |
| `lake/exfor/j4-2026-10-28/` | `exfor_j4_entries`, `_subentries`, `_reactions`, `_data_columns`, `_data_points` | `j4.py` |
| `lake/exfor/c5-2023-08-28/` | `exfor_c5_points`, `exfor_c5_datasets` | `c5.py` |
| `lake/exfor/dictionary/` | `exfor_dict_<name>` (32) and `exfor_dict_dictionaries` | `dictionary.py` |
| `lake/serve/exfor/2026-10-28/` | `exfor_serve_search_index`, `_targets`, `_reactions`, `_quantities` | `../serve/serve.py` |

Each folder has a `manifest.json` (source, tool versions, tables with columns, rows and bytes, the counts check, spend).
DDL for every table is in `ddl/` (and `../serve/ddl/`); the count checks are in `checks/`.

## Rerun

Everything heavy runs on an EC2 box; the Mac only launches it and copies scripts to S3.

```
./scripts/parse/exfor/create.sh nsr-parse-2 m7i-flex.large userdata.sh 100        # prints the instance id
aws s3 sync scripts/parse/exfor/ s3://nsr-lake-613473203863/lake/_work/parse/exfor/scripts/ --exclude '*' --include '*.py' --include '*.sh' --include '*.sql' --include '*.json'
aws s3 sync scripts/parse/serve/ s3://nsr-lake-613473203863/lake/_work/parse/exfor/scripts/serve/
./scripts/iaea/box/ssm.sh <id> 'mkdir -p /opt/nsr && aws s3 cp s3://nsr-lake-613473203863/lake/_work/parse/exfor/scripts/run.sh /opt/nsr/ && bash /opt/nsr/run.sh <log> <script> <args>'
```

In order (each `run.sh` call runs one script in the background, logging to `/data/logs/<log>.log`):

1. `x4pro.py inventory raw/iaea/2026-11-07/cdroms/dwn/x4sqlite-20230714-c.zip x4sqlite-20230714-c`, then
   `x4pro.py convert x4sqlite-20230714-c x4pro-2023-07-14`, `x4pro.py register x4sqlite-20230714-c x4pro-2023-07-14`,
   `x4pro.py manifest x4sqlite-20230714-c x4pro-2023-07-14 <zip-key> lake/_work/parse/exfor/scripts/notes/x4pro-2023-07-14.json`.
   The 2025 build the same way with `exfor_x25_` as the third `register` argument.
2. J4 and the dictionary need their archives on the box: `aws s3 cp` the two `raw/github/IAEA-NDS/` tarballs to
   `/data/src/` and untar `exfor_dictionary` to `/data/src/dict/`. Then `j4.py build <tar> <dict>/src/exfor_dictionary/latest.json`,
   `j4.py register`, `j4.py manifest <tar-key>`; `dictionary.py build <latest.json> <tar-key>`.
3. `c5.py build /data/src/EXFOR-C5v4-20230828.zip`, `c5.py register`, `c5.py manifest <zip-key>`.
4. `checks.py step1-x4pro`, `checks.py step2-j4`, `checks.py step2-dict` (results to `lake/_work/parse/exfor/checks/`).
5. `serve/serve.py` (after J4, C5 and the dictionary are registered).
6. The API: `services/nsr-api/build.sh` on the box, then `./services/nsr-api/deploy.sh` on the Mac.

Terminate the box when done (`aws ec2 terminate-instances`); it ends itself after 24 hours regardless.
