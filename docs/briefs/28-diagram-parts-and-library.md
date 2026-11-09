# 28 — The diagram library: parts, specs, renderers, and the reference figures rebuilt (2026-11-08)

Written by lead-agent for parsing-2. Brendan approved the plan at 19:50 ET and expects the whole thing finished when he is
back in an hour; no questions, no check-ins, one report at the end. Report to `lead-agent` only. Work in `~/Code/nsrgpt`
on main: pull before each commit, commit often, push each commit (CI runs the type check on every push; fix red at once).
The rollback point is tag `before-diagram-library`. The dev box http://3.145.136.19:3000 pulls main every 20 s and stops
itself at 22:06 ET; the type check runs there through SSM (brief 22's hook allows it) or you read CI.

Peers working beside you on main: ui-layer (brief 27: the rail taxonomy and the Config panel that edits your
`DiagramConfig`), parsing-1 (brief 29: the data files your specs read). Don't touch their files: `components/nsr/graph/
FlowSettings.tsx`, `RightInsetPanel.tsx`, `LeftInsetPanel.tsx`, `InsetPanel.tsx`, `components/sidebar/*`, `scripts/*`,
`lib/viz-charts.ts`, `lib/viz-tables.ts`. You own `lib/diagram/**`, `components/nsr/graph/diagram/**`, and the parts of
`components/nsr/graph/GraphPage.tsx` named below.

## The idea
Every recurring nuclear diagram is a combination of a few parts: a disc or a square or a card for a nuclide, an arrow of a
kind (α, β−, β+, EC, IT, capture, fission, γ), a label, a band, a legend, an axis. A diagram type is a spec: which grid,
which shape, which arrows, bands or not, legend or not. The reference figures Brendan gave (Wikipedia's decay series, the
s-process charts, the U-238 to Cm-244 transmutation flow, the Co-60 and Au-198 decay schemes) are rebuilt faithfully from
those parts and from real data. Today's hand-drawn `DEMOS`, `FIGURES` and `CHAINS` in GraphPage.tsx become specs.

## 1. The contract: `lib/diagram/spec.ts` (write this first; ui-layer codes against it)
```ts
export type DiagramKind = "decay-chain" | "reaction-network" | "activation-burnup" | "production-route" | "fission-fan" | "level-scheme"
export type NodeShape = "disc" | "square" | "rect"
export type GridKind = "element-rows" | "nz" | "free" | "ladder"
export type EdgeKind = "alpha" | "beta-" | "beta+" | "ec" | "it" | "capture" | "fission" | "gamma" | "sf"
export type LabelField = "A" | "Z" | "symbol" | "halflife" | "jpi" | "energy" | "percent"
export interface DiagramConfig { kind: DiagramKind; subtype: string; shape: NodeShape; grid: GridKind; bands: boolean; legend: boolean; labels: LabelField[]; edges: EdgeKind[] }
export interface DiagramNode { id: string; z: number; a: number; symbol: string; n?: number; halfLife?: { value: number; unit: string } | "stable"; family?: string; cls?: string; energyKeV?: number; jpi?: string; pos?: { x: number; y: number }; faint?: boolean }
export interface DiagramEdge { s: string; t: string; kind: EdgeKind; pct?: number; label?: string; curve?: boolean }
export interface DiagramSpec { id: string; title: string; kind: DiagramKind; subtype: string; source: string; defaults: DiagramConfig; nodes: DiagramNode[]; edges: DiagramEdge[]; legend?: { label: string; color: string }[]; bands?: { label: string; key: number }[] }
```
`DiagramKind` to section name: decay-chain "Decay chains"; reaction-network "Reaction networks"; activation-burnup
"Activation and burnup"; production-route "Production routes"; fission-fan "Fission fan / yield curve"; level-scheme "Level
schemes". Subtypes (strings, shown as the Type row): decay-chain: thorium-series, neptunium-series, uranium-series,
actinium-series, single-chain; reaction-network: s-process, r-process, rp-process, capture-chain; activation-burnup:
transmutation-flow, breeding-chain; production-route: medical-isotope; fission-fan: fan; level-scheme: decay-scheme, ladder.
Export `KIND_LABEL`, `SUBTYPE_LABEL` and `DEFAULTS_BY_KIND` from the same file. Keep the file free of React.

## 2. Parts: `components/nsr/graph/diagram/`
- `DiscNode`: the Wikipedia decay-series disc. A and Z stacked at the left (A above Z, small), the symbol large and
  bold, the half-life value on one line and its unit beneath ("1.41e+10 / Years", "3.6 / Days", "Stable"). Fill from the
  element family (`lib/nuclide.ts` FAMILY colours, as the chart of nuclides uses), dark text, a thin border. Eight handles
  as EntityNode has. Diameter about 100 at zoom 1.
- `SquareNode`: the s-process chart cell. A square with the mass number in the top-left corner in the accent colour,
  solid yellow when the nuclide is on the path, pale when it isn't (`faint`), black border on the path, grey off it.
  Side about 64.
- `RectNode`: EntityNode's card, reused, not rewritten (import it).
- `LabelNode`: free text (the element names at a band's right, "In", "Cd", axis titles "N", "Z").
- `BandLayer`: alternating full-width stripes behind the nodes, one per element row, with the element name at the right
  edge, exactly as the series figures draw them. Rendered as a React Flow node layer behind everything (zIndex −1,
  not selectable, not draggable) sized from the layout.
- `LegendBox`: a bordered box of swatch and label rows, placed bottom-left by default; content from the spec.
- `AxisArrows`: the N and Z arrows with their letters for the `nz` grid.
- `DiagramEdge`: one edge type for all kinds. Colour and head by kind: α magenta, β− green up-right, β+ and EC green,
  IT grey, capture blue with the solid dot head (the s-process figure's red line with a dot: use the figure's red for
  capture on `nz` grids and blue on `free` grids, from a per-spec palette), fission red, γ black. Label the Greek letter
  and the percent when the spec gives one, in a small pill. Straight by default, `curve` bends it.

## 3. Layout: `lib/diagram/layout.ts`
`place(spec, config): Map<id, {x, y}>` for each grid:
- `element-rows`: rows by Z descending top to bottom (one row per element present, including empty elements between, as
  the series figures keep Francium and Astatine rows), columns by A descending left to right; a β− arrow therefore
  points up-right, α straight down. Row height 150, column width 300. Bands come from the rows.
- `nz`: N across (right), Z up; cell 80. The s-process figures.
- `free`: the spec's own `pos`, scaled; the transmutation figure.
- `ladder`: parent at the left, daughter levels as horizontal lines on the right at y proportional to energy, the
  ground state at the bottom; γ arrows straight down between levels, β and EC arrows from the parent to the fed levels.
`toFlow(spec, config)` turns a spec plus config into React Flow nodes and edges using the parts and the layout. The shape
in `config` wins over the spec's default so Brendan's picker works; labels and edge kinds filter what shows.

## 4. The library: `lib/diagram/library/`
One file per spec, exported together from `index.ts` as `LIBRARY: DiagramSpec[]`, each with `source` (the figure's URL):
1. The four series (thorium, neptunium, uranium, actinium) as `element-rows` discs with bands and the family legend, from
   `decay.json` (ENSDF decay modes, `lib/viz-physics.ts` `seriesFrom`) and half-lives from `livechart-ground.json`; the
   Pu-241 single chain the same way.
2. s-process Ag to Sb and mass 201 to 210 (s and r) as `nz` squares with capture and β− arrows and the legend box, from
   parsing-1's `diagram/s-process-ag-sb.json` and `diagram/mass-201-210.json` (brief 29; until they land, build from
   `livechart-ground.json`'s stable flags with the s-process rule: capture while stable, β− when not).
3. rp-process: a representative path from `diagram/rp-process.json`.
4. U-238 to Cm-244 transmutation flow (Sasahara) as `free` cards with the figure's colours (fissile dark red, fertile blue,
   less fertile grey, short-lived light grey; capture blue, α magenta, β and EC green), numbers from
   `diagram/transmutation-u238-cm244.json`; the existing hand-typed figure's positions are the starting layout.
5. Breeding chains (U-238 to Pu-239, Th-232 to U-233) as a small `free` spec.
6. Production routes: Mo-99/Tc-99m and Lu-177 from the existing demos, as `free` specs.
7. The U-235 fission fan from the existing demo.
8. Level schemes: Co-60, Au-198, Po-210 as `ladder` from `diagram/level-schemes/*.json` (brief 29); until they land, from
   the existing Co-60 and Cs-137 demos.
Data files load through `lib/use-data.ts` (`fetchData`/`useData`), never fetch directly.

## 5. GraphPage integration
- `loadDiagram(spec)` replaces `loadChain` and `loadDemo`: it keeps a `diagram` state `{ spec, config }`, calls `toFlow`,
  and loads the result with `loadGraph(..., positions)`. Expose `diagram` and `setDiagramConfig` to the right panel through
  the existing props path so ui-layer's Config section can edit `config` and the canvas redraws (`useEffect` on config).
- The catalog's sections list `LIBRARY` grouped by kind, each row a SideBarMenuItem as now, href `/graph?diagram=<id>`;
  `?diagram=` on load opens it. Remove `CHAINS`, `DEMOS`, `FIGURES`, `gridPositions` and the sample helpers once every
  one of them has a spec; nothing hand-drawn remains.
- Clicking a disc or square selects the nuclide as today (Papers view).

## Done means
1. `spec.ts` committed first (within the first 20 minutes) so ui-layer can build Config against it.
2. Every reference figure in the library, drawn from parts and data, in both themes; the series look like the Wikipedia
   figures (discs, bands, element names, α down, β− up-right); the s-process charts look like theirs (squares, mass numbers,
   red capture with dot, blue dashed β−, axes, legend).
3. Shape, labels, edges, bands and legend respond to `DiagramConfig` live.
4. Nothing hand-drawn left in GraphPage.tsx; type check green on CI; one report with commits and what you checked.
