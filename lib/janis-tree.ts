// /janis (brief 67): JANIS Web's database tree (oecd-nea.org/janisweb/tree, walked 2026-11-10) as data, with what I hold
// marked. A node not held carries held: false and the pages draw a red ❌ after its label, so the tree doubles as the gap
// list. Rows JANIS has none of but I hold (ENDF/B-VIII.1, JENDL-5, TENDL-2023, the POINT files) carry ours: true. Slugs
// follow JANIS's paths (/tree/N/EXFOR, a library's slash as a dash). Elements and nuclides are generated: the element
// symbols are lib/nsr-structure.ts's, the names lib/diagram/elements.ts's (and the six past Lawrencium here), and an
// element's nuclides a band around the valley of stability, for placeholder rows only.
import { ELEMENTS } from "@/lib/nsr-structure"
import { elementName } from "@/lib/diagram/elements"

/** Brief 67 as changed at 23:45 ET (Brendan): three marks. "missing" shows ❌ (JANIS has it, I do not), "same" shows
 *  nothing (both hold it), "ours" shows ✅ (I hold it, JANIS does not). Brief 68's crawl writes the same three. */
export type Mark = "missing" | "same" | "ours"
export type JanisNode = { name: string; slug: string; held: boolean; ours?: boolean; children?: JanisNode[]; leaf?: "elements"; href?: string }
export type JanisRow = { name: string; href: string; held: boolean; mark: Mark; open?: boolean }
export type JanisView = { trail: { name: string; href: string }[]; rows: JanisRow[]; nuclides: boolean; missing: boolean; source: "hand" | "crawl" }

export const markOf = (n: { held: boolean; ours?: boolean }): Mark => (!n.held ? "missing" : n.ours ? "ours" : "same")

const LATE = ["Rutherfordium", "Dubnium", "Seaborgium", "Bohrium", "Hassium", "Meitnerium", "Darmstadtium", "Roentgenium",
  "Copernicium", "Nihonium", "Flerovium", "Moscovium", "Livermorium", "Tennessine", "Oganesson"]

/** "Neutron" for 0, "Hydrogen" for 1 … "Oganesson" for 118. */
export const nameOfZ = (z: number) => (z === 0 ? "Neutron" : z > 103 ? LATE[z - 104] ?? `Z=${z}` : elementName(z))
export const symbolOfZ = (z: number) => ELEMENTS[z] ?? `Z${z}`
export const Z_MAX = 118

/** The mass numbers drawn for an element: the valley of stability's band (Z = A / (1.98 + 0.0155 A^2/3)), widened by
 *  `pad` on each side. Placeholder rows, not a nuclide table. */
export function massesOf(z: number, pad = 0): number[] {
  if (z === 0) return [1]
  if (z === 1) return [1, 2, 3]
  if (z === 2) return [3, 4]
  const band: number[] = []
  for (let a = z; a <= 3 * z + 20; a++) if (Math.round(a / (1.98 + 0.0155 * a ** (2 / 3))) === z) band.push(a)
  if (!band.length) band.push(Math.round(2.5 * z))
  const lo = Math.max(z, band[0] - pad)
  const hi = band[band.length - 1] + pad
  return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i)
}

const slugOf = (name: string) => name.replace(/\//g, "-").replace(/[\s,]+/g, "-")
const node = (name: string, held: boolean, children?: JanisNode[], extra: Partial<JanisNode> = {}): JanisNode =>
  ({ name, slug: extra.slug ?? slugOf(name), held, children, ...extra })
const leaves = (names: string[]) => names.map((n) => node(n, true, undefined, { leaf: "elements" }))

// What a library holds, as the brief names it (each opens on the element list).
const LIBRARY_LEAVES = ["Cross sections", "Angular distributions", "Energy distributions", "Energy-angle distributions",
  "Fission yields", "Resonance parameters", "Covariances"]
// EXFOR's quantities under each base, as JANIS lists them.
const EXFOR_NEUTRON = ["Cross sections", "Angular distributions", "Energy distributions", "Energy-angle distributions",
  "Fission yields data", "Cross section integral over incident energy", "Differential fission neutron multiplicities",
  "Differential thick target yields", "Fission neutron multiplicities", "Gamma spectra", "Kinetic energies",
  "Most probable charge or mass", "Nuclear quantities", "Outgoing particle multiplicities", "Partial cross section data",
  "Partial differential data with respect to angle", "Partial differential data with respect to energy", "Polarization data",
  "Product yields", "Reaction rates", "Resonance integrals", "Resonance parameters", "Scattering length", "Special quantities",
  "Temperature dependent cross section data"]
const EXFOR_CHARGED = ["Cross sections", "Angular distributions", "Energy distributions", "Energy-angle distributions",
  "Fission yields data", "Cross section integral over incident energy", "Differential thick target yields",
  "Fission neutron multiplicities", "Gamma spectra", "Kinetic energies", "Most probable charge or mass",
  "Outgoing particle multiplicities", "Partial cross section data", "Partial differential data with respect to angle",
  "Partial differential data with respect to energy", "Partial thick target yields", "Polarization data", "Product yields",
  "Reaction rates", "Resonance parameters", "Thick target yields"]
const EXFOR_DECAY = ["Angular distributions", "Energy-angle distributions", "Fission yields data",
  "Differential fission neutron multiplicities", "Fission neutron multiplicities", "Gamma spectra", "Kinetic energies",
  "Most probable charge or mass", "Nuclear quantities", "Outgoing particle multiplicities",
  "Partial differential data with respect to angle", "Product yields"]

/** The libraries I hold (brief 59 and the night's briefs); every other name in JANIS's lists is a gap. */
const HELD = new Set(["CENDL-3.2", "ENDF/B-VI.8", "ENDF/B-VII.0", "ENDF/B-VII.1", "ENDF/B-VIII.0", "ENDF/B-VIII.1",
  "JEFF-3.3", "JENDL-5", "TENDL-2023", "POINT2025 (ENDF/B-VIII.1)", "POINT2018 (ENDF/B-VIII.0)"])
const lib = (name: string, ours = false) => node(name, HELD.has(name), HELD.has(name) ? leaves(LIBRARY_LEAVES) : undefined, ours ? { ours } : {})
const libs = (theirs: string[], ours: string[] = []) => [...theirs.map((n) => lib(n)), ...ours.map((n) => lib(n, true))]
const exfor = (quantities: string[]) => node("EXFOR", true, leaves(quantities))
const range = (prefix: string, versions: string[]) => versions.map((v) => `${prefix}${v}`)
const GEFY = range("GEFY-", ["3.3", "4.2", "5.2", "6.1", "6.2", "8.1", "9.1"])
const TENDL_OLD = range("TENDL-", ["2009", "2010", "2011", "2012", "2013", "2014", "2015", "2017", "2019"])

const NUBASE = (year: string, held: boolean) =>
  node(`Nubase ${year}`, held, held ? [node("Basic properties", true, undefined, { leaf: "elements" })] : undefined)

/** Base, as JANIS's tree root lists it. */
export const JANIS_TREE: JanisNode = node("Base", true, [
  node("Nuclear properties", true, [NUBASE("1997", false), NUBASE("2003", false), NUBASE("2012", false), NUBASE("2016", false), NUBASE("2020", true),
    node("ICRP 107", true, undefined, { ours: true, leaf: "elements" }), node("RIPL", true, undefined, { ours: true, leaf: "elements" })], { slug: "PROPS" }),
  node("Radioactive data", true, [
    node("EXFOR", true, leaves(EXFOR_DECAY)),
    ...libs(["ENDF/B-VI.8", "ENDF/B-VII.0", "ENDF/B-VII.1", "ENDF/B-VIII.0", ...GEFY, "JEF-2.2", "JEFF-3.1", "JEFF-3.1.1", "JEFF-3.3",
      "JEFF-4.0", "JENDL-4.0", "JENDL/DDF-2015", "JENDL/FPD-2000", "JENDL/FPD-2011", "JENDL/FPY-2011", "TENDL-2010"],
    ["ENDF/B-VIII.1", "JENDL-5"]),
  ], { slug: "RDD" }),
  node("Incident neutron data", true, [
    exfor(EXFOR_NEUTRON),
    ...libs(["BROND-2.2", "BROND-3.1", "CENDL-2.1", "CENDL-3.1", "CENDL-3.2", "EAF-2007", "EAF-2010", "ENDF/B-VI.8", "ENDF/B-VI.8-HE",
      "ENDF/B-VII.0", "ENDF/B-VII.1", "ENDF/B-VIII.0", "FENDL-2.1", "FENDL-2.1 MG", "FENDL-3.1b", ...GEFY, "IRDF-2002", "IRDF-2002 MG",
      "IRDFF-1.0", "IRDFF-1.0-640g", "IRDFF-1.05", "IRDFF-II", "JEF-2.2", "JEFF-3.0", "JEFF-3.0/A", "JEFF-3.1", "JEFF-3.1.1", "JEFF-3.1.2",
      "JEFF-3.2", "JEFF-3.3", "JEFF-4.0", "JENDL-3.3", "JENDL-4.0", "JENDL-4.0/HE", "JENDL-4.0u", "JENDL/AC-2008", "JENDL/AD-2017",
      "JENDL/FPY-2011", "JENDL/HE-2007", "RUSFOND-2010", ...TENDL_OLD, "TSL ENDF/B-VI.8", "TSL ENDF/B-VII.0", "TSL JEFF-3.0", "TSL JEFF-3.1"],
    ["ENDF/B-VIII.1", "JENDL-5", "TENDL-2023", "POINT2025 (ENDF/B-VIII.1)", "POINT2018 (ENDF/B-VIII.0)"]),
  ], { slug: "N" }),
  node("Incident gamma data", true, [
    exfor(EXFOR_CHARGED),
    ...libs(["ENDF/B-VII.0", "ENDF/B-VII.1", "ENDF/B-VIII.0", "IAEA/PD-2019", "JENDL/PD-2004", "JENDL/PD-2016", "JENDL/PD-2016.1", ...TENDL_OLD],
      ["ENDF/B-VIII.1", "JEFF-3.3", "JENDL-5", "TENDL-2023"]),
  ], { slug: "G" }),
  node("Incident proton data", true, [
    exfor(EXFOR_CHARGED),
    ...libs(["ENDF/B-VI.8", "ENDF/B-VI.8-HE", "ENDF/B-VII.0", "ENDF/B-VII.1", "ENDF/B-VIII.0", "JEFF-3.1", "JEFF-4.0", "JENDL-4.0/HE",
      "JENDL/AD-2017", "JENDL/HE-2007", "PADF-2007", ...TENDL_OLD], ["ENDF/B-VIII.1", "JEFF-3.3", "JENDL-5", "TENDL-2023"]),
  ], { slug: "P" }),
  node("Incident deuteron data", true, [
    exfor(EXFOR_CHARGED),
    ...libs(["ENDF/B-VI.8", "ENDF/B-VII.0", "ENDF/B-VII.1", "ENDF/B-VIII.0", "JENDL/DEU-2020", ...TENDL_OLD],
      ["ENDF/B-VIII.1", "JEFF-3.3", "JENDL-5", "TENDL-2023"]),
  ], { slug: "D" }),
  node("Incident triton data", true, [
    exfor(EXFOR_CHARGED),
    ...libs(["ENDF/B-VI.8", "ENDF/B-VII.0", "ENDF/B-VII.1", "ENDF/B-VIII.0", ...TENDL_OLD], ["ENDF/B-VIII.1", "TENDL-2023"]),
  ], { slug: "T" }),
  node("Incident He3 data", true, [
    exfor(EXFOR_CHARGED),
    ...libs(["ENDF/B-VII.0", "ENDF/B-VII.1", "ENDF/B-VIII.0", ...TENDL_OLD], ["ENDF/B-VIII.1", "JEFF-3.3", "TENDL-2023"]),
  ], { slug: "HE3" }),
  node("Incident alpha data", true, [
    exfor(EXFOR_CHARGED),
    ...libs(["ENDF/B-VIII.0", "JENDL/AN-2005", ...TENDL_OLD], ["ENDF/B-VIII.1", "JEFF-3.3", "JENDL-5", "TENDL-2023"]),
  ], { slug: "A" }),
  node("Heavy particles data", false, undefined, { slug: "HVY" }),
  node("Incident electron data", false, undefined, { slug: "E" }),
  node("Incident antiprotons", false, undefined, { slug: "AP" }),
  node("Incident kaons,negative", false, undefined, { slug: "KN" }),
  node("Incident kaons,positive", false, undefined, { slug: "KP" }),
  node("Incident pions,negative", false, undefined, { slug: "PIN" }),
  node("Incident pions,positive", false, undefined, { slug: "PIP" }),
  node("CINDA", true, undefined, { ours: true, href: "/cinda" }),
], { slug: "" })

const BASE = "/janis/browse"

/** "0 - n - Neutron", "5 - B - Boron". */
export const elementLabel = (z: number) => `${z} - ${symbolOfZ(z)} - ${nameOfZ(z)}`
/** "5-B-11"; "5-B-Nat" for the natural element. */
export const nuclideLabel = (z: number, a: number | "Nat") => `${z}-${symbolOfZ(z)}-${a}`

/** What /janis/browse/<path> shows: the trail for the breadcrumb and the rows beneath, each a link one level down. */
export function browse(path: string[]): JanisView {
  const trail = [{ name: "Base", href: BASE }]
  let at: JanisNode = JANIS_TREE
  let href = BASE
  let i = 0
  for (; i < path.length; i++) {
    const next = at.children?.find((c) => c.slug === path[i])
    if (!next) break
    at = next
    href += `/${next.slug}`
    trail.push({ name: next.name, href })
  }
  const rest = path.slice(i)
  if (at.leaf === "elements") {
    if (!rest.length) {
      return { trail, nuclides: false, missing: false, source: "hand", rows: Array.from({ length: Z_MAX + 1 }, (_, z) => ({ name: elementLabel(z), href: `${href}/${z}-${symbolOfZ(z)}`, held: true, mark: "same" as Mark })) }
    }
    const z = parseInt(rest[0], 10)
    if (Number.isFinite(z) && z >= 0 && z <= Z_MAX && rest.length === 1) {
      href += `/${rest[0]}`
      trail.push({ name: elementLabel(z), href })
      return { trail, nuclides: true, missing: false, source: "hand", rows: massesOf(z, 2).map((a) => ({ name: nuclideLabel(z, a), href: `/janis/book/n/${nuclideLabel(z, a)}/1`, held: true, mark: "same" as Mark, open: true })) }
    }
    return { trail, rows: [], nuclides: false, missing: true, source: "hand" }
  }
  if (rest.length) return { trail, rows: [], nuclides: false, missing: true, source: "hand" }
  return { trail, nuclides: false, missing: false, source: "hand", rows: (at.children ?? []).map((c) => ({ name: c.name, href: c.href ?? `${href}/${c.slug}`, held: c.held, mark: markOf(c) })) }
}

export type MarkCounts = Record<Mark, number>

/** The hand list's marks, each distinct name once (the generated element and nuclide rows are not counted). */
export function handCounts(): MarkCounts {
  const seen = new Map<string, Mark>()
  const walk = (n: JanisNode, root = false) => {
    if (!root) {
      const m = markOf(n)
      const was = seen.get(n.name)
      if (!was || was === "same") seen.set(n.name, m) // a name held in one base and missing in another counts once, marked
    }
    n.children?.forEach((c) => walk(c))
  }
  walk(JANIS_TREE, true)
  const out: MarkCounts = { missing: 0, same: 0, ours: 0 }
  seen.forEach((m) => { out[m] += 1 })
  return out
}

/** The home page's cards I don't have, marked ❌ there and counted with the tree. */
export const HOME_GAPS = ["Open .jns file", "TRANS Checker"]

// ---------- brief 68's crawl: public/janis-tree.json ----------
/** One node of new-worker-1's crawl of JANIS Web's tree: { label, path, href, children, leaf?, mark, counts }. */
export type CrawlNode = { label: string; path?: string; href?: string; children?: CrawlNode[]; leaf?: { renderer_id?: string } | null; mark?: string; rule?: string; counts?: unknown }

const crawlMark = (m?: string): Mark => (m === "missing" ? "missing" : m === "ours" ? "ours" : "same")
const segs = (p?: string) => (p ?? "").replace(/^\/?(janisweb\/)?(tree\/?)?/, "").split("/").filter(Boolean)

/** "Yb171" (a crawl leaf's label) -> "70-Yb-171", the book page's name; null when the label is not a nuclide. */
function crawlNuclide(label: string): string | null {
  const m = /^([A-Z][a-z]{0,2})(\d{1,3})/.exec(label.trim())
  const z = m ? ELEMENTS.indexOf(m[1]) : -1
  return m && z >= 0 ? nuclideLabel(z, parseInt(m[2], 10)) : null
}

/** What /janis/browse/<path> shows from the crawl, or null when the crawl has not reached that path (the hand list
 *  answers then). A child's link is its own JANIS path under /janis/browse. */
export function browseCrawl(root: CrawlNode, path: string[]): JanisView | null {
  const trail = [{ name: root.label || "Base", href: BASE }]
  let at = root
  for (let i = 0; i < path.length; i++) {
    const next = at.children?.find((c) => { const p = segs(c.path); return p[p.length - 1] === path[i] || c.label === path[i] })
    if (!next) return null
    at = next
    trail.push({ name: next.label, href: `${BASE}/${path.slice(0, i + 1).map(encodeURIComponent).join("/")}` })
  }
  if (!at.children?.length) return null
  const here = path.map(encodeURIComponent).join("/")
  return {
    trail, nuclides: at.children.some((c) => c.leaf), missing: false, source: "crawl",
    rows: at.children.map((c) => {
      const mark = crawlMark(c.mark)
      const p = segs(c.path)
      const slug = p[p.length - 1] ?? encodeURIComponent(c.label)
      if (c.leaf) {
        const nuc = crawlNuclide(c.label)
        return { name: c.label, href: nuc ? `/janis/book/n/${nuc}/1` : "", held: mark !== "missing" && !!nuc, mark, open: true }
      }
      return { name: c.label, href: `${BASE}/${here ? `${here}/` : ""}${encodeURIComponent(slug)}`, held: mark !== "missing" || !!c.children?.length, mark }
    }),
  }
}

/** Every mark the crawl carries, node by node (the root not counted). */
export function crawlCounts(root: CrawlNode): MarkCounts {
  const out: MarkCounts = { missing: 0, same: 0, ours: 0 }
  const walk = (n: CrawlNode) => n.children?.forEach((c) => { out[crawlMark(c.mark)] += 1; walk(c) })
  walk(root)
  return out
}

// ---------- the books ----------
export type Projectile = { key: string; symbol: string; name: string; word: string }
export const PROJECTILES: Projectile[] = [
  { key: "n", symbol: "n", name: "neutron-induced", word: "neutrons" },
  { key: "g", symbol: "γ", name: "gamma-induced", word: "gammas" },
  { key: "p", symbol: "p", name: "proton-induced", word: "protons" },
  { key: "d", symbol: "d", name: "deuteron-induced", word: "deuterons" },
  { key: "t", symbol: "t", name: "triton-induced", word: "tritons" },
  { key: "h", symbol: "h", name: "helion-induced", word: "helions" },
  { key: "a", symbol: "α", name: "alpha-induced", word: "alphas" },
]

/** The reactions each nuclide's page offers in the rail, by MT. */
export const BOOK_MTS: { mt: number; out: string }[] = [
  { mt: 1, out: "total" }, { mt: 2, out: "elastic" }, { mt: 16, out: "2n" }, { mt: 102, out: "γ" },
  { mt: 103, out: "p" }, { mt: 105, out: "t" }, { mt: 107, out: "α" },
]
export const mtLabel = (mt: number, symbol: string) => {
  const m = BOOK_MTS.find((x) => x.mt === mt)
  return m ? `MT${mt} (${symbol},${m.out})` : `MT${mt}`
}

/** A book's nuclides in order: per element the natural element, then the band's mass numbers. */
export function bookNuclides(z: number): { label: string; z: number; a: number | "Nat" }[] {
  if (z === 0) return [{ label: nuclideLabel(0, 1), z: 0, a: 1 }]
  return [{ label: nuclideLabel(z, "Nat"), z, a: "Nat" as const }, ...massesOf(z).map((a) => ({ label: nuclideLabel(z, a), z, a }))]
}

/** "5-B-11" -> { z: 5, a: 11 }; "5-B-Nat" -> { z: 5, a: "Nat" }. */
export function parseNuclide(s: string): { z: number; a: number | "Nat" } | null {
  const m = /^(\d{1,3})-([A-Za-z]{1,3})-(\d{1,3}|Nat)$/.exec(s)
  if (!m) return null
  const z = parseInt(m[1], 10)
  return z <= Z_MAX ? { z, a: m[3] === "Nat" ? "Nat" : parseInt(m[3], 10) } : null
}

/** The nuclide before and after one in the book's order, across elements. */
export function neighbours(z: number, a: number | "Nat"): { prev?: string; next?: string } {
  const all = [z - 1, z, z + 1].filter((x) => x >= 0 && x <= Z_MAX).flatMap(bookNuclides)
  const i = all.findIndex((x) => x.z === z && x.a === a)
  return { prev: all[i - 1]?.label, next: all[i + 1]?.label }
}
