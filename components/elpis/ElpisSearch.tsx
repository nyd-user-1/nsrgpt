"use client"
// /elpis/search/{endf|exfor|cinda|resonances|decay|covariances} (briefs 67, 69): JANIS Web's six search forms in their
// shape and order (oecd-nea.org/janisweb/search/*, read 2026-11-10): each group a bold label over its fields, Search and
// Reset beneath, then the results under JANIS's own column headers. An option JANIS has and I do not carries ❌; one I
// have and JANIS does not, ✅; a field the search cannot honour carries ❌ after its label (search-forms.ts `off`).
//
// Brief 69's wiring, decided here (the API through lib/api-url.ts, as the Lab fetches):
// - EXFOR: /exfor/search (target, reaction, quantity, product, energy, accession, author, laboratory, years), 100 rows a
//   page; the number of points filters the page's rows. A row opens the subentry's page.
// - ENDF and Covariances: /endf/materials for the target (every release), then each material's section list
//   (/endf/material/<release>/<mat>), filtered by particle, library, MF and MT (Covariances: MF 31 to 35). A target is
//   needed: without one I list materials, not sections. A row opens the section on the material's page; an MF 3 row
//   of a book's particle opens the book too.
// - CINDA: /cinda (target, quantity, reaction, energy, author, laboratory, years), 100 rows a page.
// - Resonances and Decay lines: /endf/resonances and /endf/decay for the target in each library chosen (every held one
//   when none is), filtered here by energy, type, half-life and intensity.
// A URL's query fills the form and searches at once (the book's "Additional EXFOR" and "Additional ENDF", browse's
// EXFOR rows): target=B-11 (C-0 natural, Am-242-M isomer), reaction=N,A, quantity=SIG, projectile=N|n, mt=107.
import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { RotateCcw, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SERIF } from "@/app/(site)/(plate)/viz/box-style"
import { LINE, LINK, Mark, SEARCHES, TINT } from "@/components/elpis/parts"
import { cn } from "@/lib/utils"
import { apiUrl } from "@/lib/api-url"
import { energyLabel } from "@/lib/lab/canvases/plot"
import { symbolOfZ } from "@/lib/janis-tree"
import { libraryName } from "@/lib/elpis"
import { FORMS, type Group } from "@/components/elpis/search-forms"

const SELECT = "h-10 w-full rounded-md border border-[var(--paper-rule)] bg-[var(--paper)] px-2 text-sm text-[var(--paper-text)]"
const SMALL = "text-xs text-[var(--paper-muted)]"
const HALF_MIN = ["0 milliseconds", "1 minute", "1 hour", "1 day", "10 days", "100 days", "10 years", "1e4 years"]
const HALF_MAX = ["1 minute", "1 hour", "1 day", "10 days", "100 days", "10 years", "1e4 years", "infinity"]
const HALF_S: Record<string, number> = { "0 milliseconds": 0, "1 minute": 60, "1 hour": 3600, "1 day": 86400, "10 days": 864000, "100 days": 8640000, "10 years": 3.15576e8, "1e4 years": 3.15576e11, infinity: Infinity }
/** The releases the lake holds, in the order a search asks them. */
const HELD = ["B-VIII.1", "B-VIII.0", "B-VII.1", "B-VII.0", "B-VI.8", "JEFF-3.3", "JENDL-5", "TENDL-2023", "CENDL-3.2"]
/** JANIS's bases to the API's sublibraries. */
const SUB_OF: Record<string, string> = { "Radioactive data": "decay", "Incident neutron data": "neutrons", "Incident gamma data": "gammas", "Incident proton data": "protons", "Incident deuteron data": "deuterons", "Incident triton data": "tritons", "Incident He3 data": "helium3s", "Incident alpha data": "alphas" }
const BASE_OF = Object.fromEntries(Object.entries(SUB_OF).map(([k, v]) => [v, k]))
const BOOK_OF_SUB: Record<string, string> = { neutrons: "n", gammas: "g", protons: "p", deuterons: "d", tritons: "t", helium3s: "h", alphas: "a" }
const SUB_OF_PROJ: Record<string, string> = { N: "neutrons", G: "gammas", P: "protons", D: "deuterons", T: "tritons", HE3: "helium3s", A: "alphas", n: "neutrons", g: "gammas", p: "protons", d: "deuterons", t: "tritons", h: "helium3s", a: "alphas" }
const REF_TYPE: Record<string, string> = { J: "Journal", R: "Report", C: "Conference", T: "Thesis", B: "Book", P: "Private communication", W: "Private communication", S: "Conference", X: "Preprint", A: "Abstract" }
/** ENDF-6 decay radiation types (STYP). */
const STYP: Record<number, string> = { 0: "γ", 1: "β−", 2: "β+/EC", 4: "α", 5: "n", 6: "SF", 7: "p", 8: "e−", 9: "X-ray" }

type Values = Record<string, string | string[]>
type Cell = React.ReactNode
type Result = { rows: { key: string; cells: Cell[] }[]; note?: string; page?: number; pages?: number; total?: number }

const Labeled = ({ label, off, children, className }: { label: string; off?: boolean; children: React.ReactNode; className?: string }) => (
  <label className={cn("flex min-w-0 flex-col gap-1", SMALL, className)}><span>{label}{off && <Mark kind="missing" />}</span>{children}</label>
)
const Box = (props: React.ComponentProps<typeof Input>) => <Input {...props} className={cn("text-[var(--paper-text)]", props.className)} />
const offOf = (g: Group, sub: string) => Array.isArray(g.off) && g.off.includes(sub)
const str = (v: Values, k: string) => { const x = v[k]; return (Array.isArray(x) ? x[0] : x ?? "").trim() }
const list = (v: Values, k: string) => { const x = v[k]; return Array.isArray(x) ? x : x ? [x] : [] }
const num = (s: string) => (s.trim() === "" ? undefined : Number(s))
const fmtE = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? energyLabel(v) : "")
const fmtN = (v: unknown, d = 4) => (typeof v === "number" && Number.isFinite(v) ? Number(v.toPrecision(d)).toString() : "")
function fmtHalf(s: unknown): string {
  if (typeof s !== "number" || !Number.isFinite(s)) return s === null ? "stable" : ""
  const y = 3.15576e7
  return s >= y ? `${fmtN(s / y, 4)} y` : s >= 86400 ? `${fmtN(s / 86400, 4)} d` : s >= 3600 ? `${fmtN(s / 3600, 4)} h` : s >= 60 ? `${fmtN(s / 60, 4)} min` : `${fmtN(s, 4)} s`
}

async function getJson<T>(path: string): Promise<T> {
  const r = await fetch(apiUrl(path))
  const j = (await r.json().catch(() => ({}))) as T & { error?: string }
  if (!r.ok && r.status !== 404) throw new Error(j.error ? `${path.split("?")[0]}: ${j.error}` : `${path.split("?")[0]} answered ${r.status}`)
  return j
}
const qs = (o: Record<string, string | number | undefined>) =>
  new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v)])).toString()

/** The Target fields as the API's material name ("B-11", "C-nat", "Am-242m") and EXFOR's target ("B-11", "C-0", "Am-242-M"). */
function targetOf(v: Values, key = "target"): { name: string; exfor: string; z?: number } | null {
  const z = num(str(v, `${key}.z`)), a = str(v, `${key}.a`), state = str(v, `${key}.state`).toUpperCase()
  if (z === undefined || !Number.isFinite(z)) return null
  const sym = symbolOfZ(z)
  if (!a) return { name: "", exfor: sym, z }
  const nat = a === "0" || a.toLowerCase() === "nat"
  return { name: `${sym}-${nat ? "nat" : Number(a)}${state === "M" ? "m" : state === "N" ? "m2" : ""}`, exfor: `${sym}-${nat ? 0 : Number(a)}${state ? `-${state}` : ""}`, z }
}
/** The energy group as eV bounds: min to max, or value ± delta. */
function energyOf(v: Values, key = "energy"): { lo?: number; hi?: number } {
  if (str(v, `${key}.mode`) === "value") {
    const c = num(str(v, `${key}.value`)), d = num(str(v, `${key}.delta`)) ?? 0
    return c === undefined ? {} : { lo: c - d, hi: c + d }
  }
  return { lo: num(str(v, `${key}.min`)), hi: num(str(v, `${key}.max`)) }
}
const years = (v: Values) => { const a = str(v, "reference.from"), b = str(v, "reference.to"); return a || b ? `${a || "1900"}..${b || "2100"}` : undefined }
const releasesOf = (v: Values) => { const r = list(v, "library").map((l) => l.replace(/^ENDF\//, "")).filter((r) => HELD.includes(r)); return r.length ? r : HELD }
const subsOf = (v: Values) => { const s = list(v, "particle").map((b) => SUB_OF[b]).filter(Boolean); return s.length ? s : ["neutrons"] }

type Material = { release: string; sublibrary: string; mat: number; name: string }
type Section = { mf: number; mt: number; reaction?: string | null }
async function materialsFor(name: string, subs: string[], releases: string[]): Promise<Material[]> {
  const j = await getJson<{ rows?: Material[] }>(`/endf/materials?${qs({ release: "all", name })}`)
  return (j.rows ?? []).map((m) => ({ ...m, sublibrary: m.sublibrary === "(root)" ? "neutrons" : m.sublibrary })).filter((m) => releases.includes(m.release) && subs.includes(m.sublibrary))
}
const sectionsOf = (m: Material) => getJson<{ sections?: Section[] }>(`/endf/material/${encodeURIComponent(m.release)}/${m.mat}?${qs({ sub: m.sublibrary })}`).then((j) => j.sections ?? [])
const matHref = (m: Material, mf?: number, mt?: number) => `/datasets/endf/${encodeURIComponent(m.release)}/${m.mat}?${qs({ sub: m.sublibrary, mf, mt })}`

async function endfSections(v: Values, keep: (s: Section) => boolean): Promise<Result | { materials: Material[] }> {
  const t = targetOf(v)
  const subs = subsOf(v), releases = releasesOf(v)
  if (!t?.name) {
    // No nuclide: the materials of the element (or every material) in each release chosen, no sections.
    const rows: Material[] = []
    for (const r of releases.slice(0, 4)) for (const sub of subs.slice(0, 2)) {
      const j = await getJson<{ rows?: Material[] }>(`/endf/materials?${qs({ release: r, sublibrary: sub, z: t?.z })}`)
      rows.push(...(j.rows ?? []))
    }
    return { materials: rows.slice(0, 500) }
  }
  const mats = await materialsFor(t.name, subs, releases)
  const secs = await Promise.all(mats.map(sectionsOf))
  const rows: Result["rows"] = []
  mats.forEach((m, i) => {
    for (const s of secs[i].filter(keep)) {
      const book = s.mf === 3 && BOOK_OF_SUB[m.sublibrary] && t ? `/elpis/book/${BOOK_OF_SUB[m.sublibrary]}/${bookLabelOf(t.name, t.z)}/${s.mt}` : null
      rows.push({
        key: `${m.release}/${m.sublibrary}/${m.mat}/${s.mf}/${s.mt}/${rows.length}`,
        cells: [BASE_OF[m.sublibrary] ?? m.sublibrary, libraryName(m.release), <Link key="m" href={matHref(m, s.mf, s.mt)} className={LINK}>{m.name}</Link>, s.mf,
          book ? <Link key="b" href={book} className={LINK}>{s.mt}</Link> : s.mt],
      })
    }
  })
  return { rows, note: mats.length ? undefined : `No material named ${t.name} in the libraries chosen.` }
}
/** "B-11" -> "5-B-11", "C-nat" -> "6-C-Nat", "Am-242m" -> "95-Am-242m". */
function bookLabelOf(name: string, z?: number): string {
  const m = /^([A-Za-z]+)-(\d+|nat)(m\d?)?$/.exec(name)
  return m && z !== undefined ? `${z}-${m[1]}-${m[2] === "nat" ? "Nat" : m[2]}${m[3] ?? ""}` : name
}
const materialRows = (mats: Material[]): Result => ({
  rows: mats.map((m, i) => ({ key: `${m.release}/${m.sublibrary}/${m.mat}/${i}`, cells: [BASE_OF[m.sublibrary] ?? m.sublibrary, libraryName(m.release), <Link key="m" href={matHref(m)} className={LINK}>{m.name}</Link>, "", ""] })),
  note: "Give a target nuclide (Z and A) to list its sections; without one I list materials.",
})

type ExforRow = { dataset: string; target: string; product?: string; reaction: string; quantity: string; sf6?: string; energy_min_ev?: number; energy_max_ev?: number; first_author?: string; n_authors?: number; institute?: string; reference?: string; points?: number }
type CindaRow = { block_id: number; line_no: number; target: string; reaction: string; quantity: string; quantity_word?: string; e_min_ev?: number | null; e_max_ev?: number | null; energy_text?: string; lab?: string; work_type?: string; reference_text?: string; year?: number; author?: string; comment?: string }
type Paged<T> = { rows?: T[]; total?: number; page?: number; pages?: number }

const RUN: Record<string, (v: Values, page: number) => Promise<Result>> = {
  async exfor(v, page) {
    const t = targetOf(v), p = targetOf(v, "product"), e = energyOf(v)
    const proj = str(v, "reaction.a").toUpperCase(), proc = str(v, "reaction.b").toUpperCase()
    const acc = str(v, "subentry.acc"), sub = str(v, "subentry.sub")
    const q = qs({
      target: t ? (t.name ? t.exfor : `${t.exfor}-*`) : undefined, product: p ? p.exfor : undefined,
      reaction: proj || proc ? `${proj || "*"},${proc || "*"}` : undefined, quantity: str(v, "quantity.b").toUpperCase() || undefined,
      emin: e.lo, emax: e.hi, acc: acc ? `${acc}${sub ? sub.padStart(3, "0") : ""}` : undefined, author: str(v, "author.name") || undefined,
      institute: str(v, "institute.lab") || undefined, year: years(v), page,
    })
    if (!q.replace(/(^|&)page=\d+/, "")) return { rows: [], note: "Fill in at least one field." }
    const j = await getJson<Paged<ExforRow>>(`/exfor/search?${q}`)
    const lo = num(str(v, "points.min")), hi = num(str(v, "points.max"))
    const rows = (j.rows ?? []).filter((r) => (lo === undefined || (r.points ?? 0) >= lo) && (hi === undefined || (r.points ?? 0) <= hi))
    return {
      page: j.page, pages: j.pages, total: j.total,
      rows: rows.map((r) => ({
        key: r.dataset,
        cells: [<Link key="s" href={`/datasets/exfor/${r.dataset}`} className={cn(LINK, "font-mono")}>{r.dataset}</Link>, r.target, r.product ?? "", r.reaction, r.sf6 ?? "", r.quantity,
          r.points ?? "", fmtE(r.energy_min_ev), fmtE(r.energy_max_ev), `${r.first_author ?? ""}${(r.n_authors ?? 1) > 1 ? " et al." : ""}`, "", r.institute ?? "",
          REF_TYPE[(r.reference ?? "").charAt(0)] ?? "", r.reference ?? ""],
      })),
    }
  },
  async endf(v) {
    const mf = num(str(v, "mf")), mt = num(str(v, "mt"))
    const out = await endfSections(v, (s) => (mf === undefined || s.mf === mf) && (mt === undefined || s.mt === mt) && s.mf !== 1)
    return "materials" in out ? materialRows(out.materials) : out
  },
  async covariances(v) {
    const mt = num(str(v, "mt"))
    const out = await endfSections(v, (s) => s.mf >= 31 && s.mf <= 35 && (mt === undefined || s.mt === mt))
    if ("materials" in out) return materialRows(out.materials)
    // JANIS's columns: Incident particle, Evaluation, Format, Material1, MF1, MT1, Material2, MF2, MT2 (the same material
    // and section: I serve each section's own covariances).
    return { ...out, rows: out.rows.map((r) => ({ key: r.key, cells: [r.cells[0], r.cells[1], "ENDF", r.cells[2], r.cells[3], r.cells[4], r.cells[2], r.cells[3], r.cells[4]] })) }
  },
  async cinda(v, page) {
    const t = targetOf(v), e = energyOf(v)
    const q = qs({ target: t ? t.name || symbolOfZ(t.z ?? 0) : undefined, quantity: str(v, "quantity.a").toUpperCase() || undefined, reaction: str(v, "quantity.b").toUpperCase() || undefined,
      emin: e.lo, emax: e.hi, author: str(v, "author") || undefined, lab: str(v, "institute.lab") || undefined, year: years(v), page })
    if (!q.replace(/(^|&)page=\d+/, "")) return { rows: [], note: "Fill in at least one field." }
    const j = await getJson<Paged<CindaRow>>(`/cinda?${q}`)
    return {
      page: j.page, pages: j.pages, total: j.total,
      rows: (j.rows ?? []).map((r) => ({
        key: `${r.block_id}/${r.line_no}`,
        cells: [<Link key="t" href={`/cinda?${qs({ target: r.target, quantity: r.quantity })}`} className={LINK}>{r.target}</Link>, r.quantity_word || r.quantity, r.reaction,
          r.e_min_ev != null ? fmtE(r.e_min_ev) : r.energy_text ?? "", r.e_max_ev != null ? fmtE(r.e_max_ev) : "", r.lab ?? "", r.block_id, r.work_type ?? "",
          REF_TYPE[(r.reference_text ?? "").charAt(0)] ?? "", r.reference_text ?? "", r.year ?? "", [r.author, r.comment].filter(Boolean).join(": ")],
      })),
    }
  },
  async resonances(v) {
    const t = targetOf(v), e = energyOf(v)
    if (!t?.name) return { rows: [], note: "Give a target nuclide (Z and A): I read one material's resonances at a time." }
    const rels = releasesOf(v)
    const res = await Promise.all(rels.map((r) => getJson<{ mat?: number; sublibrary?: string; resonances?: { er_ev: number }[] }>(`/endf/resonances?${qs({ name: t.name, release: r })}`).catch(() => ({} as { mat?: number; resonances?: { er_ev: number }[]; sublibrary?: string }))))
    const rows: Result["rows"] = []
    rels.forEach((r, i) => {
      const j = res[i]
      if (!j.mat) return
      const m: Material = { release: r, sublibrary: j.sublibrary ?? "neutrons", mat: j.mat, name: t.name }
      for (const x of j.resonances ?? []) {
        if ((e.lo !== undefined && x.er_ev < e.lo) || (e.hi !== undefined && x.er_ev > e.hi)) continue
        rows.push({ key: `${r}/${rows.length}`, cells: [BASE_OF[m.sublibrary] ?? m.sublibrary, libraryName(r), <Link key="m" href={matHref(m, 2, 151)} className={LINK}>{t.name}</Link>, fmtE(x.er_ev)] })
      }
    })
    return { rows: rows.slice(0, 5000), note: rows.length > 5000 ? `${rows.length.toLocaleString("en-US")} resonances; the first 5,000 are listed.` : rows.length ? undefined : `No resonance parameters for ${t.name} in the libraries chosen.` }
  },
  async decay(v) {
    const t = targetOf(v), e = energyOf(v), i = energyOf(v, "intensity")
    if (!t?.name) return { rows: [], note: "Give a target nuclide (Z and A): I read one material's decay lines at a time." }
    const type = str(v, "type") || "All lines"
    const hlo = HALF_S[str(v, "halflife.from") || "0 milliseconds"] ?? 0, hhi = HALF_S[str(v, "halflife.to") || "infinity"] ?? Infinity
    const rels = releasesOf(v)
    type Line = { styp: number; er_ev: number; er_unc?: number; ri?: number; ri_unc?: number; fd?: number }
    const res = await Promise.all(rels.map((r) => getJson<{ mat?: number; sublibrary?: string; decay?: { half_life_s?: number | null; stable?: boolean }; lines?: Line[] }>(`/endf/decay?${qs({ name: t.name, release: r })}`).catch(() => ({} as { mat?: number; lines?: Line[]; decay?: { half_life_s?: number | null }; sublibrary?: string }))))
    const rows: Result["rows"] = []
    rels.forEach((r, k) => {
      const j = res[k]
      if (!j.mat) return
      const half = j.decay?.half_life_s ?? null
      if (half !== null && (half < hlo || half > hhi)) return
      const m: Material = { release: r, sublibrary: j.sublibrary ?? "decay", mat: j.mat, name: t.name }
      for (const x of j.lines ?? []) {
        if (type === "Alpha lines" && x.styp !== 4) continue
        if (type === "Photon lines" && x.styp !== 0 && x.styp !== 9) continue
        if ((e.lo !== undefined && x.er_ev < e.lo) || (e.hi !== undefined && x.er_ev > e.hi)) continue
        const pct = x.ri != null ? x.ri * (x.fd ?? 1) * 100 : undefined
        const pctUnc = x.ri_unc != null ? x.ri_unc * (x.fd ?? 1) * 100 : undefined
        if (pct !== undefined && ((i.lo !== undefined && pct < i.lo) || (i.hi !== undefined && pct > i.hi))) continue
        rows.push({ key: `${r}/${rows.length}`, cells: [libraryName(r), fmtE(x.er_ev), fmtE(x.er_unc), pct !== undefined ? `${fmtN(pct)} %` : "", pctUnc !== undefined ? `${fmtN(pctUnc, 2)} %` : "", STYP[x.styp] ?? String(x.styp),
          <Link key="m" href={matHref(m, 8, 457)} className={LINK}>{t.name}</Link>, fmtHalf(half)] })
      }
    })
    return { rows, note: rows.length ? undefined : `No decay lines for ${t.name} in the libraries chosen and the ranges given.` }
  },
}

/** The form's fields named for the URL's query: target=B-11 fills Z, A and State; reaction=N,A the two reaction fields. */
function initialOf(form: string, sp: URLSearchParams): Values {
  const v: Values = {}
  const t = sp.get("target")
  if (t) {
    const m = /^([A-Za-z]{1,3})-(\d+|nat)(?:-?(m\d?|M\d?))?$/.exec(t.trim())
    const z = m ? Array.from({ length: 119 }, (_, i) => symbolOfZ(i).toLowerCase()).indexOf(m[1].toLowerCase()) : -1
    if (m && z >= 0) {
      v["target.z"] = String(z)
      v["target.a"] = m[2].toLowerCase() === "nat" ? "0" : m[2]
      if (m[3]) v["target.state"] = m[3].toUpperCase().startsWith("M2") ? "N" : "M"
    }
  }
  const reaction = sp.get("reaction"), proj = sp.get("projectile")
  if (form === "exfor") {
    if (reaction) [v["reaction.a"], v["reaction.b"]] = reaction.split(",")
    else if (proj) v["reaction.a"] = proj.toUpperCase() === "H" ? "HE3" : proj.toUpperCase()
    if (sp.get("quantity")) v["quantity.b"] = sp.get("quantity") as string
  }
  if (form === "cinda" && reaction) v["quantity.b"] = reaction
  if ((form === "endf" || form === "covariances") && proj && SUB_OF_PROJ[proj]) v.particle = [BASE_OF[SUB_OF_PROJ[proj]]]
  if (sp.get("mt")) { v.mt = sp.get("mt") as string; if (form === "endf") v.mf = sp.get("mf") ?? "3" }
  return v
}

function Target({ name, init, off }: { name: string; init: Values; off?: boolean }) {
  return (
    <div className="grid grid-cols-3 gap-3 sm:max-w-md">
      <Labeled label="Z" off={off}><Box name={`${name}.z`} defaultValue={str(init, `${name}.z`)} aria-label={`${name} Z`} inputMode="numeric" disabled={off} /></Labeled>
      <Labeled label="A" off={off}><Box name={`${name}.a`} defaultValue={str(init, `${name}.a`)} aria-label={`${name} A`} inputMode="numeric" disabled={off} /></Labeled>
      <Labeled label="State" off={off}><Box name={`${name}.state`} defaultValue={str(init, `${name}.state`)} aria-label={`${name} State`} disabled={off} /></Labeled>
    </div>
  )
}

function RangeField({ name, unit }: { name: string; unit: string }) {
  return (
    <div className="flex flex-col gap-2 text-sm text-[var(--paper-text)]">
      <label className="flex flex-wrap items-center gap-2">
        <input type="radio" name={`${name}.mode`} value="range" defaultChecked className="accent-[var(--paper-strong)]" />
        <Box name={`${name}.min`} aria-label="min" placeholder="min" className="h-9 w-32" /> <span className={SMALL}>to</span> <Box name={`${name}.max`} aria-label="max" placeholder="max" className="h-9 w-32" />
        <span className={SMALL}>{unit}</span>
      </label>
      <label className="flex flex-wrap items-center gap-2">
        <input type="radio" name={`${name}.mode`} value="value" className="accent-[var(--paper-strong)]" />
        <Box name={`${name}.value`} aria-label="value" placeholder="value" className="h-9 w-32" /> <span className={SMALL}>±</span> <Box name={`${name}.delta`} aria-label="delta" placeholder="delta" className="h-9 w-32" />
        <span className={SMALL}>{unit}</span>
      </label>
    </div>
  )
}

function Field({ g, id, init }: { g: Group; id: string; init: Values }) {
  const k = g.key
  switch (g.kind) {
    case "select": {
      const chosen = list(init, k)
      return (
        <select name={k} multiple={g.multiple} defaultValue={g.multiple ? chosen : chosen[0]} size={g.multiple ? Math.min(6, g.options.length) : undefined} aria-label={g.label} className={cn(SELECT, g.multiple && "h-auto py-1")}>
          {g.options.map((o) => <option key={o.label} value={o.label}>{o.label}{o.mark === "missing" ? "  ❌" : o.mark === "ours" ? "  ✅" : ""}</option>)}
        </select>
      )
    }
    case "radio":
      return (
        <div className="flex gap-5 text-sm text-[var(--paper-text)]">
          {g.options.map((o, i) => (
            <label key={o.label} className="inline-flex items-center gap-2">
              <input type="radio" name={`${id}-fmt`} defaultChecked={i === 1} disabled={!o.held} className="accent-[var(--paper-strong)]" />
              {o.label}<Mark kind={o.mark} />
            </label>
          ))}
        </div>
      )
    case "target":
      return <Target name={k} init={init} />
    case "target2":
      return (
        <div className="flex flex-col gap-2">
          <label className="inline-flex items-center gap-2 text-sm text-[var(--paper-text)]"><input type="checkbox" defaultChecked disabled className="accent-[var(--paper-strong)]" />same as Material #1</label>
          <Target name={k} init={init} off />
        </div>
      )
    case "mt2":
      return (
        <div className="flex flex-col gap-2 sm:max-w-md">
          <label className="inline-flex items-center gap-2 text-sm text-[var(--paper-text)]"><input type="checkbox" defaultChecked disabled className="accent-[var(--paper-strong)]" />same as Reaction #1</label>
          <Box aria-label="Reaction #2 MT" placeholder="MT" disabled />
        </div>
      )
    case "text":
      return <Box name={k} defaultValue={str(init, k)} aria-label={g.label} placeholder={g.placeholder} disabled={g.off === true} className="sm:max-w-md" />
    case "pair":
      return (
        <div className="grid gap-3 sm:max-w-xl sm:grid-cols-2">
          <Labeled label={g.a} off={offOf(g, g.a)}><Box name={`${k}.a`} defaultValue={str(init, `${k}.a`)} aria-label={g.a} disabled={offOf(g, g.a)} /></Labeled>
          <Labeled label={g.b} off={offOf(g, g.b)}><Box name={`${k}.b`} defaultValue={str(init, `${k}.b`)} aria-label={g.b} disabled={offOf(g, g.b)} /></Labeled>
        </div>
      )
    case "energy":
      return <RangeField name={k} unit="eV" />
    case "intensity":
      return <RangeField name={k} unit="%" />
    case "halflife":
      return (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <select name={`${k}.from`} aria-label="Half-life from" className={cn(SELECT, "w-40")}>{HALF_MIN.map((h) => <option key={h}>{h}</option>)}</select>
          <span className={SMALL}>to</span>
          <select name={`${k}.to`} aria-label="Half-life to" defaultValue="infinity" className={cn(SELECT, "w-40")}>{HALF_MAX.map((h) => <option key={h}>{h}</option>)}</select>
        </div>
      )
    case "subentry":
      return (
        <div className="grid grid-cols-2 gap-3 sm:max-w-md">
          <Labeled label="Accession #"><Box name={`${k}.acc`} aria-label="Accession number" className="font-mono" /></Labeled>
          <Labeled label="Subaccession #"><Box name={`${k}.sub`} aria-label="Subaccession number" className="font-mono" /></Labeled>
        </div>
      )
    case "author":
      return (
        <div className="flex flex-wrap items-center gap-3">
          <Box name={`${k}.name`} aria-label="Author" className="sm:max-w-md" />
          <label className="inline-flex items-center gap-2 text-sm text-[var(--paper-text)]"><input type="checkbox" disabled className="accent-[var(--paper-strong)]" />1st author{offOf(g, "1st author") && <Mark kind="missing" />}</label>
        </div>
      )
    case "reference":
      return (
        <div className="grid gap-3 sm:grid-cols-[repeat(5,minmax(0,1fr))]">
          <Labeled label="Type" off={offOf(g, "Type")}><select aria-label="Reference type" disabled className={SELECT}>{["Any", "Journal", "Report", "Conference", "Thesis", "Book", "Private communication"].map((t) => <option key={t}>{t}</option>)}</select></Labeled>
          <label className="inline-flex items-end gap-2 pb-2 text-sm text-[var(--paper-text)]"><input type="checkbox" disabled className="accent-[var(--paper-strong)]" />Main ref.{offOf(g, "Main ref.") && <Mark kind="missing" />}</label>
          <Labeled label="Code" off={offOf(g, "Code")}><Box aria-label="Reference code" disabled className="font-mono" /></Labeled>
          <Labeled label="From year"><Box name={`${k}.from`} aria-label="From year" inputMode="numeric" /></Labeled>
          <Labeled label="To year"><Box name={`${k}.to`} aria-label="To year" inputMode="numeric" /></Labeled>
        </div>
      )
    case "institute":
      return (
        <div className="grid gap-3 sm:max-w-2xl sm:grid-cols-3">
          <Labeled label="Area" off={offOf(g, "Area")}><Box aria-label="Area" disabled /></Labeled>
          <Labeled label="Country" off={offOf(g, "Country")}><Box aria-label="Country" disabled /></Labeled>
          <Labeled label="Laboratory"><Box name={`${k}.lab`} aria-label="Laboratory" className="font-mono" /></Labeled>
        </div>
      )
    case "points":
      return (
        <div className="flex items-center gap-2">
          <Box name={`${k}.min`} aria-label="Points from" placeholder="min" inputMode="numeric" className="w-32" /> <span className={SMALL}>to</span>
          <Box name={`${k}.max`} aria-label="Points to" placeholder="max" inputMode="numeric" className="w-32" />
        </div>
      )
  }
}

/** The form's values by field name; a multiple select gives every option chosen. */
function valuesOf(form: HTMLFormElement): Values {
  const v: Values = {}
  for (const [k, x] of new FormData(form).entries()) {
    if (typeof x !== "string") continue
    const had = v[k]
    v[k] = had === undefined ? x : Array.isArray(had) ? [...had, x] : [had, x]
  }
  return v
}

export function ElpisSearch({ form }: { form: string }) {
  const f = FORMS[form]
  const sp = useSearchParams()
  const init = useMemo(() => initialOf(form, new URLSearchParams(sp.toString())), [form, sp])
  const [round, setRound] = useState(0) // Reset remounts the fields
  const [state, setState] = useState<{ status: "idle" | "loading" | "done" | "error"; result?: Result; error?: string; page: number }>({ status: "idle", page: 1 })
  const formRef = useRef<HTMLFormElement>(null)
  const ticket = useRef(0)
  const run = async (page = 1) => {
    if (!formRef.current || !RUN[form]) return
    const n = ++ticket.current
    setState({ status: "loading", page })
    try {
      const result = await RUN[form](valuesOf(formRef.current), page)
      if (n === ticket.current) setState({ status: "done", result, page })
    } catch (e) {
      if (n === ticket.current) setState({ status: "error", error: e instanceof Error ? e.message : String(e), page })
    }
  }
  // A query in the URL searches at once.
  useEffect(() => {
    if (Object.keys(init).length) run(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [init])
  if (!f) return null
  const r = state.result
  return (
    <div className="mx-auto w-full max-w-[1140px] px-4 py-6 sm:px-6">
      <div className="mb-5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className="text-3xl tracking-tight text-[var(--paper-text)]" style={SERIF}>{f.title}</h2>
        <span className="flex flex-wrap gap-x-3 text-sm">
          {SEARCHES.filter((s) => s.key !== form).map((s) => <Link key={s.key} href={`/elpis/search/${s.key}`} className={LINK}>{s.name}</Link>)}
        </span>
      </div>
      <form ref={formRef} key={`${round}-${sp.toString()}`} className="flex flex-col gap-5" onSubmit={(e) => { e.preventDefault(); run(1) }}>
        {f.groups.map((g, i) => (
          <div key={`${g.label}-${i}`} className="grid gap-2 md:grid-cols-[200px_minmax(0,1fr)] md:items-start">
            <strong className="pt-2 text-sm font-semibold text-[var(--paper-text)]">{g.label}:{g.off === true && <Mark kind="missing" />}</strong>
            <Field g={g} id={`${form}-${i}`} init={init} />
          </div>
        ))}
        <div className="flex gap-2 md:pl-[208px]">
          <Button type="submit" className="h-10 rounded-full px-5"><Search className="size-4" aria-hidden="true" />Search</Button>
          <Button type="button" variant="outline" className="h-10 rounded-full px-5" onClick={() => { setRound((x) => x + 1); setState({ status: "idle", page: 1 }) }}><RotateCcw className="size-4" aria-hidden="true" />Reset</Button>
        </div>
      </form>
      <div className={cn("mt-8 overflow-x-auto rounded-lg border", LINE)}>
        <table className="w-full text-sm text-[var(--paper-text)]">
          <thead>
            <tr className={cn("border-b", LINE, TINT)}>
              {f.columns.map((c, i) => <th key={`${c}-${i}`} className="whitespace-nowrap px-3 py-2 text-left text-xs font-medium text-[var(--paper-muted)]">{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {state.status === "done" && r && r.rows.map((row) => (
              <tr key={row.key} className={cn("border-b last:border-b-0", LINE)}>
                {row.cells.map((c, i) => <td key={i} className="whitespace-nowrap px-3 py-1.5 align-top">{c}</td>)}
              </tr>
            ))}
            {!(state.status === "done" && r?.rows.length) && (
              <tr>
                <td colSpan={f.columns.length} className="px-3 py-6 text-center text-sm text-[var(--paper-muted)]">
                  {state.status === "loading" ? "Searching…" : state.status === "error" ? state.error : state.status === "done" ? r?.note ?? "No rows match." : "Fill in the form and search."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {state.status === "done" && r && (r.rows.length > 0 || r.pages) && (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-[var(--paper-muted)]">
          {r.rows.length > 0 && r.note && <span>{r.note}</span>}
          {r.total !== undefined && <span>{r.total.toLocaleString("en-US")} rows</span>}
          {(r.pages ?? 1) > 1 && (
            <span className="ml-auto flex items-center gap-2">
              <Button variant="outline" className="h-8 rounded-full px-3" disabled={state.page <= 1} onClick={() => run(state.page - 1)}>Previous</Button>
              <span>Page {state.page} of {r.pages}</span>
              <Button variant="outline" className="h-8 rounded-full px-3" disabled={state.page >= (r.pages ?? 1)} onClick={() => run(state.page + 1)}>Next</Button>
            </span>
          )}
        </div>
      )}
    </div>
  )
}
