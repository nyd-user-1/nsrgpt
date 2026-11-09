import { notFound } from "next/navigation"

import { PAPER_BRIDGE } from "@/components/editorial/PaperBridge"
import { DataTable } from "@/components/viz/DataTable"
import { NuclidesTable } from "./nuclides-table"
import { ReactionsTable } from "./reactions-table"
import { VIZ_TABLES } from "@/lib/viz-tables"

// A chart's data, one table per /viz chart (2026-11-04): what a click on the chart opens in the second
// panel. Static — the twelve pages prerender, and the rows load in the browser from the snapshot.

export const dynamicParams = false

export function generateStaticParams() {
  return Object.keys(VIZ_TABLES).map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return { title: `${VIZ_TABLES[slug]?.title ?? "Chart"} — data` }
}

export default async function VizDataPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const t = VIZ_TABLES[slug]
  if (!t) notFound()
  return (
    <div className="flex-1 overflow-y-auto no-scrollbar text-[var(--paper-text)]" style={{ backgroundColor: "var(--paper)", ...PAPER_BRIDGE }}>
      {/* No heading of its own (brief 36): the app header names the page, with the click-to-copy, as on the chart pages
          (components/AppLayout.tsx); the second panel's header names it there. The column headings lead the pane. */}
      {/* The nuclides and reactions tables sort, filter and link (briefs 35, 36); the charts' tables are DataTable. */}
      {slug === "nuclides" ? <NuclidesTable /> : slug === "reactions" ? <ReactionsTable /> : <DataTable slug={slug} />}
    </div>
  )
}
