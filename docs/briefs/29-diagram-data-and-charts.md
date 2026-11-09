# 29 — The diagram library's data files, and two chart types (2026-11-08)

Written by lead-agent for parsing-1. Brendan approved the plan at 19:50 ET and expects everything finished when he is
back in an hour; no questions, no check-ins, one report at the end. Report to `lead-agent` only. Work in `~/Code/nsrgpt`
on main: pull before each commit, push each commit, CI type-checks every push. Rollback tag: `before-diagram-library`.
No heavy work on the Mac: Athena (workgroup `nsrgpt`, database `nsr`, profile `nysgpt-new`, us-east-2) or DuckDB on a box
for the queries; the results are small.

Peers on main: parsing-2 (brief 28) builds the parts and specs that read your files; ui-layer (brief 27) the rail and
Config. You own `scripts/diagram/**`, the data files below, and the two chart types in `lib/viz-charts.ts` plus their
pages. Don't touch `lib/diagram/**`, `components/nsr/graph/**`, `components/sidebar/*`.

## Part A: data files (first; parsing-2 is waiting on them)
Publish each file to the chart data CDN beside the others: `s3://nsr-lake-613473203863/site/viz-data/v20261108/diagram/
<name>.json`, served at `https://dcl3kyt3ynmb2.cloudfront.net/viz-data/v20261108/diagram/<name>.json` (the app reads it
through `lib/data-url.ts` `dataUrl("diagram/<name>.json")`). Also copy each into `lake/serve/diagram/` with a
`manifest.json` naming its sources. Scripts in `scripts/diagram/`, one per file, each with a header saying what it reads and
writes. Order:
1. `transmutation-u238-cm244.json`: for U-238, Pu-238 to Pu-243, Am-241, Am-242, Am-242m, Am-243, Cm-242 to Cm-245:
   thermal (0.0253 eV) σ(n,γ) (MT 102) and σ(n,f) (MT 18) from `nsr.endf_serve_xs` release `B-VIII.1-point-293.6K`
   (interpolate the arrays), `capturePct = 100·σγ/(σγ+σf)`, `fissionPct` the complement, half-life and decay branches
   (α, β−, EC, IT percent) from `nsr.nuclide_serve_summary` / `nuclide_serve_decays`, and the figure's class
   (fissile, fertile, less fertile, shortlived) by rule: fissionPct ≥ 50 fissile; else half-life under 1 year
   shortlived; else capturePct ≥ 50 fertile; else less fertile. Note where our numbers differ from the Wikipedia figure.
2. `s-process-ag-sb.json` and `mass-201-210.json`: nuclides by (Z, N, A, symbol, stable) for Ag to Sb (Z 47–51) and for
   A 201–210 (Hg to Po), from `livechart-ground.json` (stable = no decay mode) with the path edges: the s-process rule,
   neutron capture along stable isotopes, β− when the product is unstable; for 201–210 add the r-process β− feeding
   (dashed) as the figure shows. Include `faint` for stable isotopes off the path.
3. `rp-process.json`: the rp-process path of proton captures and β+ decays from the Wikipedia article's description (the
   waiting points up to Sn-100), as nodes and edges; cite the article.
4. `level-schemes/co60.json`, `au198.json`, `po210.json`: parent (Z, A, symbol, half-life, Jπ), daughter levels from the
   API `/nuclide/{daughter}/levels` (energy keV, Jπ, half-life), gammas from `/nuclide/{daughter}/gammas` (from, to,
   energy, intensity), and the feeding branches (β−, EC, α percent to each level) from `nuclide_serve_decays` or ENSDF's
   decay datasets (`nsr.ensdf_betas`, `ensdf_alphas`). Co-60 → Ni-60, Au-198 → Hg-198, Po-210 → Pb-206.
5. `decay-series.json`: the four series' members with half-life value and unit text as the figures print them ("1.41e+10
   Years", "3.6 Days", "55 Seconds", "Stable") from `nuclide_serve_summary`, keyed by series. parsing-2 may already derive
   members from `decay.json`; this file gives the half-life text.
Commit each file's script as it lands; tell lead-agent in one line when 1 and 4 are up (parsing-2 needs them most).

## Part B: two chart types (after Part A)
Brendan's two figures that are charts, not canvases: Wikipedia's ThermalFissionYield.svg and the Co-60 gamma spectrum.
1. **Fission yield curve** at `/viz/fission-yield`: independent yield against mass number for thermal fission, U-235,
   Pu-239 and U-233 selectable, log y. Check first whether the existing charts already plot `fission/<id>.json`; if one
   does, extend it to the figure (log scale, the double hump, the three nuclides) rather than adding a second chart.
2. **Gamma lines** at `/viz/gamma-lines`: a stick spectrum of a nuclide's decay gammas, energy on x, intensity on y (log
   option), the two Co-60 lines at 1173 and 1332 keV by default, any nuclide through the picker, from the API
   `/nuclide/{name}/gammas`. Say on the page that it shows the emitted lines, not a detector's spectrum (no Compton
   continuum), in one plain sentence beneath the title.
Both follow brief 13's rules: static shells, `useData` or the API, no server data calls while a page renders; entries in
`lib/viz-charts.ts` and `lib/header-titles.ts`; the dataviz skill's palette rules for the series colours.

## Done means
The five data files on the CDN and in the lake with scripts and manifest; the two charts live and listed in the sidebar's
Charts group; type check green; one report with what differs from the reference figures and why.
