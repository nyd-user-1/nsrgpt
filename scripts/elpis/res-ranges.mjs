#!/usr/bin/env node
// Brief 69 follow-up (elpis-wire, 2026-11-11): where each release's File 3 is only the background, for the neutron book.
//
//   node scripts/elpis/res-ranges.mjs [date]
//
// One Athena query (the AWS CLI, profile nysgpt-new): nsr.endfb_res_ranges joined to endfb_materials, neutron
// sublibraries, the resolved and unresolved ranges (LRU 1 and 2) of the materials whose LRP is 1 (File 2's resonances are
// to be added to File 3, so File 3 inside them is the background), one span per release and nuclide: the lowest EL to the
// highest EH, and the highest LRF (7 is R-matrix limited, whose channels can include (n,p) and (n,α)).
// Out: public/elpis/res-ranges-n.json { built, ranges: { "<book label>": { "<release>": [el_ev, eh_ev, lrf] } } } and
// lake/elpis/<date>/res-ranges-n.json. The book draws a release's line dashed over that span when the API serves File 3
// as evaluated (not POINT), and offers PREPRO's reconstruction (nsr-jobs) in its place.
import { execFileSync } from "node:child_process"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..")
const DATE = process.argv[2] || new Date().toISOString().slice(0, 10)
const AWS = ["--profile", "nysgpt-new", "--region", "us-east-2"]
const WORK = join(tmpdir(), "elpis-work")
mkdirSync(WORK, { recursive: true })
const SYM = ["n", "H", "He", "Li", "Be", "B", "C", "N", "O", "F", "Ne", "Na", "Mg", "Al", "Si", "P", "S", "Cl", "Ar", "K", "Ca", "Sc", "Ti", "V", "Cr", "Mn", "Fe", "Co", "Ni", "Cu", "Zn", "Ga", "Ge", "As", "Se", "Br", "Kr", "Rb", "Sr", "Y", "Zr", "Nb", "Mo", "Tc", "Ru", "Rh", "Pd", "Ag", "Cd", "In", "Sn", "Sb", "Te", "I", "Xe", "Cs", "Ba", "La", "Ce", "Pr", "Nd", "Pm", "Sm", "Eu", "Gd", "Tb", "Dy", "Ho", "Er", "Tm", "Yb", "Lu", "Hf", "Ta", "W", "Re", "Os", "Ir", "Pt", "Au", "Hg", "Tl", "Pb", "Bi", "Po", "At", "Rn", "Fr", "Ra", "Ac", "Th", "Pa", "U", "Np", "Pu", "Am", "Cm", "Bk", "Cf", "Es", "Fm", "Md", "No", "Lr", "Rf", "Db", "Sg", "Bh", "Hs", "Mt", "Ds", "Rg", "Cn", "Nh", "Fl", "Mc", "Lv", "Ts", "Og"]

const aws = (...a) => execFileSync("aws", [...a, ...AWS], { encoding: "utf8", maxBuffer: 1 << 28 }).trim()
const sql = `SELECT r.release, CAST(m.za AS integer) AS za, COALESCE(m.liso, 0) AS liso, min(r.el_ev) AS el, max(r.eh_ev) AS eh, max(r.lrf) AS lrf
FROM endfb_res_ranges r JOIN endfb_materials m
  ON m.release = r.release AND m.sublibrary = r.sublibrary AND m.mat = r.mat AND m.file_name = r.file_name
WHERE r.lru IN (1, 2) AND m.lrp = 1 AND r.release NOT LIKE '%-point-%'
  AND (r.sublibrary LIKE 'neutrons%' OR (r.sublibrary = '(root)' AND COALESCE(m.nsub, 10) = 10))
GROUP BY 1, 2, 3`
const id = aws("athena", "start-query-execution", "--work-group", "nsrgpt", "--query-execution-context", "Database=nsr", "--query-string", sql, "--output", "text", "--query", "QueryExecutionId")
let out
for (;;) {
  const s = JSON.parse(aws("athena", "get-query-execution", "--query-execution-id", id, "--output", "json", "--query", "QueryExecution.{state:Status.State,why:Status.StateChangeReason,out:ResultConfiguration.OutputLocation}"))
  if (s.state === "SUCCEEDED") { out = s.out; break }
  if (s.state === "FAILED" || s.state === "CANCELLED") throw new Error(`${s.state} ${s.why}`)
  execFileSync("sleep", ["2"])
}
const file = join(WORK, "res-ranges.csv")
aws("s3", "cp", "--quiet", out, file)
const [head, ...lines] = readFileSync(file, "utf8").trim().split("\n").map((l) => l.split(",").map((x) => x.replace(/^"|"$/g, "")))
const col = Object.fromEntries(head.map((h, i) => [h, i]))
const ranges = {}
for (const r of lines) {
  const za = Number(r[col.za]), liso = Number(r[col.liso]), z = Math.floor(za / 1000), a = za % 1000
  const label = `${z}-${SYM[z] ?? `Z${z}`}-${a === 0 ? "Nat" : a}${liso === 1 ? "m" : liso > 1 ? `m${liso}` : ""}`
  ;(ranges[label] ??= {})[r[col.release]] = [Number(r[col.el]), Number(r[col.eh]), Number(r[col.lrf])]
}
const dest = join(ROOT, "public", "elpis", "res-ranges-n.json")
writeFileSync(dest, JSON.stringify({ built: new Date().toISOString(), ranges }))
aws("s3", "cp", "--quiet", dest, `s3://nsr-lake-613473203863/lake/elpis/${DATE}/res-ranges-n.json`, "--content-type", "application/json")
console.log(`${Object.keys(ranges).length} nuclides, ${lines.length} release spans`)
