import Link from "next/link"

import { DocCard, TopicCard, VideoCard } from "@/components/docs/DocCards"
import { ICONS } from "@/components/docs/icons"
import { CATEGORIES, docBySlug, inCategory } from "@/lib/docs"
import { DOCS_MEDIA, GUIDES } from "@/lib/docs/media"

export const metadata = { title: "Docs" }

const SERIF = { fontFamily: "var(--font-display), Georgia, serif" } as const
const EYEBROW = "mb-5 text-[12px] font-medium uppercase tracking-[0.08em] text-[var(--paper-faint)]"

// The first nine to read, each with its picture, captured in dark mode and light (<name>.jpg, <name>.light.jpg).
const START = [
  { slug: "welcome", shot: "home" },
  { slug: "chart-pages", shot: "chart-nebula" },
  { slug: "find-your-way", shot: "sidebar" },
  { slug: "three-d", shot: "engaged" },
  { slug: "data-tables", shot: "data-table" },
  { slug: "panel-2", shot: "panel-2" },
  { slug: "sources-overview", shot: "chart-heatmap" },
  { slug: "notes", shot: "notes" },
  { slug: "search", shot: "search" },
]

// /docs: the help center's front page (pax-trinity's, 2026-11-07): start here, the topics, the video guides.
export default function DocsHome() {
  return (
    <div className="mx-auto max-w-[1120px] px-10 pt-14 pb-24">
      <h1 className="text-[44px] leading-tight font-normal text-[var(--paper-text)]" style={SERIF}>
        How can I help?
      </h1>

      <section className="mt-12">
        <h2 className={EYEBROW}>Start here</h2>
        <div className="grid gap-5 md:grid-cols-3">
          {START.map(({ slug, shot }) => {
            const d = docBySlug(slug)!
            return <DocCard key={slug} href={`/docs/${slug}`} image={`${DOCS_MEDIA}/shots/${shot}.jpg`} lightImage={`${DOCS_MEDIA}/shots/${shot}.light.jpg`} title={d.title} summary={d.summary} />
          })}
        </div>
      </section>

      <section className="mt-16">
        <h2 className={EYEBROW}>Browse by topic</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {CATEGORIES.map((c) => {
            const docs = inCategory(c.id)
            return <TopicCard key={c.id} id={c.id} href={`/docs/${docs[0]!.slug}`} icon={ICONS[c.id]} title={c.title} blurb={c.blurb} count={docs.length} />
          })}
        </div>
      </section>

      <section className="mt-16">
        <div className="mb-5 flex items-baseline justify-between">
          <h2 className={EYEBROW.replace("mb-5 ", "")}>Video guides</h2>
          <Link href="/docs/video-guides" className="text-[14px] font-medium text-[var(--paper-strong)] hover:underline">
            See all
          </Link>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {GUIDES.slice(0, 3).map((g) => (
            <VideoCard key={g.name} href={`/docs/${g.article}`} poster={`${DOCS_MEDIA}/videos/${g.name}.jpg`} title={g.title} summary={g.summary} />
          ))}
        </div>
      </section>
    </div>
  )
}
