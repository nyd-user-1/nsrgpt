"use client"
// /elpis/book (brief 77): the book page reads what JANIS itself made. JANIS 4.1's own book generator (BarnBook, OFFICIAL)
// ran on a box against JANIS's packages; each page's series, order, legend text, colour, mark or stroke, axes, title and
// the selection tree's rows come from the JNS JANIS saved, and each series' values from JANIS's Tabler
// (scripts/janis/engine/). Files on the lake's CDN, gzip:
//   lake/janis/book/<p>/navigation.json        JANIS's outline (BarnBookItemNavigator.buildOutline): "By nuclide", "By MT"
//   lake/janis/book/<p>/<nuclide>/<MT>.json    one page
import { useEffect, useState } from "react"

export const JANIS_BOOK = "https://daw1qggkn69lv.cloudfront.net/lake/janis/book"

export type JanisOutline = { label: string; page: number; mat: string; reac: string; children?: JanisOutline[] }
export type JanisStroke = { width: number; dash: number[] | null; raw: string }
export type JanisMark = { shape?: string; args?: string; size?: number; raw: string }
export type JanisSeries = {
  ref: string
  kind: "exfor" | "evaluated"
  library: string | null
  /** The legend text JANIS wrote ("TENDL-2019 *", "G.Leinweber+ 2006"; empty for EXFOR past 20 sets). */
  legend: string | null
  computed: string | null
  color: string | null
  stroke: JanisStroke | null
  mark: JanisMark | null
  exfor_id?: string | null
  author?: string | null
  year?: number | null
  points?: number
  rows?: number
  columns?: string[]
  x?: (number | null)[]
  y?: (number | null)[]
  dy?: (number | null)[]
}
export type JanisSheetRow = { label: string; depth: number; ref: string | null; toggles: string[] }
export type JanisAxis = { scale: string | null; min: number | null; max: number | null; range: [string, string] }
export type JanisPage = {
  book: string
  mat: string
  nuclide: string
  mt: number
  title: string | null
  x: JanisAxis & { variable?: string }
  y: JanisAxis
  labels: Record<string, Record<string, string> | null>
  /** In JANIS's drawing order: EXFOR first (by year, then first author), then the libraries from the end of its list. */
  series: JanisSeries[]
  sheet: JanisSheetRow[]
}

const navs = new Map<string, Promise<JanisOutline | null>>()
const pages = new Map<string, Promise<JanisPage | null>>()
const get = <T,>(url: string): Promise<T | null> => fetch(url).then((r) => (r.ok ? (r.json() as Promise<T>) : null)).catch(() => null)

/** A book's outline: undefined while loading, null when missing. */
export function useJanisNav(p: string): JanisOutline | null | undefined {
  const [v, setV] = useState<JanisOutline | null | undefined>(undefined)
  useEffect(() => {
    let live = true
    if (!navs.has(p)) navs.set(p, get<JanisOutline>(`${JANIS_BOOK}/${p}/navigation.json`))
    navs.get(p)!.then((x) => { if (live) setV(x) })
    return () => { live = false }
  }, [p])
  return v
}

/** One page: undefined while loading, null when JANIS made no such page. */
export function useJanisPage(p: string, nuclide: string, mt: number): JanisPage | null | undefined {
  const key = `${p}/${nuclide}/${mt}`
  const [v, setV] = useState<{ key: string; page: JanisPage | null } | undefined>(undefined)
  useEffect(() => {
    let live = true
    if (!pages.has(key)) pages.set(key, get<JanisPage>(`${JANIS_BOOK}/${key}.json`))
    pages.get(key)!.then((x) => { if (live) setV({ key, page: x }) })
    return () => { live = false }
  }, [key])
  return v && v.key === key ? v.page : undefined
}

/** "By nuclide" from the outline: elements, each with its nuclides, each with its MT leaves, in JANIS's page order. */
export function byNuclide(o: JanisOutline | null | undefined): JanisOutline[] {
  return o?.children?.find((c) => c.label === "By nuclide")?.children ?? []
}

/** The MT of a leaf's reaction code ("MT18" -> 18). */
export const mtOf = (reac: string) => Number(reac.replace(/^MT/, ""))

const SYM = ["n", "H", "He", "Li", "Be", "B", "C", "N", "O", "F", "Ne", "Na", "Mg", "Al", "Si", "P", "S", "Cl", "Ar", "K", "Ca", "Sc", "Ti", "V", "Cr", "Mn", "Fe", "Co", "Ni", "Cu", "Zn", "Ga", "Ge", "As", "Se", "Br", "Kr", "Rb", "Sr", "Y", "Zr", "Nb", "Mo", "Tc", "Ru", "Rh", "Pd", "Ag", "Cd", "In", "Sn", "Sb", "Te", "I", "Xe", "Cs", "Ba", "La", "Ce", "Pr", "Nd", "Pm", "Sm", "Eu", "Gd", "Tb", "Dy", "Ho", "Er", "Tm", "Yb", "Lu", "Hf", "Ta", "W", "Re", "Os", "Ir", "Pt", "Au", "Hg", "Tl", "Pb", "Bi", "Po", "At", "Rn", "Fr", "Ra", "Ac", "Th", "Pa", "U", "Np", "Pu", "Am", "Cm", "Bk", "Cf", "Es", "Fm", "Md", "No", "Lr", "Rf", "Db", "Sg", "Bh", "Hs", "Mt", "Ds", "Rg", "Cn"]
/** JANIS's material code to the book's nuclide label (JANIS's own rail titles): "Fe56" -> "26-Fe-56", "Fe0" -> "26-Fe-Nat",
 *  "Am242m" -> "95-Am-242m", "n" -> "0-n-1". */
export function bookNuclide(code: string): string {
  const m = /^([A-Za-z]+?)(\d*)([mn]?)$/.exec(code)
  if (!m) return code
  if (m[1] === "n") return "0-n-1"
  const z = SYM.indexOf(m[1])
  if (z < 0) return code
  return `${z}-${m[1]}-${!m[2] || m[2] === "0" ? "Nat" : m[2]}${m[3]}`
}
/** An EXFOR subentry as the dataset pages name it: "11152.002" -> "11152002". */
export const exforDataset = (id: string) => id.split(".").slice(0, 2).join("")
