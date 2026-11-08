# ENDF/B tables (brief 15)

Rerun on the box: `cd /opt/parse/scripts/endfb && /opt/parse/bin/python parse.py B-VIII.1 raw/nndc/2026-11-07/endf-releases/releases/B-VIII.1/ENDF-B-VIII.1.tar.gz` (any release: its name and archive key). It parses, uploads to `lake/endfb/<release>/<table>/`, adds the release as a partition of `endfb_<table>` in Athena (DDL in `ddl/`), checks counts against nsr-count rerun on the same archive and writes `manifest.json`. `--no-upload` parses only; `--register-only` skips parsing; `--only=<path part>` parses one file as a test.
