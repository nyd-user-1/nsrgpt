import { CATEGORIES, DOCS } from "@/lib/docs"
import { HEADER_TITLES } from "@/lib/header-titles"
import { VIZ_CHARTS } from "@/lib/viz-charts"
import { VIZ_TABLES } from "@/lib/viz-tables"

// What the ⌘K search (CommandPalette) searches (2026-11-06; the docs' articles, 2026-11-07). Charts, data tables, articles and pages are the site's own lists,
// searched in the browser; chats come from the chat store when the search opens. Nothing here calls a server, so
// it answers the same on dev and production.

export type SearchKind = "chart" | "data" | "doc" | "chat" | "page"
export type SearchItem = { kind: SearchKind; href: string; title: string; snippet?: string; meta?: string; keywords?: string }

/** The scope chips, in order; "all" searches every kind. */
export const SCOPES: { scope: "all" | SearchKind; label: string }[] = [
  { scope: "all", label: "All" },
  { scope: "chart", label: "Charts" },
  { scope: "data", label: "Data" },
  { scope: "doc", label: "Docs" },
  { scope: "chat", label: "Chats" },
  { scope: "page", label: "Pages" },
]

/** A typed "/chart " etc. narrows the scope, Slack-style. */
export const SCOPE_ALIASES: Record<string, SearchKind> = {
  chart: "chart", charts: "chart",
  data: "data", table: "data", tables: "data",
  doc: "doc", docs: "doc", help: "doc",
  chat: "chat", chats: "chat",
  page: "page", pages: "page",
}

const CHARTS: SearchItem[] = VIZ_CHARTS.map((c) => ({
  kind: "chart",
  href: c.href,
  title: HEADER_TITLES[c.href] ?? c.title,
  snippet: c.body,
  meta: [c.title, c.lines.find((l) => l.startsWith("Source:"))?.slice(8)].filter(Boolean).join(" · "),
  keywords: c.lines.join(" "),
}))

const TABLES: SearchItem[] = Object.entries(VIZ_TABLES).map(([slug, t]) => ({
  kind: "data",
  href: `/viz/data/${slug}`,
  title: HEADER_TITLES[`/viz/${slug}`] ?? t.title,
  snippet: t.title,
  meta: "Data table",
  keywords: "table rows data",
}))

// The help center's articles: title, the line under it and its tags; the bodies stay out of the search.
const ARTICLES: SearchItem[] = DOCS.map((d) => ({
  kind: "doc",
  href: `/docs/${d.slug}`,
  title: d.title,
  snippet: d.summary,
  meta: CATEGORIES.find((c) => c.id === d.category)?.title ?? "Video guides",
  keywords: (d.tags ?? []).join(" "),
}))

const PAGES: SearchItem[] = [
  { kind: "page", href: "/", title: "Home", keywords: "index charts boxes root" },
  { kind: "page", href: "/chat", title: "Chat", keywords: "ask new chat nsr" },
  { kind: "page", href: "/docs", title: "Docs", keywords: "help center articles guides" },
  { kind: "page", href: "/graph", title: "Graph", keywords: "workspace canvas papers authors nuclides reactions exfor" },
  { kind: "page", href: "/search", title: "Search", keywords: "nsr references papers records find" },
  { kind: "page", href: "/account", title: "Account", keywords: "usage plan billing" },
  { kind: "page", href: "/profile", title: "Profile", keywords: "name email" },
  { kind: "page", href: "/settings", title: "Settings", keywords: "preferences theme" },
  { kind: "page", href: "/notifications", title: "Notifications", keywords: "alerts" },
]

export const STATIC_ITEMS: SearchItem[] = [...CHARTS, ...TABLES, ...ARTICLES, ...PAGES]
