"use client"
// /janis/browse (brief 67): JANIS Web's "Browse database": the heading, the breadcrumb bar in the quiet tint, then a
// bordered list of rows about 49 px tall, each a link one level down in the house link colour. A nuclide row has
// JANIS's "Open" outline button before its name; a row with nowhere to go is plain text (muted when JANIS has it and I do not). The rows come from brief 68's crawl where it has reached the path
// (the index public/janis-tree.json, and a library's own file public/janis-tree/<file> once the path enters it), else
// from the hand list (lib/janis-tree.ts). ❌ after a row: JANIS has it, I do not (not a
// link); ✅: I have it, JANIS does not; no mark: both.
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { SERIF } from "@/app/(site)/(plate)/viz/box-style"
import { HOVER, LINE, LINK, Mark, TINT } from "@/components/janis/parts"
import { useCrawl, useCrawlFile } from "@/components/janis/use-crawl"
import { browse, browseCrawl, crawlFile } from "@/lib/janis-tree"
import { cn } from "@/lib/utils"

export function JanisBrowse({ path }: { path: string[] }) {
  const crawl = useCrawl()
  const lib = useCrawlFile(crawl ? crawlFile(crawl, path) : null)
  const hand = browse(path)
  // While the index loads, a path the hand list cannot answer waits instead of saying it is past the tree.
  const v = (crawl && browseCrawl(crawl, path, lib)) || (crawl === undefined && hand.missing ? { ...hand, missing: false, loading: true } : hand)
  const last = v.trail[v.trail.length - 1]
  return (
    <div className="mx-auto w-full max-w-[1140px] px-4 py-6 sm:px-6">
      <h2 className="mb-4 text-3xl tracking-tight text-[var(--paper-text)]" style={SERIF}>Browse database</h2>
      <nav aria-label="Breadcrumb" className={cn("mb-4 rounded-lg px-4 py-3 text-sm", TINT)}>
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {v.trail.map((t, i) => (
            <li key={t.href} className="inline-flex items-center gap-2">
              {i > 0 && <span className="text-[var(--paper-faint)]" aria-hidden="true">/</span>}
              {i === v.trail.length - 1 ? <span className="text-[var(--paper-muted)]" aria-current="page">{t.name}</span> : <Link href={t.href} className={LINK}>{t.name}</Link>}
            </li>
          ))}
        </ol>
      </nav>
      {v.missing && <p className="text-sm text-[var(--paper-muted)]">Nothing here yet: the path goes past the tree. <Link href={last.href} className={LINK}>Back to {last.name}</Link>.</p>}
      {!v.missing && !v.rows.length && <p className="text-sm text-[var(--paper-muted)]">{v.loading ? `Loading ${last.name}…` : v.pending ? `JANIS's rows under ${last.name} are still being read.` : `Nothing listed under ${last.name}.`}</p>}
      {v.rows.length > 0 && (
        <ul className={cn("overflow-hidden rounded-lg border", LINE)}>
          {v.rows.map((r, i) => (
            <li key={`${r.href}-${i}`} className={cn("flex min-h-[49px] items-center gap-3 border-b px-4 text-[15px] last:border-b-0", LINE, r.held && HOVER)}>
              {r.open && (r.held && r.href
                ? <Button asChild variant="outline" className="h-8 rounded-full px-4 text-xs"><Link href={r.href}>Open</Link></Button>
                : <Button variant="outline" disabled className="h-8 rounded-full px-4 text-xs">Open</Button>)}
              {r.open ? (
                <span className="font-mono text-sm text-[var(--paper-text)]">{r.name}<Mark kind={r.mark} /></span>
              ) : r.held ? (
                <Link href={r.href} className={cn(LINK, "flex min-h-[49px] flex-1 items-center")}>{r.name}<Mark kind={r.mark} /></Link>
              ) : (
                <span className={r.mark === "missing" ? "text-[var(--paper-muted)]" : "text-[var(--paper-text)]"}>{r.name}<Mark kind={r.mark} /></span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
