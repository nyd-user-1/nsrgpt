# ENDF tables (briefs 15, 43)

Thirteen releases in `nsr.endfb_*`, partitioned by `release`: nine ENDF/B (B-VIII.1 to B-II), JEFF-3.3, JENDL-5,
TENDL-2023 and CENDL-3.2. The last four are one archive per sublibrary (IAEA's backup zips; JEFF-3.3's alphas,
deuterons, gammas, helium3s and protons from NEA), and their `sublibrary` is ENDF/B's word for the archive's token
(`neutrons`, `thermal_scatt`, `decay`, `nfy`, `sfy`, `gammas`, `protons`, `deuterons`, `tritons`, `helium3s`, `alphas`,
`photoat`, `electrons`, `atomic_relax`). Each release has `lake/endfb/<release>/manifest.json` with counts, the counts
check and spend.

Rerun each part on the parse box (`scripts/parse/box/create.sh`; scripts synced to `/opt/parse/scripts/`), one line each:

- **Part A, the four tables** (materials, sections, xs_points, records): `cd /opt/parse/scripts/endfb && ./releases.sh <release>`
  (keys from the list in `releases.sh`; no argument runs every release). It parses, uploads to
  `lake/endfb/<release>/<table>/`, adds the partition (DDL in `ddl/`), checks counts (ENDF/B: nsr-count rerun on the same
  archive; the four libraries: each sublibrary's `.lst`, else the files with an MF1/451 section) and writes the manifest.
- **Part B, MF8 and MF33** (`endfb_fy`, `endfb_decay`, `endfb_decay_modes`, `endfb_decay_lines`, `endfb_cov`):
  `./releases.sh --mf=8,33 <release>`. Same files and sections as part A; each table's sections are compared with
  `endfb_sections` and written to the manifest's `mf8_mf33` section.
- **Serving**: `cd ../serve-structure && /opt/parse/bin/python -I serve.py endf <release>` (`lake/serve/endf/<release>/`).

`parse.py <release> <s3 key>… [--mf=8,33] [--no-upload] [--register-only] [--only=<path part>]` is what `releases.sh`
runs; `--only` parses one file as a test.
