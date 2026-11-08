// The chart of nuclides' data (2026-11-08): the IAEA Live Chart ground states (livechart-ground.json: half-life, modes,
// Q-values, separation energies, binding, mass excess, radius, abundance, moments, spin and parity) indexed by (Z, N),
// and the decay radiation slices (radiation/<z>.json) the card's "major radiations" read, one request per element.

import { fetchData } from '@/lib/use-data'
import { keyOf } from '@/lib/nuclide'

export type GroundRow = {
  z: number; n: number
  /** Half-life, s; null stable. */
  t: number | null
  mode: string | null; pct: number | null
  qa: number | null; qbm: number | null; qbmn: number | null; qec: number | null
  sn: number | null; sp: number | null
  /** Binding energy per nucleon, keV. */
  ba: number | null
  /** Mass excess, keV. */
  me: number | null
  radius: number | null; abundance: number | null; mu: number | null; q: number | null
  j: number | null; parity: number | null
}
type GroundFile = { source: string; els: string[]; cols: string[]; rows: (number | string | null)[][] }
export type Ground = { source: string; els: string[]; rows: GroundRow[]; index: Map<number, GroundRow> }

function parseGround(f: GroundFile): Ground {
  const rows = f.rows.map((r) => Object.fromEntries(f.cols.map((c, i) => [c, r[i]])) as unknown as GroundRow)
  return { source: f.source, els: f.els, rows, index: new Map(rows.map((r) => [keyOf(r.z, r.n), r])) }
}
export const loadGround = () => fetchData<Ground, GroundFile>('livechart-ground.json', parseGround)

/** One element's decay radiation: per nuclide, lines by type ([keV, % per decay, note?]). */
export type Radiation = { z: number; el: string; nuclides: { n: number; t: number | null; lines: Record<string, (number | string)[][]> }[] }
export const loadRadiation = (z: number) => fetchData<Radiation>(`radiation/${z}.json`)

export const RADIATION_LABEL: Record<string, string> = { a: 'α', bm: 'β−', bp: 'β+', g: 'γ', e: 'e−', x: 'X', n: 'n', p: 'p' }

/** "5/2-", "0+", "1-": the ground state's spin and parity as the Live Chart writes them. */
export function jpi(r: GroundRow | undefined): string {
  if (!r || r.j === null) return '—'
  const j = Number.isInteger(r.j) ? String(r.j) : `${Math.round(r.j * 2)}/2`
  return `${j}${r.parity === null ? '' : r.parity < 0 ? '-' : '+'}`
}

/** Atomic mass in μu from the mass excess: m = A·u + Δ, with u = 931,494.10242 keV. */
export function massMicroU(a: number, me: number | null): number | null {
  return me === null ? null : (a + me / 931494.10242) * 1e6
}

export const ELEMENT_NAMES = ['neutron', 'Hydrogen', 'Helium', 'Lithium', 'Beryllium', 'Boron', 'Carbon', 'Nitrogen', 'Oxygen', 'Fluorine', 'Neon', 'Sodium', 'Magnesium', 'Aluminium', 'Silicon', 'Phosphorus', 'Sulfur', 'Chlorine', 'Argon', 'Potassium', 'Calcium', 'Scandium', 'Titanium', 'Vanadium', 'Chromium', 'Manganese', 'Iron', 'Cobalt', 'Nickel', 'Copper', 'Zinc', 'Gallium', 'Germanium', 'Arsenic', 'Selenium', 'Bromine', 'Krypton', 'Rubidium', 'Strontium', 'Yttrium', 'Zirconium', 'Niobium', 'Molybdenum', 'Technetium', 'Ruthenium', 'Rhodium', 'Palladium', 'Silver', 'Cadmium', 'Indium', 'Tin', 'Antimony', 'Tellurium', 'Iodine', 'Xenon', 'Caesium', 'Barium', 'Lanthanum', 'Cerium', 'Praseodymium', 'Neodymium', 'Promethium', 'Samarium', 'Europium', 'Gadolinium', 'Terbium', 'Dysprosium', 'Holmium', 'Erbium', 'Thulium', 'Ytterbium', 'Lutetium', 'Hafnium', 'Tantalum', 'Tungsten', 'Rhenium', 'Osmium', 'Iridium', 'Platinum', 'Gold', 'Mercury', 'Thallium', 'Lead', 'Bismuth', 'Polonium', 'Astatine', 'Radon', 'Francium', 'Radium', 'Actinium', 'Thorium', 'Protactinium', 'Uranium', 'Neptunium', 'Plutonium', 'Americium', 'Curium', 'Berkelium', 'Californium', 'Einsteinium', 'Fermium', 'Mendelevium', 'Nobelium', 'Lawrencium', 'Rutherfordium', 'Dubnium', 'Seaborgium', 'Bohrium', 'Hassium', 'Meitnerium', 'Darmstadtium', 'Roentgenium', 'Copernicium', 'Nihonium', 'Flerovium', 'Moscovium', 'Livermorium', 'Tennessine', 'Oganesson']
