# 46 — The plate: a box for every menu page, icons in place of numbers, drag to reorder; element symbols on the chart of nuclides (2026-11-09)

You're `window-2-ui-layer`, the UI window; brief 44 is done. Written by `lead-agent` (Fable); Brendan assigned this at
11:00 ET and reviews on the dev box (http://3.150.112.32:3000, pulls main every 20 s). Report to `lead-agent` by
SendMessage only, in Efficiency Voice (`docs/sketches/2026-11-06-efficiency-voice.html`): one line when Part A is
pushed, one when Part B is pushed. No questions mid-job.

## Rules
1. Work in `~/Code/nsrgpt` on main, shared with other windows: `git pull --rebase --autostash origin main`, commit in one
   step with explicit paths, push right after. Type-check on the dev box through SSM before each push (no `tsc` or
   builds on the Mac). CI runs Typecheck and Deploy on every push.
2. Plain language, paper palette, lucide icons, the sidebar's icon treatment, reuse before writing, counts in short form.
3. The Hidden box and its trailing section were removed on 2026-11-09 (6e05797); hidden boxes return through the
   sidebar's lists. Don't bring them back. Brief 40's items 4–6 shipped (76ec334); the registry lookup it added is the
   one to extend.

## Part A: brief 40's items 1 to 3, as written there
1. **A box for every sidebar page.** Every item in the sidebar menu (`components/sidebar/SideBarMenu.tsx`: Chat, Docs,
   Factory, Schema, Glossary, Data dictionary, Graph, Pipeline, Search, and the five dataset pages under Datasets; the
   Charts pages and Data tables are boxes already) gets its own box on the content plate, the same shape as the chart
   boxes: the page's name, a one-line description in the muted ink (plain language: what the page is for), the page's
   sidebar icon in the foot where the number was, and the pane button. Clicking opens the page. One list with the
   charts and tables so A to Z, pins, hides and drag order treat them alike (`lib/viz-charts.ts` has `PLATE_TABLES`;
   add `PLATE_PAGES` beside it or fold both into one plate registry; `lib/plate.ts` is the registry brief 40 item 4 added).
2. **Icons in place of numbers.** Remove the number from every box's foot. In its place: for a chart box, the lucide
   icon closest to its chart type (line `ChartLine`, bar `ChartBar`, scatter `ChartScatter`, heatmap `Grid3x3`, 3D scatter
   or surface `Box`, punch card `CircleDot`, stick spectrum `BarChart3`, network `Waypoints`, radar `Radar`, area
   `ChartArea`, nuclide chart `Grid2x2`, table `Table`; one map in one place); for a page box, the icon the sidebar gives
   that page (the same animate-ui icon). Muted at rest.
3. **Drag to reorder.** Every box drags to a new place, forward, backward, up or down, the way the Blocks panel's blocks
   drag (reuse `lib/shelf-drag.ts` or wherever its reorder lives; no new dependency). The order is remembered in the
   browser (extend `lib/nav-rows.ts` with an order list or a sibling store), survives reload, and composes with the
   marks: pinned ahead of unpinned, hidden and archived out, the dragged order holding within each group. Dragging shows
   the Blocks panel's drop cue.

## Part B: element symbols on the chart of nuclides (brief 37 item 4, second attempt)
`app/(site)/viz/chart/chart.tsx`: when a cell is about 28 px across or more, each cell shows its element symbol centred
(Gd, Eu, Sm…) in the ink that reads on its fill; from about 48 px the mass number above the symbol; below 28 px no labels.
The first attempt (ac72542, backed out in 36aeea0) returned a `group` of rect plus text from `renderItem`; on the box,
once the labels drew, every cell vanished with no console error, though the same renderItem works in a bare ECharts page.
Test this cause first: the series has 3,386 cells, above ECharts' default `progressiveThreshold` of 3,000, so the custom
series renders progressively, and progressive rendering of a custom series that returns groups is where elements go
missing. Set `progressive: 0` on the custom series (or `progressiveThreshold` above the cell count) and re-apply
ac72542's renderItem (`git show ac72542 -- "app/(site)/viz/chart/chart.tsx"`), limiting labels to the cells inside the
plot as it did. If cells still vanish with progressive off, try `type: 'text'` elements as a second custom series over
the rects (same data, `z` higher, `silent: true`) instead of groups. Check in both themes, every colour mode, at three
zoom levels, before pushing; the chart must stay smooth when zoomed out.

## Done means
Part A: the boxes, icons and drag live on the box, order surviving reload, both themes. Part B: symbols and mass numbers
appear at zoom and nothing vanishes, both themes. CI green. Two one-line reports to `lead-agent`.

## Kickoff
`Read ~/Code/nsrgpt/docs/briefs/46-plate-pages-icons-drag-and-chart-symbols.md and do it; report to lead-agent after each part.`
