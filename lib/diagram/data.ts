// The diagram library's data (brief 28): ENSDF ground-state decays (decay.json), the IAEA Live Chart ground states
// (livechart-ground.json) and parsing-1's diagram files (diagram/<name>.json, brief 29), all read through
// lib/use-data.ts's one cache. Turns a nuclide into a DiagramNode and a decay mode into an EdgeKind.

import { apiUrl } from "@/lib/api-url"
import { fetchData, getQueryClient } from "@/lib/use-data"
import { decayIndex, familyOf, keyOf, loadDecay, seriesFrom, type Decay, type DecayNuclide } from "@/lib/viz-physics"
import type { DiagramEdge, DiagramNode, EdgeKind } from "./spec"

type GroundFile = { source: string; els: string[]; cols: string[]; rows: (number | string | null)[][] }
/** Live Chart ground states: element symbols by Z, and each (Z, N)'s half-life in seconds (null = stable) and main mode. */
export type Ground = { els: string[]; t: Map<number, number | null>; mode: Map<number, string | null> }
function parseGround(f: GroundFile): Ground {
  const zi = f.cols.indexOf("z"), ni = f.cols.indexOf("n"), ti = f.cols.indexOf("t"), mi = f.cols.indexOf("mode")
  const t = new Map<number, number | null>(), mode = new Map<number, string | null>()
  for (const r of f.rows) {
    const k = keyOf(r[zi] as number, r[ni] as number)
    t.set(k, r[ti] as number | null)
    mode.set(k, (r[mi] as string | null) ?? null)
  }
  return { els: f.els, t, mode }
}
export const loadGround = () => fetchData<Ground, GroundFile>("livechart-ground.json", parseGround)

/** A parsing-1 diagram file, or null while it isn't published. */
export async function loadDiagramFile<T>(name: string): Promise<T | null> {
  try {
    return await fetchData<T>(`diagram/${name}`)
  } catch {
    return null
  }
}

/** "232TH", "242AMM": the graph's nuclide id (an isomer adds M). */
export const codeOf = (a: number, symbol: string, isomer = false) => `${a}${symbol.toUpperCase()}${isomer ? "M" : ""}`

const YEAR = 365.2422 * 86400
const trim = (s: string) => (s.includes("e") ? s.replace(/\.?0+e/, "e") : s.includes(".") ? s.replace(/\.?0+$/, "") : s)
/** A half-life as the decay-series figures print it: "1.41e+10" over "Years", "3.6" over "Days", "Stable". */
export function halfLifeOf(t: number | null | undefined): DiagramNode["halfLife"] | undefined {
  if (t === undefined) return undefined
  if (t === null) return "stable"
  if (t < 0) return undefined
  const [v, unit]: [number, string] = t < 60 ? [t, "Seconds"] : t < 3600 ? [t / 60, "Minutes"] : t < 86400 ? [t / 3600, "Hours"] : t < YEAR ? [t / 86400, "Days"] : [t / YEAR, "Years"]
  return { value: v, unit }
}
export function halfLifeValueText(v: number): string {
  if (v >= 1e5 || v < 0.01) return trim(v.toExponential(2))
  return trim(v >= 10 ? v.toPrecision(3) : v.toPrecision(2))
}

/** A DiagramNode for a nuclide in decay.json, its half-life from the Live Chart when it has one. */
export function nodeOf(x: DecayNuclide, ground?: Ground): DiagramNode {
  const a = x.z + x.n
  const gt = ground?.t.get(keyOf(x.z, x.n))
  return { id: codeOf(a, x.el), z: x.z, a, n: x.n, symbol: x.el, halfLife: halfLifeOf(gt !== undefined ? gt : x.t), family: familyOf(x) }
}

/** ENSDF's decay-mode code as an arrow kind: "A" α, "B-" β−, "EC"/"B+" EC or β+, "IT", "SF"; null for the rest. */
export function edgeKindOf(mode: string): EdgeKind | null {
  if (mode === "A") return "alpha"
  if (mode.startsWith("B-")) return "beta-"
  if (mode === "B+") return "beta+"
  if (mode.startsWith("EC")) return "ec"
  if (mode === "IT") return "it"
  if (mode.endsWith("SF")) return "sf"
  return null
}

/** A decay chain from its head (Z, N): every α and β branch of at least 0.001% down to stable (viz-physics seriesFrom). */
export async function chainFrom(head: readonly [number, number]): Promise<{ nodes: DiagramNode[]; edges: DiagramEdge[] }> {
  const [d, ground] = await Promise.all([loadDecay(), loadGround().catch(() => undefined)])
  const steps = seriesFrom(d, decayIndex(d), head)
  const nodes = new Map<string, DiagramNode>()
  const edges: DiagramEdge[] = []
  for (const s of steps) {
    const from = nodeOf(d.nuclides[s.from], ground), to = nodeOf(d.nuclides[s.to], ground)
    nodes.set(from.id, from)
    nodes.set(to.id, to)
    const kind = edgeKindOf(s.mode)
    if (kind) edges.push({ s: from.id, t: to.id, kind, pct: s.pct ?? undefined })
  }
  return { nodes: [...nodes.values()], edges }
}

/** The s-process walk over the chart (brief 28, until parsing-1's files land): from a start nuclide, neutron capture while
 *  the nuclide lives long enough to capture (stable, or a half-life over 1,000 years), else its main decay (β−, EC/β+, α),
 *  until it leaves the window or comes back to a nuclide it has seen. Stable isotopes in the window off the path come
 *  back faint, as the figures draw them. */
export async function sProcessWalk(start: readonly [number, number], keep: (z: number, n: number) => boolean): Promise<{ nodes: DiagramNode[]; edges: DiagramEdge[] }> {
  const [d, ground] = await Promise.all([loadDecay(), loadGround()])
  const index = decayIndex(d)
  const at = (z: number, n: number): DecayNuclide | undefined => {
    const i = index.get(keyOf(z, n))
    return i === undefined ? undefined : d.nuclides[i]
  }
  const t = (z: number, n: number) => {
    const g = ground.t.get(keyOf(z, n))
    return g !== undefined ? g : at(z, n)?.t
  }
  const long = (z: number, n: number) => { const v = t(z, n); return v === null || (v !== undefined && v > 1000 * YEAR) }
  const make = (z: number, n: number, faint = false): DiagramNode => {
    const x = at(z, n)
    const el = ground.els[z] ?? x?.el ?? "?"
    const a = z + n
    return { id: codeOf(a, el), z, a, n, symbol: el, halfLife: halfLifeOf(t(z, n)), family: x ? familyOf(x) : undefined, faint }
  }
  const nodes = new Map<string, DiagramNode>()
  const edges: DiagramEdge[] = []
  let [z, n] = start
  const seen = new Set<number>()
  for (let step = 0; step < 200 && keep(z, n) && !seen.has(keyOf(z, n)); step++) {
    seen.add(keyOf(z, n))
    const here = make(z, n)
    nodes.set(here.id, here)
    let next: [number, number], kind: EdgeKind
    if (long(z, n)) { next = [z, n + 1]; kind = "capture" } else {
      const m = at(z, n)?.m[0]?.[0] ?? "B-"
      const k = edgeKindOf(m) ?? "beta-"
      kind = k
      next = k === "alpha" ? [z - 2, n - 2] : k === "beta-" ? [z + 1, n - 1] : k === "ec" || k === "beta+" ? [z - 1, n + 1] : [z + 1, n - 1]
    }
    const there = make(next[0], next[1])
    if (!keep(next[0], next[1])) break
    edges.push({ s: here.id, t: there.id, kind })
    if (seen.has(keyOf(next[0], next[1]))) break
    ;[z, n] = next
  }
  // the window's stable isotopes off the path, faint
  const zs = [...nodes.values()].map((x) => x.z), ns = [...nodes.values()].map((x) => x.n ?? x.a - x.z)
  for (let zz = Math.min(...zs); zz <= Math.max(...zs); zz++)
    for (let nn = Math.min(...ns) - 1; nn <= Math.max(...ns) + 1; nn++) {
      if (!keep(zz, nn) || ground.t.get(keyOf(zz, nn)) !== null) continue
      const f = make(zz, nn, true)
      if (!nodes.has(f.id)) nodes.set(f.id, f)
    }
  return { nodes: [...nodes.values()], edges }
}

export type { Decay }

/** One API read (lib/api-url.ts), cached in the app's query client for the tab's life like the chart files. */
export async function fetchApi<T>(path: string): Promise<T> {
  const url = apiUrl(path)
  return getQueryClient().fetchQuery({
    queryKey: ["api", url],
    queryFn: async (): Promise<T> => {
      const r = await fetch(url)
      if (!r.ok) throw new Error(`${path}: ${r.status}`)
      return r.json()
    },
    staleTime: Infinity,
    gcTime: 60 * 60 * 1000,
    retry: 1,
  })
}

/** β− chains from starting nuclides down to stability (a half-life over 1e20 s counts as stable), each step by the
 *  nuclide's main decay mode from decay.json's mode table. Starts and stable ends come back solid, the steps between faint. */
export async function decayChainsFrom(starts: [number, number][]): Promise<{ nodes: DiagramNode[]; edges: DiagramEdge[] }> {
  const [d, ground] = await Promise.all([loadDecay(), loadGround()])
  const index = decayIndex(d)
  const at = (z: number, n: number): DecayNuclide | undefined => {
    const i = index.get(keyOf(z, n))
    return i === undefined ? undefined : d.nuclides[i]
  }
  const tOf = (z: number, n: number) => {
    const g = ground.t.get(keyOf(z, n))
    return g !== undefined ? g : at(z, n)?.t
  }
  const make = (z: number, n: number, faint: boolean): DiagramNode => {
    const el = ground.els[z] ?? at(z, n)?.el ?? "?"
    const x = at(z, n)
    return { id: codeOf(z + n, el), z, a: z + n, n, symbol: el, halfLife: halfLifeOf(tOf(z, n)), family: x ? familyOf(x) : undefined, faint }
  }
  const nodes = new Map<string, DiagramNode>()
  const edges: DiagramEdge[] = []
  const seen = new Set<string>()
  for (const [z0, n0] of starts) {
    if (tOf(z0, n0) === undefined) continue
    let [z, n] = [z0, n0]
    nodes.set(make(z, n, false).id, make(z, n, false))
    for (let step = 0; step < 20; step++) {
      const t = tOf(z, n)
      const id = make(z, n, false).id
      if (t === null || (t !== undefined && t > 1e20)) { nodes.set(id, make(z, n, false)); break }
      const mode = at(z, n)?.m[0]?.[0]
      const m = mode ? d.modes[mode] : undefined
      if (!mode || !m || m.dz === null || m.dn === null) break
      const [nz, nn] = [z + m.dz, n + m.dn]
      const next = make(nz, nn, true)
      if (!nodes.has(next.id)) nodes.set(next.id, next)
      if (!seen.has(`${id}>${next.id}`)) edges.push({ s: id, t: next.id, kind: edgeKindOf(mode) ?? "beta-", label: "r β−" })
      seen.add(`${id}>${next.id}`)
      ;[z, n] = [nz, nn]
    }
  }
  return { nodes: [...nodes.values()], edges }
}
