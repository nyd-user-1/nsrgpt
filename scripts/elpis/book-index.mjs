#!/usr/bin/env node
// Brief 69 (elpis-wire, 2026-11-11): the Elpis books' rails, one file a projectile, from the lake and from JANIS Web's
// own book rails.
//
//   node scripts/elpis/book-index.mjs [date]          (date defaults to today, UTC; it names lake/elpis/<date>/)
//
// Node, not Python: the Mac has no python3 and the dev box's role has no Athena rights; the AWS CLI does the AWS
// calls one at a time (profile nysgpt-new). Two Athena queries in all, not one a projectile: the release list, then
// every File 3 section of every held release grouped by (projectile, ZA, isomer, MT) with a bit per release.
//
// The sublibrary of a section comes from its token (`neutrons`, `neutrons-version.VIII.1`, `triton` read as tritons);
// B-VI.8's `(root)` from the material's NSUB; B-II to B-V's `(root)` is neutrons. POINT releases and the standards
// are left out (POINT is B-VIII.x reconstructed, served for the same sections).
//
// JANIS's rails: `janis-book-rails.sh` crawls https://www.oecd-nea.org/janisweb/book/<book> page by page into
// lake/elpis/<date>/janis-rail-<book>.jsonl ({ book, element, label, mat, mts: [{ label, reac, page }] } a nuclide);
// the outline each JANIS book page embeds expands only its own element and nuclide, so it takes a page a nuclide.
//
// Out: public/elpis/book-<p>.json and lake/elpis/<date>/book-<p>.json:
//   { projectile, sub, built, releases: [names, bit i = releases[i]], janis_book, counts, nuclides: [
//     { l: "5-B-11", n: "B-11", m: "1:255 2:255 …" (MT:release mask; absent when I hold no material),
//       j: "1 2 16 …" (JANIS's MTs; absent when JANIS's book lists none),
//       x: "26053:4096 …" (residuals MT 5 produces, File 6 yields or File 10 sections: ZA and release mask; brief 69
//          follow-up: a JANIS MT I hold no section for is served as that residual's production from MT 5, as JANIS labels it
//          "MT11 (p,2n+d) or MT5 (Fe53 production)") } ] }
//   and public/elpis/books.json (and the lake copy): { built, releases, books: { <p>: counts } }, the home page's figures.
import { execFileSync } from "node:child_process"
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs"
import { join, dirname } from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..")
const DATE = process.argv[2] || new Date().toISOString().slice(0, 10)
const BUCKET = "nsr-lake-613473203863"
const LAKE = `s3://${BUCKET}/lake/elpis/${DATE}`
const AWS = ["--profile", "nysgpt-new", "--region", "us-east-2"]
const WORK = join(tmpdir(), "elpis-work")
mkdirSync(WORK, { recursive: true })
mkdirSync(join(ROOT, "public", "elpis"), { recursive: true })

const BOOKS = [
  { p: "n", sub: "neutrons", book: "neutrons" },
  { p: "g", sub: "gammas", book: "gammas" },
  { p: "p", sub: "protons", book: "protons" },
  { p: "d", sub: "deuterons", book: "deuterons" },
  { p: "t", sub: "tritons", book: "tritons" },
  { p: "h", sub: "helium3s", book: "he3" },
  { p: "a", sub: "alphas", book: "alphas" },
]
// The order of the release bits: the libraries a book draws first, then every other release by name.
const FIRST = ["B-VIII.1", "JEFF-3.3", "JENDL-5", "B-VIII.0", "B-VII.1", "TENDL-2023", "CENDL-3.2", "B-VII.0", "B-VI.8", "B-V", "B-IV", "B-III", "B-II"]
const SYM = ["n", "H", "He", "Li", "Be", "B", "C", "N", "O", "F", "Ne", "Na", "Mg", "Al", "Si", "P", "S", "Cl", "Ar", "K", "Ca", "Sc", "Ti", "V", "Cr", "Mn", "Fe", "Co", "Ni", "Cu", "Zn", "Ga", "Ge", "As", "Se", "Br", "Kr", "Rb", "Sr", "Y", "Zr", "Nb", "Mo", "Tc", "Ru", "Rh", "Pd", "Ag", "Cd", "In", "Sn", "Sb", "Te", "I", "Xe", "Cs", "Ba", "La", "Ce", "Pr", "Nd", "Pm", "Sm", "Eu", "Gd", "Tb", "Dy", "Ho", "Er", "Tm", "Yb", "Lu", "Hf", "Ta", "W", "Re", "Os", "Ir", "Pt", "Au", "Hg", "Tl", "Pb", "Bi", "Po", "At", "Rn", "Fr", "Ra", "Ac", "Th", "Pa", "U", "Np", "Pu", "Am", "Cm", "Bk", "Cf", "Es", "Fm", "Md", "No", "Lr", "Rf", "Db", "Sg", "Bh", "Hs", "Mt", "Ds", "Rg", "Cn", "Nh", "Fl", "Mc", "Lv", "Ts", "Og"]

const aws = (...a) => execFileSync("aws", [...a, ...AWS], { encoding: "utf8", maxBuffer: 1 << 28 }).trim()

function athena(sql, name) {
  const id = aws("athena", "start-query-execution", "--work-group", "nsrgpt", "--query-execution-context", "Database=nsr", "--query-string", sql, "--output", "text", "--query", "QueryExecutionId")
  for (;;) {
    const s = JSON.parse(aws("athena", "get-query-execution", "--query-execution-id", id, "--output", "json", "--query", "QueryExecution.{state:Status.State,why:Status.StateChangeReason,out:ResultConfiguration.OutputLocation,bytes:Statistics.DataScannedInBytes}"))
    if (s.state === "SUCCEEDED") {
      const file = join(WORK, `${name}.csv`)
      aws("s3", "cp", "--quiet", s.out, file)
      console.log(`${name}: ${(s.bytes / 1e6).toFixed(1)} MB scanned`)
      return csv(readFileSync(file, "utf8"))
    }
    if (s.state === "FAILED" || s.state === "CANCELLED") throw new Error(`${name}: ${s.state} ${s.why}`)
    execFileSync("sleep", ["2"])
  }
}

/** Athena's CSV: every field quoted, a header row. */
function csv(text) {
  const rows = []
  let row = [], f = "", q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"' && text[i + 1] === '"') { f += '"'; i++ }
      else if (c === '"') q = false
      else f += c
    } else if (c === '"') q = true
    else if (c === ",") { row.push(f); f = "" }
    else if (c === "\n") { row.push(f); rows.push(row); row = []; f = "" }
    else if (c !== "\r") f += c
  }
  if (f || row.length) { row.push(f); rows.push(row) }
  const [head, ...body] = rows
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])))
}

const SUB = `CASE WHEN s.sublibrary = '(root)' AND s.release = 'B-VI.8' THEN (CASE m.nsub WHEN 0 THEN 'gammas' WHEN 10010 THEN 'protons'
    WHEN 10020 THEN 'deuterons' WHEN 10030 THEN 'tritons' WHEN 20030 THEN 'helium3s' WHEN 20040 THEN 'alphas' ELSE 'neutrons' END)
  WHEN s.sublibrary = '(root)' THEN 'neutrons'
  ELSE regexp_replace(regexp_replace(s.sublibrary, '-version\\..*$', ''), '^triton$', 'tritons') END`
const WHERE = "s.mf = 3 AND s.release NOT LIKE '%-point-%' AND s.sublibrary NOT LIKE 'standards%'"

const held = athena(`SELECT DISTINCT s.release FROM endfb_sections s WHERE ${WHERE}`, "releases").map((r) => r.release)
const releases = [...FIRST.filter((r) => held.includes(r)), ...held.filter((r) => !FIRST.includes(r)).sort()]
const bit = `CASE s.release ${releases.map((r, i) => `WHEN '${r}' THEN ${2 ** i}`).join(" ")} END`
const rows = athena(`WITH k AS (
  SELECT ${SUB} AS sub, CAST(s.za AS integer) AS za, COALESCE(m.liso, 0) AS liso, s.mt, sum(DISTINCT ${bit}) AS mask
  FROM endfb_sections s JOIN endfb_materials m
    ON m.release = s.release AND m.sublibrary = s.sublibrary AND m.mat = s.mat AND m.file_name = s.file_name
  WHERE ${WHERE}
  GROUP BY 1, 2, 3, 4)
SELECT sub, za, liso, array_join(array_agg(CAST(mt AS varchar) || ':' || CAST(mask AS varchar) ORDER BY mt), ' ') AS mts
FROM k WHERE sub IN (${BOOKS.map((b) => `'${b.sub}'`).join(", ")}) GROUP BY 1, 2, 3 ORDER BY 1, 2, 3`, "sections")

const isoTag = (liso) => (liso > 0 ? (liso === 1 ? "m" : `m${liso}`) : "")
const labelOf = (z, a, liso) => `${z}-${SYM[z] ?? `Z${z}`}-${a === 0 ? "Nat" : a}${isoTag(liso)}`
const nameOf = (z, a, liso) => `${SYM[z] ?? `Z${z}`}-${a === 0 ? "nat" : a}${isoTag(liso)}`
/** JANIS's label to mine: "5-B-11", "6-C-Nat", "95-Am-242m"; JANIS writes a second isomer "72-Hf-178n" (mine "m2"). */
const janisLabel = (l) => l.replace(/^(\d+-[A-Za-z]+-\d+)[Mm](\d?)$/, "$1m$2").replace(/^(\d+-[A-Za-z]+-\d+)n$/, "$1m2")
const order = (l) => {
  const m = /^(\d+)-[A-Za-z]+-(\d+|Nat)(?:m(\d?))?$/.exec(l)
  return m ? [Number(m[1]), m[2] === "Nat" ? -1 : Number(m[2]), m[3] === undefined ? 0 : Number(m[3] || 1)] : [999, 0, 0]
}

const summary = {}
// The residuals MT 5 produces, per material and release: File 6 MT 5's product yields (endfb_eang, quantity yield) and File
// 10 MT 5's production sections (endfb_mult), heavier than an alpha.
const prods = athena(`WITH p AS (
  SELECT s.release, s.sublibrary, s.mat, s.file_name, CAST(round(s.zap) AS integer) AS zap FROM endfb_eang s
  WHERE s.mt = 5 AND s.quantity = 'yield' AND s.zap > 2004.5
  UNION SELECT s.release, s.sublibrary, s.mat, s.file_name, CAST(round(s.izap) AS integer) FROM endfb_mult s
  WHERE s.mf = 10 AND s.mt = 5 AND s.izap > 2004.5)
SELECT sub, za, liso, array_join(array_agg(CAST(zap AS varchar) || ':' || CAST(mask AS varchar) ORDER BY zap), ' ') AS x FROM (
  SELECT ${SUB} AS sub, CAST(m.za AS integer) AS za, COALESCE(m.liso, 0) AS liso, s.zap, sum(DISTINCT ${bit}) AS mask
  FROM p s JOIN endfb_materials m ON m.release = s.release AND m.sublibrary = s.sublibrary AND m.mat = s.mat AND m.file_name = s.file_name
  GROUP BY 1, 2, 3, 4)
WHERE sub IN (${BOOKS.map((b) => `'${b.sub}'`).join(", ")}) GROUP BY 1, 2, 3`, "products")

// The residual of a reaction: projectile and outgoing particles' (Z, A) taken from the compound nucleus.
const ZA_OF = { N: [0, 1], P: [1, 1], D: [1, 2], T: [1, 3], HE3: [2, 3], A: [2, 4], G: [0, 0] }
const PROJ_ZA = { n: [0, 1], g: [0, 0], p: [1, 1], d: [1, 2], t: [1, 3], h: [2, 3], a: [2, 4] }
const OUT = {
  4: "N", 11: "2N+D", 16: "2N", 17: "3N", 22: "N+A", 23: "N+3A", 24: "2N+A", 25: "3N+A", 28: "N+P", 29: "N+2A", 30: "2N+2A",
  32: "N+D", 33: "N+T", 34: "N+HE3", 35: "N+D+2A", 36: "N+T+2A", 37: "4N", 41: "2N+P", 42: "3N+P", 44: "N+2P", 45: "N+P+A",
  102: "G", 103: "P", 104: "D", 105: "T", 106: "HE3", 107: "A", 108: "2A", 109: "3A", 111: "2P", 112: "P+A", 113: "T+2A",
  114: "D+2A", 115: "P+D", 116: "P+T", 117: "D+A", 152: "5N", 153: "6N", 154: "2N+T", 155: "T+A", 156: "4N+P", 157: "3N+D",
  158: "N+D+A", 159: "2N+P+A", 160: "7N", 161: "8N", 162: "5N+P", 163: "6N+P", 164: "7N+P", 165: "4N+A", 166: "5N+A",
  167: "6N+A", 168: "7N+A", 169: "4N+D", 170: "5N+D", 171: "6N+D", 172: "3N+T", 173: "4N+T", 174: "5N+T", 175: "6N+T",
  176: "2N+HE3", 177: "3N+HE3", 178: "4N+HE3", 179: "3N+2P", 180: "3N+2A", 181: "3N+P+A", 182: "D+T", 183: "N+P+D",
  184: "N+P+T", 185: "N+D+T", 186: "N+P+HE3", 187: "N+D+HE3", 188: "N+T+HE3", 189: "N+T+A", 190: "2N+2P", 191: "P+HE3",
  192: "D+HE3", 193: "HE3+A", 194: "4N+2P", 195: "4N+2A", 196: "4N+P+A", 197: "3P", 198: "N+3P", 199: "3N+2P+A", 200: "5N+2P",
}
/** ZA of the residual of MT on a target (z, a) by projectile p; null for elastic, n' of neutrons, fission and sums. */
function residual(p, z, a, mt) {
  if (!a || (mt === 4 && p === "n")) return null
  const out = OUT[mt]
  if (!out) return null
  let rz = z + PROJ_ZA[p][0], ra = a + PROJ_ZA[p][1]
  for (const t of out.split("+")) {
    const m = /^(\d*)(HE3|[A-Z])$/.exec(t)
    const k = m[1] ? Number(m[1]) : 1
    rz -= k * ZA_OF[m[2]][0]
    ra -= k * ZA_OF[m[2]][1]
  }
  return rz >= 0 && ra > 0 && ra >= rz ? rz * 1000 + ra : null
}

for (const b of BOOKS) {
  const mine = new Map()
  for (const r of rows.filter((x) => x.sub === b.sub)) {
    const za = Number(r.za), liso = Number(r.liso), z = Math.floor(za / 1000), a = za % 1000
    mine.set(labelOf(z, a, liso), { l: labelOf(z, a, liso), n: nameOf(z, a, liso), m: r.mts })
  }
  const made = new Map()
  for (const r of prods.filter((x) => x.sub === b.sub)) {
    const za = Number(r.za), liso = Number(r.liso)
    made.set(labelOf(Math.floor(za / 1000), za % 1000, liso), r.x)
  }
  // JANIS's rail for the book, from the lake copy (or the local one janis-book-rails.sh left).
  const local = join(WORK, `janis-rail-${b.book}.jsonl`)
  try { aws("s3", "cp", "--quiet", `${LAKE}/janis-rail-${b.book}.jsonl`, local) } catch { /* the local copy, if any */ }
  const janis = new Map()
  if (existsSync(local))
    for (const line of readFileSync(local, "utf8").split("\n").filter(Boolean)) {
      const r = JSON.parse(line)
      if (r.error || !r.label) continue
      janis.set(janisLabel(r.label), r.mts.map((m) => Number(m.reac.replace(/^MT/, ""))).filter(Number.isFinite))
    }
  const labels = [...new Set([...mine.keys(), ...janis.keys()])].sort((x, y) => {
    const [a, b2] = [order(x), order(y)]
    return a[0] - b2[0] || a[1] - b2[1] || a[2] - b2[2]
  })
  const nuclides = labels.map((l) => {
    const m = mine.get(l), j = janis.get(l)
    const p = /^(\d+)-[A-Za-z]+-(\d+|Nat)(m\d?)?$/.exec(l)
    const n = m?.n ?? (p ? `${SYM[Number(p[1])]}-${p[2] === "Nat" ? "nat" : p[2]}${p[3] ?? ""}` : l)
    const x = made.get(l)
    return { l, n, ...(m ? { m: m.m } : {}), ...(j?.length ? { j: j.join(" ") } : {}), ...(x ? { x } : {}) }
  })
  const mts = (s) => (s ? s.split(" ").map((x) => Number(x.split(":")[0])) : [])
  let both = 0, missing = 0, ours = 0, produced = 0
  for (const x of nuclides) {
    const my = new Set(mts(x.m)), jm = new Set(x.j ? x.j.split(" ").map(Number) : [])
    const zx = new Set(x.x ? x.x.split(" ").map((v) => Number(v.split(":")[0])) : [])
    const pz = /^(\d+)-[A-Za-z]+-(\d+)/.exec(x.l)
    for (const t of jm) {
      if (my.has(t)) both++
      else if (pz && zx.has(residual(b.p, Number(pz[1]), Number(pz[2]), t))) produced++
      else missing++
    }
    for (const t of my) if (!jm.has(t)) ours++
  }
  const counts = {
    nuclides: nuclides.length, held_nuclides: mine.size, janis_nuclides: janis.size,
    missing_nuclides: nuclides.filter((x) => !x.m).length, ours_nuclides: nuclides.filter((x) => !x.j && x.m).length,
    mts_both: both, mts_missing: missing, mts_ours: ours, mts_produced: produced,
  }
  const out = { projectile: b.p, sub: b.sub, built: new Date().toISOString(), releases, janis_book: `https://www.oecd-nea.org/janisweb/book/${b.book}`, counts, nuclides }
  const file = join(ROOT, "public", "elpis", `book-${b.p}.json`)
  writeFileSync(file, JSON.stringify(out))
  aws("s3", "cp", "--quiet", file, `${LAKE}/book-${b.p}.json`, "--content-type", "application/json")
  console.log(b.p, JSON.stringify(counts))
  summary[b.p] = counts
}
const sfile = join(ROOT, "public", "elpis", "books.json")
writeFileSync(sfile, JSON.stringify({ built: new Date().toISOString(), releases, books: summary }))
aws("s3", "cp", "--quiet", sfile, `${LAKE}/books.json`, "--content-type", "application/json")
