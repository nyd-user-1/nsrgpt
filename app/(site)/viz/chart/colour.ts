// The chart of nuclides' colour modes (brief 35, Part 2, 2026-11-09): what a box's colour says. Decay family is the
// chart's own categorical code (lib/nuclide.ts FAMILY). Evaluation age and XUNDL sets since the cutoff carry a
// direction, fresh to stale, so they take the structure index's diverging ramp (lib/structure.ts DIVERGE7). Half-life,
// papers and EXFOR entries are plain magnitudes, so they take one-hue ramps. Every ramp passed the dataviz validator
// on both papers.

import { FAMILIES, FAMILY, familyOf, type DecayNuclide } from '@/lib/nuclide'
import { fetchData } from '@/lib/use-data'
import { AGE_LABELS, DIVERGE7, NONE, RAMP6, RAMP7, XUNDL_LABELS, ageStep, loadStructure, xundlStep } from '@/lib/structure'

export type Mode = 'family' | 'halflife' | 'age' | 'xundl' | 'papers' | 'exfor'
export const MODES: readonly { id: Mode; label: string }[] = [
  { id: 'family', label: 'Decay family' },
  { id: 'halflife', label: 'Half-life' },
  { id: 'age', label: 'Evaluation age' },
  { id: 'xundl', label: 'XUNDL sets since cutoff' },
  { id: 'papers', label: 'Papers' },
  { id: 'exfor', label: 'EXFOR entries' },
]

/** Per-nuclide counts the colour modes and the nuclides table read, keyed z * 1000 + n. */
export type Counts = {
  /** Years since the cutoff, bucket 0–11 (lib/structure.ts), and the cutoff itself. */
  age: Map<number, { b: number; cutoff: string | null }>
  xundlSince: Map<number, number>
  ensdf: Map<number, number>
  xundl: Map<number, number>
  papers: Map<number, number>
  exfor: Map<number, number>
}

const key = (z: number, n: number) => z * 1000 + n
let counts: Promise<Counts> | null = null
/** The structure index and the NSR field (field.json, papers per nuclide), loaded once and shaped into maps. */
export function loadCounts(): Promise<Counts> {
  return (counts ??= Promise.all([loadStructure(), fetchData<{ n: number; z: number; c: number }[]>('field.json')]).then(([s, field]) => {
    const c: Counts = { age: new Map(), xundlSince: new Map(), ensdf: new Map(), xundl: new Map(), papers: new Map(), exfor: new Map() }
    for (const r of s.nuclides) {
      const k = key(r.z, r.n)
      c.age.set(k, { b: r.age, cutoff: r.cutoff })
      c.xundlSince.set(k, r.xundlSince)
      c.ensdf.set(k, r.ensdf)
      c.xundl.set(k, r.xundl)
    }
    for (const [z, n, e] of s.exfor) c.exfor.set(key(z, n), e)
    for (const f of field) c.papers.set(key(f.z, f.n), f.c)
    return c
  }))
}

/** Half-life bands, shortest first, in decades of seconds (the Live Chart's decade bands, merged to seven so one hue
 *  can tell them apart). */
const HL_EDGES = [-1, 1, 3, 5, 7, 10]
const HL_LABELS = ['<0.1 s', '0.1–10 s', '10–10³ s', '10³–10⁵ s', '10⁵–10⁷ s', '10⁷–10¹⁰ s', '≥10¹⁰ s']
const PAPER_EDGES = [10, 50, 200, 1000, 5000]
const PAPER_LABELS = ['1–9', '10–49', '50–199', '200–999', '1K–4.9K', '5K+']
const EXFOR_EDGES = [3, 10, 30, 100, 300]
const EXFOR_LABELS = ['1–2', '3–9', '10–29', '30–99', '100–299', '300+']
const binOf = (v: number, edges: number[]) => edges.filter((e) => v >= e).length

export type Legend =
  | { kind: 'chips'; items: { color: string; label: string }[] }
  | { kind: 'bar'; title: string; segments: { color: string; label: string }[]; extras: { color: string; label: string }[] }

/** A mode's palette (index = bucket), its legend, and each nuclide's bucket; null counts means the data is loading. */
export function colouring(mode: Mode, dark: boolean, c: Counts | null) {
  const t = dark ? 'dark' : 'light'
  const none = NONE[t]
  const stable = dark ? FAMILY.stable.dark : FAMILY.stable.light
  const fam = FAMILIES.map((f) => (dark ? FAMILY[f].dark : FAMILY[f].light))
  const bar = (title: string, ramp: string[], labels: string[], extras: { color: string; label: string }[] = []): Legend => ({
    kind: 'bar', title, segments: ramp.map((color, i) => ({ color, label: labels[i] })), extras,
  })
  const count = (m: Map<number, number> | undefined, x: DecayNuclide) => m?.get(key(x.z, x.n)) ?? 0
  switch (mode) {
    case 'family':
      return {
        colors: fam,
        legend: { kind: 'chips', items: FAMILIES.map((f, i) => ({ color: fam[i], label: FAMILY[f].label })) } as Legend,
        bucket: (x: DecayNuclide) => FAMILIES.indexOf(familyOf(x)),
      }
    case 'halflife': {
      const ramp = RAMP7[t]
      return {
        // the ramp, then stable, then no half-life (none given, or expected and never observed)
        colors: [...ramp, stable, none],
        legend: bar('Half-life', ramp, HL_LABELS, [{ color: stable, label: 'stable' }, { color: none, label: 'no T½' }]),
        bucket: (x: DecayNuclide) => (x.t === null ? 7 : x.exp || x.t <= 0 ? 8 : binOf(Math.log10(x.t), HL_EDGES)),
      }
    }
    case 'age': {
      const ramp = DIVERGE7[t]
      return {
        colors: [...ramp, none],
        legend: bar('Years since the evaluation cutoff', ramp, AGE_LABELS, [{ color: none, label: 'not in ENSDF' }]),
        bucket: (x: DecayNuclide) => {
          const a = c?.age.get(key(x.z, x.n))
          return !a || a.b >= 12 ? 7 : ageStep(a.b)
        },
      }
    }
    case 'xundl': {
      const ramp = DIVERGE7[t]
      return {
        colors: ramp,
        legend: bar('XUNDL sets since the cutoff', ramp, XUNDL_LABELS),
        bucket: (x: DecayNuclide) => xundlStep(count(c?.xundlSince, x)),
      }
    }
    case 'papers': {
      const ramp = RAMP6[t]
      return {
        colors: [...ramp, none],
        legend: bar('NSR papers', ramp, PAPER_LABELS, [{ color: none, label: 'none' }]),
        bucket: (x: DecayNuclide) => {
          const v = count(c?.papers, x)
          return v <= 0 ? 6 : binOf(v, PAPER_EDGES)
        },
      }
    }
    case 'exfor': {
      const ramp = RAMP6[t]
      return {
        colors: [...ramp, none],
        legend: bar('EXFOR entries with the nuclide as target', ramp, EXFOR_LABELS, [{ color: none, label: 'none' }]),
        bucket: (x: DecayNuclide) => {
          const v = count(c?.exfor, x)
          return v <= 0 ? 6 : binOf(v, EXFOR_EDGES)
        },
      }
    }
  }
}

/** The hover's line for a mode other than family and half-life (which the hover already gives). */
export function modeLine(mode: Mode, x: DecayNuclide, c: Counts | null): string | null {
  if (!c) return null
  const k = key(x.z, x.n)
  if (mode === 'age') {
    const a = c.age.get(k)
    return a?.cutoff ? `Evaluation cutoff ${a.cutoff}` : 'No ENSDF evaluation cutoff'
  }
  if (mode === 'xundl') return `${c.xundlSince.get(k) ?? 0} XUNDL sets since the cutoff`
  if (mode === 'papers') return `${(c.papers.get(k) ?? 0).toLocaleString('en')} NSR papers`
  if (mode === 'exfor') return `${(c.exfor.get(k) ?? 0).toLocaleString('en')} EXFOR entries`
  return null
}

/** Sources beyond the chart's own, by mode. */
export const MODE_SOURCE: Partial<Record<Mode, string>> = { xundl: 'XUNDL', papers: 'NSR', exfor: 'EXFOR' }
