"use client"
// /elpis (briefs 67, 69): the home page's figures. The foot counts every mark: from brief 68's crawl once
// public/janis-tree.json is there (node by node), else the hand list (each name once); the home page's ❌ cards are added
// to the ❌ count. The Browse card's line: the records I hold (/counts) and the rows of JANIS's tree (the crawl's root).
// The Books card's figures: each book's nuclides from public/elpis/books.json (scripts/elpis/book-index.mjs).
import { useEffect, useState } from "react"
import { useCrawl } from "@/components/elpis/use-crawl"
import { crawlCounts, handCounts, HOME_GAPS } from "@/lib/janis-tree"
import { apiUrl } from "@/lib/api-url"
import { compact } from "@/lib/compact"

const n = (v: number) => v.toLocaleString("en-US")
const short = (v: number) => { const f = compact(v); return `${f.count.toFixed(f.decimals)}${f.suffix}` }

export function ElpisCounts() {
  const crawl = useCrawl()
  const c = crawl ? crawlCounts(crawl) : handCounts()
  return (
    <p className="mt-8 text-sm text-[var(--paper-muted)]">
      ❌ JANIS has it and I do not: {n(c.missing + HOME_GAPS.length)} · no mark, both hold it: {n(c.same)} · ✅ I have it and JANIS does not: {n(c.ours)}.
    </p>
  )
}

let countsLoad: Promise<number | null> | undefined
/** The Browse card's figures: "5.9B records I hold · 104K rows in JANIS's tree". */
export function BrowseFigures() {
  const crawl = useCrawl()
  const [records, setRecords] = useState<number | null>(null)
  useEffect(() => {
    countsLoad ??= fetch(apiUrl("/counts")).then((r) => r.json()).then((j) => (typeof j.total_records === "number" ? j.total_records : null)).catch(() => null)
    let live = true
    countsLoad.then((v) => { if (live) setRecords(v) })
    return () => { live = false }
  }, [])
  const c = crawl ? crawlCounts(crawl) : null
  const rows = c ? c.missing + c.same + c.ours : null
  if (records === null && rows === null) return null
  return (
    <p className="font-mono text-xs text-[var(--paper-muted)]">
      {[records !== null && `${short(records)} records I hold`, rows !== null && `${short(rows)} rows in JANIS's tree`].filter(Boolean).join(" · ")}
    </p>
  )
}

type Books = { books: Record<string, { held_nuclides: number; janis_nuclides: number }> }
let booksLoad: Promise<Books | null> | undefined
/** A Books button's figure: the nuclides I hold for the book, and JANIS's. */
export function BookFigure({ p }: { p: string }) {
  const [b, setB] = useState<Books | null>(null)
  useEffect(() => {
    booksLoad ??= fetch("/elpis/books.json").then((r) => (r.ok ? r.json() : null)).catch(() => null)
    let live = true
    booksLoad.then((v) => { if (live) setB(v) })
    return () => { live = false }
  }, [])
  const c = b?.books[p]
  if (!c) return null
  return <span className="ml-auto font-mono text-xs opacity-70" title={`I hold ${n(c.held_nuclides)} nuclides; JANIS's book lists ${n(c.janis_nuclides)}`}>{n(c.held_nuclides)}</span>
}
