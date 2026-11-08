"use client"

import * as React from "react"
import { usePathname } from "next/navigation"

import { MessagesSquare } from "@/components/animate-ui/icons/messages-square"
import { SquarePlay } from "@/components/animate-ui/icons/square-play"
import { ICONS } from "@/components/docs/icons"
import { SearchBar } from "@/components/search/SearchBar"
import { PAPER_TAB, RailToggle } from "@/components/rail-toggle"
import { cn } from "@/lib/utils"
import { SideBarMenuFoot, SideBarMenuGroup, SideBarMenuItem, SideBarMenuPinned } from "@/components/sidebar/SideBarMenuItem"
import { arrange, useNavRows } from "@/lib/nav-rows"
import type { DocCategory } from "@/lib/docs"

// DocsNav (2026-11-07): pax-trinity's help center sidebar (components/docs/docs-nav.tsx) — the SearchBar, the
// categories opening into their articles (the open article's opens itself), then Learn by doing and Support — built
// from the SideBarMenu's own rows, so it reads as the same sidebar: two-tone icons, branch lines, the UpRight Arrow
// and the Kebab.

export type NavDoc = { slug: string; title: string }
export type NavCategory = { id: DocCategory; title: string; docs: NavDoc[] }

const LABEL = "px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--paper-faint)]"

export function DocsNav({ categories }: { categories: NavCategory[] }) {
  const path = usePathname()
  const isOn = (href: string) => path === href
  const { rows } = useNavRows()
  const [showHidden, setShowHidden] = React.useState(false)
  const all = categories.flatMap((c) => c.docs.map((d) => ({ href: `/docs/${d.slug}`, label: d.title, group: c.title })))
  const { pinned, archived, hiddenCount, place } = arrange(all, rows, showHidden)

  return (
    // govblock's rail tab (components/rail-toggle.tsx, 2026-11-07): the black chevron tab pinned to the panel's edge
    // opens and closes it, and rides the edge as the column slides, so it looks to drag the panel open. The tab
    // overhangs the column; the column's inner box clips the nav. Open or closed is <html data-rail-left>.
    <div className="relative h-full w-[284px] shrink-0 transition-[width] duration-[500ms] ease-in-out [[data-rail-left=closed]_&]:w-0">
    {/* The paper's tab (rail-toggle.tsx PAPER_TAB, 2026-11-08), flat against the panel's edge. */}
    <RailToggle side="left" className={cn(PAPER_TAB, "right-0 border-l-0")} />
    <div className="h-full w-full overflow-hidden">
    <nav aria-label="Docs" className="no-scrollbar flex h-full w-[284px] shrink-0 flex-col overflow-y-auto border-r border-[var(--paper-rule)] px-4 pt-5 pb-10">
      {/* The SearchBar, as the SideBarMenu's: it opens ⌘K, whose Docs chip narrows to the articles (2026-11-07). */}
      <SearchBar />

      <p className={`${LABEL} mt-4`}>Help Center</p>
      <div className="flex flex-col gap-0.5">
        <SideBarMenuPinned pinned={pinned} isOn={isOn} />
        {categories.map((c) => (
          <SideBarMenuGroup key={c.id} label={c.title} icon={ICONS[c.id]} items={c.docs.map((d) => ({ href: `/docs/${d.slug}`, label: d.title }))} isOn={isOn} openWhenHolding place={place} />
        ))}
        <SideBarMenuFoot archived={archived} hiddenCount={hiddenCount} showHidden={showHidden} onShowHidden={setShowHidden} isOn={isOn} />
      </div>

      <p className={`${LABEL} mt-8`}>Learn by doing</p>
      <SideBarMenuItem href="/docs/video-guides" label="Video guides" icon={SquarePlay} on={isOn("/docs/video-guides")} group="Docs" />

      <p className={`${LABEL} mt-8`}>Support</p>
      <SideBarMenuItem href="/chat" label="Ask NSRgpt in Chat" icon={MessagesSquare} on={false} group="Docs" />
    </nav>
    </div>
    </div>
  )
}
