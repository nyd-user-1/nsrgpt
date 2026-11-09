// Layout (brief 28): place(spec, config) puts each nuclide on its grid; toFlow(spec, config) turns a spec into React Flow
// nodes and edges drawn by the parts in components/nsr/graph/diagram/. The config's shape wins over the spec's default, so
// the Config panel's picker redraws the same figure as discs, squares or cards; labels and arrow kinds filter what shows.
// No React here: node `type` names the part ("disc", "square", "entity", "level", "band", "legend", "axis", "label").
import type { Edge, Node } from "@xyflow/react"
import { elementName } from "./elements"
import { EDGE_LABEL, type DiagramConfig, type DiagramNode, type DiagramSpec, type EdgeKind, type GridKind } from "./spec"

type XY = { x: number; y: number }

/** element-rows: one row per element, Z descending top to bottom, empty elements kept. Columns by neutron excess (N−Z)
 *  descending left to right, two units a column: α (N−Z unchanged) then falls straight down two rows and β− (N−Z less 2)
 *  steps one row up and one column right, as Wikipedia's decay-series figures draw them. */
export const ROW_H = 150, COL_W = 260
/** nz: N across, Z up, the s-process figures' chart. */
export const CELL = 80
/** free: a spec's own positions, in these units. */
export const FREE_X = 230, FREE_Y = 170
/** ladder: the daughter's levels between these, highest at the top. */
export const LADDER_TOP = 40, LADDER_H = 420, LADDER_X = 300, LEVEL_W = 520
/** A ladder's left edge and width: rungs start near the left when there is no parent, and widen with the γ lines. */
export function ladderGeometry(spec: DiagramSpec, edges: EdgeKind[] = ["gamma"]): { x: number; w: number } {
  const parent = spec.nodes.some((n) => n.energyKeV === undefined)
  const gammas = edges.includes("gamma") ? spec.edges.filter((e) => e.kind === "gamma").length : 0
  return { x: parent ? LADDER_X : 60, w: Math.max(LEVEL_W, 180 + gammas * 48) }
}

const nOf = (x: DiagramNode) => x.n ?? x.a - x.z

/** Centres of every node on the grid. */
export function place(spec: DiagramSpec, config: Pick<DiagramConfig, "grid">): Map<string, XY> {
  const pos = new Map<string, XY>()
  const grid = effectiveGrid(spec, config.grid)
  const nodes = spec.nodes
  if (grid === "ladder") {
    const ladder = ladderGeometry(spec)
    const levels = nodes.filter((x) => x.energyKeV !== undefined)
    const maxE = Math.max(1, ...levels.map((x) => x.energyKeV as number))
    nodes.forEach((x, i) => {
      if (x.energyKeV === undefined) pos.set(x.id, { x: 60, y: LADDER_TOP + i * 120 })
      else pos.set(x.id, { x: ladder.x + ladder.w / 2, y: LADDER_TOP + 60 + (1 - x.energyKeV / maxE) * LADDER_H })
    })
    return pos
  }
  if (grid === "free") {
    nodes.forEach((x, i) => pos.set(x.id, x.pos ? { x: x.pos.x * FREE_X, y: x.pos.y * FREE_Y } : { x: (i % 5) * FREE_X, y: Math.floor(i / 5) * FREE_Y }))
    return pos
  }
  const zMax = Math.max(...nodes.map((x) => x.z))
  if (grid === "nz") {
    const nMin = Math.min(...nodes.map(nOf))
    for (const x of nodes) pos.set(x.id, { x: (nOf(x) - nMin) * CELL, y: (zMax - x.z) * CELL })
    return pos
  }
  const exMax = Math.max(...nodes.map((x) => nOf(x) - x.z))
  for (const x of nodes) pos.set(x.id, { x: ((exMax - (nOf(x) - x.z)) / 2) * COL_W, y: (zMax - x.z) * ROW_H })
  return pos
}

/** A grid the spec can be drawn on: free needs positions, ladder needs levels; else the element rows. */
export function effectiveGrid(spec: DiagramSpec, grid: GridKind): GridKind {
  if (grid === "free" && !spec.nodes.some((x) => x.pos)) return "element-rows"
  if (grid === "ladder" && !spec.nodes.some((x) => x.energyKeV !== undefined)) return "element-rows"
  return grid
}

export const SIZE: Record<"disc" | "square" | "entity" | "glyph", { w: number; h: number }> = {
  disc: { w: 100, h: 100 }, square: { w: 64, h: 64 }, entity: { w: 130, h: 74 }, glyph: { w: 130, h: 56 },
}

/** "242mAm" for the isomer id "242AMM", else "238U". */
export function nuclideLabel(x: DiagramNode): string {
  const isomer = x.id === `${x.a}${x.symbol.toUpperCase()}M`
  return `${x.a}${isomer ? "m" : ""}${x.symbol}`
}

/** A nuclide's record for the canvas store (GraphPage's GNode shape): clicking it opens its papers. */
export function gnodeOf(x: DiagramNode) {
  const label = nuclideLabel(x)
  const hl = x.halfLife === "stable" ? "stable" : x.halfLife ? `${Number(x.halfLife.value.toPrecision(3))} ${x.halfLife.unit.toLowerCase()}` : ""
  return { type: "nuclide" as const, id: x.id, label, sub: `Z=${x.z} N=${nOf(x)}${hl ? ` · ${hl}` : ""}`, z: x.z, n: nOf(x), family: x.family }
}

export interface FlowOut {
  nodes: Node[]
  edges: Edge[]
  /** The nuclides on the canvas, by node id, in GraphPage's GNode shape. */
  gnodes: Map<string, ReturnType<typeof gnodeOf> & Record<string, unknown>>
}

const fmtPct = (p: number) => (p >= 10 ? `${Number(p.toFixed(1))}` : p >= 1 ? `${Number(p.toFixed(2))}` : `${Number(p.toPrecision(2))}`)

/** The arrow's pill text: the spec's own label, else the kind's letter; the percent when labels include it. */
export function edgeText(kind: EdgeKind, pct: number | undefined, label: string | undefined, labels: DiagramConfig["labels"]): string {
  const pctOn = labels.includes("percent") && pct !== undefined
  if (label) return pctOn && !label.includes("%") ? `${label} · ${fmtPct(pct as number)}%` : label
  return `${EDGE_LABEL[kind]}${pctOn ? ` ${fmtPct(pct as number)}%` : ""}`
}

export function toFlow(spec: DiagramSpec, config: DiagramConfig): FlowOut {
  const grid = effectiveGrid(spec, config.grid)
  const centres = place(spec, { grid })
  const nodes: Node[] = []
  const gnodes: FlowOut["gnodes"] = new Map()
  const boxes = new Map<string, { x: number; y: number; w: number; h: number }>()
  const palette = grid === "nz" ? "chart" : "figure"
  const ladder = ladderGeometry(spec, config.edges)

  for (const x of spec.nodes) {
    const c = centres.get(x.id) ?? { x: 0, y: 0 }
    const g = gnodeOf(x)
    if (grid === "ladder" && x.energyKeV !== undefined) {
      const id = `diagram:level:${x.id}`
      nodes.push({ id, type: "level", position: { x: ladder.x, y: c.y - 14 }, width: ladder.w, height: 28, draggable: false, selectable: false,
        data: { node: x, labels: config.labels } })
      boxes.set(x.id, { x: ladder.x, y: c.y, w: ladder.w, h: 0 })
      continue
    }
    const id = `nuclide:${x.id}`
    gnodes.set(id, g)
    const glyph = config.shape === "rect" && x.cls !== undefined
    const type = config.shape === "rect" ? "entity" : config.shape
    const size = glyph ? SIZE.glyph : SIZE[type as "disc" | "square" | "entity"]
    const position = { x: c.x - size.w / 2, y: c.y - size.h / 2 }
    boxes.set(x.id, { x: position.x, y: position.y, w: size.w, h: size.h })
    const data = type === "entity"
      ? { ...g, ...(glyph ? { style: "glyph", cls: x.cls, fission: x.fissionPct } : {}), diagram: true }
      : { ...g, node: x, labels: config.labels, palette, diagram: true }
    nodes.push({ id, type, position, data })
  }

  // bands behind the element rows, the element's name at the right
  if (grid === "element-rows" && config.bands && spec.nodes.length) {
    const zs = spec.nodes.map((x) => x.z)
    const zMax = Math.max(...zs), zMin = Math.min(...zs)
    const xs = [...boxes.values()]
    const left = Math.min(...xs.map((b) => b.x)) - 60, right = Math.max(...xs.map((b) => b.x + b.w)) + 180
    for (let z = zMax; z >= zMin; z--) {
      nodes.push({ id: `diagram:band:${z}`, type: "band", position: { x: left, y: (zMax - z) * ROW_H - ROW_H / 2 }, width: right - left, height: ROW_H,
        draggable: false, selectable: false, focusable: false, zIndex: -1, style: { pointerEvents: "none" },
        data: { label: elementName(z), shade: (zMax - z) % 2 === 0 } })
    }
  }

  // N and Z arrows under and beside the chart
  if (grid === "nz" && spec.nodes.length) {
    const xs = [...boxes.values()]
    const left = Math.min(...xs.map((b) => b.x)), bottom = Math.max(...xs.map((b) => b.y + b.h))
    nodes.push({ id: "diagram:axis", type: "axis", position: { x: left - 50, y: bottom + 16 }, draggable: false, selectable: false, data: {} })
  }

  // the legend, bottom-left
  const legend = config.legend ? spec.legend ?? familyLegend(spec) : undefined
  if (legend?.length && boxes.size) {
    const xs = [...boxes.values()]
    const left = Math.min(...xs.map((b) => b.x)), bottom = Math.max(...xs.map((b) => b.y + b.h))
    nodes.push({ id: "diagram:legend", type: "legend", position: grid === "nz" ? { x: left + 130, y: bottom + 30 } : { x: left - (grid === "element-rows" ? 40 : 0), y: bottom + 40 },
      draggable: true, selectable: false, data: { items: legend, family: !spec.legend } })
  }

  // arrows
  const edges: Edge[] = []
  let gammaSlot = 0
  spec.edges.forEach((e, i) => {
    if (!config.edges.includes(e.kind)) return
    const sb = boxes.get(e.s), tb = boxes.get(e.t)
    if (!sb || !tb) return
    const source = (grid === "ladder" && spec.nodes.find((x) => x.id === e.s)?.energyKeV !== undefined) ? `diagram:level:${e.s}` : `nuclide:${e.s}`
    const target = (grid === "ladder" && spec.nodes.find((x) => x.id === e.t)?.energyKeV !== undefined) ? `diagram:level:${e.t}` : `nuclide:${e.t}`
    let points: [number, number][] | undefined
    if (grid === "ladder") {
      if (e.kind === "gamma") {
        gammaSlot += 1
        const x = ladder.x + 120 + gammaSlot * 48
        points = [[x, sb.y], [x, tb.y]]
      } else {
        points = [[sb.x + sb.w, sb.y + sb.h / 2], [ladder.x + 30 + (edges.length % 4) * 14, tb.y]]
      }
    }
    const sc = { x: sb.x + sb.w / 2, y: sb.y + sb.h / 2 }, tc = { x: tb.x + tb.w / 2, y: tb.y + tb.h / 2 }
    const dx = tc.x - sc.x, dy = tc.y - sc.y
    const horizontal = Math.abs(dx) >= Math.abs(dy)
    // named handles only where the node has them: a plain card (EntityNode without the glyph) has just its own two
    const named = (id: string) => {
      const x = spec.nodes.find((n) => n.id === id)
      return !(config.shape === "rect" && !(grid === "ladder" && x?.energyKeV !== undefined) && !x?.cls)
    }
    const handles = {
      ...(named(e.s) ? { sourceHandle: horizontal ? (dx > 0 ? "r" : "l") : dy > 0 ? "b" : "t" } : {}),
      ...(named(e.t) ? { targetHandle: horizontal ? (dx > 0 ? "lt" : "rt") : dy > 0 ? "tt" : "bt" } : {}),
    }
    edges.push({
      id: `diagram:${i}:${e.s}->${e.t}:${e.kind}`, source, target, type: "diagram", ...handles,
      data: { kind: e.kind, pct: e.pct, curve: e.curve, palette, points, text: grid === "nz" ? undefined : edgeText(e.kind, e.pct, e.label, config.labels), mode: EDGE_LABEL[e.kind],
        source: spec.source, receipt: receiptOf(spec, e.s, e.t, e.kind, e.pct, e.label) },
    })
  })
  return { nodes, edges, gnodes }
}

/** What a click on the arrow says (GraphPage edgeReceipt): the step, its percent, the figure it belongs to. */
function receiptOf(spec: DiagramSpec, s: string, t: string, kind: EdgeKind, pct: number | undefined, label: string | undefined): string {
  const name = (id: string) => { const x = spec.nodes.find((n) => n.id === id); return x ? (x.energyKeV !== undefined ? `${nuclideLabel(x)} ${Number(x.energyKeV.toFixed(1))} keV` : nuclideLabel(x)) : id };
  return `${name(s)} to ${name(t)}: ${label ?? EDGE_LABEL[kind]}${pct !== undefined ? `, ${fmtPct(pct)}%` : ""}. One step of ${spec.title}, drawn from its data.`;
}

/** The decay families the spec's nuclides fall in, for the series' legend. */
function familyLegend(spec: DiagramSpec): { label: string; color: string }[] {
  const fams = [...new Set(spec.nodes.map((x) => x.family).filter((f): f is string => !!f))]
  return fams.map((f) => ({ label: f, color: f }))
}
