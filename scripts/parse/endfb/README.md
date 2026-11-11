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
- Before a fan-out, cap it so the other functions keep 100 of the account's 400: `aws lambda put-function-concurrency --function-name nsr-endf-parse --reserved-concurrent-executions 300`; after it, give the 300 back: `aws lambda delete-function-concurrency --function-name nsr-endf-parse` (released 2026-11-11 after the run).
- Part A, split `endfb_records` into per-material text of MF 4-15: `aws lambda invoke --function-name nsr-endf-parse --cli-binary-format raw-in-base64-out --payload '{"job":"fanout","release":"R","stage":"split"}' out.json`
- Part B, parse every material (all seven tables at once): the same with `"stage":"parse"`; add `"missing":true` for the materials with no summary, `"rejected":true` for those with a rejected section, `"ids":[…]` for named ones, `"chunks":n` to split a long material's sections over n invocations.
- Part C, register, count and write the manifest: `{"job":"collect","release":"R"}`
- `/counts`' total_values: `{"job":"values"}` (writes `lake/endfb/_values/latest.json`).
- Delete the split text after a run (130 GB for all 13; the indexes stay, Part A rebuilds it): `{"job":"clean"}` (or `"release":"R"`); each manifest's `mf4_15.split_text` records it.

## The libraries JANIS lists that the lake lacked (brief 70, elpis-fill, 2026-11-11)

Forty-two more releases in the same tables, each with parts A, B and C, Files 4-15 and a manifest. The release name is
JANIS's label with "ENDF/" dropped and slashes and spaces turned to hyphens (`JENDL/AD-2017` → `JENDL-AD-2017`,
`IRDF-2002 MG` → `IRDF-2002-MG`). `fill.sh` lists them the way `releases.sh` lists the thirteen; the releases fetched
during the night were appended on the boxes in `fill.extra` (one line each, the same form) and are written out here.

| Releases | Archives | Where they came from |
| --- | --- | --- |
| JEFF-4.0, JEF-2.2, IRDFF-II, IAEA-PD-2019, IRDF-2002, PADF-2007, RUSFOND-2010 | IAEA backup `*_<token>.sublib.zip` | `raw/iaea/2026-11-07/` (the 11-07 mirror, used in place) |
| B-VI.8-HE, CENDL-2.1, BROND-2.2, IRDF-2002-MG | one zip or tape each, `#<token>` | the same mirror |
| BROND-3.1, FENDL-2.1, IRDFF-1.0, IRDFF-1.05, EAF-2010 | IAEA per-material zips, `<prefix>/*#n` | the same mirror |
| JEFF-3.1.1, JENDL-4.0-HE, JENDL-AD-2017, JENDL-DEU-2020, JENDL-PD-2016, JENDL-PD-2016.1 | IAEA backup sublib zips | `lake/_raw/iaea/`, fetched 11-11 through browser box nsr-fill-wb |
| JEFF-3.1, JEFF-3.1.2, JEFF-3.2, CENDL-3.1, JENDL-4.0, JENDL-4.0u (100 of 406) | IAEA per-material zips | `lake/_raw/iaea/`, the same; JEFF-3.1's decay, nfy, sfy and tsl come from JEFF-3.1.1's backup archives, which IAEA names jeff-3-1 and whose headers read LREL 0 (JEFF-3.1's own, unchanged in 3.1.1) |
| JENDL-3.3, JENDL-HE-2007, JENDL-AC-2008, JENDL-AN-2005, JENDL-PD-2004, JENDL-DDF-2015, JENDL-FPD-2000, JENDL-FPD-2011, JENDL-FPY-2011 | JAEA's own tarballs, `#<token>` (`#fy` splits yields into nfy and sfy by file name) | `lake/_raw/<release>/`, from the Wayback Machine (JAEA's host answers an Incapsula challenge) |
| JEFF-3.0 | NEA's JEFF30N and JEFF30TS tapes | `lake/_raw/JEFF-3.0/`, from the Wayback Machine (NEA's host answers a Cloudflare challenge) |
| GEFY-6.1, 6.2, 8.1, 9.1 | GEF's `_n`, `_mn` (`#nfpy`) and `_s` (`#sfpy`) zips | `lake/_raw/GEFY-*/`, from the GEF site |

Held as files and not parsed (CATALOGUED in `scripts/janis/mark.py`): Nubase 2016, 2003 and 1997 (`lake/_raw/Nubase-*/`)
and EAF-2007 (`lake/_raw/EAF-2007/`, EAF's own layout with no MF1 directory). Each release's `lake/_raw/<release>/SOURCE.md`
names its files, bytes, checksums, route and licence (`scripts/janis/fill/sources.py`).

Rerun, on a parse box (`scripts/parse/box/create.sh`; scripts in `/opt/parse/scripts/`, the fill drivers in `/opt/fill/`):

- Parts A, B, C: `cd /opt/parse/scripts/endfb && ./fill.sh <release>`, `./fill.sh --mf=8,33 <release>`, `./fill.sh --mf=2,32 <release>`;
  or one line each ("A R", "B R", "C R") in `/opt/fill/queue.txt` for `scripts/janis/fill/worker.sh` (one per vCPU). Part B and
  C compare with Part A's tables, so queue them after Part A ends.
- Files 4-15: `/opt/parse/bin/python -I /opt/fill/mf415.py <release>…` (fan-out split, parse, collect through nsr-endf-parse from
  the box), or `auto415.sh`, which runs it for each release whose Part A ends. Reserve the function's concurrency before
  and release it after each fan-out (the lines above).
- Serving: `/opt/fill/serve_fill.sh <release>…` (serve.py endf and point_files, INDEXED), then add the names to
  `RELEASES` in `services/nsr-api/structure.py` (dataset.py reads the same list) and build and deploy nsr-api once.
- `PROGRESS`: `/opt/parse/bin/python -I /opt/fill/progress.py --lines` writes `lake/_raw/PROGRESS.json`.
