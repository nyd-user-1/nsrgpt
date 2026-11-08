# 17 — Serving layer and the cached API for ENSDF, XUNDL and ENDF/B (2026-11-08, overnight)

You're `parsing-1`, continuing from brief 15 (your ENSDF, XUNDL and ENDF/B tables are in Athena `nsr`). Brendan
authorized this overnight work through agent-1; he reads the results in the morning. Report to agent-1 with
SendMessage (name `agent-1`) after each step, 3–5 lines, Efficiency Voice. Blockers go to agent-1; don't stop on them.
The standing rules of brief 15 hold (Mac rules, no commits, write only in `scripts/parse/serve-structure/` (new),
`services/nsr-api/` (shared with parsing-2: add files and handlers, don't rewrite theirs), the lake prefixes below,
`INVENTORY.md` rows; spend cap $3; free routes first).

The shape: raw, parsed, serving tables in S3; a cached API; a thin static UI. parsing-2 built the serving tables and
the API for EXFOR (`lake/serve/exfor/`, Lambda `nsr-api` behind API Gateway `3o2ps7jan4` and CloudFront
`https://daw1qggkn69lv.cloudfront.net`, DuckDB reading Parquet from S3; see `services/nsr-api/` and
`scripts/parse/serve/`). This brief does the same for structure and the evaluated libraries, so a page can show any
nuclide, any level scheme, any decay, any cross section with one request.

## Serving tables (Athena UNLOAD into `lake/serve/<set>/<version>/<table>/`, then CREATE EXTERNAL TABLE in `nsr`)
1. `lake/serve/nuclide/2026-11-05/`:
   1a. `summary` … one row per nuclide ENSDF knows: z, n, a, symbol, name ("137Cs"), half_life_s, half_life_text,
       decay_modes (JSON array of {mode, pct}), n_levels, n_gammas, n_datasets, has_xundl, adopted_dsid, mass_excess_kev
       if the adopted dataset carries it, jpi_ground.
   1b. `levels` … the adopted levels per nuclide (dsid matching "ADOPTED LEVELS"): z, n, name, level_seq, energy_kev,
       energy_unc, jpi, half_life_s, half_life_text, decay_modes_text.
   1c. `gammas` … the adopted gammas: z, n, name, level_seq (initial), final_level_seq (resolved by energy difference
       within the uncertainty; null when ambiguous), e_gamma_kev, ri, mult, mr, cc.
   1d. `decays` … one row per decay dataset: parent name, daughter name, mode, dsid, half_life_s, q_kev, branching
       pct where the dataset gives it, n_gammas.
2. `lake/serve/endf/B-VIII.1/` (then the other releases, same shape, `release` column):
   2a. `materials` … release, sublibrary, mat, za, z, a, name, awr, temp_k, file_name, n_mf3_sections, n_points.
   2b. `xs` … one row per (release, sublibrary, mat, mt): energy_ev and xs_barn as parallel arrays (Parquet lists),
       n_points, e_min, e_max, interpolation. This is the chart row: one read draws a cross section.
   2c. `mt_names` … mt, name, description for every MT present (from ENDF-102; the ENDF manual is in
       `raw/nndc/2026-11-07/endfdocs/`; a static table you write by hand for the MTs present is fine).
3. `lake/serve/search/2026-11-08/docs` … one row per searchable record for parsing-2's search index (brief 18 reads
   it): type (nuclide, level, decay, material, dataset), id, name, title (plain words), text (what a person would
   type to find it: symbols, A, Z, N, modes, MT names, release), keywords (array), z, a, mt. Nuclides, ENSDF
   datasets, ENDF materials and MF3 sections at least.

## The API (add to `services/nsr-api/`; the pattern is parsing-2's lambda_function.py: DuckDB over S3 Parquet, JSON out)
1. `GET /nuclide/{name}` … summary, decay modes, adopted levels and gammas (paged: `?levels=200`), its decays
   (as parent and as daughter), counts. `{name}` as "137Cs", "cs-137", "CS137" (normalize).
2. `GET /nuclide/{name}/levels`, `/gammas` … full lists, paged.
3. `GET /endf/materials?release=&sublibrary=&z=` … the index.
4. `GET /endf/xs?name=U-235&mt=18&release=B-VIII.1` … the energy and xs arrays, plus the same for `&compare=B-VIII.0`
   when asked (two series in one response). Default release B-VIII.1; sublibrary neutrons unless `&sub=`.
5. `GET /endf/mt` … the MT table.
6. Cache: the same CloudFront, 1 hour. Latency target: under 0.5 s first hit on a warm Lambda, under 0.1 s cached.
   Deploy with the existing `deploy.sh`; add routes to the HTTP API; don't change parsing-2's EXFOR routes.
7. Verify from the Mac with curl: `/nuclide/137Cs`, `/nuclide/60Co/gammas`, `/endf/xs?name=U-235&mt=18`,
   `/endf/xs?name=Fe-56&mt=102&compare=JEFF-3.3` (only if JEFF is parsed; else say not held). Report the latencies.

## Done means
1. The serving tables above, registered in `nsr`, with a manifest per set (sources, rows, bytes, built-at, spend).
2. The API routes live, latencies reported, `services/nsr-api/README.md` listing every route with an example.
3. `INVENTORY.md` rows for `lake/serve/nuclide`, `lake/serve/endf`, `lake/serve/search`.
4. A final report to agent-1: rows, bytes, spend, routes, what's missing. Terminate any box you start.

## Kickoff
`Read ~/Code/nsrgpt/docs/briefs/17-serving-layer-and-api.md and start; report to agent-1 after each step.`
