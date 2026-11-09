# 35 — The structure chart ported, colour modes on the chart of nuclides, the nuclides table, the content plate (2026-11-09, 00:05 ET)

Written by lead-agent for ui-layer-3. Report to `lead-agent` only; no questions; one report per part. Work in
`~/Code/nsrgpt` on main, pull before each commit, push each commit, CI type-checks every push. The box
(http://13.184.13.46:3000, pulls main every 20 s, stops about 04:40 ET; restart with
`scripts/devbox/launch.sh start i-0ec4775a5cd68d41b`, which prints the new address) is where Brendan reviews.
ui-layer (brief 32) and ui-layer-2 (brief 33) work in the same tree; don't touch their files (`app/(site)/glossary`,
`factory`, `schema`, `data-dictionary`, `datasets`, `components/nsr/factory`, `components/nsr/graph/**`). Standing
rules: port the named source whole, then adapt (EV rule 14); plain language; paper palette; static shells (brief 13);
charts follow the dataviz skill's palette rules; counts in short form (304K, 9.1M) through one formatter.

## Part 1: the structure chart, ported whole
Source, the old app: `~/Code/nsr/src/components/ChartOfNuclides.tsx`, `~/Code/nsr/src/pages/Structure.tsx`,
`~/Code/nsr/src/lib/structure.ts` (AGE_COLORS, XUNDL_COLORS, ageLabel, the StructureIndex shape) and the ENSDF
Evaluation Index table `~/Code/nsr/src/pages/ensdf/Evaluation.tsx`. Port the chart and the index table whole to
`/viz/structure`: the N-Z grid, wheel zoom, the two colour codes (years since ENSDF cutoff; XUNDL sets since cutoff),
the hover showing nuclide and value, the legend bar, a click opening that nuclide's datasets
(`/datasets/ensdf?nucid=…`, brief 33's route; until it exists, `/graph?center=nuclide:<id>`). Then the paper palette;
nothing else changes.
Data: regenerate the structure index from the lake with a script in `scripts/viz/structure-index.mjs`: for every mass
chain the ENSDF cutoff from the COMMENTS dataset header (`CUT=` in `nsr.ensdf_cards`, with the evaluation's citation and
evaluators), and for every nuclide the count of XUNDL datasets dated after that cutoff (`nsr.xundl_datasets`). Athena
(workgroup `nsrgpt`, database `nsr`, profile `nysgpt-new`, us-east-2), one query at a time, results small. Publish to the
CDN at `viz-data/v20261108/structure-index.json` and to `lake/serve/viz/` with a manifest row; read it through
`lib/use-data.ts`.

## Part 2: colour modes on /viz/chart
`app/(site)/viz/chart/` is the chart of nuclides with the IAEA-style card. Add a **Colour by** control in the chart's
header: decay family (today's), half-life (log scale, the Live Chart's bands), evaluation age (Part 1's index), XUNDL
sets since cutoff (the same), papers per nuclide (NSR, from `literature`'s data or the API), EXFOR entries per nuclide
(`exfor_serve_targets`). One legend that redraws per mode. A click on a cell keeps opening the card; the card gains a row
of links: the nuclide's datasets, its papers, its chart row in the table (Part 3). A "Sources" line beneath the chart:
NUBASE2020, AME2020, ENSDF, the IAEA Live Chart.

## Part 3: the nuclides table
`/viz/data/nuclides`, on the app's table pages (`lib/viz-tables.ts`, `app/(site)/viz/data/[slug]`): one row per nuclide
from `livechart-ground.json` (Z, N, A, symbol, Jπ, half-life with unit, decay modes with percents, mass excess, binding
per nucleon, abundance) plus our counts (ENSDF datasets, XUNDL datasets, NSR papers, EXFOR entries). Sortable on every
column, a filter box, each row linking to its chart cell (`/viz/chart?nuclide=…`, the chart opens its card) and its
datasets. The same Sources line.

## Part 4: the content plate
Each of the three (the structure chart, the chart of nuclides, the nuclides table) gets its own box on the root page's
content plate. While there: Brendan's standing complaint, the plate's boxes bleed into each other, the source line of
one running into the next. Every box holds the same shape (same height, same padding, clipped content, the source line
inside its own box at the foot, truncated with an ellipsis when long). Fix it for every box on the plate, not only the
three new ones, and say which boxes were overflowing.

## Done means
Four parts checked on the box in both themes; CI green; the structure index on the CDN with its script and manifest row;
one report per part with commits and anything seen and not fixed.
