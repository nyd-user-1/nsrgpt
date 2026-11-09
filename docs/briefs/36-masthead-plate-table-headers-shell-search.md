# 36 — Masthead and plate boxes, table pages' headers, the shell's search bar, header spacing (2026-11-09, 01:20 ET)

Written by lead-agent for ui-layer-3. Report to `lead-agent` only; no questions; one report per part. Work in
`~/Code/nsrgpt` on main, pull before each commit, commit with explicit paths, push each commit, CI type-checks every
push. The box (http://13.184.13.46:3000, pulls main every 20 s) is where Brendan reviews. Standing rules: plain language,
paper palette, reuse before writing, counts in short form in tiles, static shells.

## Part 1: the masthead's four boxes
`app/HomeMasthead.tsx` shows four dataset boxes. Replace "Nuclides" with **ENDF/B** (Brendan typed "ENSDF/B"; the lake's
fourth parsed dataset is ENDF/B, so that is the name; if the figure and link exist for it already, use them), and sort
the four A to Z, left to right then top to bottom: ENDF/B, ENSDF, EXFOR, XUNDL. Each box keeps its figure and opens its
dataset index (`/datasets/endfb`, `/datasets/ensdf`, `/datasets/exfor`, `/datasets/xundl`).

## Part 2: a Nuclides box on the content plate
The plate's chart box titled "Chart of Nuclides" is titled **Nuclides** and opens `/viz/chart`. The "Nuclides Table"
box stays and opens `/viz/data/nuclides`.

## Part 3: Reactions
`/viz/data/reactions` is titled "Decay series steps" and lists decay steps, which are not reactions, so it must not be
relabelled Reactions. Do this instead: rename that slug to `decay-steps` (title unchanged, redirect the old address), and
make `/viz/data/reactions` a real **Reactions** table over the EXFOR reactions the API serves (`/exfor/pickers/reactions`
and the `exfor_serve_reactions` table): reaction code, target, quantity, entries, subentries, data points, each row
linking to `/datasets/exfor?reaction=…`. A **Reactions** box on the plate opens it. Sources line: EXFOR (IAEA X4Pro and J4).

## Part 4: table pages take the charts' header treatment
On every `/viz/data/*` page the page's own h1 goes, and the name moves into the app shell header with the click-to-copy
beside it, exactly as the chart pages do (`components/AppLayout.tsx`: `HEADER_TITLES`, `CopyTitle`). With the h1 gone
the table's column header is the first thing in the pane: it stays stuck at the top while the rows scroll beneath it
(`position: sticky` on the header row under the filter bar, as `/viz/data/nuclides` already does; make every table page
do it).

## Part 5: the graph's search bar in the app shell header
Take the search bar from `/graph` (`components/nsr/graph/GraphPage.tsx`: the circle that opens to full width over
500 ms, the input, the suggestions list) and place it in the app shell header after the click-to-copy icon, on every
page. Clicking the icon opens the bar without focusing the input; clicking into the input opens the suggestions list.
The list must render above everything beneath the header (portal it, as the tooltips are, with a z-index over the
plate, the canvases and the panels). A pick navigates as the graph's does: a nuclide, paper, author, reaction or EXFOR
entry centres on `/graph`. Lift the search into a component both the header and /graph use; /graph's own copy goes once
the header has it, so the canvas page shows one search bar, the header's.

## Part 6: header spacing
On some pages the gap between the sidebar toggle and the title is wrong (the title's margin now depends on whether the
sidebar is open, and the chart switcher has its own margin). Make it one fixed gap from the shared `HEADER` constant in
AppLayout.tsx so every page, the chart switcher included, sits the title the same distance from the toggle in both
sidebar states.

## Done means
Each part checked on the box in both themes; CI green; one report per part with commits, the pages checked, and
anything seen and not fixed.
