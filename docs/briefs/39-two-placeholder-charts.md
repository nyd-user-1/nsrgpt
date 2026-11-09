# 39 — The two placeholder boxes become real charts (2026-11-09, 02:25 ET)

Written by lead-agent for ui-layer-3. Report to `lead-agent` only; no questions; one report at the end. Work in
`~/Code/nsrgpt` on main, pull before each commit, commit with explicit paths, push each commit; CI type-checks every push.
The box (http://13.184.13.46:3000) is where Brendan reviews. Rules: the dataviz skill for palette and marks, static
shells, data through `lib/use-data.ts`, counts in short form, plain language.

`lib/viz-charts.ts` carries two "Placeholder" entries that link to Wikipedia figures. Build both as charts and drop
the placeholders.

## 1. Decay chain of Pu-241, quantities over time
Figure: Wikipedia's DecayChain241Pu-eng.svg (Brendan's screenshot): log time in years on x (1 to 10⁹), log quantity on y
(starting quantity 1, down to 10⁻³⁰), one line per member of the Pu-241 chain (Pu-241, Am-241, Np-237, Pa-233, U-233,
Th-229, Ra-225, Ac-225, Fr-221, At-217, Bi-213, Po-213, Tl-209, Pb-209, Bi-209), each labelled on its curve, a thick
line for the sum Σ, and a vertical marker the reader can drag to read every quantity at one time.
- The existing chart "Decay Chain Activity" (box 07, `/viz/decay`, x time log, y activity or atoms log) is the home for
  it: add Pu-241 as a chain the reader can pick, with the figure's members and the Σ line, and make it the chart's
  opening state. If that chart's chain picker doesn't exist, add one (the four series and Pu-241).
- Numbers: the Bateman equations over the chain's half-lives and branching ratios from `decay.json` and
  `livechart-ground.json` (the same source the graph's series use, `lib/viz-physics.ts` `seriesFrom`). Compute in the
  browser; the chain is 15 nuclides, trivial.
- Colours: one hue per member from the categorical palette, Σ in the ink.

## 2. The four decay series on the Z by A grid
Figure: Wikipedia's Radioactive_decay_chains_diagram.svg (Brendan's screenshot): rows are elements, Z 81 to 95, each
labelled "95 Americium (Am)" at the left with alternating grey bands; columns are mass numbers 205 to 241, with
alternating yellow bands and the numbers along the bottom; the four series drawn as polylines of small circles: α a
diagonal down-left two columns and two rows, β− a vertical step up one row; thorium chain blue, radium (uranium) chain
red, actinium chain green, neptunium chain magenta; stable ends marked with a spiral; a legend box top right.
- A new chart page `/viz/decay-series` ("Decay series", a Line Chart on a category grid) in ECharts, with hover on a
  node showing the nuclide and its half-life, a click opening its card or datasets, and the four chains toggled in the
  legend. Members and half-lives from the same data as item 1 (`seriesFrom` for each series).
- Palette: the four chain colours from the categorical palette (keep them distinct from each other, validated), the
  bands in the paper's quiet tints rather than Wikipedia's yellow and grey.
- A box on the plate in place of the second placeholder, sources line "ENSDF (decay modes), the IAEA Live Chart
  (half-lives)".

## Done means
Both placeholders gone from `lib/viz-charts.ts`; both charts live and on the plate, checked on the box in both themes;
CI green; one report with commits and what differs from the figures.
