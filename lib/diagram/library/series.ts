// The four decay series and the Pu-241 chain (brief 28): discs on element rows with bands and the family legend, as
// Wikipedia's decay-series figures draw them. Members and branchings walk ENSDF's ground-state decay modes from the head
// (decay.json, viz-physics seriesFrom); half-lives come from the IAEA Live Chart (livechart-ground.json).
import { chainFrom } from "../data"
import { DEFAULTS_BY_KIND, type DiagramSpec } from "../spec"

const WIKI = "https://en.wikipedia.org/wiki/Decay_chain"
const base = (id: string, title: string, subtype: string, source: string): DiagramSpec => ({
  id, title, kind: "decay-chain", subtype, source,
  defaults: { ...DEFAULTS_BY_KIND["decay-chain"], subtype },
  nodes: [], edges: [],
})

export const SERIES_SPECS: { spec: DiagramSpec; head: readonly [number, number] }[] = [
  { spec: base("thorium-series", "Thorium series (4n)", "thorium-series", `${WIKI}#Thorium_series`), head: [90, 142] },
  { spec: base("neptunium-series", "Neptunium series (4n+1)", "neptunium-series", `${WIKI}#Neptunium_series`), head: [93, 144] },
  { spec: base("uranium-series", "Uranium series (4n+2)", "uranium-series", `${WIKI}#Uranium_series`), head: [92, 146] },
  { spec: base("actinium-series", "Actinium series (4n+3)", "actinium-series", `${WIKI}#Actinium_series`), head: [92, 143] },
  { spec: base("pu241-chain", "Pu-241 chain", "single-chain", "https://en.wikipedia.org/wiki/Plutonium-241"), head: [94, 147] },
]

export async function loadSeries(spec: DiagramSpec, head: readonly [number, number]): Promise<DiagramSpec> {
  const { nodes, edges } = await chainFrom(head)
  return { ...spec, nodes, edges }
}
