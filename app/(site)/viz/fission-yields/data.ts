// The fission yields' data (2026-11-06): public/viz-data/fission/<parent>.json, built from the IAEA Live Chart API's
// JEFF-3.1.1 yields (scripts/iaea-livechart-build.mjs). Yields are per fission (they sum to about 2, two fragments a
// fission); the charts show them in percent.

import { fetchData } from '@/lib/use-data'

export type Energy = 'thermal' | 'fast' | '14mev'
export const ENERGIES: { id: Energy; label: string }[] = [
  { id: 'thermal', label: 'Thermal' },
  { id: 'fast', label: 'Fast' },
  { id: '14mev', label: '14 MeV' },
]

export type FissionFile = {
  source: string
  parent: { z: number; a: number; el: string }
  energies: Energy[]
  z: number[]
  a: number[]
  /** 0 the ground state, 1 and up an isomer. */
  m: number[]
  ind: Partial<Record<Energy, (number | null)[]>>
  cum: Partial<Record<Energy, (number | null)[]>>
}

/** The eight parents, in the API's order, each with a colour per theme. */
export const PARENTS = [
  { id: '232th', light: '#7a6a55', dark: '#c9b89a' },
  { id: '233u', light: '#00a396', dark: '#3fd0dc' },
  { id: '235u', light: '#2f6fdc', dark: '#5b9cff' },
  { id: '238u', light: '#1f9d4c', dark: '#3ddc7a' },
  { id: '237np', light: '#8b3fd9', dark: '#b57bff' },
  { id: '239pu', light: '#e8730c', dark: '#ff8a3d' },
  { id: '241pu', light: '#d42f2f', dark: '#ff5c5c' },
  { id: '241am', light: '#b8860b', dark: '#ffd84d' },
] as const
export type ParentId = (typeof PARENTS)[number]['id']

export const loadFission = (id: string) => fetchData<FissionFile>(`fission/${id}.json`)
export const loadAllFission = () => Promise.all(PARENTS.map((p) => loadFission(p.id)))

/** The mass-yield curve: independent yields summed per mass number, every charge and state, % per fission. */
export function massCurve(f: FissionFile, e: Energy): [number, number][] {
  const ys = f.ind[e]
  if (!ys) return []
  const byA = new Map<number, number>()
  ys.forEach((y, i) => {
    if (y) byA.set(f.a[i], (byA.get(f.a[i]) ?? 0) + y)
  })
  return [...byA.entries()].sort(([a], [b]) => a - b).map(([a, y]) => [a, y * 100])
}

/** Each product nuclide's yield on the N–Z plane, % per fission: independent yields with the isomers' added in;
 *  cumulative ones from the ground state alone, since a ground state's cumulative yield already counts what its
 *  isomers feed it. */
export function nzYields(f: FissionFile, e: Energy, kind: 'ind' | 'cum'): { z: number; n: number; y: number }[] {
  const ys = f[kind][e]
  if (!ys) return []
  const byNuc = new Map<number, { z: number; n: number; y: number }>()
  ys.forEach((y, i) => {
    if (!y || (kind === 'cum' && f.m[i] !== 0)) return
    const z = f.z[i]
    const n = f.a[i] - z
    const k = z * 1000 + n
    const cur = byNuc.get(k)
    if (cur) cur.y += y * 100
    else byNuc.set(k, { z, n, y: y * 100 })
  })
  return [...byNuc.values()]
}
