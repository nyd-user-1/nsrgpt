#!/usr/bin/env node
// Brief 69 (elpis-wire, 2026-11-11): the figures Elpis's browse shows beside each held row, from the lake.
//
//   node scripts/elpis/browse-counts.mjs [date]
//
// Two Athena queries (the AWS CLI, profile nysgpt-new; Node because the Mac has no python3):
//   ENDF: every section of every held release (POINT copies and the standards left out) by base, release, data type,
//         ZA and isomer: materials, sections, and the File 3 points (NP).
//   EXFOR: nsr.exfor_serve_search_index by projectile, SF6, target ZA and state: datasets and points.
// Out: public/elpis/counts/index.json { <base>: { <library slug>: n } } (a library's materials, or EXFOR's points), and
// public/elpis/counts/<base>/<library slug>.json { unit, lib, types: { <class>: n }, el: { <class>: { <symbol>: n } },
// iso: { <class>: { <"Fe56"|"C0"|"Am242m"> : n } } }, with lake copies in lake/elpis/<date>/counts/. Library slugs are
// the browse URL's ("ENDF-B-VIII.0", "JEFF-3.3", "EXFOR"); data type classes are ElpisBrowse's (lib/elpis.ts COUNT_CLASS).
// The figures: library, data type and element rows count materials (EXFOR: points); isotope rows count File 3 points
// for cross sections, sections for the other types (EXFOR: points).
import { execFileSync } from "node:child_process"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..")
const DATE = process.argv[2] || new Date().toISOString().slice(0, 10)
const BUCKET = "nsr-lake-613473203863"
const LAKE = `s3://${BUCKET}/lake/elpis/${DATE}/counts`
const AWS = ["--profile", "nysgpt-new", "--region", "us-east-2"]
const WORK = join(tmpdir(), "elpis-work")
const OUT = join(ROOT, "public", "elpis", "counts")
mkdirSync(WORK, { recursive: true })
const SYM = ["n", "H", "He", "Li", "Be", "B", "C", "N", "O", "F", "Ne", "Na", "Mg", "Al", "Si", "P", "S", "Cl", "Ar", "K", "Ca", "Sc", "Ti", "V", "Cr", "Mn", "Fe", "Co", "Ni", "Cu", "Zn", "Ga", "Ge", "As", "Se", "Br", "Kr", "Rb", "Sr", "Y", "Zr", "Nb", "Mo", "Tc", "Ru", "Rh", "Pd", "Ag", "Cd", "In", "Sn", "Sb", "Te", "I", "Xe", "Cs", "Ba", "La", "Ce", "Pr", "Nd", "Pm", "Sm", "Eu", "Gd", "Tb", "Dy", "Ho", "Er", "Tm", "Yb", "Lu", "Hf", "Ta", "W", "Re", "Os", "Ir", "Pt", "Au", "Hg", "Tl", "Pb", "Bi", "Po", "At", "Rn", "Fr", "Ra", "Ac", "Th", "Pa", "U", "Np", "Pu", "Am", "Cm", "Bk", "Cf", "Es", "Fm", "Md", "No", "Lr", "Rf", "Db", "Sg", "Bh", "Hs", "Mt", "Ds", "Rg", "Cn", "Nh", "Fl", "Mc", "Lv", "Ts", "Og"]
const BASE_OF_SUB = { neutrons: "N", gammas: "G", protons: "P", deuterons: "D", tritons: "T", helium3s: "HE3", alphas: "A", decay: "RDD", nfy: "RDD", sfy: "RDD" }
const BASE_OF_PROJ = { N: "N", G: "G", P: "P", D: "D", T: "T", HE3: "HE3", A: "A" }

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
function csv(text) {
  const rows = []
  let row = [], f = "", q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) { if (c === '"' && text[i + 1] === '"') { f += '"'; i++ } else if (c === '"') q = false; else f += c }
    else if (c === '"') q = true
    else if (c === ",") { row.push(f); f = "" }
    else if (c === "\n") { row.push(f); rows.push(row); row = []; f = "" }
    else if (c !== "\r") f += c
  }
  if (f || row.length) { row.push(f); rows.push(row) }
  const [head, ...body] = rows
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])))
}

const SUB = `CASE WHEN s.sublibrary = '(root)' AND s.release = 'B-VI.8' THEN (CASE m.nsub WHEN 0 THEN 'gammas' WHEN 10010 THEN 'protons'
    WHEN 10020 THEN 'deuterons' WHEN 10030 THEN 'tritons' WHEN 20030 THEN 'helium3s' WHEN 20040 THEN 'alphas' WHEN 4 THEN 'decay' WHEN 5 THEN 'sfy' WHEN 11 THEN 'nfy' ELSE 'neutrons' END)
  WHEN s.sublibrary = '(root)' THEN 'neutrons'
  ELSE regexp_replace(regexp_replace(s.sublibrary, '-version\\..*$', ''), '^triton$', 'tritons') END`
const CLASS = `CASE WHEN s.mf = 3 THEN 'SIG' WHEN s.mf = 4 THEN 'DA' WHEN s.mf = 5 THEN 'DE' WHEN s.mf = 6 THEN 'DADE' WHEN s.mf = 2 THEN 'RP'
  WHEN s.mf BETWEEN 31 AND 35 THEN 'COV' WHEN s.mf BETWEEN 12 AND 15 THEN 'PP' WHEN s.mf IN (9, 10) THEN 'MULT'
  WHEN s.mf = 8 AND s.mt IN (454, 459) THEN 'FY' WHEN s.mf = 8 AND s.mt = 457 THEN 'RDD' WHEN s.mf = 1 AND s.mt IN (452, 455, 456) THEN 'NU' END`
const endf = athena(`SELECT release, sub, cls, za, liso, count(DISTINCT key) AS mats, count(*) AS secs, sum(pts) AS pts FROM (
  SELECT s.release, ${SUB} AS sub, ${CLASS} AS cls, CAST(s.za AS integer) AS za, COALESCE(m.liso, 0) AS liso,
    s.file_name || '/' || CAST(s.mat AS varchar) AS key, CASE WHEN s.mf = 3 THEN COALESCE(s.np, 0) ELSE 0 END AS pts
  FROM endfb_sections s JOIN endfb_materials m
    ON m.release = s.release AND m.sublibrary = s.sublibrary AND m.mat = s.mat AND m.file_name = s.file_name
  WHERE s.release NOT LIKE '%-point-%' AND s.sublibrary NOT LIKE 'standards%')
WHERE cls IS NOT NULL GROUP BY 1, 2, 3, 4, 5`, "counts-endf")
const exfor = athena(`SELECT projectile, sf6, target_za, COALESCE(target_state, '') AS state, count(*) AS sets, sum(points) AS pts
FROM exfor_serve_search_index WHERE projectile IN ('N', 'G', 'P', 'D', 'T', 'HE3', 'A') AND sf6 IS NOT NULL AND target_za IS NOT NULL
GROUP BY 1, 2, 3, 4`, "counts-exfor")

const isoKey = (za, iso) => { const z = Math.floor(za / 1000), a = za % 1000; return `${SYM[z] ?? `Z${z}`}${a}${iso}` }
const libSlug = (r) => (r.startsWith("B-") ? `ENDF-${r}` : r).replace(/\//g, "-").replace(/\s+/g, "-")
const files = new Map()
const fileOf = (base, lib, unit) => {
  const k = `${base}/${lib}`
  if (!files.has(k)) files.set(k, { unit, lib: 0, types: {}, el: {}, iso: {}, isos: new Set() })
  return files.get(k)
}
const add = (o, k, v) => { o[k] = (o[k] ?? 0) + v }
for (const r of endf) {
  const base = BASE_OF_SUB[r.sub]
  if (!base) continue
  const f = fileOf(base, libSlug(r.release), "materials")
  const za = Number(r.za), liso = Number(r.liso), iso = liso === 1 ? "m" : liso === 2 ? "n" : ""
  const key = isoKey(za, iso), sym = SYM[Math.floor(za / 1000)] ?? ""
  f.isos.add(key)
  add(f.types, r.cls, Number(r.mats))
  add((f.el[r.cls] ??= {}), sym, Number(r.mats))
  add((f.iso[r.cls] ??= {}), key, r.cls === "SIG" ? Number(r.pts) : Number(r.secs))
}
for (const r of exfor) {
  const base = BASE_OF_PROJ[r.projectile]
  if (!base) continue
  const f = fileOf(base, "EXFOR", "points")
  const cls = r.sf6.replace(/\//g, "-")
  const za = Number(r.target_za), iso = /^M/i.test(r.state) ? "m" : ""
  const pts = Number(r.pts) || 0
  add(f.types, cls, pts)
  add((f.el[cls] ??= {}), SYM[Math.floor(za / 1000)] ?? "", pts)
  add((f.iso[cls] ??= {}), isoKey(za, iso), pts)
  f.lib += pts
}
const index = {}
for (const [k, f] of files) {
  if (f.unit === "materials") f.lib = f.isos.size
  delete f.isos
  const [base, lib] = k.split("/")
  ;(index[base] ??= {})[lib] = f.lib
  mkdirSync(join(OUT, base), { recursive: true })
  const file = join(OUT, base, `${lib}.json`)
  writeFileSync(file, JSON.stringify(f))
}
writeFileSync(join(OUT, "index.json"), JSON.stringify({ built: new Date().toISOString(), index }))
aws("s3", "cp", "--quiet", "--recursive", OUT, LAKE)
console.log(`${files.size} library files; ${JSON.stringify(Object.fromEntries(Object.entries(index).map(([b, v]) => [b, Object.keys(v).length])))}`)
