# 40 — The plate: a box for every menu page, icons in place of numbers, drag to reorder; blocks named; pin hover (2026-11-09, 02:30 ET)

Written by lead-agent for ui-layer-2, after brief 37. Report to `lead-agent` only; no questions; one report at the end.
Work in `~/Code/nsrgpt` on main, pull before each commit, commit with explicit paths, push each commit; CI type-checks
every push. The box (http://13.184.13.46:3000) is where Brendan reviews. Rules: plain language, paper palette, lucide
icons, the sidebar's icon treatment, reuse before writing.

## 1. A box for every sidebar page
Every item in the sidebar menu (`components/sidebar/SideBarMenu.tsx`: Chat, Charts' pages are already boxes, Data's
tables are, Docs, Factory, Schema, Glossary, Data dictionary, Graph, Pipeline, Search, and the five dataset pages
under Datasets) gets its own box on the content plate, the same shape as the chart boxes: the page's name, a one-line
description in the muted ink (plain language: what the page is for), the page's sidebar icon in the foot where the
number was, and the pane button. Clicking opens the page. Put them in one list with the charts and tables so the
plate's A to Z, pins, hides and drag order treat them all alike (`lib/viz-charts.ts` already has PLATE_TABLES; add
PLATE_PAGES beside it or fold both into one plate registry).

## 2. Icons in place of numbers
Remove the number from every box's foot. In its place: for a chart box, the lucide icon closest to its chart type
(line chart `ChartLine`, bar `ChartBar`, scatter `ChartScatter`, heatmap `Grid3x3`, 3D scatter or surface `Box`, punch
card `CircleDot`, stick spectrum `BarChart3` or `AlignVerticalJustifyEnd`, network `Waypoints`, radar `Radar`, area
`ChartArea`, nuclide chart `Grid2x2`, table `Table`; choose once per chart type and keep a map in one place); for a
page box, the icon the sidebar gives that page (import the same animate-ui icon). Muted at rest.

## 3. Drag to reorder
Every box drags to a new place, forward, backward, up or down, the same way the Blocks panel's blocks drag (reuse its
drag code: `lib/shelf-drag.ts` or wherever the Blocks panel's reorder lives; don't add a dependency). The order is
remembered in the browser (extend `lib/nav-rows.ts` with an order list, or a sibling store), survives reload, and
composes with the marks: pinned boxes stay ahead of unpinned, hidden and archived stay out, and within those groups the
dragged order holds. Dragging shows the Blocks panel's drop cue.

## 4. Blocks are named
Brendan added four blocks from the plate and the Blocks panel showed "Home" on each (the page's header name) instead of
the box's name; after your 94cc3fa some read their names and older ones still say "Home". Fix the panel to show the
block's own name, and migrate stored blocks that have no name by looking their anchor up in the plate registry.

## 5. The pin mark is a control
The pin before the pane button takes the pane button's muted hover background, shows "Unpin" on hover, and unpins on
click.

## 6. No search on the root page
The header's search icon and bar (brief 36 part 5) don't appear on `/`, the root page. Everywhere else they stay.

## Done means
Each item checked on the box in both themes; CI green; one report with commits and anything seen and not fixed.
