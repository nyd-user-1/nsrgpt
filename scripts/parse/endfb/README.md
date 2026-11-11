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
- **Part C, MF2 and MF32** (brief 56: `endfb_res_ranges`, `endfb_res_params`, `endfb_res_cov`): `./releases.sh --mf=2,32 <release>`,
  or `nohup ./res_all.sh &` for all 13 in the brief's order (logs `/data/mf2-<release>.log`); counts against `endfb_sections`
  (MF2 and MF32 MT151) go to the manifest's `mf2_mf32` section. `./res_test.sh <release> <key> <file part>` parses one file
  without uploading and prints what each table holds.
- **Serving**: `cd ../serve-structure && /opt/parse/bin/python -I serve.py endf <release>` (`lake/serve/endf/<release>/`);
  for JEFF-3.3, JENDL-5 and TENDL-2023 also `HOME=/root /opt/parse/bin/python -I serve.py point_files <release>` (the
  API reads them through `xs_index/` and `xs_series/series.bin`, `INDEXED` in `services/nsr-api/structure.py`).
- **Search**: `serve.py docs`, then `cd ../search && HOME=/root /opt/parse/bin/python -I index.py` (it needs
  `scripts/parse/exfor/common.py` at `/opt/parse/scripts/common.py` and DuckDB's fts in `/opt/duckdb_ext`); then build
  and deploy nsr-api (`services/nsr-api/README.md`, "Packages and build").

`parse.py <release> <s3 key>… [--mf=8,33] [--no-upload] [--register-only] [--only=<path part>]` is what `releases.sh`
runs; `--only` parses one file as a test.

## Files 4, 5, 6, 9, 10, 12, 13, 14 and 15 (brief 64)

Seven tables, partitioned by release, one Parquet file per material at `lake/endfb/<release>/<table>/<id>.parquet`, written
by the Lambda `nsr-endf-parse` (`services/nsr-endf-parse/`, endf-parserpy 0.18.0, one invocation per material, 300 at a
time). Long form, one numeric value a row; DDL in `ddl/`. The per-material section summaries (rows, values, energies,
laws, rejects) are at `lake/endfb/<release>/mf4_15/sections/<id>.json`, the id list at `mf4_15/materials.json`, every
rejected section at `mf4_15/rejects.json`, and the release's counts (`sections_by_mf`, `values_by_mf`, the check against
`endfb_sections`, timings, spend) in the manifest's `mf4_15` section.

| Table | File | One row is |
| --- | --- | --- |
| `endfb_ang` | MF4 | a Legendre coefficient a_l (form legendre, l) or a point of f(mu) (form tabulated, mu) at incident energy e_ev; an isotropic section is one row with no value |
| `endfb_edist` | MF5 | per subsection and law lf: a point of p(E) (kind p), of g(E→E') (kind g, LF 1), a law parameter (kind theta, a, b, tm; U, EFL, EFH in params) or g(x) (kind gx, LF 5) |
| `endfb_eang` | MF6 | per product (zap, law): its yield (quantity yield), a Legendre or Kalbach-Mann coefficient, a tabulated point, a LAW 5 parameter (cp_elastic), LAW 6's APSX or a LAW 7 point (lab_f) |
| `endfb_mult` | MF9, MF10 | a point of a product's multiplicity (MF9) or production cross section (MF10), with izap, lfs, qm, qi |
| `endfb_photon_xs` | MF12, MF13 | a point of a photon's yield or cross section (kind yield, total_yield, xs, total_xs), or a transition probability (transition_tp, transition_gp; LO 2) |
| `endfb_photon_ang` | MF14 | as endfb_ang per photon (eg_ev, es_ev) |
| `endfb_photon_edist` | MF15 | a point of p(E) (kind p) or of g(E→Eg) (kind g, eg_ev the photon energy) |

Rerun, one line per step, from the Mac (one AWS CLI call each; `R` a release):

- Deploy: `./services/nsr-endf-parse/deploy.sh`
- Part A, split `endfb_records` into per-material text of MF 4-15: `aws lambda invoke --function-name nsr-endf-parse --cli-binary-format raw-in-base64-out --payload '{"job":"fanout","release":"R","stage":"split"}' out.json`
- Part B, parse every material (all seven tables at once): the same with `"stage":"parse"`; add `"missing":true` for the materials with no summary, `"rejected":true` for those with a rejected section, `"ids":[…]` for named ones, `"chunks":n` to split a long material's sections over n invocations.
- Part C, register, count and write the manifest: `{"job":"collect","release":"R"}`
- `/counts`' total_values: `{"job":"values"}` (writes `lake/endfb/_values/latest.json`).
- Delete the split text after a run (130 GB for all 13; the indexes stay, Part A rebuilds it): `{"job":"clean"}` (or `"release":"R"`); each manifest's `mf4_15.split_text` records it.
