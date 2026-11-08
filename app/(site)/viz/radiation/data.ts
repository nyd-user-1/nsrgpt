// The decay radiation card's data (2026-11-06): public/viz-data/radiation/<Z>.json, one file per element, every
// isotope's ground-state decay radiation from the IAEA Live Chart API (scripts/iaea-livechart-build.mjs). Energies
// keV; intensities per 100 decays of the parent, every mode together.

import { dataUrl } from '@/lib/data-url'

export type Lines = {
  /** α: [energy, intensity] */
  a?: [number, number][]
  /** β− and β+: [mean energy, endpoint energy, intensity, (anti)neutrino mean energy] */
  bm?: [number, number | null, number, number | null][]
  bp?: [number, number | null, number, number | null][]
  /** Electron capture: [neutrino energy, intensity] */
  ec?: [number | null, number][]
  /** γ and X-rays: [energy, intensity] */
  g?: [number, number][]
  x?: [number, number][]
  /** Auger and conversion electrons: [energy, intensity, kind] */
  e?: [number, number, string][]
}
export type ElementFile = { z: number; el: string; nuclides: { n: number; t: number | null; lines: Lines }[] }

const cache = new Map<number, Promise<ElementFile>>()
export function loadElement(z: number): Promise<ElementFile> {
  let p = cache.get(z)
  if (!p) {
    p = fetch(dataUrl(`radiation/${z}.json`)).then((r) => {
      if (!r.ok) throw new Error(`${r.url}: ${r.status}`)
      return r.json() as Promise<ElementFile>
    })
    p.catch(() => cache.delete(z))
    cache.set(z, p)
  }
  return p
}

/** The radiation types, as the card draws and names them. */
export const TYPES = [
  { id: 'a', label: 'α', light: '#d9ab00', dark: '#ffd84d' },
  { id: 'bm', label: 'β−', light: '#2f6fdc', dark: '#5b9cff' },
  { id: 'bp', label: 'β+', light: '#e8730c', dark: '#ff8a3d' },
  { id: 'g', label: 'γ', light: '#0e8a96', dark: '#3fd0dc' },
  { id: 'x', label: 'X-ray', light: '#8b3fd9', dark: '#b57bff' },
  { id: 'e', label: 'Electron', light: '#6b6b6b', dark: '#a3a3a3' },
] as const

/** Where an average decay's energy goes, keV: what stays in a sample and what leaves it. */
export function budget(l: Lines, a: number) {
  const sum = <T extends unknown[]>(list: T[] | undefined, f: (x: T) => number) => (list ?? []).reduce((s, x) => s + f(x), 0)
  const alpha = sum(l.a, ([e, i]) => (e * i) / 100)
  return {
    stays: [
      { label: 'α', kev: alpha },
      { label: 'Recoil', kev: sum(l.a, ([e, i]) => (e * i * 4) / Math.max(1, a - 4) / 100) },
      { label: 'β', kev: sum(l.bm, ([m, , i]) => (m * i) / 100) + sum(l.bp, ([m, , i]) => (m * i) / 100) },
      { label: 'Electrons', kev: sum(l.e, ([e, i]) => (e * i) / 100) },
    ],
    leaves: [
      { label: 'γ', kev: sum(l.g, ([e, i]) => (e * i) / 100) },
      { label: 'X-rays', kev: sum(l.x, ([e, i]) => (e * i) / 100) },
      { label: 'Annihilation', kev: sum(l.bp, ([, , i]) => (1021.998 * i) / 100) },
      { label: 'Neutrinos', kev: sum(l.bm, ([, , i, nu]) => ((nu ?? 0) * i) / 100) + sum(l.bp, ([, , i, nu]) => ((nu ?? 0) * i) / 100) + sum(l.ec, ([e, i]) => ((e ?? 0) * i) / 100) },
    ],
  }
}
