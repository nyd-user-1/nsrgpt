// Decay heat (2026-11-06), for the particle view (/viz/particles): the power one gram of a nuclide and its daughters
// give off as heat, over time. Each member's activity comes from the exact Bateman solution (lib/viz-bateman.ts); the
// energy each decay leaves behind comes from AME2020's Q-values (public/viz-data/masses.json):
//
//   α (and the rare cluster decays)  all of Qα: the α particle and the recoiling daughter stop in the sample.
//   β−                               a third of Qβ−: the electron's mean energy; the antineutrino carries off the rest.
//   β+/EC                            a third of Q(EC), the same rule; Q(EC) = ΔB − (mₙ − m(¹H)), from the B/A of both.
//   fission                          200 MeV, the usual figure for a fission's prompt energy.
//   p, n emission                    −Sₚ or −Sₙ of the emitter.
//
// Gamma rays are not counted: most leave a small sample. Where a β decay mostly feeds excited levels, part of that
// third is really gamma-ray energy, so it reads high (⁶⁰Co most of all: 6.3 W/g here, about 0.6 W/g from its betas). A decay mode's share is its ENSDF branching, as the Bateman
// solver reads it (listed percentages, the rest shared among modes listed without one, scaled down where they add to
// more than 100).

import { familyOfMode, keyOf, type Decay, type Mass } from '@/lib/viz-physics'
import { atoms, logTimes, solveChain, timeSpan, type Chain } from '@/lib/viz-bateman'

const AVOGADRO = 6.02214076e23
const KEV_J = 1.602176634e-16
/** (mₙ − m(¹H))c², keV. */
const N_MINUS_H = 782.347
const FISSION_KEV = 2e5

/** keV left in the sample per decay of nuclide i. */
export function heatPerDecay(d: Decay, masses: Map<number, Mass>, i: number): number {
  const x = d.nuclides[i]
  if (x.t === null || !x.m.length) return 0
  const self = masses.get(keyOf(x.z, x.n))
  const known = x.m.reduce((s, [, p]) => s + (p ?? 0), 0)
  const unknown = x.m.filter(([, p]) => p === null).length
  const rest = Math.max(0, 100 - known)
  const raw = x.m.map(([mode, p]) => [mode, p !== null ? p : unknown ? rest / unknown : 0] as const)
  const sum = raw.reduce((s, [, f]) => s + f, 0)
  const scale = sum > 100 ? 100 / sum : 1
  let kev = 0
  for (const [mode, f] of raw) {
    const share = (f * scale) / 100
    if (!share) continue
    switch (familyOfMode(mode)) {
      case 'a':
        kev += share * Math.max(0, self?.qa ?? 0)
        break
      case 'b-':
        kev += (share * Math.max(0, self?.qb ?? 0)) / 3
        break
      case 'ec': {
        const daughter = masses.get(keyOf(x.z - 1, x.n + 1))
        const a = x.z + x.n
        if (self?.b != null && daughter?.b != null) kev += (share * Math.max(0, a * (daughter.b - self.b) - N_MINUS_H)) / 3
        break
      }
      case 'sf':
        kev += share * FISSION_KEV
        break
      case 'p':
        kev += share * Math.max(0, -(self?.sp ?? 0))
        break
      case 'n':
        kev += share * Math.max(0, -(self?.sn ?? 0))
        break
    }
  }
  return kev
}

export type HeatModel = {
  chain: Chain
  /** keV per decay, by chain member. */
  perDecay: number[]
  /** The chain's time window, s (lib/viz-bateman.ts timeSpan). */
  span: [number, number]
  /** The most heat any moment in the window gives, W, all members together. */
  peak: number
  /** The members that give heat, hottest first by their own peak, at most `most` of them. */
  hottest: number[]
}

/** One gram of nuclide `start` (a decay.json index), and its decay heat over its chain's window. */
export function heatModel(d: Decay, masses: Map<number, Mass>, start: number, most = 5): HeatModel {
  const head = d.nuclides[start]
  const chain = solveChain(d, start, AVOGADRO / (head.z + head.n))
  const perDecay = chain.members.map((i) => heatPerDecay(d, masses, i))
  const span = timeSpan(d, chain)
  const times = [0, ...logTimes(span[0], span[1], 240)]
  const own = chain.members.map(() => 0)
  let peak = 0
  for (const t of times) {
    let total = 0
    chain.members.forEach((_, k) => {
      const w = memberHeat({ chain, perDecay }, k, t)
      total += w
      if (w > own[k]) own[k] = w
    })
    if (total > peak) peak = total
  }
  const hottest = chain.members
    .map((_, k) => k)
    .filter((k) => own[k] > 0)
    .sort((a, b) => own[b] - own[a])
    .slice(0, most)
  return { chain, perDecay, span, peak, hottest }
}

/** Member k's decay heat at time t, W. */
export function memberHeat(h: Pick<HeatModel, 'chain' | 'perDecay'>, k: number, t: number): number {
  return h.chain.lambda[k] * atoms(h.chain, k, t) * h.perDecay[k] * KEV_J
}

/** All members' decay heat at time t, W. */
export function totalHeat(h: Pick<HeatModel, 'chain' | 'perDecay'>, t: number): number {
  let w = 0
  for (let k = 0; k < h.chain.members.length; k++) w += memberHeat(h, k, t)
  return w
}

/** "0.567 W", "3.2 kW", "41 µW". */
export function wattsText(w: number): string {
  if (!(w > 0)) return '0 W'
  const units: [number, string][] = [[1e9, 'GW'], [1e6, 'MW'], [1e3, 'kW'], [1, 'W'], [1e-3, 'mW'], [1e-6, 'µW'], [1e-9, 'nW'], [1e-12, 'pW']]
  const [f, u] = units.find(([f]) => w >= f) ?? units[units.length - 1]
  return `${+(w / f).toPrecision(3)} ${u}`
}
