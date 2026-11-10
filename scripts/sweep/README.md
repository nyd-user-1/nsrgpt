# The sweep (brief 57)

Every measured cross section in EXFOR against every evaluation the lake holds, ranked; the retrodiction (the ranking on
ENDF/B-VIII.0 against what VIII.1 changed); the VIII.1 list; flags with receipts; the medical-isotope production routes.
Tables under `s3://nsr-lake-613473203863/lake/sweep/2026-11-10/<table>/`, registered as `nsr.sweep_<table>`, served by
nsr-api's `/sweep` routes (`services/nsr-api/sweep.py`). The method, the thresholds, the counts, the U-235 check and the
spend are in `lake/sweep/2026-11-10/manifest.json`.

Rerun it the day a library changes (a new ENDF/B, JEFF, JENDL, TENDL or CENDL release, or a new EXFOR serving table):

```
B=$(./scripts/sweep/box/create.sh) && aws s3 cp scripts/sweep/ s3://nsr-lake-613473203863/lake/_work/sweep/scripts/ --recursive --exclude '*' --include '*.py' && ./scripts/iaea/box/ssm.sh $B 'until [ -f /opt/sweep/ready ]; do sleep 10; done; cd /opt/sweep && aws s3 cp --recursive s3://nsr-lake-613473203863/lake/_work/sweep/scripts/ . && HOME=/root venv/bin/python -I public.py && HOME=/root venv/bin/python -I sweep.py load floors covs loadstate check run changes retro flags eval_flags write && HOME=/root venv/bin/python -I medical.py && HOME=/root venv/bin/python -I manifest.py; shutdown -h now'
```

`medical.py` reads the JEFF-3.3, JENDL-5, TENDL-2023 and CENDL-3.2 capture and fission curves from nsr-jobs broaden jobs
listed in `lake/_work/sweep/jobs.tsv` (PREPRO at 293.6 K); post fresh ones first if a library changed (the POST loop is in
the brief 57 report). On the night of 2026-11-10 the whole sweep took under a minute on an m7i-flex.large (the account
allows Free Tier instance types only), the load about six minutes.

| File | Does |
| --- | --- |
| `box/create.sh`, `box/userdata.sh` | the sweep box (m7i-flex.large, 100 GB, role nsr-jobs-box plus the inline policy nsr-sweep; it terminates itself 9 hours after boot) |
| `reactions.py` | the EXFOR reaction field to (sublibrary, MT), by ENDF-6's MT table |
| `sweep.py` | Parts A to C: load, floors, covariances, the U-235 check, the sweep, the changes VIII.0 to VIII.1, the retrodiction, the lists and flags, write and register |
| `public.py` | the public statements about ENDF/B-VIII.1 (NNDC's release descriptions and metadata, and what else answers), saved under `lake/sweep/2026-11-10/public-lists/` |
| `medical.py` | Part D: the production routes, a yield per evaluation, per the IAEA curve and from the data, and a verdict |
| `manifest.py` | the manifest: every table's rows and bytes, the method, the sources reached and not, the check, timings, spend |
| `ddl/` | the Athena DDL of every `nsr.sweep_*` table |
| `icrp-vs-ensdf.sql` | lead-agent's (not part of the sweep) |
