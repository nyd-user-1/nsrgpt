# GNDS 2.0 compile (brief 60)

The ENDF-6 releases in the lake (`lake/endfb/<release>/records/`) compiled to GNDS 2.0 with LLNL FUDGE 6.14.0
(github.com/LLNL/fudge, tag 6.14.0, commit 41da14c; the lake's copy and its `manifest.json` in
`raw/github/2026-11-10/LLNL/fudge/`). FUDGE's own converter does the work: `brownies/bin/endf2gnds.py <tape> <mat>.xml
--continuumSpectraFix --formatVersion 2.0 --traceback`.

| File | What |
| --- | --- |
| `box/create.sh [name]` | launches a compile box (m7i-flex.large; the account takes Free Tier types only), role `nsr-jobs-box` plus inline policy `nsr-gnds` |
| `box/userdata.sh` | FUDGE into the lake, then built from the lake's copy with its Makefile; ends the box after 12 hours |
| `compile.py <release> [<sub>] [--shard i/n]` | every material: a tape from the records, endf2gnds, gzip to `lake/gnds/<release>/<sub>/<mat>.xml.gz` (and `.cov.xml.gz`), a row in `nsr.gnds_files` |
| `compile.py --one <release> <sub> <mat>` | one material by hand |
| `box/chain.sh <i> <n>` | a box's order after B-VIII.1: B-VIII.0, B-VII.1, JEFF-3.3, JENDL-5, CENDL-3.2, TENDL-2023 neutrons, B-VII.0, B-VI.8, B-V, B-IV, B-III, B-II, then TENDL-2023's other sublibraries; the manifest after each |
| `compile.py --manifest` | `lake/gnds/manifest.json` and each `lake/gnds/<release>/index.json` (what `/gnds` reads) |
| `check.py <xml> <release> <sub> <mat>` | the XML parses, `format="2.0"`, MT18 at 1 MeV through FUDGE equals `nsr.endfb_xs_points` within 1e-6 |
| `cdn.sh` | CloudFront: the bucket as nsr-api's second origin for `/lake/gnds/*` and `/lake/jobs/*` |
| `ddl/gnds_files.sql` | the catalog table |

Rerun: `./scripts/gnds/box/create.sh nsr-gnds-1` (and `-2`…), `aws s3 cp scripts/gnds/ s3://nsr-lake-613473203863/lake/_work/gnds/box/
--recursive --exclude '*' --include '*.py'`, then on each box through `scripts/iaea/box/ssm.sh`:
`cd /opt/gnds && nohup /opt/gnds/venv/bin/python -I compile.py <release> --shard <i>/<n> > /data/<release>.s<i>.log 2>&1 &`,
and once all shards end, `compile.py --manifest` on any box.

- Sublibraries are named by the word (`neutrons`), ENDF/B's folder names (`neutrons-version.VIII.1`) read as it. A run
  takes one sublibrary, a comma list (in that order) or all (neutrons first); it downloads the records once and works one
  sublibrary at a time, deleting its tapes after (TENDL-2023's 32 GB of records would otherwise fill the disk).
- Decay files come out as GNDS PoPs documents (`<PoPs format="2.0">`), the form GNDS gives decay data.
- A tape keeps its source file's name: FUDGE reads a thermal-scattering target from it (`HinCH2`, `tsl-BeinBeO`).
- The reactionSuite points at its covariances as `Covariances/<mat>-covar.xml`; the lake holds that file as
  `<mat>.cov.xml.gz` beside it.
- Failures are rows with `ok = false` and FUDGE's last 20 lines in `error`; nothing is retried.
- On demand: the `gnds` job kind (services/nsr-jobs, `scripts/jobs/box/gnds.py`) compiles one material on `nsr-jobs-1`.
