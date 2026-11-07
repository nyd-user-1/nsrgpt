import { DocsNav, type NavCategory } from "@/components/docs/DocsNav"
import { CATEGORIES, inCategory } from "@/lib/docs"

// The help center's frame (pax-trinity's /docs layout, 2026-11-07): DocsNav, then the article's own column, which
// scrolls on its own (#docs-scroll, the contents' scroll-spy reads it). Inside the app shell, under the header.
export default function DocsLayout({ children }: { children: React.ReactNode }) {
  const categories: NavCategory[] = CATEGORIES.map((c) => ({
    id: c.id,
    title: c.title,
    docs: inCategory(c.id).map((d) => ({ slug: d.slug, title: d.title })),
  }))
  return (
    <div className="flex min-h-0 flex-1 bg-[var(--paper)] text-[var(--paper-text)]">
      <div className="hidden md:block">
        <DocsNav categories={categories} />
      </div>
      <div id="docs-scroll" className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  )
}
