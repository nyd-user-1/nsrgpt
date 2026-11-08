# ENSDF and XUNDL tables (brief 15)

Rerun on the box: `cd /opt/parse/scripts/ensdf && /opt/parse/bin/python parse.py ensdf 2026-11-05 raw/nndc/2026-11-07/ensdfarchivals/distributions/dist26/ensdf_261105.zip` (XUNDL: `parse.py xundl 2026-10-01 raw/nndc/2026-11-07/xundlarchivals/distributions/dist26/xundl_261001.zip`). It parses, uploads to `lake/<dataset>/<release>/<table>/`, registers `<dataset>_<table>` in Athena (DDL in `ddl/`), checks counts and writes `manifest.json`. `--no-upload` parses only; `--register-only` skips parsing.
