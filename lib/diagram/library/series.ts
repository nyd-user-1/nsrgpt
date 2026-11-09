// The four decay series, the Pu-241 chain (brief 28) and ten more chains (brief 47): discs on element rows with bands and
// the family legend, as Wikipedia's decay-series figures draw them. Members and branchings walk ENSDF's ground-state decay
// modes from the head (decay.json, viz-physics seriesFrom); half-lives come from the IAEA Live Chart (livechart-ground.json).
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
  { spec: base("u232-chain", "U-232 chain", "single-chain", "https://en.wikipedia.org/wiki/Uranium-232"), head: [92, 140] },
  { spec: base("pu238-chain", "Pu-238 chain", "single-chain", "https://en.wikipedia.org/wiki/Plutonium-238"), head: [94, 144] },
  { spec: base("cm244-chain", "Cm-244 chain", "single-chain", "https://en.wikipedia.org/wiki/Curium-244"), head: [96, 148] },
  { spec: base("rn222-progeny", "Radon-222 progeny", "single-chain", "https://en.wikipedia.org/wiki/Radon-222"), head: [86, 136] },
  { spec: base("sr90-chain", "Sr-90 chain", "single-chain", "https://en.wikipedia.org/wiki/Strontium-90"), head: [38, 52] },
  { spec: base("cs137-chain", "Cs-137 chain", "single-chain", "https://en.wikipedia.org/wiki/Caesium-137"), head: [55, 82] },
  { spec: base("mo99-chain", "Mo-99 chain", "single-chain", "https://en.wikipedia.org/wiki/Molybdenum-99"), head: [42, 57] },
  { spec: base("mass-131-chain", "Mass 131 fission chain", "single-chain", "https://en.wikipedia.org/wiki/Iodine-131"), head: [50, 81] },
  { spec: base("mass-135-chain", "Mass 135 fission chain", "single-chain", "https://en.wikipedia.org/wiki/Xenon-135"), head: [52, 83] },
  { spec: base("mass-140-chain", "Mass 140 fission chain", "single-chain", "https://en.wikipedia.org/wiki/Barium-140"), head: [54, 86] },
]

export async function loadSeries(spec: DiagramSpec, head: readonly [number, number]): Promise<DiagramSpec> {
  const { nodes, edges } = await chainFrom(head)
  return { ...spec, nodes, edges }
}
