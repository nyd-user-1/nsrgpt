"use client"

import * as React from "react"
import { usePathname } from "next/navigation"

import { Activity } from "@/components/animate-ui/icons/activity"
import { Blocks } from "@/components/animate-ui/icons/blocks"
import { BookOpen } from "@/components/animate-ui/icons/book-open"
import { Database } from "@/components/animate-ui/icons/database"
import { MessagesSquare } from "@/components/animate-ui/icons/messages-square"
import { Radar } from "@/components/animate-ui/icons/radar"
import { SearchBar } from "@/components/search/SearchBar"
import { SidebarChats } from "@/components/sidebar/SidebarChats"
import { SideBarMenuFoot, SideBarMenuGroup, SideBarMenuItem, SideBarMenuPinned } from "@/components/sidebar/SideBarMenuItem"
import { HEADER_TITLES } from "@/lib/header-titles"
import { VIZ_CHARTS } from "@/lib/viz-charts"
import { VIZ_TABLES } from "@/lib/viz-tables"
import { arrange, useNavRows, type NavEntry } from "@/lib/nav-rows"

// SideBarMenu (Brendan, 2026-11-06): the SearchBar on top, Chat second, then the rest A to Z, then the chats.
// pax-trinity's sidebar (components/shell.tsx) with Code/hq's row affordances and govblock's animate-ui icons.

const CHARTS = VIZ_CHARTS.map((c) => ({ href: c.href, label: HEADER_TITLES[c.href] ?? c.title }))
// A table goes by its chart's name, so two tables never share one.
const TABLES = Object.entries(VIZ_TABLES).map(([slug, t]) => ({ href: `/viz/data/${slug}`, label: HEADER_TITLES[`/viz/${slug}`] ?? t.title }))
// Every row the menu can show, for Pin to top, Hide and Archive (lib/nav-rows.ts).
const ALL: NavEntry[] = [
  { href: "/chat", label: "Chat", group: "Main" },
  ...CHARTS.map((c) => ({ ...c, group: "Charts" })),
  ...TABLES.map((c) => ({ ...c, group: "Data" })),
  { href: "/docs", label: "Docs", group: "Main" },
  { href: "/graph", label: "Graph", group: "Main" },
  { href: "/search", label: "Search", group: "Main" },
]

export function SideBarMenu() {
  const path = usePathname()
  const isOn = (href: string) => path === href
  const { rows } = useNavRows()
  const [showHidden, setShowHidden] = React.useState(false)
  const { pinned, archived, hiddenCount, place } = arrange(ALL, rows, showHidden)
  return (
    <div className="flex h-full flex-col px-3 pt-3">
      <div className="mb-3">
        <SearchBar />
      </div>
      <nav className="-mx-1 flex max-h-[55%] shrink-0 flex-col gap-0.5 overflow-y-auto px-1">
        <SideBarMenuPinned pinned={pinned} isOn={isOn} />
        {place("/chat") && <SideBarMenuItem href="/chat" label="Chat" icon={MessagesSquare} on={path === "/chat"} />}
        <SideBarMenuGroup label="Charts" icon={Activity} items={CHARTS} isOn={isOn} place={place} />
        <SideBarMenuGroup label="Data" icon={Database} items={TABLES} isOn={isOn} place={place} />
        {place("/docs") && <SideBarMenuItem href="/docs" label="Docs" icon={BookOpen} on={path === "/docs" || path.startsWith("/docs/")} />}
        {place("/graph") && <SideBarMenuItem href="/graph" label="Graph" icon={Blocks} on={path === "/graph"} />}
        {place("/search") && <SideBarMenuItem href="/search" label="Search" icon={Radar} on={path === "/search"} />}
        <SideBarMenuFoot archived={archived} hiddenCount={hiddenCount} showHidden={showHidden} onShowHidden={setShowHidden} isOn={isOn} />
      </nav>
      <div className="mt-3 flex min-h-0 flex-1 flex-col border-t border-[var(--paper-rule-soft)] pt-3">
        <React.Suspense>
          <SidebarChats />
        </React.Suspense>
      </div>
    </div>
  )
}
