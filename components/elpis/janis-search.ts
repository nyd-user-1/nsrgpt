"use client"
// /elpis/search (brief 77 step 11): every form runs JANIS's own search over JANIS's own database index (Lambda nsr-janis,
// GET /janis/search?type=&p=…, the `janis -search` parameters: CommandLineParserSearchParameters and each search type's
// fromCommandLine). The rows and column headers are JANIS's table export; each row's JANIS reference (where the result
// carries one) opens what it plots.
import { apiUrl } from "@/lib/api-url"
import { bookNuclide } from "@/components/elpis/use-janis-page"

export type Values = Record<string, string | string[]>
export type JanisResult = { type: string; bases: string[]; total: number; columns: string[]; rows: string[][]; refs: string[]; error?: string }

const str = (v: Values, k: string) => { const x = v[k]; return (Array.isArray(x) ? x[0] : x ?? "").trim() }
const list = (v: Values, k: string) => { const x = v[k]; return (Array.isArray(x) ? x : x ? [x] : []).map((s) => s.trim()).filter(Boolean) }
/** JANIS's base names to its datatype codes (`janis -help`, REFERENCES SYNTAX). */
export const DATATYPE: Record<string, string> = {
  "Radioactive data": "RDD", "Incident neutron data": "N", "Incident gamma data": "G", "Incident proton data": "P", "Incident deuteron data": "D",
  "Incident triton data": "T", "Incident He3 data": "HE3", "Incident alpha data": "A",
}
const HALF_S: Record<string, number> = { "0 milliseconds": 0, "1 minute": 60, "1 hour": 3600, "1 day": 86400, "10 days": 864000, "100 days": 8640000, "10 years": 3.15576e8, "1e4 years": 3.15576e11 }

function target(v: Values, k: string, prefix = ""): string[] {
  const out: string[] = []
  const z = str(v, `${k}.z`), a = str(v, `${k}.a`), s = str(v, `${k}.state`)
  if (z) out.push(`${prefix}z=${z}`)
  if (a) out.push(`${prefix}a=${a === "0" ? "Nat" : a}`)
  if (s) out.push(`${prefix}state=${s}`)
  return out
}
/** A range field (min to max, or value ± delta) as JANIS's `<p>>min` and `<p><max`. */
function range(v: Values, k: string, p: string, scale = 1): string[] {
  const mode = str(v, `${k}.mode`) || "range"
  const n = (s: string) => (s === "" ? undefined : Number(s) * scale)
  let lo: number | undefined, hi: number | undefined
  if (mode === "value") {
    const c = n(str(v, `${k}.value`)), d = n(str(v, `${k}.delta`)) ?? 0
    if (c !== undefined) { lo = c - d; hi = c + d }
  } else {
    lo = n(str(v, `${k}.min`)); hi = n(str(v, `${k}.max`))
  }
  return [...(lo !== undefined && Number.isFinite(lo) ? [`${p}>${lo}`] : []), ...(hi !== undefined && Number.isFinite(hi) ? [`${p}<${hi}`] : [])]
}
const set = (name: string, xs: string[]) => (xs.length ? [`${name}=${xs.join(",")}`] : [])
const one = (name: string, x: string) => (x ? [`${name}=${x}`] : [])

/** Each form's fields as JANIS's search parameters. */
export function janisParams(form: string, v: Values): { type: string; params: string[] } {
  switch (form) {
    case "endf":
      return { type: "endf", params: [...set("inc", list(v, "particle").map((b) => DATATYPE[b] ?? b)), ...set("lib", list(v, "library")), ...target(v, "target"), ...one("mf", str(v, "mf")), ...one("mt", str(v, "mt"))] }
    case "exfor": {
      const from = str(v, "reference.from"), to = str(v, "reference.to")
      const pmin = str(v, "points.min"), pmax = str(v, "points.max")
      return {
        type: "exfor",
        params: [
          ...target(v, "target"), ...one("q", str(v, "quantity.a")), ...one("qd", str(v, "quantity.b")), ...one("inc", str(v, "reaction.a")), ...one("reac", str(v, "reaction.b")),
          ...target(v, "product", "product_"), ...range(v, "energy", "e"), ...one("acc", str(v, "subentry.acc")), ...one("subacc", str(v, "subentry.sub")),
          ...one("title", str(v, "title")), ...one("author", str(v, "author.name")), ...(str(v, "author.first") ? ["1st_author=true"] : []),
          ...one("type", str(v, "reference.type")), ...(str(v, "reference.main") ? ["main=true"] : []), ...one("code", str(v, "reference.code")),
          ...(from || to ? [`date=${from}-${to}`] : []), ...one("area", str(v, "institute.area")), ...one("country", str(v, "institute.country")), ...one("lab", str(v, "institute.lab")),
          ...(pmin || pmax ? [`nb_pts=${pmin}-${pmax}`] : []),
        ],
      }
    }
    case "cinda": {
      const io = str(v, "quantity.b").split(",").map((s) => s.trim())
      const from = str(v, "reference.from"), to = str(v, "reference.to")
      return {
        type: "cinda",
        params: [
          ...target(v, "target"), ...one("q", str(v, "quantity.a")), ...one("inc", io[0] ?? ""), ...one("out", io[1] ?? ""), ...range(v, "energy", "e"),
          ...one("comments", str(v, "author")), ...one("type", str(v, "reference.type")), ...(str(v, "reference.main") ? ["main=true"] : []), ...one("code", str(v, "reference.code")),
          ...(from || to ? [`date=${from}-${to}`] : []), ...one("area", str(v, "institute.area")), ...one("country", str(v, "institute.country")), ...one("lab", str(v, "institute.lab")),
        ],
      }
    }
    case "resonances":
      return { type: "resonances", params: [...set("lib", list(v, "library")), ...target(v, "target"), ...range(v, "energy", "e")] }
    case "decay": {
      const t = str(v, "type")
      const lo = HALF_S[str(v, "halflife.from")], hi = HALF_S[str(v, "halflife.to")]
      return {
        type: "decay",
        params: [t === "Alpha lines" ? "alpha" : t === "Photon lines" ? "photons" : "all", ...set("lib", list(v, "library")), ...target(v, "target"),
          ...(lo ? [`hl>${lo}`] : []), ...(hi !== undefined ? [`hl<${hi}`] : []), ...range(v, "energy", "e"), ...range(v, "intensity", "i", 0.01)],
      }
    }
    case "covariances":
      return {
        type: "covariances",
        params: [...one("fmt", str(v, "format") || "ENDF"), ...set("inc", list(v, "particle").map((b) => DATATYPE[b] ?? b)), ...set("lib", list(v, "library")),
          ...target(v, "target", "mat1_"), ...one("mt1", str(v, "mt")), ...target(v, "target2", "mat2_"), ...one("mt2", str(v, "mt2"))],
      }
  }
  return { type: form, params: [] }
}

export async function janisSearch(form: string, v: Values): Promise<JanisResult> {
  const { type, params } = janisParams(form, v)
  const q = new URLSearchParams([["type", type], ...params.map((p) => ["p", p] as [string, string])])
  const r = await fetch(apiUrl(`/janis/search?${q}`))
  const j = (await r.json().catch(() => ({}))) as JanisResult
  if (!r.ok || j.error) throw new Error(j.error ?? `JANIS's search answered ${r.status}`)
  return j
}

const BOOK_OF: Record<string, string> = { N: "n", G: "g", P: "p", D: "d", T: "t", HE3: "h", A: "a" }
/** Where a result's JANIS reference plots: an EXFOR subentry's page, or a cross section's book page. */
export function plotHref(ref: string): string | null {
  const p = ref.split("~")
  const x4 = /X4_([0-9A-Z]{5})\.?([0-9]{3})/.exec(ref)
  if (x4) return `/datasets/exfor/${x4[1]}${x4[2]}`
  const [, dt, , cat, mat, block] = p
  const mt = /^MT(\d+)$/.exec(block ?? "")?.[1]
  if (dt && BOOK_OF[dt] && cat === "SIG" && mat && mt) return `/elpis/book/${BOOK_OF[dt]}/${bookNuclide(mat)}/${mt}`
  return null
}

const BOOK_OF_BASE: Record<string, string> = { "Incident neutron data": "n", "Incident gamma data": "g", "Incident proton data": "p", "Incident deuteron data": "d", "Incident triton data": "t", "Incident He3 data": "h", "Incident alpha data": "a" }
/** Where a result row plots when its result carries no reference (JANIS's ENDF rows): an MF 3 row of a book's particle
 *  opens that cross section's book page. */
export function rowHref(columns: string[], row: string[]): string | null {
  const at = (name: string) => row[columns.indexOf(name)] ?? ""
  const book = BOOK_OF_BASE[at("Incident particle")]
  const mf = /(\d+)/.exec(at("MF"))?.[1], mt = /(\d+)/.exec(at("MT"))?.[1], mat = at("Material")
  return book && mf === "3" && mt && mat ? `/elpis/book/${book}/${bookNuclide(mat)}/${mt}` : null
}
