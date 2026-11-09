# 37 — The plate's Hidden section, pin marks, no source text; symbols on the chart of nuclides (2026-11-09, 02:15 ET)

Written by lead-agent for ui-layer-2. Report to `lead-agent` only; no questions; one report at the end. Work in
`~/Code/nsrgpt` on main, pull before each commit, commit with explicit paths, push each commit; CI type-checks every push.
The box (http://13.184.13.46:3000, pulls main every 20 s) is where Brendan reviews. ui-layer-3 is in
`components/AppLayout.tsx` and the graph's search (brief 36 parts 5 and 6); don't touch those. Standing rules: plain
language, paper palette, lucide icons, reuse before writing.

## 1. A Hidden section on the plate
`app/(site)/(plate)/page.tsx` and `viz/plate-arrange.tsx`: the plate now drops hidden and archived boxes, with no way
back from the plate. Add a **Hidden** box as the very last box of the plate (same shape as the others, the title
"Hidden", the count of hidden and archived boxes as its figure, an eye-off icon). Clicking it scrolls the plate to one
more section after the last page (the PlateGrid is a horizontal snap scroller; add a trailing page) that lists the
hidden and archived boxes, each drawn as its normal box plus an eye-off icon in the foot; clicking the eye unhides or
unarchives it (`patch(href, { hidden: false, archived: false })`) and the box returns to its place. With nothing
hidden the Hidden box still shows, with the figure 0, and the trailing section says "Nothing hidden."

## 2. No source text after the number
Every box's foot reads "02 • ENSDF" today. Remove the source after the number; the number stays. The source is still in
the box's menu foot and on hover of the title if that exists; otherwise drop it altogether. Apply to all boxes.

## 3. The pin mark
When a box is pinned, a lucide `Pin` icon sits in the foot just before the pane button in the lower right, in the
muted ink, with a tooltip "Pinned". Unpinned boxes show nothing there.

## 4. Element symbols on the chart of nuclides
`app/(site)/viz/chart/chart.tsx`: when the reader zooms in far enough that a cell is at least about 28 px across, each
cell shows its element symbol centred in the cell (Gd, Eu, Sm…), in the ink that reads on the cell's fill, as the old
app's chart does and as `/viz/structure`'s ported ChartOfNuclides does ("labels as cells grow"); larger still, the mass
number above the symbol. Below the threshold no labels. Use ECharts' label on the custom series with a zoom-dependent
`show`, or draw them in the custom renderItem; whichever keeps the chart smooth at 3,386 cells.

## Done means
Each item checked on the box in both themes; CI green; one report with commits and anything seen and not fixed.
