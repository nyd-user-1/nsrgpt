// /docs' articles (2026-11-07): pax-trinity's help center (src/lib/docs), carried over in shape. Each article is
// markdown, written from the code as it stands: the chart pages, lib/viz-charts.ts, the README and the git history
// for the release notes. Revise an article when its page changes. The site speaks as I; the reader is you.

export type DocCategory = "get-started" | "charts" | "atlas" | "data" | "sources" | "navigation" | "panels" | "chat" | "faq" | "releases" | "guides"

export type Doc = {
  slug: string
  title: string
  category: DocCategory
  /** The line under the title: what the article helps you do. */
  summary: string
  tags?: string[]
  /** Kept from pax-trinity's shape: a page only staff can open. NSRgpt has none yet. */
  admins?: boolean
  body: string
}

/** A link to another article. */
export const doc = (slug: string) => `/docs/${slug}`
