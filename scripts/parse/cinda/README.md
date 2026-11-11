# CINDA (brief 65)

The Computer Index of Nuclear Reaction Data, kept by the NRDC since 1964, from the held IAEA backup to Parquet.

- **Source:** `raw/iaea/2026-11-07/exfor-master/cinda/000-cinda-main/import-2024-04-26/CINDA-2024-04-26.zip`, the newest
  complete snapshot (all five area files with their listings; the dated `cinda-YYYY-MM-DD/` folders end in 2009, the
  `backup-*` folders in 2013).
- **Format:** read from the data; the column layout is in `parse.py`'s docstring. The archive holds no format manual: its
  `manual-*` folders are the hand-entered part of CINDA (`000-cinda-main/readme.txt`). Quantity names come from EXFOR
  dictionary 45 (`nsr.exfor_dict045`), laboratory names from EXFOR dictionary 3 (`nsr.exfor_dict003`).
- **Output:** `lake/cinda/<snapshot>/` with `lines/` (`nsr.cinda_lines`, sorted by target_za in row groups of 10,000),
  `dict_quantities/`, `dict_labs/`, `dict_types/` (`nsr.cinda_dict_*`) and `manifest.json` (files, blocks, rows, the
  NSR and EXFOR matches, the pre-2010 lines neither resolves, format source, spend). DDL in `ddl/`.
- **Served** by nsr-api `cinda.py` (`/cinda`, `/cinda/block/{id}`, `/cinda/pickers/{name}`); the page is `/cinda`.

## Rerun
On the Mac: `./scripts/parse/box/create.sh nsr-cinda-1 m7i-flex.large ../cinda/userdata.sh 30` (role nsr-parse-box with
inline policy `nsr-parse-box-cinda` = `box-policy.json`), then copy `scripts/parse/box/lake.py` and `parse.py` to
`s3://nsr-lake-613473203863/lake/_work/parse/cinda/`. On the box (through `scripts/iaea/box/ssm.sh <id> '…'`):
`aws s3 cp` both to `/opt/parse/scripts/`, then `cd /opt/parse/scripts && /opt/parse/bin/python parse.py --snapshot
2024-04-26`. About 30 seconds. Terminate the box after.
