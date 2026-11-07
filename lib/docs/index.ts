import { ATLAS } from "./atlas"
import { CHARTS } from "./charts"
import { DATA } from "./data"
import { GET_STARTED } from "./get-started"
import { CHAT, FAQ, GUIDES_PAGE, RELEASE_NOTES } from "./more"
import { NAVIGATION } from "./navigation"
import { PANELS } from "./panels"
import { SOURCES } from "./sources"
import type { Doc, DocCategory } from "./types"

export type { Doc, DocCategory } from "./types"

// pax-trinity's src/lib/docs/index.ts (2026-11-07), with NSRgpt's categories.

/** The help center's categories, in the nav's order. Video guides sits apart, under Learn by doing. */
export const CATEGORIES: { id: DocCategory; title: string; blurb: string }[] = [
  { id: "get-started", title: "Get started", blurb: "What NSRgpt is, accounts, and finding your way around." },
  { id: "charts", title: "Read charts", blurb: "The frame, the pointer, the controls, chart types and 3D." },
  { id: "atlas", title: "Chart atlas", blurb: "Every chart, what it plots and where its data comes from." },
  { id: "data", title: "Data tables", blurb: "Every chart's rows: open them, pick them, copy them." },
  { id: "sources", title: "Data sources", blurb: "NSR, ENSDF, XUNDL, EXFOR, AME2020 and the IAEA Live Chart." },
  { id: "navigation", title: "Search and navigation", blurb: "The sidebar, search, the Nav and moving between charts." },
  { id: "panels", title: "Panels and notes", blurb: "The second panel, the right panel, notes and Blocks." },
  { id: "chat", title: "Chat", blurb: "Ask about the corpus in plain words." },
  { id: "faq", title: "FAQ", blurb: "Answers to the questions people ask most." },
  { id: "releases", title: "Release notes", blurb: "What changed, day by day." },
]

export const DOCS: Doc[] = [...GET_STARTED, ...CHARTS, ...ATLAS, ...DATA, ...SOURCES, ...NAVIGATION, ...PANELS, ...CHAT, ...FAQ, ...RELEASE_NOTES, ...GUIDES_PAGE]

export const docBySlug = (slug: string | undefined) => (slug ? DOCS.find((d) => d.slug === slug) : undefined)
export const categoryOf = (id: DocCategory) => CATEGORIES.find((c) => c.id === id)
export const inCategory = (id: DocCategory) => DOCS.filter((d) => d.category === id)

/** A heading's anchor, shared by the article's headings and its contents. */
export const headingId = (text: string) =>
  text
    .toLowerCase()
    .replace(/[*`[\]]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")

/** The article's sections, for its contents. */
export const headingsOf = (body: string) => [...body.matchAll(/^## (.+)$/gm)].map((m) => ({ id: headingId(m[1]!), text: m[1]!.replace(/[*`]/g, "") }))

/** Minutes to read, at 200 words a minute; pictures and links don't count. */
export const readMinutes = (body: string) => Math.max(1, Math.round(body.replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\]\([^)]*\)/g, "]").split(/\s+/).filter(Boolean).length / 200))

/** The articles before and after, in the nav's order. */
export function neighbors(slug: string) {
  const order = [...CATEGORIES.flatMap((c) => inCategory(c.id)), ...DOCS.filter((d) => d.category === "guides")]
  const i = order.findIndex((d) => d.slug === slug)
  return { prev: i > 0 ? order[i - 1] : undefined, next: i >= 0 && i < order.length - 1 ? order[i + 1] : undefined }
}
