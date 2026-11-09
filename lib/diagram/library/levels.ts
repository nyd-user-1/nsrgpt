// Level schemes (brief 28): Co-60, Au-198 and Po-210 decaying into their daughters' levels, as ladders: the parent at
// the left, the daughter's levels by energy, β, EC or α feeding with its percent, and the γ lines with energy and
// intensity. From parsing-1's diagram/level-schemes/<id>.json (ENSDF levels, gammas and decay branches, brief 29).
import { codeOf, halfLifeOf, loadDiagramFile } from "../data"
import { DEFAULTS_BY_KIND, type DiagramEdge, type DiagramNode, type DiagramSpec, type EdgeKind } from "../spec"

type Nuc = { z: number; a: number; symbol: string; jpi?: string; halfLife?: { s: number | null } }
type Scheme = {
  parent: Nuc; daughter: Nuc
  levels: { energy: number; jpi?: string; halfLife?: { s: number | null } }[]
  gammas: { from: number; to: number; energy: number; intensity: number | null }[]
  branches: { mode: string; toLevel: number; pct: number | null }[]
}

const spec = (id: string, title: string, source: string): DiagramSpec => ({
  id, title, kind: "level-scheme", subtype: "decay-scheme", source,
  defaults: { ...DEFAULTS_BY_KIND["level-scheme"] }, nodes: [], edges: [],
})
export const LEVEL_SPECS: DiagramSpec[] = [
  spec("co60", "Co-60 decay into Ni-60 levels", "https://en.wikipedia.org/wiki/Decay_scheme"),
  spec("au198", "Au-198 decay into Hg-198 levels", "https://en.wikipedia.org/wiki/Decay_scheme"),
  spec("po210", "Po-210 decay into Pb-206 levels", "https://en.wikipedia.org/wiki/Polonium-210"),
]

const kindOf = (mode: string): EdgeKind => (mode === "A" ? "alpha" : mode.startsWith("B-") ? "beta-" : mode === "B+" ? "beta+" : "ec")

export async function loadLevels(s: DiagramSpec): Promise<DiagramSpec> {
  const f = await loadDiagramFile<Scheme>(`level-schemes/${s.id}.json`)
  if (!f) throw new Error(`the ${s.title} data is not published yet (parsing-1, brief 29)`)
  const p = f.parent, d = f.daughter
  const parent: DiagramNode = { id: codeOf(p.a, p.symbol), z: p.z, a: p.a, symbol: p.symbol, jpi: p.jpi, halfLife: halfLifeOf(p.halfLife ? p.halfLife.s : undefined) }
  const levelId = (e: number) => `${codeOf(d.a, d.symbol)}-${Math.round(e)}`
  // a level shows when something feeds it or a γ leaves or reaches it
  const used = new Set<number>([0])
  for (const b of f.branches) if ((b.pct ?? 0) > 0) used.add(b.toLevel)
  for (const g of f.gammas) if ((g.intensity ?? 0) > 0) { used.add(g.from); used.add(g.to) }
  const near = (e: number) => f.levels.reduce((best, l) => (Math.abs(l.energy - e) < Math.abs(best.energy - e) ? l : best), f.levels[0])
  const levels: DiagramNode[] = f.levels.filter((l) => [...used].some((u) => Math.abs(u - l.energy) < 0.5)).map((l) => ({
    id: levelId(l.energy), z: d.z, a: d.a, symbol: d.symbol, energyKeV: l.energy, jpi: l.jpi, halfLife: halfLifeOf(l.halfLife ? l.halfLife.s : undefined),
  }))
  const edges: DiagramEdge[] = [
    ...f.branches.filter((b) => (b.pct ?? 0) > 0).map((b) => ({ s: parent.id, t: levelId(near(b.toLevel).energy), kind: kindOf(b.mode), pct: b.pct ?? undefined })),
    ...f.gammas.filter((g) => (g.intensity ?? 0) > 0).map((g) => ({ s: levelId(near(g.from).energy), t: levelId(near(g.to).energy), kind: "gamma" as const,
      pct: g.intensity ?? undefined, label: `${Number(g.energy.toFixed(1))} keV` })),
  ]
  return { ...s, nodes: [parent, ...levels], edges }
}
