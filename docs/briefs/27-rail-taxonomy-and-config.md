# 27 — /graph: the six diagram sections with Type rows, and the Config panel's Diagram section (2026-11-08)

Written by lead-agent for ui-layer. Brendan approved the plan at 19:50 ET and expects everything finished when he is back
in an hour; no questions, no check-ins, one report at the end. Report to `lead-agent` only. Work in `~/Code/nsrgpt` on
main: pull before each commit, push each commit, CI type-checks every push (fix red at once). Rollback tag:
`before-diagram-library`. The dev box pulls main every 20 s until 22:06 ET.

Peers on main: parsing-2 (brief 28) owns `lib/diagram/**`, `components/nsr/graph/diagram/**` and GraphPage's diagram
loading; parsing-1 (brief 29) owns data. You own `components/nsr/graph/FlowSettings.tsx`, `RightInsetPanel.tsx`,
`LeftInsetPanel.tsx`, `InsetPanel.tsx`, the catalog's section markup in `GraphPage.tsx` (CatalogRail), and
`components/sidebar/*`. parsing-2 writes `lib/diagram/spec.ts` first (within 20 minutes); read it and code against it.
If it isn't there when you need it, use the types exactly as written in brief 28 section 1 and reconcile when it lands.

## 1. The rail: six sections, each with a Type row
The left rail's diagram sections are the six kinds, in this order and with these names: Decay chains, Reaction networks,
Activation and burnup, Production routes, Fission fan / yield curve, Level schemes. Each section is a collapsible
SideBarSection as now. Directly under each header, a **Type** row: the sub-type picker for that kind (a SideBarMenuItem
row whose trailing control is a small select of the kind's subtypes from `spec.ts` `SUBTYPE_LABEL`; choosing one filters
the rows beneath to specs of that subtype; "All" shows every spec of the kind). Beneath it, the kind's specs from
`LIBRARY` (brief 28) as SideBarMenuItem rows. Until `LIBRARY` exists, list today's samples moved to their right sections:
"U-238 to Cm-244" and the breeding chains under Activation and burnup; "s-process, Ag to Sb", "Mass 201 to 210" and
rp-process under Reaction networks; Mo-99 and Lu-177 under Production routes; the U-235 fan under Fission fan / yield
curve; Co-60 and Cs-137 under Level schemes. Corpus, Workspace and Datasets stay above them unchanged.

## 2. Config: the Diagram section
The right panel's Config view (FlowSettings) gains a **Diagram** section at the top, above Layouting algorithms, editing
the loaded diagram's `DiagramConfig` (GraphPage exposes `diagram` and `setDiagramConfig`; agree the prop names with
parsing-2 through lead-agent only if the brief's names don't work: `diagram: { spec, config } | null`,
`setDiagramConfig(patch: Partial<DiagramConfig>)`). Rows, in the panel's row style, each with its current value on the right:
- Diagram: the kind (read-only label) and the Type (select of subtypes);
- Shape: Circle / Square / Rectangle (`disc` / `square` / `rect`);
- Grid: Element rows / N by Z / Free / Ladder;
- Bands: on or off; Legend: on or off;
- Labels: a checklist of A, Z, symbol, half-life, Jπ, energy, percent;
- Arrows: a checklist of α, β−, β+, EC, IT, capture, fission, γ, SF.
With no diagram loaded the section shows one muted line, "Load a diagram from the rail." Every change calls
`setDiagramConfig` and the canvas redraws (parsing-2's effect). Rename nothing else; the panel is already "Config".

## 3. Keep
Everything the rail and panels do today. Plain language, paper tokens, the sidebar's row and icon treatment, no new
dependencies.

## Done means
Sections and Type rows live; the Diagram section edits a loaded diagram live (test with parsing-2's first spec, the
thorium series); type check green on CI; one report with commits and what you checked in both themes.
