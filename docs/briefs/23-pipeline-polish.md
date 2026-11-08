# 23 — /pipeline: fit on load, a collapsible lake, A–Z contents, the sidebar's icons (2026-11-08)

Written by lead-agent for ui-layer. Brendan's requests at 17:05–17:14 ET, from his screenshots. Report to `lead-agent` only.
Work in `~/Code/nsrgpt` on main (pull first; the lead commits there too). Push each commit; the box
(http://3.145.136.19:3000, pulls main every 20 s) is where Brendan watches. Files: `components/pipeline/PipelineCanvas.tsx`,
`lib/pipeline-map.ts`, the sidebar's `components/sidebar/SideBarMenu.tsx` and `SideBarMenuItem.tsx`, `components/animate-ui/icons/*`.

## 1. Fit on load, exactly like the fit-view button
On load the diagram sits top-left at zoom 1 with the right column near the edge. Pressing the controls' fit button gives the
right result: the whole diagram centred, zoomed to fit. Make the load match the button: same options the button uses (React
Flow's default `fitView()`), run once every node is measured and the pane has its final size (the page reveal in
`app/(site)/template.tsx` is still resizing it at 60 ms; the 450 ms pass isn't matching the button's result either). Find why
the on-load fit differs (container size at the time, the right column not yet measured, `maxZoom: 1` capping it, or the
options) and fix it at the cause. Then the `Fit` child in PipelineCanvas.tsx does the one job.

## 2. The NSR Lake card collapses like the others
A chevron on its header. Collapsed, the card shows the header and the five core dataset cards only (no Detail section, no
"Core Datasets" title, no Shared key), as in Brendan's screenshot. Expanded, it shows everything it shows today. On load:
expanded. The in and out connectors stay on the header in both states, and the lake's height change re-measures its node
(`useUpdateNodeInternals`) the way the other cards do.

## 3. Everything inside a card sorted A–Z
The order of the cards in each column stays. Inside a card, every list sorts A–Z by its label, and every list inside those
sorts A–Z too:
- source cards: the folds (Codes, Datasets, Formats, Frameworks) and the items inside each fold;
- the lake: the Detail rows (Files, Records, Size), the core dataset cards (ENDF/B, ENSDF, EXFOR, NSR, XUNDL) and, inside
  each, the Inside rows and the Joins rows;
- surface cards: their rows.
Sort at render time with one helper (`localeCompare`, numeric, base sensitivity) so the data file's order stops mattering.

## 4. The sidebar's icons on the cards
The lake header carries a database icon from lucide. Replace it with the sidebar's own Database icon, and give Chat, Search,
Graph and Charts the icon the sidebar gives them (`SideBarMenu.tsx`: MessagesSquare, Radar, Blocks, Activity, from
`components/animate-ui/icons/`). Match `SideBarMenuItem.tsx` exactly: the same component, size, two-tone colour classes, and
the same hover animation, triggered by hovering the card's header (the parent), not the icon itself, exactly as a sidebar row
animates when the row is hovered. Read how `SideBarMenuItem` wires the hover (the group class or the icon's `animateOnHover`
and `AnimateIcon` wrapper in `components/animate-ui/icons/icon.tsx`) and reuse it rather than re-implementing.

## Rules
Plain language; paper palette only; no new dependencies; nothing else on the page changes. Type check on the box through SSM
(your hook now allows it). One report with the commits and anything you saw that you didn't fix.

## Kickoff
`Read ~/Code/nsrgpt/docs/briefs/23-pipeline-polish.md and start; report to lead-agent when done.`
