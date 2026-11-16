#!/usr/bin/env node
// Brief 75 (lead's ruling, 2026-11-12): the book pages to fetch, stratified instead of in tree order.
//
//   node scripts/janis/strata.mjs            (Node on the Mac; the AWS CLI one call at a time, profile nysgpt-new)
//
// Strata, from JANIS's book rails (lake/elpis/2026-11-11/janis-rail-<book>.jsonl):
//   - C4's sample: ten pages a book, evenly spaced through its page order (crawl.py sample());
//   - every MT that occurs on at least 3 pages of a book, once per target class it occurs with: light (A <= 40),
//     medium (41-150), heavy (> 150), Nat (natural element); the page chosen is the middle one of that class in page order.
// A stratum a page already held covers (lake/_work/janis/book/<book>/<page>.xml) needs no fetch. JANIS opens a book on a
// random page (eight visits, eight pages, 2026-11-12), so there is no opening-page stratum.
// Out: lake/_work/janis/todo/books-strata.json { made, held_at_start, strata: [...], order: ["<book>/<page>", ...] },
// the order taking one page a book in turn (sample first), which crawl.py --mode books --order reads.
import { execFileSync } from "node:child_process"

const B = "nsr-lake-613473203863"
const AWS = ["--profile", "nysgpt-new", "--region", "us-east-2"]
const BOOKS = ["neutrons", "gammas", "protons", "deuterons", "tritons", "he3", "alphas"]
const aws = (...a) => execFileSync("aws", [...a, ...AWS], { encoding: "utf8", maxBuffer: 1 << 28 })

const held = new Set(aws("s3", "ls", `s3://${B}/lake/_work/janis/book/`, "--recursive").split("\n")
  .map((l) => l.match(/book\/([a-z0-9]+)\/(\d+)\.xml$/)).filter(Boolean).map((m) => `${m[1]}/${Number(m[2])}`))

const classOf = (label) => {
  const m = /^\d+-[A-Za-z]+-(\d+|Nat)/.exec(label)
  if (!m || m[1] === "Nat") return "Nat"
  const a = Number(m[1])
  return a <= 40 ? "light" : a <= 150 ? "medium" : "heavy"
}
const sample = (pages, n = 10) => pages.length <= n ? pages : [...Array(n)].map((_, i) => pages[Math.round(i * (pages.length - 1) / (n - 1))])

const strata = [], perBook = {}, heldByBook = {}
for (const b of BOOKS) {
  const pages = []
  for (const line of aws("s3", "cp", `s3://${B}/lake/elpis/2026-11-11/janis-rail-${b}.jsonl`, "-").split("\n")) {
    if (!line.trim()) continue
    const n = JSON.parse(line)
    for (const m of n.mts) pages.push({ book: b, page: m.page, nuclide: n.label, reac: m.reac, cls: classOf(n.label) })
  }
  pages.sort((x, y) => x.page - y.page)
  heldByBook[b] = pages.filter((p) => held.has(`${b}/${p.page}`)).length
  const list = []
  for (const p of sample(pages)) list.push({ kind: "sample", book: b, mt: p.reac, class: p.cls, page: p.page, held: held.has(`${b}/${p.page}`) })
  const byMt = new Map()
  for (const p of pages) { if (!byMt.has(p.reac)) byMt.set(p.reac, []); byMt.get(p.reac).push(p) }
  for (const [mt, ps] of byMt) {
    if (ps.length < 3) continue
    for (const cls of ["light", "medium", "heavy", "Nat"]) {
      const inCls = ps.filter((p) => p.cls === cls)
      if (!inCls.length) continue
      const have = inCls.find((p) => held.has(`${b}/${p.page}`))
      const p = have ?? inCls[Math.floor(inCls.length / 2)]
      list.push({ kind: "mt-class", book: b, mt, class: cls, page: p.page, pages_in_stratum: inCls.length, held: !!have })
    }
  }
  strata.push(...list)
  perBook[b] = { pages: pages.length, held: heldByBook[b], strata: list.length, to_fetch: new Set(list.filter((s) => !s.held).map((s) => s.page)).size }
}
// one page a book in turn, the sample first
const queues = BOOKS.map((b) => [...strata.filter((s) => s.book === b && s.kind === "sample" && !s.held),
  ...strata.filter((s) => s.book === b && s.kind === "mt-class" && !s.held)])
const order = [], seen = new Set()
while (queues.some((q) => q.length)) for (const q of queues) {
  const s = q.shift()
  if (s && !seen.has(`${s.book}/${s.page}`)) { seen.add(`${s.book}/${s.page}`); order.push(`${s.book}/${s.page}`) }
}
const doc = { made: new Date().toISOString(), held_at_start: held.size, per_book: perBook, strata, order }
execFileSync("aws", ["s3", "cp", "-", `s3://${B}/lake/_work/janis/todo/books-strata.json`, ...AWS], { input: JSON.stringify(doc) })
console.log(JSON.stringify({ held: held.size, per_book: perBook, strata: strata.length, to_fetch: order.length }, null, 1))
