# 64 — Files 4, 5, 6 and 9 to 15 of every ENDF release to numeric rows, in under an hour, served and counted (2026-11-10, 21:30 ET)

You're `new-worker-2`. Written by `lead-agent` (Fable). Brendan's order: the parse that was left as "sections only"
gets done now, fanned out, not queued. Report to `lead-agent` by SendMessage, Efficiency Voice, one line per part,
one at the end. No questions; decide and record in the manifest.

## What is held and what is missing
- 13 releases of ENDF-6 text are parsed to `nsr.endfb_*` (brief 15, 43, 56): every section is in `endfb_sections`
  (release, sublibrary, file_name, mat, mf, mt, line_count, first_line) and every line in `endfb_records`
  (`lake/endfb/<release>/records/`, Parquet keyed by file_name and mat). Numeric rows exist only for MF3
  (`endfb_xs_points`), MF2/32 (`endfb_res_*`), MF8 (`endfb_fy`, `endfb_decay*`) and MF33 (`endfb_cov`).
- Missing as numbers: MF4 (angular distributions), MF5 (energy distributions), MF6 (energy-angle), MF9 and MF10
  (multiplicities and production cross sections), MF12 and MF13 (photon production), MF14 (photon angular), MF15
  (photon energy). About 2 billion text lines across 69,201 materials. The reader is endf-parserpy 0.18.0
  (`raw/pypi/2026-11-07/endf-parserpy/`), which parses all of these; `scripts/parse/endfb/parse.py`'s `--mf=8,33`
  and `--mf=2,32` modes show how a section's parsed dict becomes rows (`fy_rows`, `cov_rows`).

## Rules
1. Mac rules: no python3 locally; AWS CLI one call at a time; everything runs on Lambda or boxes. `~/Code/nsrgpt` on
   main, shared: pull `--rebase --autostash`, commit with explicit paths, push your own files only (never
   `components/nsrcpt/`). You own `scripts/parse/endfb/**` (new modes only), `services/nsr-endf-parse/**` (new),
   `scripts/parse/endfb/ddl/*` for the new tables, `lake/endfb/<release>/<new table>/`, the API module below, the
   dictionary entries and INVENTORY rows for the new tables, `/counts` keys.
2. **Time, not box-hours, is the constraint:** the first release (B-VIII.1) parsed and registered within 2 hours of
   kickoff, all 13 within 4. Fan out: a Lambda per material (the `services/nsr-count` pattern: one function, invoked
   asynchronously 1,000 at a time, each reading its input from S3 and writing its output to S3), or, if packaging
   endf-parserpy and pyarrow into a Lambda costs more than an hour, one large box in the Old account (profile
   `default`, which has no instance-type restriction: a `c7i.24xlarge` spot or on-demand, 96 vCPU, about $4 an hour,
   terminated the moment the run ends) with a process per core. Say which in the first report. Spend cap $12.
3. Nothing dropped silently: a section endf-parserpy rejects is counted in the manifest with MAT, MF, MT and the
   error, and its lines stay in `endfb_records`.

## Part A: split (box, minutes)
One text file per material under `lake/_work/endf-split/<release>/<file_name>.endf`, from `endfb_records` by DuckDB
(the job box pattern, `scripts/jobs/box/broaden.py`'s `tape()` writes a material from records), or straight from the
archives for ENDF/B where each material is already its own file. 69,201 files. Skip the four POINT releases (they hold
MF3 only).

## Part B: parse (fan-out)
One invocation per material file: endf-parserpy reads it, and every section with MF in {4, 5, 6, 9, 10, 12, 13, 14,
15} becomes rows in these tables (Parquet part per material, `lake/endfb/<release>/<table>/`, registered in `nsr`,
partitioned by release; DDL in `scripts/parse/endfb/ddl/`). Long form, one numeric value per row, with the
representation flags kept so a reader can reconstruct:
- `endfb_ang` (MF4): release, sublibrary, mat, mt, ltt, lct, e_ev, form ("legendre" | "tabulated"), l (for
  Legendre), mu (for tabulated), value, interpolation.
- `endfb_edist` (MF5): release, sublibrary, mat, mt, lf (the law), e_in_ev, e_out_ev, value, plus `params` JSON
  for the law's parameters (theta, U, etc.) one row per e_in.
- `endfb_eang` (MF6): release, sublibrary, mat, mt, zap, awp, law, lang, lep, e_in_ev, e_out_ev, mu_or_l, value,
  `params` JSON. Laws 1 to 7; a law the reader can't tabulate is rows of its parameters, named.
- `endfb_mult` (MF9 and MF10): release, sublibrary, mat, mf, mt, lfs, qm, qi, e_ev, value, interpolation.
- `endfb_photon_xs` (MF12 and MF13): release, sublibrary, mat, mf, mt, lo, lp, lf, eg_ev, es_ev, e_ev, value
  (yield for MF12, cross section for MF13), transition-probability rows flagged.
- `endfb_photon_ang` (MF14) and `endfb_photon_edist` (MF15): as MF4 and MF5 with eg_ev.
Every table also records `n_values` per section in the manifest's `values_by_mf` so the count is defined.

## Part C: register, serve, count
1. Glue partitions for every release; `scripts/parse/endfb/README.md` one-line rerun per table; manifests per
   release (`sections_by_mf` now paired with `values_by_mf`, rejects, timings, spend); INVENTORY rows.
2. `GET /endf/section?name=U-235&release=B-VIII.1&mf=4&mt=2&emin=&emax=` in nsr-api (a new `endf_sections.py` on
   the structure.py route pattern): the rows for one section, cut by energy, at most 50,000 rows with `truncated`,
   plus `GET /endf/section/laws?name=&mf=&mt=` listing the energies and laws held. README rows, dictionary entries.
   Deploy from the dev box (pull first). Latency for U-235 MF4 MT2.
3. `/counts`: a key per new table and `total_values`, the sum of every numeric value held across all `endfb_*`
   numeric tables (points, parameters, covariance values, the new rows), with `total_values_of` listing what it
   sums, beside the existing `total_records`. Tell `lead-agent` both totals.

## Done means
All 13 releases' MF4 to MF15 as rows in `nsr`, counts matching `endfb_sections` or explained, served, in the
dictionary and INVENTORY, `/counts` carrying `total_values`; boxes terminated; one final report with rows per table,
the two totals, timings per release, spend.

## Kickoff
`Read ~/Code/nsrgpt/docs/briefs/64-endf-files-4-15-fan-out.md and do it; report to lead-agent after each part.`
