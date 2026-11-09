// Level schemes (brief 28): Co-60, Au-198 and Po-210 decaying into their daughters' levels, as ladders: the parent at
// the left, the daughter's levels by energy, β, EC or α feeding with its percent, and the γ lines with energy and
// intensity. From parsing-1's diagram/level-schemes/<id>.json (ENSDF levels, gammas and decay branches, brief 29).
// The ladder subtype (brief 31): Ni-60's own adopted levels to 3 MeV and their γ cascades, from the API.
import { codeOf, fetchApi, halfLifeOf, loadDiagramFile } from "../data"
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
  // a ladder: a nucleus's own adopted levels and the γ cascades between them, no parent
  { ...spec("ni60-levels", "Ni-60 adopted levels", "https://www.nndc.bnl.gov/nudat3/"), subtype: "ladder" },
]

// The API's adopted levels and gammas (services/nsr-api structure.py, ENSDF 2026-11-05).
type ApiLevel = { energy_kev: number; jpi: string | null; half_life_s: number | null; half_life_text: string | null }
type ApiGamma = { level_energy_kev: number; final_level_energy_kev: number | null; e_gamma_kev: number; ri: number | null }
const MAX_KEV = 3000

/** A nucleus's adopted levels to 3 MeV with the γ lines between them: energies on the rungs, Jπ at the left, relative
 *  intensities on the arrows, from /nuclide/{name}/levels and /gammas. */
async function loadAdopted(s: DiagramSpec, name: string, z: number, a: number, symbol: string): Promise<DiagramSpec> {
  const [lv, gm] = await Promise.all([
    fetchApi<{ levels: ApiLevel[] }>(`/nuclide/${name}/levels`),
    fetchApi<{ gammas: ApiGamma[] }>(`/nuclide/${name}/gammas`),
  ])
  const levels = lv.levels.filter((l) => l.energy_kev <= MAX_KEV)
  const id = (e: number) => `${codeOf(a, symbol)}-${Math.round(e)}`
  const ids = new Set(levels.map((l) => id(l.energy_kev)))
  const nodes: DiagramNode[] = levels.map((l) => ({
    id: id(l.energy_kev), z, a, symbol, energyKeV: l.energy_kev, jpi: l.jpi ?? undefined,
    halfLife: halfLifeOf(l.half_life_text === "STABLE" ? null : l.half_life_s ?? undefined),
  }))
  const edges: DiagramEdge[] = gm.gammas
    .filter((g) => g.final_level_energy_kev !== null && ids.has(id(g.level_energy_kev)) && ids.has(id(g.final_level_energy_kev)))
    .sort((p, q) => q.level_energy_kev - p.level_energy_kev || q.e_gamma_kev - p.e_gamma_kev)
    .map((g) => ({
      s: id(g.level_energy_kev), t: id(g.final_level_energy_kev as number), kind: "gamma" as const,
      label: g.ri === null ? `${Number(g.e_gamma_kev.toFixed(1))} keV` : `${Number(g.ri.toPrecision(3))}`,
    }))
  return { ...s, nodes, edges }
}

const kindOf = (mode: string): EdgeKind => (mode === "A" ? "alpha" : mode.startsWith("B-") ? "beta-" : mode === "B+" ? "beta+" : "ec")

export async function loadLevels(s: DiagramSpec): Promise<DiagramSpec> {
  if (s.id === "ni60-levels") return loadAdopted(s, "60Ni", 28, 60, "Ni")
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
