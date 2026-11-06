// The Bateman equations over ENSDF's decay network (2026-11-05), for /viz/decay-chain.
//
// Start with N₀ atoms of one nuclide. Each member i decays at λᵢ = ln 2 / T½ᵢ and feeds each daughter k a fraction
// bᵢₖ of its decays (the branching ratio). The network only runs one way, so in topological order every member's
// population is an exact sum of exponentials, Nᵢ(t) = Σⱼ cᵢⱼ e^(−λⱼ t), with the coefficients built parent by
// parent: a source term bₚᵢ λₚ cₚⱼ e^(−λⱼ t) into i contributes bₚᵢ λₚ cₚⱼ / (λᵢ − λⱼ) to cᵢⱼ, and cᵢᵢ makes up
// Nᵢ(0). Stable members have λ = 0. Equal decay constants (rare) are nudged apart by a part in 10⁹.
//
// Branching: a mode's percentage becomes a fraction. Where the listed percentages add to more than 100 (ENSDF
// lists β⁻n as a share of β⁻, for instance), they are scaled to sum to 1; a mode listed without a value shares
// what's left. Only ground states are in the data, so isomeric transitions don't appear.

import { decayIndex, keyOf, type Decay } from '@/lib/viz-physics'

export type Chain = {
  /** Indices into decay.nuclides, parents before daughters. */
  members: number[]
  /** Decay constants, s⁻¹ (0 = stable). */
  lambda: number[]
  /** Nᵢ(t) coefficients: coef[i] is a list of [λⱼ, cᵢⱼ]. */
  coef: [number, number][][]
}

const LN2 = Math.LN2

/** Branching fractions out of one nuclide, daughters by index. */
function branches(d: Decay, from: number, index: Map<number, number>): [number, number][] {
  const x = d.nuclides[from]
  const listed: { to: number; pct: number | null }[] = []
  for (const [mode, pct] of x.m) {
    const m = d.modes[mode]
    if (!m || m.dz === null || m.dn === null) continue
    const to = index.get(keyOf(x.z + m.dz, x.n + m.dn))
    if (to === undefined || to === from) continue
    listed.push({ to, pct })
  }
  if (!listed.length) return []
  const known = listed.filter((l) => l.pct !== null).reduce((s, l) => s + (l.pct as number), 0)
  const unknown = listed.filter((l) => l.pct === null).length
  const rest = Math.max(0, 100 - known)
  const raw = listed.map((l) => ({ to: l.to, f: l.pct !== null ? l.pct : unknown ? rest / unknown : 0 }))
  const sum = raw.reduce((s, l) => s + l.f, 0)
  const scale = sum > 100 ? 100 / sum : 1
  // Two modes can lead to the same daughter (β⁻ and β⁻n twice removed don't, but EC and β⁺ do): merge them.
  const out = new Map<number, number>()
  for (const r of raw) out.set(r.to, (out.get(r.to) ?? 0) + (r.f * scale) / 100)
  return [...out.entries()].filter(([, f]) => f > 0)
}

/** Every nuclide `start` decays into, with exact coefficients for N₀ = n0 atoms of `start`. */
export function solveChain(d: Decay, start: number, n0: number): Chain {
  const index = decayIndex(d)
  // Reachable set, then a topological order (parents before daughters).
  const out = new Map<number, [number, number][]>()
  const seen = new Set([start])
  const stack = [start]
  while (stack.length) {
    const i = stack.pop() as number
    const b = branches(d, i, index)
    out.set(i, b)
    for (const [to] of b) if (!seen.has(to)) {
      seen.add(to)
      stack.push(to)
    }
  }
  const indeg = new Map<number, number>([...seen].map((i) => [i, 0]))
  for (const b of out.values()) for (const [to] of b) indeg.set(to, (indeg.get(to) ?? 0) + 1)
  const order: number[] = []
  const ready = [...seen].filter((i) => indeg.get(i) === 0)
  while (ready.length) {
    const i = ready.shift() as number
    order.push(i)
    for (const [to] of out.get(i) ?? []) {
      indeg.set(to, (indeg.get(to) as number) - 1)
      if (indeg.get(to) === 0) ready.push(to)
    }
  }

  const pos = new Map(order.map((i, k) => [i, k]))
  const lambda = order.map((i) => {
    const t = d.nuclides[i].t
    return t === null || t <= 0 ? 0 : LN2 / t
  })
  // Nudge exactly equal decay constants apart.
  const used = new Set<number>()
  for (let k = 0; k < lambda.length; k++) {
    while (lambda[k] > 0 && used.has(lambda[k])) lambda[k] *= 1 + 1e-9
    used.add(lambda[k])
  }

  const coef: [number, number][][] = order.map(() => [])
  // Sources into each member: [parent position, fraction].
  const into = order.map(() => [] as [number, number][])
  for (const i of order) for (const [to, f] of out.get(i) ?? []) into[pos.get(to) as number].push([pos.get(i) as number, f])

  for (let k = 0; k < order.length; k++) {
    const terms = new Map<number, number>()
    for (const [p, f] of into[k]) {
      const lp = lambda[p]
      if (lp === 0) continue
      for (const [lj, cj] of coef[p]) {
        const denom = lambda[k] - lj
        if (denom === 0) continue
        terms.set(lj, (terms.get(lj) ?? 0) + (f * lp * cj) / denom)
      }
    }
    const initial = k === 0 ? n0 : 0
    const sum = [...terms.values()].reduce((s, c) => s + c, 0)
    terms.set(lambda[k], (terms.get(lambda[k]) ?? 0) + initial - sum)
    coef[k] = [...terms.entries()]
  }
  return { members: order, lambda, coef }
}

/** Atoms of member k at time t (s); tiny negative values from cancellation read as zero. */
export function atoms(c: Chain, k: number, t: number): number {
  let n = 0
  for (const [l, a] of c.coef[k]) n += a * Math.exp(-l * t)
  return n > 0 ? n : 0
}

/** Log-spaced times, seconds. */
export function logTimes(t0: number, t1: number, count: number): number[] {
  const a = Math.log10(t0)
  const b = Math.log10(t1)
  return Array.from({ length: count }, (_, i) => 10 ** (a + ((b - a) * i) / (count - 1)))
}
