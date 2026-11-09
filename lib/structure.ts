// The ENSDF/XUNDL structure index (brief 35, 2026-11-09), ported from the old nsr app's src/lib/structure.ts: the
// StructureIndex shape, the two colour codes (years since the ENSDF cutoff; XUNDL sets since it), their labels, and
// the mass and nuclide parsers. The data is structure-index.json on the chart CDN, built from the lake by
// scripts/viz/structure-index.mjs and read through lib/use-data.ts.
//
// The colour codes keep the old scales (twelve year buckets, six XUNDL buckets) but not the old green-to-red ramps:
// each is one hue, light to dark, validated with the dataviz skill's ordinal checks in both themes. One hue can carry
// about seven visible steps, so the age code shows its twelve buckets two years to a step.

import { fetchData, useData } from '@/lib/use-data'
export { ELEMENTS } from '@/lib/nsr-structure'

export interface NuclideEval {
  /** Element symbol as ENSDF writes it, upper case ("GD"). */
  el: string
  citation: string | null
  /** NSR key number for the citation, when it resolves to exactly one paper. */
  key?: string | null
  cutoff: string | null
  authors?: string | null
  xundl_sets: number
}

export interface MassSummary {
  a: number
  citation: string | null
  key?: string | null
  cutoff: string | null
  /** The evaluators, from the history record's AUT field. */
  authors?: string | null
  xundl_sets: number
  nuclideEvals: NuclideEval[]
}

/** One charted nuclide with its dataset census. */
export interface NuclideRow {
  code: string; z: number; n: number; a: number; el: string
  ensdf: number; xundl: number; xundlSince: number; revised: string | null; age: number
  /** The literature cutoff the nuclide's data follows: its own evaluation's, else its chain's. */
  cutoff: string | null
}

export interface StructureIndex {
  generated: string
  source: string
  masses: MassSummary[]
  /** [z, n, a, ageBucket, xundlSetCount] per known nuclide */
  grid: [number, number, number, number, number][]
  nuclides: NuclideRow[]
  /** [z, n, distinct EXFOR entries] per target nuclide */
  exfor: [number, number, number][]
}

export const STRUCTURE_FILE = 'structure-index.json'
export const loadStructure = () => fetchData<StructureIndex>(STRUCTURE_FILE)
export const useStructureIndex = () => useData<StructureIndex>(STRUCTURE_FILE)

/** One-hue ordinal ramps, light end first (dataviz skill, ordinal checks passed on #ffffff and #15120d). On the dark
 *  paper the low end sits nearest the paper, so the steps run dim to bright. */
export const RAMP6 = {
  light: ['#86b6ef', '#6d9bd3', '#5480b8', '#3c679e', '#254e84', '#0d366b'],
  dark: ['#184f95', '#3d6caa', '#6089be', '#84a6d3', '#a8c4e7', '#cde2fb'],
}
export const RAMP7 = {
  light: ['#86b6ef', '#719fd8', '#5c89c1', '#4874ab', '#345f95', '#214a80', '#0d366b'],
  dark: ['#184f95', '#3867a6', '#557fb8', '#7297c9', '#90b0d9', '#aec9ea', '#cde2fb'],
}
/** No value: a neutral the ramps don't reach, receding toward the paper. */
export const NONE = { light: '#d6d3cc', dark: '#3a3630' }

const theme = (dark: boolean) => (dark ? 'dark' : 'light')

/** Years since cutoff: bucket 0–11 from the build date (≤1y … ≥11y), 12 = no cutoff. */
export const ageLabel = (b: number) => (b >= 12 ? 'n/a' : b >= 11 ? '≥11y' : b <= 0 ? '≤1y' : `${b + 1}y`)
/** The age code's six steps, two buckets to a step: ≤2, 3–4, 5–6, 7–8, 9–10, ≥11 years. */
export const AGE_LABELS = ['≤2', '3–4', '5–6', '7–8', '9–10', '≥11']
export const ageStep = (b: number) => Math.min(5, Math.floor(Math.max(0, b) / 2))
export const ageColor = (b: number, dark: boolean) => (b >= 12 ? NONE[theme(dark)] : RAMP6[theme(dark)][ageStep(b)])

/** XUNDL sets compiled since the cutoff: 1–5, 6–10, 11–15, 16–20, 21–25, 26 and up; none outside the ramp. */
export const XUNDL_LABELS = ['1–5', '6–10', '11–15', '16–20', '21–25', '26+']
export const xundlBucket = (count: number) =>
  count <= 5 ? 0 : count <= 10 ? 1 : count <= 15 ? 2 : count <= 20 ? 3 : count <= 25 ? 4 : 5
export const xundlColor = (count: number, dark: boolean) => (count <= 0 ? NONE[theme(dark)] : RAMP6[theme(dark)][xundlBucket(count)])

/** Black or white for a label on a ramp segment, from the segment's own luminance. */
export function inkOn(hex: string) {
  const v = hex.replace('#', '')
  const ch = (i: number) => {
    const c = parseInt(v.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * ch(0) + 0.7152 * ch(2) + 0.0722 * ch(4) > 0.35 ? '#000' : '#fff'
}

/** Whole years from a cutoff to the index's build date, bucketed 0–11; 12 = no cutoff. */
export const ageBucket = (cutoff: string | null, generated: string) =>
  cutoff ? Math.max(0, Math.min(11, Math.floor((Date.parse(generated) - Date.parse(cutoff)) / 3.15576e10))) : 12

/** "137", "137Cs", "Cs-137", "cs137" → mass number (or null). */
export function parseMassQuery(q: string): number | null {
  const s = q.trim()
  if (!s) return null
  if (/^\d{1,3}$/.test(s)) return Number(s)
  const m = s.match(/^(\d{1,3})\s*-?\s*[A-Za-z]{1,2}$/) ?? s.match(/^[A-Za-z]{1,2}\s*-?\s*(\d{1,3})$/)
  return m ? Number(m[1]) : null
}

/** The NUCID ENSDF and the graph key nuclides by: "137CS"; the neutron "1NN". */
export const nucidOf = (a: number, el: string) => (el === 'n' ? '1NN' : `${a}${el.toUpperCase()}`)

/** A nuclide's datasets: brief 33's ENSDF index, which takes a nuclide or a mass as ?q= (60Ni, 60). Until that route
 *  is on main, the graph centred on the nuclide. */
export const DATASETS_ROUTE = false
export const datasetsHref = (a: number, el: string) =>
  DATASETS_ROUTE ? `/datasets/ensdf?q=${a}${el === 'n' ? 'NN' : el}` : `/graph?center=nuclide:${nucidOf(a, el)}`
/** A mass chain's datasets, on the same index; null until the route is on main. */
export const chainHref = (a: number) => (DATASETS_ROUTE ? `/datasets/ensdf?q=${a}` : null)
/** A nuclide's papers: NSR search for its name. */
export const papersHref = (a: number, el: string) => `/search?q=${encodeURIComponent(el === 'n' ? 'neutron' : `${a}${el}`)}`
