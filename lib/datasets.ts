// The five parsed datasets' pages (brief 33, Part 1). One page shape used five times, as NNDC's index pages are:
// /datasets/{source} lists records under a filter, /datasets/{source}/{id} shows one record. Each source names the API
// routes behind its list, its record, its raw text and its Markdown, in the shapes services/nsr-api/README.md gives
// ("Dataset records", brief 34). Nothing here invents a row: where a route isn't live the page shows what the API
// answered. recordView() turns a record as the API returns it into the page's header, tables, comments, references,
// raw text and the node Graph draws for it. No React.

import { apiUrl } from "@/lib/api-url"
import { compact } from "@/lib/compact"

export type SourceKey = "endf" | "ensdf" | "exfor" | "nsr" | "xundl"
/** A to Z by label: ENDF/B, ENSDF, EXFOR, NSR, XUNDL. */
export const SOURCE_KEYS: SourceKey[] = ["endf", "ensdf", "exfor", "nsr", "xundl"]
export const isSource = (s: string): s is SourceKey => (SOURCE_KEYS as string[]).includes(s)

export type Cell = string | number | boolean | null | undefined
export interface Row { id: string; href: string; cells: Record<string, Cell> }
export interface Column { key: string; label: string; mono?: boolean; num?: boolean }
export interface Filter { key: string; label: string; placeholder: string; initial: string }
export interface ListResult { rows: Row[]; total?: number; page?: number; pages?: number }
/** A record page's own query: ENDF/B's sublibrary and section (sub, mf, mt); nothing for the others. */
export type RecordQuery = Record<string, string>

export interface SourceDef {
  key: SourceKey
  label: string
  name: string
  /** What a row is, one and many. */
  noun: [string, string]
  filters: Filter[]
  columns: Column[]
  /** The API path the index reads for these filter values; null when they ask for nothing. */
  listPath(f: Record<string, string>): string | null
  readList(json: unknown, f: Record<string, string>): ListResult
  recordPath(id: string, q: RecordQuery): string
  textPath(id: string, q: RecordQuery): string
  mdPath(id: string, q: RecordQuery): string
  /** The record as a PDF from the API, where the source has one (ENSDF, XUNDL); else the page prints itself. */
  pdfPath?(id: string, q: RecordQuery): string
}

/** A short count for a heading: 2,644 reads 2.6K (lib/compact.ts). Exact figures stay in the tables. */
export function short(n: number): string {
  const f = compact(n)
  return `${f.count.toFixed(f.decimals)}${f.suffix}`
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v))
const enc = encodeURIComponent
const qs = (q: RecordQuery, keys: string[]) => {
  const p = new URLSearchParams()
  for (const k of keys) if (q[k]) p.set(k, q[k])
  const s = p.toString()
  return s ? `?${s}` : ""
}

/** "60Co", "Co-60", "co60", "60 CO" as ENSDF's NUCID "60CO"; null when it isn't a nuclide. */
export function nucidOf(s: string): string | null {
  const t = s.trim().replace(/\s+/g, "")
  const am = t.match(/^(\d{1,3})-?([A-Za-z]{1,2})$/)
  if (am) return `${Number(am[1])}${am[2].toUpperCase()}`
  const ma = t.match(/^([A-Za-z]{1,2})-?(\d{1,3})$/)
  if (ma) return `${Number(ma[2])}${ma[1].toUpperCase()}`
  return null
}
/** "60CO" as "60Co". */
export const nuclideName = (nucid: string) => nucid.trim().replace(/^(\d+)([A-Z])([A-Z]?)$/, (_, a, b, c) => `${a}${b}${c.toLowerCase()}`)

/** NSR's key number: four digits of year, then four characters (2011JA06, 1976JAZX). */
export const isNsrKey = (s: string) => /^\d{4}[A-Z]{2}[A-Z0-9]{2}$/i.test(s.trim())
/** ENSDF's yyyymm as yyyy-mm. */
const month = (v: unknown) => { const s = str(v); return /^\d{6}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4)}` : s }

/** ENSDF and XUNDL share one shape: datasets by NUCID or mass, a record by NUCID:DSID. */
function structure(key: "ensdf" | "xundl", label: string, name: string): SourceDef {
  const rec = (id: string) => `/dataset/${key}/${enc(id)}`
  return {
    key,
    label,
    name,
    noun: ["dataset", "datasets"],
    filters: [{ key: "q", label: "Nuclide or mass", placeholder: "60Co or 60", initial: "60" }],
    columns: [
      { key: "dsid", label: "Dataset" },
      { key: "nucid", label: "Nuclide", mono: true },
      { key: "type", label: "Type" },
      { key: "date", label: "Date", mono: true },
      { key: "publication", label: "Publication" },
      { key: "levels", label: "Levels", num: true },
      { key: "gammas", label: "Gammas", num: true },
      { key: "cards", label: "Cards", num: true },
    ],
    listPath: (f) => {
      const q = (f.q ?? "").trim()
      if (!q) return null
      if (/^\d{1,3}$/.test(q)) return `/dataset/${key}?mass=${q}`
      return `/dataset/${key}?nucid=${enc(nucidOf(q) ?? q.toUpperCase())}`
    },
    readList: (json) => {
      const o = obj(json)
      const rows = arr(o.rows).map((x) => {
        const r = obj(x)
        const id = str(r.id) || `${str(r.nucid)}:${str(r.dsid)}`
        return { id, href: `/datasets/${key}/${enc(id)}`, cells: { ...(r as Record<string, Cell>), dsid: str(r.dsid) || id, date: month(r.date) } }
      })
      return { rows, total: typeof o.total === "number" ? o.total : rows.length }
    },
    recordPath: (id) => rec(id),
    textPath: (id) => `${rec(id)}/text`,
    mdPath: (id) => `${rec(id)}/md`,
    pdfPath: (id) => `${rec(id)}/pdf`,
  }
}

const eV = (v: unknown) => {
  if (typeof v !== "number") return ""
  if (v >= 1e6) return `${Number((v / 1e6).toPrecision(4))} MeV`
  if (v >= 1e3) return `${Number((v / 1e3).toPrecision(4))} keV`
  return `${Number(v.toPrecision(4))} eV`
}
/** ENDF/B's id on the page is "release/MAT"; the API's routes take the two as path segments. */
const endfPath = (id: string) => `/endf/material/${id.split("/").map(enc).join("/")}`
/** An EXFOR id's entry: the first five characters of a subentry or a dataset (subentry and pointer). */
const entryOf = (id: string) => id.slice(0, 5)

export const SOURCES: Record<SourceKey, SourceDef> = {
  endf: {
    key: "endf",
    label: "ENDF/B",
    name: "Evaluated Nuclear Data File, every ENDF/B release",
    noun: ["material", "materials"],
    filters: [
      { key: "name", label: "Material", placeholder: "U-235", initial: "U-235" },
      { key: "release", label: "Release", placeholder: "All releases", initial: "" },
    ],
    columns: [
      { key: "release", label: "Release", mono: true },
      { key: "sublibrary", label: "Sublibrary" },
      { key: "mat", label: "MAT", mono: true, num: true },
      { key: "name", label: "Material", mono: true },
      { key: "lab", label: "Lab" },
      { key: "edate", label: "Evaluated", mono: true },
      { key: "authors", label: "Authors" },
      { key: "n_mf3_sections", label: "MF3 sections", num: true },
    ],
    // every release of the material at once; the release filter narrows the rows on the page
    listPath: (f) => ((f.name ?? "").trim() ? `/endf/materials?release=all&name=${enc(f.name.trim())}` : null),
    readList: (json, f) => {
      const all = arr(obj(json).rows).map((x) => {
        const r = obj(x)
        const release = str(r.release), mat = str(r.mat), sub = str(r.sublibrary)
        return { id: `${release}/${mat}`, href: `/datasets/endf/${enc(release)}/${enc(mat)}${sub ? `?sub=${enc(sub)}` : ""}`, cells: r as Record<string, Cell> }
      })
      const rows = f.release ? all.filter((r) => r.cells.release === f.release) : all
      return { rows, total: rows.length }
    },
    recordPath: (id, q) => `${endfPath(id)}${qs(q, ["sub", "mf", "mt"])}`,
    textPath: (id, q) => `${endfPath(id)}/text${qs(q, ["sub", "mf", "mt"])}`,
    mdPath: (id, q) => `${endfPath(id)}/md${qs(q, ["sub", "mf", "mt"])}`,
  },
  ensdf: structure("ensdf", "ENSDF", "Evaluated Nuclear Structure Data File"),
  exfor: {
    key: "exfor",
    label: "EXFOR",
    name: "Experimental nuclear reaction data",
    noun: ["subentry", "subentries"],
    filters: [
      { key: "target", label: "Target", placeholder: "Co-59", initial: "Co-59" },
      { key: "reaction", label: "Reaction", placeholder: "N,G", initial: "N,G" },
    ],
    columns: [
      { key: "dataset", label: "Subentry", mono: true },
      { key: "code", label: "Reaction", mono: true },
      { key: "energy", label: "Energy" },
      { key: "year", label: "Year", mono: true, num: true },
      { key: "first_author", label: "First author" },
      { key: "points", label: "Points", num: true },
    ],
    listPath: (f) => {
      const t = (f.target ?? "").trim(), r = (f.reaction ?? "").trim()
      if (!t && !r) return null
      return `/exfor/search?${t ? `target=${enc(t)}&` : ""}${r ? `reaction=${enc(r)}&` : ""}page=${Number(f.page) || 1}`
    },
    readList: (json) => {
      const o = obj(json)
      const rows = arr(o.rows).map((x) => {
        const r = obj(x)
        const lo = eV(r.energy_min_ev), hi = eV(r.energy_max_ev)
        return {
          id: str(r.dataset),
          href: `/datasets/exfor/${enc(str(r.dataset))}`,
          cells: { ...(r as Record<string, Cell>), energy: lo && hi ? (lo === hi ? lo : `${lo} to ${hi}`) : lo || hi },
        }
      })
      return { rows, total: typeof o.total === "number" ? o.total : rows.length, page: Number(o.page) || 1, pages: Number(o.pages) || 1 }
    },
    // an entry (five characters) has its route with its subentries and the X4 text; a subentry or a dataset (a subentry
    // and its pointer) has hers, with the data; the X4 text is always the entry's
    recordPath: (id) => (id.length === 5 ? `/exfor/entry/${enc(id)}` : `/exfor/subentry/${enc(id)}`),
    textPath: (id) => `/exfor/entry/${enc(entryOf(id))}/text`,
    mdPath: (id) => (id.length === 5 ? `/exfor/entry/${enc(id)}/md` : `/exfor/subentry/${enc(id)}/md`),
  },
  nsr: {
    key: "nsr",
    label: "NSR",
    name: "Nuclear Science References",
    noun: ["reference", "references"],
    filters: [{ key: "q", label: "Key or author", placeholder: "2011JA06 or Hjorth-Jensen", initial: "Hjorth-Jensen" }],
    columns: [
      { key: "key", label: "Key", mono: true },
      { key: "year", label: "Year", mono: true, num: true },
      { key: "title", label: "Title" },
    ],
    // a key number lists its one reference; anything else searches the references (authors, titles, keywords)
    listPath: (f) => {
      const q = (f.q ?? "").trim()
      if (!q) return null
      return isNsrKey(q) ? `/nsr/${enc(q.toUpperCase())}` : `/search?q=${enc(q)}&type=nsr&limit=50`
    },
    readList: (json) => {
      const o = obj(json)
      const hits = Array.isArray(o.hits) ? (o.hits as unknown[]) : o.key_number ? [{ id: o.key_number, title: o.title, year: o.year }] : []
      const rows = hits.map((x) => {
        const h = obj(x)
        const key = str(h.id ?? h.key_number)
        return { id: key, href: `/datasets/nsr/${enc(key)}`, cells: { key, year: (h.year as Cell) ?? (Number(key.slice(0, 4)) || ""), title: str(h.title) } }
      })
      return { rows, total: typeof o.total === "number" ? o.total : rows.length }
    },
    recordPath: (id) => `/nsr/${enc(id)}`,
    textPath: (id) => `/nsr/${enc(id)}/text`,
    mdPath: (id) => `/nsr/${enc(id)}/md`,
  },
  xundl: structure("xundl", "XUNDL", "Experimental Unevaluated Nuclear Data List"),
}

/* ── one record, as the page draws it ─────────────────────────────────────── */

export interface Table { name: string; columns: Column[]; rows: Cell[][]; hrefs?: (string | null)[] }
export interface Ref { key: string; text?: string }
/** A node of Graph's (brief 34): `nuclide` (id NUCID), `paper` (NSR key), `exfor` (entry), `dataset` (source:NUCID:DSID),
 *  `material` (release:MAT); on a link, `rel` is nuclide, reference, parent or subentry. */
export interface GraphRef { type: string; id: string; label: string; sub?: string; rel?: string }
export interface GraphBlock { node: GraphRef; links: GraphRef[] }
export interface RecordView {
  title: string
  sub: string
  header: { label: string; value: Cell; href?: string }[]
  /** Free text: an abstract, keywords, a material's description (`pre` keeps its columns). */
  paragraphs: { label: string; text: string; pre?: boolean }[]
  tables: Table[]
  comments: { label: string; text: string }[]
  references: Ref[]
  /** NSR's EXFOR entries. */
  exfor: string[]
  text: string | null
  /** What the raw text is: "ENSDF cards", "MF3 MT18". */
  textName: string
  graph: GraphBlock
}

const LABELS: Record<string, string> = {
  nucid: "Nuclide", dsid: "Dataset", type: "Type", date: "Date", publication: "Publication", authors: "Authors",
  citation: "Citation", cutoff: "Cutoff", release: "Release", key_number: "Key", year: "Year", reference: "Reference",
  doi: "DOI", reference_type: "Type", journal_code: "Journal", entry_date: "Entered", modification_date: "Modified",
  sublibrary: "Sublibrary", mat: "MAT", za: "ZA", zsymam: "ZSYMAM", awr: "AWR", temp_k: "Temperature (K)", alab: "Lab",
  edate: "Evaluated", auth: "Authors", ref: "Reference",
  // levels and gammas, as ENSDF names their fields
  energy: "E (keV)", unc: "ΔE", jpi: "Jπ", half_life: "T½", l: "L", s: "S", flag: "Flag", ms: "MS", band: "Band",
  comments: "Comments", from_kev: "From (keV)", to_kev: "To (keV)", ri: "Iγ", ri_unc: "ΔIγ", mult: "Mult", mr: "δ", cc: "α",
  ti: "TI", mf: "MF", mt: "MT", reaction: "Reaction", line_count: "Lines", subent: "Subentry", title: "Title",
  quantity: "Quantity", target: "Target", n_data_rows: "Points", q_minus: "Q(β−)", sn: "S(n)", sp: "S(p)", qa: "Q(α)",
  qref: "Q-value reference", lis: "LIS", liso: "LISO", nlib: "NLIB", nver: "NVER", ddate: "Distributed", rdate: "Revised",
  endate: "Entered",
}
export const labelOf = (k: string) => LABELS[k] ?? k.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())

const isScalar = (v: unknown) => v === null || ["string", "number", "boolean"].includes(typeof v)
const join = (v: unknown): Cell => (Array.isArray(v) ? v.map(str).filter(Boolean).join("; ") : (v as Cell))
const blank = (v: Cell) => v === null || v === undefined || v === ""

/** A list of objects as a table: its columns the keys its rows carry (scalars, or lists of them), in first-seen order,
 *  less `drop` and any column empty on every row. */
function tableOf(name: string, items: Record<string, unknown>[], drop: string[] = []): Table {
  const keys: string[] = []
  for (const x of items.slice(0, 50))
    for (const [k, v] of Object.entries(x)) if (!keys.includes(k) && !drop.includes(k) && (isScalar(v) || (Array.isArray(v) && v.every(isScalar)))) keys.push(k)
  const rows = items.map((x) => keys.map((k) => join(x[k])))
  const kept = keys.map((_, j) => rows.some((r) => !blank(r[j])))
  return { name, columns: keys.filter((_, j) => kept[j]).map((k) => ({ key: k, label: labelOf(k) })), rows: rows.map((r) => r.filter((_, j) => kept[j])) }
}
/** An object or a list of objects as a table; nothing when it's empty. */
function anyTable(name: string, v: unknown, drop: string[] = []): Table[] {
  const items = Array.isArray(v) ? v.map(obj).filter((x) => Object.keys(x).length) : Object.keys(obj(v)).length ? [obj(v)] : []
  return items.length ? [tableOf(name, items, drop)] : []
}

/** References as NSR keys: strings, or objects naming a key and the reference as written. */
function refsOf(v: unknown): Ref[] {
  return arr(v).map((x) => {
    if (typeof x === "string") return { key: x }
    const r = obj(x)
    return { key: str(r.key ?? r.key_number ?? r.id), text: str(r.reference ?? r.text ?? r.citation) || undefined }
  }).filter((r) => r.key)
}

/** The raw record as held: ENSDF's cards in order, EXFOR's X4, an ENDF section's lines. */
function textOf(o: Record<string, unknown>): string | null {
  for (const k of ["cards", "x4", "text"]) {
    const v = o[k]
    if (typeof v === "string" && v.trim()) return v
    if (Array.isArray(v) && v.length) return v.map((x) => (typeof x === "string" ? x : str(obj(x).line ?? obj(x).card ?? obj(x).text))).join("\n")
    const lines = obj(v).lines
    if (typeof lines === "string" && lines.trim()) return lines
    if (Array.isArray(lines) && lines.length) return lines.map(str).join("\n")
  }
  return null
}
/** The raw text a record carries, or null. */
export const rawTextOf = (json: unknown): string | null => textOf(obj(json))

const RAW_NAME: Record<SourceKey, string> = { endf: "ENDF text", ensdf: "ENSDF cards", exfor: "X4 text", nsr: "NSR exchange format", xundl: "XUNDL cards" }

/** The record's own graph block when it has one, else what the page can tell from the record. */
function graphOf(o: Record<string, unknown>, fallback: GraphBlock): GraphBlock {
  const g = obj(o.graph)
  const node = obj(g.node)
  const ref = (x: unknown): GraphRef | null => {
    const r = obj(x)
    return r.type && r.id ? { type: str(r.type), id: str(r.id), label: str(r.label) || str(r.id), sub: str(r.sub) || undefined, rel: str(r.rel) || undefined } : null
  }
  return {
    node: ref(node) ?? fallback.node,
    links: Array.isArray(g.links) ? g.links.map(ref).filter((x): x is GraphRef => !!x) : fallback.links,
  }
}

const nuclideLink = (nucid: string): GraphRef[] => (nucid ? [{ type: "nuclide", id: nucid.replace(/\s+/g, "").toUpperCase(), label: nuclideName(nucid.replace(/\s+/g, "").toUpperCase()), rel: "nuclide" }] : [])
const refLinks = (refs: Ref[]): GraphRef[] => refs.map((r) => ({ type: "paper", id: r.key, label: r.key, rel: "reference" }))

/** The page's view of a record, from the API's JSON. `q` is the page's query (ENDF/B's section). */
export function recordView(source: SourceKey, id: string, json: unknown, q: RecordQuery = {}): RecordView {
  const o = obj(json)
  if (source === "nsr") return nsrView(id, o)
  if (source === "exfor") return exforView(id, o)
  if (source === "endf") return endfView(id, o, q)
  return structureView(source, id, o)
}

/** An ENSDF comment as read: the field code before its "$" set apart ("MOMM1$From …" reads "MOMM1: From …"), the card's
 *  line breaks closed up. */
const tidyComment = (c: string) => c.replace(/^([A-Z0-9 ()+,.-]{1,16})\$/, "$1: ").replace(/\s*\n\s*/g, " ").trim()

/** ENSDF and XUNDL: the header, the Q-values, the levels and gammas, the other records, the comments, the references. */
function structureView(source: "ensdf" | "xundl", id: string, o: Record<string, unknown>): RecordView {
  const h = obj(o.header)
  const nucid = str(h.nucid) || id.split(":")[0]
  const header: RecordView["header"] = []
  const add = (label: string, v: unknown) => { const j = join(v); if (!blank(j)) header.push({ label, value: j }) }
  add("Nuclide", nuclideName(nucid))
  add("Dataset", h.dsid ?? id.split(":").slice(1).join(":"))
  add("Type", h.type)
  add("Date", month(h.date))
  add("Publication", h.publication)
  add("Authors", h.authors)
  add("Citation", h.citation)
  add("Cutoff", h.cutoff)
  add("Release", o.release)
  const qv = obj(o.qvalue)
  for (const [k, v] of Object.entries(qv)) {
    if (k.endsWith("_unc") || k.endsWith("_raw") || k === "qref" || blank(v as Cell)) continue
    const unc = qv[`${k}_unc`]
    add(labelOf(k), `${str(v)}${blank(unc as Cell) ? "" : ` ± ${str(unc)}`} keV`)
  }
  add("Q-value reference", qv.qref)
  const other = obj(o.other)
  const tidied = (v: unknown) => arr(v).map(obj).map((x) => (Array.isArray(x.comments) ? { ...x, comments: x.comments.map((c) => tidyComment(str(c))) } : x))
  const tables: Table[] = [
    ...anyTable("Levels", tidied(o.levels), ["seq", "energy_kev"]),
    ...anyTable("Gammas", tidied(o.gammas), ["level_seq", "energy_kev"]).map((t) => ({ ...t, columns: t.columns.map((c) => (c.key === "energy" ? { ...c, label: "Eγ (keV)" } : c)) })),
    ...anyTable("Parents", o.parents),
    ...anyTable("Normalization", o.normalization),
    ...anyTable("Betas", other.betas),
    ...anyTable("Electron capture", other.ec),
    ...anyTable("Alphas", other.alphas),
    ...anyTable("Delayed particles", other.delayed),
    ...anyTable("Cross-references", other.xrefs),
    ...anyTable("Other records", other.records),
    ...anyTable("History", h.history),
  ].map((t) => ({ ...t, columns: t.columns.map((c) => ({ ...c, mono: c.key !== "comments" && c.key !== "Comments" })) }))
  const comments = arr(o.comments).map(obj).filter((c) => str(c.text)).map((c) => ({ label: [str(c.rtype), str(c.type)].filter(Boolean).join(" "), text: tidyComment(str(c.text)) }))
  const references = refsOf(o.references)
  const dsid = str(h.dsid) || id.split(":").slice(1).join(":")
  const sub = [nuclideName(nucid), str(h.type), month(h.date)].filter(Boolean).join(" · ")
  const fallback: GraphBlock = {
    node: { type: "dataset", id: `${source}:${id}`, label: dsid || id, sub: `${SOURCES[source].label}${sub ? ` · ${sub}` : ""}` },
    links: [...nuclideLink(nucid), ...refLinks(references)],
  }
  return { title: dsid || id, sub, header, paragraphs: [], tables, comments, references, exfor: [], text: textOf(o), textName: RAW_NAME[source], graph: graphOf(o, fallback) }
}

/** ENDF/B's material (/endf/material/{release}/{mat}): its MF1 MT451 fields and description, its sections (each opens its
 *  text on this page), and the lines of the section asked for. */
function endfView(id: string, o: Record<string, unknown>, q: RecordQuery): RecordView {
  const m = obj(o.material)
  const [release, mat] = [str(o.release) || id.split("/")[0], str(o.mat) || id.split("/")[1]]
  // the route names the sublibrary by its folder ("neutrons-version.VIII.1"); its query takes the short name
  const sublibrary = q.sub || str(o.sublibrary).replace(/-version.*$/, "") || "neutrons"
  const header: RecordView["header"] = []
  const add = (label: string, v: unknown) => { const j = join(v); if (!blank(j)) header.push({ label, value: j }) }
  add("Release", release)
  add("Sublibrary", sublibrary)
  add("MAT", mat)
  for (const [k, v] of Object.entries(m)) if (k !== "description" && k !== "hsub" && isScalar(v)) add(labelOf(k), v)
  const sections = arr(o.sections).map(obj)
  const tables: Table[] = sections.length
    ? [{
        name: "Sections",
        columns: [{ key: "s", label: "Section", mono: true }, { key: "reaction", label: "Reaction" }, { key: "line_count", label: "Lines", num: true }],
        rows: sections.map((s) => [`MF${str(s.mf)} MT${str(s.mt)}`, str(s.reaction), s.line_count as Cell]),
        hrefs: sections.map((s) => `/datasets/endf/${enc(release)}/${enc(mat)}?sub=${enc(sublibrary)}&mf=${str(s.mf)}&mt=${str(s.mt)}`),
      }]
    : []
  const t = obj(o.text)
  const name = str(o.name) || str(m.zsymam).replace(/\s+/g, "") || `MAT ${mat}`
  const fallback: GraphBlock = { node: { type: "material", id: `${release}:${mat}`, label: name, sub: `ENDF/B · ${release} · MAT ${mat}` }, links: [] }
  const graph = graphOf(o, fallback)
  return {
    title: graph.node.label || name,
    sub: `${release} · MAT ${mat} · ${sublibrary}`,
    header,
    paragraphs: [
      ...(m.hsub ? [{ label: "Heading", text: str(m.hsub), pre: true }] : []),
      ...(m.description ? [{ label: "Description", text: str(m.description), pre: true }] : []),
    ],
    tables,
    comments: [],
    references: [],
    exfor: [],
    text: textOf(o),
    textName: `MF${str(t.mf) || q.mf || "1"} MT${str(t.mt) || q.mt || "451"}`,
    graph,
  }
}

/** NSR's record (/nsr/{key}): the reference, its keywords as written, its nuclides, reactions and EXFOR entries. */
function nsrView(id: string, o: Record<string, unknown>): RecordView {
  const key = str(o.key_number) || id
  const header: RecordView["header"] = (["key_number", "year", "reference", "authors", "doi", "reference_type", "journal_code", "entry_date", "modification_date"] as const)
    .filter((k) => !blank(o[k] as Cell))
    .map((k) => ({ label: labelOf(k), value: o[k] as Cell, href: k === "doi" ? `https://doi.org/${str(o[k])}` : undefined }))
  const list = (v: unknown) => str(v).replace(/^\{|\}$/g, "").split(/[,;]\s*/).map((s) => s.trim()).filter(Boolean)
  const paragraphs: RecordView["paragraphs"] = []
  if (o.abstract) paragraphs.push({ label: "Abstract", text: str(o.abstract) })
  if (o.keywords) paragraphs.push({ label: "Keywords", text: str(o.keywords) })
  if (list(o.nuclides).length) paragraphs.push({ label: "Nuclides", text: list(o.nuclides).join(", ") })
  if (list(o.reactions).length) paragraphs.push({ label: "Reactions", text: list(o.reactions).join(", ") })
  const exfor = list(o.exfor_keys)
  const fallback: GraphBlock = {
    node: { type: "paper", id: key, label: key, sub: str(o.title) || undefined },
    links: exfor.map((e) => ({ type: "exfor", id: e, label: e, rel: "reference" })),
  }
  return { title: str(o.title) || key, sub: [key, str(o.reference)].filter(Boolean).join(" · "), header, paragraphs, tables: [], comments: [], references: refsOf(o.references), exfor, text: textOf(o), textName: RAW_NAME.nsr, graph: graphOf(o, fallback) }
}

/** EXFOR's entry (/exfor/entry/{id}: the entry, its subentries, its X4 text) or subentry (/exfor/subentry/{id}: the
 *  reaction, the data columns with their units, the common values, the bibliography by keyword). */
function exforView(id: string, o: Record<string, unknown>): RecordView {
  const entry = obj(o.entry), sub = obj(o.subentry)
  const ds = obj(arr(o.datasets)[0])
  const isEntry = id.length === 5
  const header: RecordView["header"] = []
  const add = (label: string, v: unknown, href?: string) => { const j = join(v); if (!blank(j)) header.push({ label, value: j, href }) }
  const entryNo = str(entry.entry) || entryOf(id)
  add("Entry", entryNo, isEntry ? undefined : `/datasets/exfor/${enc(entryNo)}`)
  if (!isEntry) add("Subentry", sub.subent ?? id)
  add("Authors", entry.authors)
  add("Year", entry.year)
  add("Institute", entry.institutes ?? entry.institute)
  add("Reference", entry.references)
  add("Reaction", sub.reaction ?? ds.code)
  add("Points", sub.n_data_rows ?? ds.points)
  add("Subentries", entry.n_subentries)
  add("Date", sub.date ?? entry.date)
  add("X4 source", o.x4_source)
  const tables: Table[] = []
  const subs = arr(o.subentries).map(obj)
  if (subs.length) tables.push({ ...tableOf("Subentries", subs), hrefs: subs.map((s) => (s.subent ? `/datasets/exfor/${enc(str(s.subent))}` : null)) })
  const cols = arr(o.columns).map(obj)
  if (cols.length && Array.isArray(o.rows)) {
    tables.push({
      name: "Data",
      columns: cols.map((c, i) => ({ key: String(i), label: `${str(c.name)}${c.unit ? ` (${str(c.unit)})` : ""}`, mono: true, num: true })),
      rows: (o.rows as unknown[]).map((r) => arr(r) as Cell[]),
    })
  }
  const common = arr(o.common).map(obj)
  if (common.length) tables.push({ name: "Common", columns: [{ key: "n", label: "Quantity", mono: true }, { key: "u", label: "Unit", mono: true }, { key: "v", label: "Value", mono: true, num: true }], rows: common.map((c) => [str(c.name), str(c.unit), (c.value ?? c.value_text) as Cell]) })
  const bib = (b: unknown) => Object.entries(obj(b)).flatMap(([kw, items]) => arr(items).map(obj).map((it) => [kw, str(obj(it.coded_information).code), arr(it.free_text).map(str).filter(Boolean).join(" ")] as Cell[]))
  const bibRows = [...bib(o.entry_bib), ...bib(o.bib)]
  if (bibRows.length) tables.push({ name: "Bibliography", columns: [{ key: "k", label: "Keyword", mono: true }, { key: "c", label: "Code", mono: true }, { key: "t", label: "Text" }], rows: bibRows })
  const title = str(entry.title) || str(arr(obj(arr(obj(o.entry_bib).TITLE)[0]).free_text)[0]) || `EXFOR ${id}`
  const references = refsOf(o.references ?? o.papers)
  const fallback: GraphBlock = {
    node: { type: "exfor", id: entryNo, label: entryNo, sub: title },
    links: refLinks(references),
  }
  return {
    title,
    sub: [`EXFOR ${id}`, str(join(sub.reaction) ?? "") || str(ds.code)].filter(Boolean).join(" · "),
    header, paragraphs: [], tables, comments: [], references, exfor: [], text: textOf(o), textName: RAW_NAME.exfor, graph: graphOf(o, fallback),
  }
}

/** The Graph node a record page opens when the record itself didn't load: the same ids the API's graph block uses. */
export function graphNodeOf(source: SourceKey, id: string): GraphRef {
  if (source === "endf") return { type: "material", id: id.replace("/", ":"), label: id }
  if (source === "nsr") return { type: "paper", id, label: id }
  if (source === "exfor") return { type: "exfor", id: entryOf(id), label: entryOf(id) }
  return { type: "dataset", id: `${source}:${id}`, label: id }
}

/** A dataset or material node's page and API record: dataset ids are source:NUCID:DSID, material ids release:MAT. */
export function recordOfNode(type: string, id: string): { source: SourceKey; id: string; href: string } | null {
  if (type === "dataset") {
    const i = id.indexOf(":")
    const source = id.slice(0, i), rid = id.slice(i + 1)
    return isSource(source) && rid ? { source, id: rid, href: `/datasets/${source}/${enc(rid)}` } : null
  }
  if (type === "material") {
    const [release, mat] = [id.slice(0, id.lastIndexOf(":")), id.slice(id.lastIndexOf(":") + 1)]
    return release && mat ? { source: "endf", id: `${release}/${mat}`, href: `/datasets/endf/${enc(release)}/${enc(mat)}` } : null
  }
  return null
}

/** A record's levels for Graph's "+ levels": energy as written, Jπ and half-life. */
export function levelsOf(json: unknown): { seq: string; energy: string; jpi: string; halfLife: string }[] {
  return arr(obj(json).levels).map(obj).map((l, i) => ({ seq: str(l.seq) || String(i), energy: str(l.energy) || str(l.energy_kev), jpi: str(l.jpi), halfLife: str(l.half_life) }))
}

/* ── the API, read plainly ────────────────────────────────────────────────── */

/** What the API answered when it didn't answer with data: the route, its status and its own words. */
export class ApiError extends Error {
  path: string
  status: number
  detail: string
  constructor(path: string, status: number, detail: string) {
    super(`${status} ${detail}`)
    this.path = path
    this.status = status
    this.detail = detail
  }
}

async function get(path: string): Promise<{ r: Response; body: string }> {
  let r: Response
  try {
    r = await fetch(apiUrl(path))
  } catch (e) {
    throw new ApiError(path, 0, (e as Error).message || "The API didn't answer.")
  }
  const body = await r.text()
  if (!r.ok) {
    let detail = body
    try { detail = str(obj(JSON.parse(body)).error) || body } catch { /* not JSON: the body as sent */ }
    throw new ApiError(path, r.status, detail.slice(0, 600) || r.statusText)
  }
  return { r, body }
}

/** GET a route of the API as JSON; anything but a 2xx becomes an ApiError carrying the API's message. */
export async function apiJson(path: string): Promise<unknown> {
  const { r, body } = await get(path)
  try {
    return JSON.parse(body)
  } catch {
    throw new ApiError(path, r.status, "The API answered with something other than JSON.")
  }
}

/** GET a route as bytes (a PDF). */
export async function apiBlob(path: string): Promise<Blob> {
  let r: Response
  try {
    r = await fetch(apiUrl(path))
  } catch (e) {
    throw new ApiError(path, 0, (e as Error).message || "The API didn't answer.")
  }
  if (!r.ok) {
    const body = await r.text()
    let detail = body
    try { detail = str(obj(JSON.parse(body)).error) || body } catch { /* plain text */ }
    throw new ApiError(path, r.status, detail.slice(0, 600) || r.statusText)
  }
  return r.blob()
}

/** GET a route as text (the raw record, the Markdown). */
export async function apiText(path: string): Promise<string> {
  return (await get(path)).body
}

/** A record id as a file name: ENSDF's "60CO:ADOPTED LEVELS, GAMMAS" becomes "ensdf-60CO-ADOPTED-LEVELS-GAMMAS". */
export const fileBase = (source: SourceKey, id: string, q: RecordQuery = {}) =>
  `${source}-${id.replace(/[^A-Za-z0-9.+-]+/g, "-").replace(/^-+|-+$/g, "")}${q.mf ? `-MF${q.mf}` : ""}${q.mt ? `-MT${q.mt}` : ""}`

/** The id from the route's segments: Next may hand them over encoded; ENDF/B's release and MAT are two of them. */
export function idFromSegments(seg: string | string[] | undefined): string {
  const parts = Array.isArray(seg) ? seg : seg ? [seg] : []
  return parts.map((p) => { try { return decodeURIComponent(p) } catch { return p } }).join("/")
}
