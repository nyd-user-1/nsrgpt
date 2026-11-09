// Activation and burnup (brief 28): the U-238 to Cm-245 transmutation flow in a light-water reactor (Sasahara et al.,
// as Wikipedia redraws it) as free glyph cards in the figure's colours, and the two breeding chains. The flow's layout
// and arrows are the figure's; its numbers and classes come from parsing-1's diagram/transmutation-u238-cm244.json
// (thermal σ(n,γ) and σ(n,f) from ENDF/B-VIII.1, decay branches from ENSDF) when it loads, else the figure's own.
import { loadDiagramFile } from "../data"
import { DEFAULTS_BY_KIND, type DiagramEdge, type DiagramNode, type DiagramSpec, type EdgeKind } from "../spec"

const g = (id: string, z: number, a: number, symbol: string, cls: string, x: number, y: number, fissionPct?: number): DiagramNode =>
  ({ id, z, a, symbol, cls, pos: { x, y }, fissionPct })
const FLOW_NODES: DiagramNode[] = [
  g("238U", 92, 238, "U", "fertile", 0, 0), g("239PU", 94, 239, "Pu", "fissile", 1, 0, 64), g("240PU", 94, 240, "Pu", "fertile", 2, 0),
  g("238PU", 94, 238, "Pu", "fertile", 0, 1, 9), g("241PU", 94, 241, "Pu", "fissile", 1, 2, 72), g("242PU", 94, 242, "Pu", "less", 2, 2),
  g("243PU", 94, 243, "Pu", "short", 3, 2), g("241AM", 95, 241, "Am", "less", 0, 3.6, 10), g("242AM", 95, 242, "Am", "short", 1, 3.6),
  g("243AM", 95, 243, "Am", "less", 2, 3.6, 1), g("244AM", 95, 244, "Am", "short", 3, 3.6), g("242AMM", 95, 242, "Am", "fissile", 1.5, 4.4, 84),
  g("242CM", 96, 242, "Cm", "short", 0, 5.4, 1), g("243CM", 96, 243, "Cm", "fissile", 1, 5.4, 85), g("244CM", 96, 244, "Cm", "fertile", 2, 5.4, 4),
  g("245CM", 96, 245, "Cm", "fissile", 3, 5.4, 85),
]
const e = (s: string, t: string, kind: EdgeKind, pct?: number, curve?: boolean): DiagramEdge => ({ s, t, kind, pct, curve })
const FLOW_EDGES: DiagramEdge[] = [
  e("238U", "239PU", "capture", 91, true), e("239PU", "240PU", "capture", 36), e("240PU", "241PU", "capture"), e("241PU", "242PU", "capture", 25),
  e("242PU", "243PU", "capture"), e("241PU", "241AM", "beta-", 3), e("243PU", "243AM", "beta-"), e("241AM", "242AM", "capture", 79),
  e("241AM", "242AMM", "capture", 10, true), e("242AM", "242CM", "beta-", 81), e("242AM", "242PU", "ec", 17), e("242AM", "243AM", "capture", 1),
  e("242AMM", "243AM", "capture", 16), e("243AM", "244AM", "capture", 99), e("244AM", "244CM", "beta-"), e("242CM", "238PU", "alpha", 96, true),
  e("243CM", "239PU", "alpha", 2, true), e("244CM", "240PU", "alpha", 15, true), e("242CM", "243CM", "capture", 3), e("243CM", "244CM", "capture", 13),
  e("244CM", "245CM", "capture", 81),
]
const LEGEND = [
  { label: "Fissile", color: "#a0352c" }, { label: "Fertile", color: "#1f4fd6" }, { label: "Less fertile", color: "#6b6b6b" },
  { label: "Short-lived", color: "#aaaaaa" }, { label: "Neutron capture", color: "#1f4fd6" }, { label: "α decay", color: "#e22bd0" },
  { label: "β−, EC decay", color: "#1b8c3a" },
]

const breed = (id: string, z: number, a: number, symbol: string, x: number, y: number): DiagramNode => ({ id, z, a, symbol, pos: { x, y } })
export const ACTIVATION_SPECS: DiagramSpec[] = [
  { id: "transmutation-u238-cm244", title: "U-238 to Cm-245 in a reactor", kind: "activation-burnup", subtype: "transmutation-flow",
    source: "https://en.wikipedia.org/wiki/Spent_nuclear_fuel (after Sasahara et al., J. Nucl. Sci. Technol. 41 (2004) 448)",
    defaults: { ...DEFAULTS_BY_KIND["activation-burnup"], subtype: "transmutation-flow" }, nodes: FLOW_NODES, edges: FLOW_EDGES, legend: LEGEND },
  { id: "breeding-chains", title: "Breeding: U-238 to Pu-239, Th-232 to U-233", kind: "activation-burnup", subtype: "breeding-chain",
    source: "https://en.wikipedia.org/wiki/Breeder_reactor",
    defaults: { ...DEFAULTS_BY_KIND["activation-burnup"], subtype: "breeding-chain", legend: false },
    nodes: [breed("238U", 92, 238, "U", 0, 0), breed("239U", 92, 239, "U", 1, 0), breed("239NP", 93, 239, "Np", 2, 0), breed("239PU", 94, 239, "Pu", 3, 0),
      breed("232TH", 90, 232, "Th", 0, 1.3), breed("233TH", 90, 233, "Th", 1, 1.3), breed("233PA", 91, 233, "Pa", 2, 1.3), breed("233U", 92, 233, "U", 3, 1.3)],
    edges: [e("238U", "239U", "capture"), e("239U", "239NP", "beta-", 100), e("239NP", "239PU", "beta-", 100),
      e("232TH", "233TH", "capture"), e("233TH", "233PA", "beta-", 100), e("233PA", "233U", "beta-", 100)] },
]

type Row = { z: number; a: number; liso: number; capturePct: number; fissionPct: number; cls?: string; class?: string;
  decay: { alpha: number; betaMinus: number; ec: number; it: number; sf: number } }
const CLS: Record<string, string> = { fissile: "fissile", fertile: "fertile", "less fertile": "less", less: "less", shortlived: "short", "short-lived": "short", short: "short" }
const round = (v: number) => (v >= 10 ? Math.round(v) : v >= 1 ? Math.round(v * 10) / 10 : Number(v.toPrecision(2)))

export async function loadActivation(spec: DiagramSpec): Promise<DiagramSpec> {
  if (spec.id !== "transmutation-u238-cm244") return spec
  const file = await loadDiagramFile<{ nuclides?: Row[] }>("transmutation-u238-cm244.json")
  if (!file?.nuclides?.length) return spec
  const key = (z: number, a: number, iso: boolean) => `${z}-${a}-${iso ? 1 : 0}`
  const rows = new Map(file.nuclides.map((r) => [key(r.z, r.a, r.liso > 0), r]))
  const rowOf = (n: DiagramNode) => rows.get(key(n.z, n.a, n.id.endsWith("MM") || n.id === `${n.a}${n.symbol.toUpperCase()}M`))
  const byId = new Map(spec.nodes.map((n) => [n.id, n]))
  const nodes = spec.nodes.map((n) => {
    const r = rowOf(n)
    return r ? { ...n, cls: CLS[(r.cls ?? r.class ?? "").toLowerCase()] ?? n.cls, fissionPct: r.fissionPct >= 0.5 ? round(r.fissionPct) : undefined } : n
  })
  const edges = spec.edges.map((x) => {
    const r = rowOf(byId.get(x.s)!)
    if (!r) return x
    // the Am-241 capture splits between the ground state and the isomer: the file gives the total, so keep the figure's split
    if (x.kind === "capture") return x.s === "241AM" ? x : { ...x, pct: round(r.capturePct) }
    const pct = x.kind === "alpha" ? r.decay.alpha : x.kind === "beta-" ? r.decay.betaMinus : x.kind === "ec" || x.kind === "beta+" ? r.decay.ec : x.kind === "it" ? r.decay.it : undefined
    return pct === undefined ? x : { ...x, pct: round(pct) }
  })
  return { ...spec, nodes, edges }
}
