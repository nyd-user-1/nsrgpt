// The diagram library (brief 28): one spec per reference figure, grouped by kind in the catalog. LIBRARY holds each
// spec as the catalog lists it; loadSpec(id) returns it with its nodes and edges drawn from the data (decay.json,
// livechart-ground.json, parsing-1's diagram files), half-lives and families filled from ENSDF where a spec leaves them out.
import { keyOf } from "@/lib/nuclide"
import { decayIndex, familyOf, loadDecay } from "@/lib/viz-physics"
import { halfLifeOf } from "../data"
import type { DiagramSpec } from "../spec"
import { ACTIVATION_SPECS, loadActivation } from "./activation"
import { LEVEL_SPECS, loadLevels } from "./levels"
import { REACTION_SPECS, loadReaction } from "./reactions"
import { ROUTE_SPECS } from "./routes"
import { SERIES_SPECS, loadSeries } from "./series"

export const LIBRARY: DiagramSpec[] = [
  ...SERIES_SPECS.map((s) => s.spec),
  ...REACTION_SPECS,
  ...ACTIVATION_SPECS,
  ...ROUTE_SPECS,
  ...LEVEL_SPECS,
]

export const specById = (id: string) => LIBRARY.find((s) => s.id === id)

async function build(spec: DiagramSpec): Promise<DiagramSpec> {
  const series = SERIES_SPECS.find((s) => s.spec.id === spec.id)
  if (series) return loadSeries(spec, series.head)
  if (REACTION_SPECS.includes(spec)) return loadReaction(spec)
  if (ACTIVATION_SPECS.includes(spec)) return loadActivation(spec)
  if (LEVEL_SPECS.includes(spec)) return loadLevels(spec)
  return spec
}

/** A spec with its nodes and edges, ready for toFlow. Throws when its data file is not published. */
export async function loadSpec(id: string): Promise<DiagramSpec> {
  const spec = specById(id)
  if (!spec) throw new Error(`no diagram "${id}"`)
  const built = await build(spec)
  const d = await loadDecay().catch(() => null)
  if (!d) return built
  const index = decayIndex(d)
  const nodes = built.nodes.map((n) => {
    if (n.energyKeV !== undefined || (n.halfLife !== undefined && n.family !== undefined)) return n
    const i = index.get(keyOf(n.z, n.a - n.z))
    const x = i === undefined ? undefined : d.nuclides[i]
    const isomer = n.id === `${n.a}${n.symbol.toUpperCase()}M`
    if (!x || isomer) return n
    return { ...n, n: n.n ?? x.n, halfLife: n.halfLife ?? halfLifeOf(x.t), family: n.family ?? familyOf(x) }
  })
  return { ...built, nodes }
}
