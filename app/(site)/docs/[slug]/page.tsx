import Link from "next/link"
import { notFound } from "next/navigation"
import { BookOpen, ChevronRight } from "lucide-react"

import { PrevNext } from "@/components/docs/DocCards"
import { DocMarkdown } from "@/components/docs/DocMarkdown"
import { DocsToc } from "@/components/docs/DocsToc"
import { categoryOf, DOCS, docBySlug, headingsOf, neighbors, readMinutes } from "@/lib/docs"

type Props = { params: Promise<{ slug: string }> }

const SERIF = { fontFamily: "var(--font-display), Georgia, serif" } as const

export function generateStaticParams() {
  return DOCS.map((d) => ({ slug: d.slug }))
}

export async function generateMetadata({ params }: Props) {
  const d = docBySlug((await params).slug)
  return { title: d ? `${d.title} · Docs` : "Docs" }
}

// A help center article (pax-trinity's, 2026-11-07): the trail to its category, the title, the line under it, its
// tags and reading time, the article, the articles either side; its contents at the right.
export default async function DocPage({ params }: Props) {
  const { slug } = await params
  const d = docBySlug(slug)
  if (!d) notFound()
  const category = categoryOf(d.category)
  const { prev, next } = neighbors(d.slug)

  return (
    <div className="mx-auto flex max-w-[1260px] gap-16 px-10 pt-10 pb-28">
      <article className="min-w-0 max-w-[780px] flex-1">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[15px] text-[var(--paper-muted)]">
          <Link href="/docs" className="hover:text-[var(--paper-text)]">
            Help Center
          </Link>
          <ChevronRight aria-hidden className="size-4 text-[var(--paper-faint)]" />
          <Link href={category ? `/docs#${category.id}` : "/docs/video-guides"} className="text-[var(--paper-text)]">
            {category?.title ?? "Video guides"}
          </Link>
        </nav>

        <h1 className="mt-6 text-[42px] leading-[1.12] font-normal text-balance text-[var(--paper-text)]" style={SERIF}>
          {d.title}
        </h1>
        <p className="mt-5 text-[18px] leading-relaxed text-[var(--paper-muted)]">{d.summary}</p>
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {(d.tags ?? []).map((t) => (
            <span key={t} className="rounded-md bg-[var(--paper-quiet)] px-2 py-0.5 text-[12px] font-medium text-[var(--paper-muted)]">
              {t}
            </span>
          ))}
          <span className="ml-1 flex items-center gap-1.5 text-[13px] text-[var(--paper-faint)]">
            <BookOpen aria-hidden className="size-4" />
            {readMinutes(d.body)} min read
          </span>
        </div>
        <hr className="mt-9 mb-10 border-[color-mix(in_oklab,var(--paper-text)_18%,var(--paper))]" />

        <DocMarkdown>{d.body}</DocMarkdown>

        <PrevNext prev={prev && { slug: prev.slug, title: prev.title }} next={next && { slug: next.slug, title: next.title }} />
      </article>
      <aside className="hidden w-[230px] shrink-0 pt-[120px] xl:block">
        <DocsToc headings={headingsOf(d.body)} />
      </aside>
    </div>
  )
}
