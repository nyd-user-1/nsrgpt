import { HEADER_TITLES } from "@/lib/header-titles"
import { PLATE_PAGES, PLATE_TABLES, VIZ_CHARTS } from "@/lib/viz-charts"

/** The contents plate fills whatever height the page column leaves it (2026-11-04, Brendan: the
 *  masthead and plate must not move — / and /viz no longer scroll; the page is a viewport-fit
 *  column and the plate takes the leftover). Boxes resize to it (app/PlateGrid.tsx). */
export const PLATE_H = "h-full min-h-0"

/** One box on the contents plate (brief 46): the charts, the tables and the sidebar's other pages in one list, so A to Z,
 *  pins, hides and the dragged order treat them alike. `type`: a chart's or table's type, under its name. `lines`: a
 *  chart's axes, one a line. `body`: a page's description. `anchor`: its block's name on the Blocks shelf. */
export type PlateBox = { href: string; name: string; anchor: string; type?: string; lines?: string[]; body?: string }

const anchorOf = (href: string) => href.replace(/^\//, "").replace(/[^a-z0-9]+/gi, "-").toLowerCase()

/** A to Z by the name each box shows (Brendan, 2026-11-07); a box's own name, when it has one, leads (brief 36). */
export const PLATE_BOXES: PlateBox[] = [
  ...[...VIZ_CHARTS, ...PLATE_TABLES].map((c) => ({
    href: c.href,
    name: c.name ?? HEADER_TITLES[c.href] ?? c.title,
    anchor: anchorOf(c.href),
    type: c.title,
    lines: c.lines.filter((l) => !l.startsWith("Source: ")),
  })),
  ...PLATE_PAGES.map((p) => ({ href: p.href, name: p.name, anchor: anchorOf(p.href), body: p.body })),
  { href: "/lab", name: "Lab", anchor: anchorOf("/lab"), body: "Blocks that fetch, broaden, compare and plot nuclear data, and ask about it." },
].sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base", numeric: true }))
