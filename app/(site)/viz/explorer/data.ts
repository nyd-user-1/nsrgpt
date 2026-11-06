// The 3D explorer's data (2026-11-06): public/viz-data/livechart-ground.json, every ground state from the IAEA Live
// Chart API (scripts/iaea-livechart-build.mjs), and the fission yields (../fission-yields/data.ts) as variables too.

import { loadFission, type Energy, type FissionFile } from '../fission-yields/data'

export type Ground = {
  source: string
  els: string[]
  cols: string[]
  rows: (number | string | null)[][]
  fission: { id: string; z: number; a: number; el: string; energies: Energy[] }[]
}

let ground: Promise<Ground> | null = null
export function loadGround(): Promise<Ground> {
  if (!ground) {
    ground = fetch('/viz-data/livechart-ground.json').then((r) => {
      if (!r.ok) throw new Error(`/viz-data/livechart-ground.json: ${r.status}`)
      return r.json() as Promise<Ground>
    })
    ground.catch(() => (ground = null))
  }
  return ground
}

export type Var = { id: string; label: string; unit: string; group: string; log?: boolean }

const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹'
const sup = (v: number) => String(v).replace(/\d/g, (d) => SUP[Number(d)])
const ENERGY: Record<Energy, string> = { thermal: 'thermal', fast: 'fast', '14mev': '14 MeV' }

/** Every variable an axis or the colour can take. */
export function variables(g: Ground): Var[] {
  const base: Var[] = [
    { id: 'n', label: 'N', unit: '', group: 'Nuclide' },
    { id: 'z', label: 'Z', unit: '', group: 'Nuclide' },
    { id: 'a', label: 'A', unit: '', group: 'Nuclide' },
    { id: 'nz', label: 'N − Z', unit: '', group: 'Nuclide' },
    { id: 't', label: 'Half-life', unit: 's', group: 'Nuclide', log: true },
    { id: 'j', label: 'Spin J', unit: 'ħ', group: 'Nuclide' },
    { id: 'abundance', label: 'Natural abundance', unit: '%', group: 'Nuclide' },
    { id: 'ba', label: 'Binding energy per nucleon', unit: 'keV', group: 'Masses and energies' },
    { id: 'me', label: 'Mass excess', unit: 'keV', group: 'Masses and energies' },
    { id: 'qa', label: 'Qα', unit: 'keV', group: 'Masses and energies' },
    { id: 'qbm', label: 'Qβ−', unit: 'keV', group: 'Masses and energies' },
    { id: 'qbmn', label: 'Qβ−n', unit: 'keV', group: 'Masses and energies' },
    { id: 'qec', label: 'Q(EC)', unit: 'keV', group: 'Masses and energies' },
    { id: 'sn', label: 'Sₙ', unit: 'keV', group: 'Masses and energies' },
    { id: 'sp', label: 'Sₚ', unit: 'keV', group: 'Masses and energies' },
    { id: 'radius', label: 'Charge radius', unit: 'fm', group: 'Moments and size' },
    { id: 'mu', label: 'Magnetic dipole moment', unit: 'μN', group: 'Moments and size' },
    { id: 'q', label: 'Electric quadrupole moment', unit: 'b', group: 'Moments and size' },
  ]
  const fy: Var[] = g.fission.flatMap((p) =>
    p.energies.flatMap((e) =>
      (['cum', 'ind'] as const).map((k) => ({
        id: `fy:${k}:${p.id}:${e}`,
        label: `${k === 'cum' ? 'Cumulative' : 'Independent'} yield, ${sup(p.a)}${p.el} ${ENERGY[e]}`,
        unit: '%',
        group: 'Fission yields',
        log: true,
      })),
    ),
  )
  return [...base, ...fy]
}

/** The fission file a variable needs, if any. */
export const fissionOf = (id: string) => (id.startsWith('fy:') ? id.split(':')[2] : null)
export const loadFor = (id: string) => {
  const p = fissionOf(id)
  return p ? loadFission(p) : null
}

/** A variable's value for every row (null where the data has none). */
export function valuesOf(g: Ground, id: string, fy: Map<string, FissionFile>): (number | null)[] {
  const col = (name: string) => g.cols.indexOf(name)
  const zi = col('z')
  const ni = col('n')
  if (id.startsWith('fy:')) {
    const [, kind, parent, energy] = id.split(':') as [string, 'cum' | 'ind', string, Energy]
    const f = fy.get(parent)
    const ys = f?.[kind][energy]
    if (!f || !ys) return g.rows.map(() => null)
    // Independent yields add their isomers in; a ground state's cumulative yield already counts them.
    const by = new Map<number, number>()
    ys.forEach((y, i) => {
      if (!y || (kind === 'cum' && f.m[i] !== 0)) return
      const k = f.z[i] * 1000 + (f.a[i] - f.z[i])
      by.set(k, (by.get(k) ?? 0) + y * 100)
    })
    return g.rows.map((r) => by.get((r[zi] as number) * 1000 + (r[ni] as number)) ?? null)
  }
  if (id === 'a') return g.rows.map((r) => (r[zi] as number) + (r[ni] as number))
  if (id === 'nz') return g.rows.map((r) => (r[ni] as number) - (r[zi] as number))
  const c = col(id)
  return g.rows.map((r) => (typeof r[c] === 'number' ? (r[c] as number) : null))
}
