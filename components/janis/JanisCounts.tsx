"use client"
// /janis (brief 67): the home page's foot, every mark counted: from brief 68's crawl once public/janis-tree.json is
// there (node by node), else the hand list (each name once); the home page's two ❌ cards are added to the ❌ count.
import { useCrawl } from "@/components/janis/use-crawl"
import { crawlCounts, handCounts, HOME_GAPS } from "@/lib/janis-tree"

export function JanisCounts() {
  const crawl = useCrawl()
  const c = crawl ? crawlCounts(crawl) : handCounts()
  const n = (v: number) => v.toLocaleString("en-US")
  return (
    <p className="mt-8 text-sm text-[var(--paper-muted)]">
      ❌ JANIS has it and I do not: {n(c.missing + HOME_GAPS.length)} · no mark, both hold it: {n(c.same)} · ✅ I have it and JANIS does not: {n(c.ours)}.
    </p>
  )
}
