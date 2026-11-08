# 24 — /graph: LeftInsetPanel and RightInsetPanel, unified; closed on load; fit on load (2026-11-08)

Written by lead-agent for ui-layer. Brendan's requests at 17:25 ET. Report to `lead-agent` only. Work in `~/Code/nsrgpt` on
main (pull first); push each commit; the box http://3.145.136.19:3000/graph is where Brendan looks. Type check on the box
through SSM. Files: `components/nsr/graph/GraphPage.tsx` (CatalogRail, RightRail, the ideas list `IDEAS`, the canvas
settings panel), `components/rail-toggle.tsx` (`RailToggle`, `useRailClosed`, `<html data-rail-left|right>`),
`components/shell.tsx` (the gripper), `app/globals.css`.

## On load
1. Both inset panels closed.
2. The canvas fitted, the way the fit-view button fits it (your brief 23 fix for /pipeline is the model; check whether
   /graph's own fitView calls have the same measured-nodes problem).

## The two components
Name them `LeftInsetPanel` and `RightInsetPanel`, in their own files under `components/nsr/graph/`, built on one shared
`InsetPanel` so they can't drift. Rules, in Brendan's words where he gave them:
1. **Typography and spacing from the left.** The left panel's font families, weights, sizes, spacing and its hover state
   are the standard. The right panel's three contents take them.
2. **The gripper from the right.** The right panel's draggable grip and its behaviour (the shell's gripper, min 280, max 720,
   width remembered in localStorage, 500 ms open and close) go to both panels.
3. **The default width from the left.** The left panel's current default width (284 px) is the starting width of every
   panel. The right's stored `graph:right-w` resets to it.
4. **The tooltip from the right.** The canvas settings panel's tooltip exists on the right; the left panel gets the same
   tooltip component and style. The tooltip is cut off today: render it through a portal above the canvas (the app's
   tooltip primitive, `components/ui/nova/tooltip`, if it portals; otherwise fix the clipping at its cause, the
   panel's overflow or the canvas's stacking) so no edge clips it on either side.
5. **A menu layer on the right.** The right panel holds three panels: the paper(s) (the selected record or edge receipt),
   the Config/controls panel (the `<ReactFlow />` props), and the ranked ideas list. Give the right panel a menu layer that
   switches among the three, in the left panel's rail-tab style, so one open panel shows one of the three at a time with
   the other two one click away. Selecting a node or edge switches to the paper(s); nothing selected shows what was last
   chosen (Graph Features on first load).
6. **Rename "Ideas ranked" to "Graph Features."** The list itself stays as it is.
7. **Bottom margin.** The right panel's ideas content has a touch more bottom margin than the left panel. Standardise: give
   the left a little more so both match, one value in the shared component.

## Keep
Everything the panels do today: the catalog's sections and loaders on the left; the receipts, the settings rows, the ideas
and their two PDF links on the right; the rail tabs on both sides (`RailToggle`); the `<html data-rail-*>` state.

## Rules
Plain language; paper palette; no new dependencies; one report with commits, what you measured (widths, margins) and
anything seen and not fixed. Brendan will review it himself on the box.

## Kickoff
`Read ~/Code/nsrgpt/docs/briefs/24-graph-inset-panels.md and start; report to lead-agent when done.`
