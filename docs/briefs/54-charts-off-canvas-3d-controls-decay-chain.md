# 54 — Every chart's panel and legend off the canvas; the 3D charts' picked point and keyboard pan; "Decay chain" (2026-11-10)

You're `window-2-ui-layer`. Written by `lead-agent` (Fable); Brendan asked at 03:20 ET and reviews on production and the
dev box (http://3.133.98.108:3000, pulls main every 20 s; it stops itself about 07:10 ET, `scripts/devbox/launch.sh start
i-0ec4775a5cd68d41b` restarts it). Report to `lead-agent` by SendMessage, one line per part as it is pushed. Efficiency
Voice (`docs/sketches/2026-11-06-efficiency-voice.html`). No questions; decide and record.

## Rules
1. `~/Code/nsrgpt` on main, shared: `git pull --rebase --autostash origin main`, commit in one step with explicit paths, push
   right after. Type-check on the dev box through SSM before each push (no `tsc` on the Mac). CI runs Typecheck and Deploy.
2. The house pattern for a chart's controls and legend is `VizControls` + `EChartLegend` (`components/viz/VizControls.tsx`,
   `components/viz/EChartLegend.tsx`): a portal into the right panel's Viz, the chart layer (`components/SwitchboardPanel.tsx`,
   `openVizControls`), reached by the right rail tab. Nothing a reader operates sits over a chart. Reuse before writing;
   paper palette; plain language; no captions that restate the layout.
3. Both themes, checked on the box, for every chart you touch.

## Part A: /viz/chart, the chart of nuclides (the most important chart)
1. The "Colour by" pills (`app/(site)/viz/chart/chart.tsx` line 146) and the mode's legend (the dots row at the right of
   the same bar) move into the right panel through `VizControls`, as `VizSection`s: Colour by, then the legend. The bar
   over the chart goes; the chart takes its height.
2. The nuclide card (the `<aside>` at line 230, 157Dy in the screenshot) moves into the same panel: a click on a cell
   opens the panel on the Viz, the chart layer (`openVizControls()`) with the card at the top, the Colour by and legend
   sections beneath it. The card's close returns to the sections. The chart takes the aside's width.
3. Nothing else changes on the chart: the symbols at zoom, the click, the magic-number rules, the marks.

## Part B: legends and panels off every canvas
1. `app/(site)/viz/decay/scene.tsx` (line 638, the legend that isolates a family) and `app/(site)/viz/graph/graph3d.tsx`
   (line 76, the legend that hides decay modes): the same rows, in `VizControls`, driving the same state.
2. Sweep every `app/(site)/viz/*/chart.tsx` and `*/scene.tsx`: any legend, pills, picker or panel rendered over or beside
   the canvas moves into `VizControls`. The heatmap's legend and the force graph's are there already; the radiation,
   reactions, weight and rainfall charts show the pattern. List in the report every chart you moved something from.
3. The camera keys' hint strip over the 3D charts (`components/viz/FramedBox.tsx` line 85, `CAMERA_KEY_LIST`) goes; Part C
   replaces it in the panel.

## Part C: the 3D charts, GL (echarts-gl: decay2, explorer, fission-yields, scatter3d, scatter3d-dataset, surface) and three.js (decay, graph3d, levels, knowledge, particles)
1. **The picked point reads 4× (Brendan's "like the first chart").** On a scatter3D series, the hovered datum and the
   datum a table row points at (`firstSeriesRow`, `onPick`) draw at four times the series' `symbolSize`, opaque, outlined
   in ink, through a one-point mark series (`id: "mark"`, `type: "scatter3D"`, updated with `setOption` on hover and pick;
   the main series untouched so echarts-gl doesn't rebuild 50,000 points). Put it in `components/viz/use-echart.ts` beside
   the 2D marks (`makeMarks`, brief 06) so every GL scatter gets it with `marks: true`. For the three.js scenes, the same
   rule on their picked node where they have one (decay's selected nuclide, graph3d's node, levels' level).
2. **Pan.** `wireGL` in `use-echart.ts` (line 289) drives echarts-gl's camera: orbit, tilt and zoom work; pan does not,
   though the strip advertises "Shift + arrows pan". Make it work: Shift + arrows and Option + arrows both pan, the camera
   and its target sliding together along the screen's right and up, through the control's centre (echarts-gl's OrbitControl
   keeps a `center`; use its setter if it has one, else `setOption({ grid3D: { viewControl: { center } } })` with the
   screen vectors from alpha and beta), smooth while held, as `SpinControls` (`lib/viz-3d-controls.tsx`) already pans the
   three.js scenes. Check the three.js pan still works and add Option there too.
3. **A real keyboard control component.** `components/viz/CameraKeys.tsx`, mounted through `VizControls` on every 3D chart:
   a `VizSection` "Camera" of key caps in rows: Orbit ← →, Tilt ↑ ↓, Zoom + − (Cmd ↑ ↓), Pan Shift/Option + arrows,
   Rotation Space, Reset 0, Leave Esc. Each cap is a button that performs its action on click (hold to move) through one
   command bus (`lib/viz-engage.ts`: add `cameraCommand(name)` and a subscriber; `wireGL` and `SpinControls` listen), so
   the panel works without the keyboard and the keys keep working with it. The strip's wording is the reference for the
   labels. Mono type, the paper palette, caps the size of the chip buttons.

## Part D: "Decay chain" for "Decay family", across the app
Every label a reader sees that says "Decay family" or "decay family" reads "Decay chain" / "decay chain": the chart's
Colour by pill (`app/(site)/viz/chart/colour.ts`), the chart list (`lib/viz-charts.ts`), the graph's labels
(`components/nsr/graph/GraphPage.tsx`), the reactions chart, `lib/viz-physics.ts`'s label strings, the docs and glossary
where they name it. Identifiers in code (`familyOf`, `FAMILY`) stay. Grep both cases and report the count.

## Done means
Each part pushed and type-checked, checked on the box in both themes; a final report listing the charts touched in Part B,
the 3D charts with the 4× mark and pan, and the rename count.

## Kickoff
`Read ~/Code/nsrgpt/docs/briefs/54-charts-off-canvas-3d-controls-decay-chain.md and do it; report to lead-agent after each part.`
