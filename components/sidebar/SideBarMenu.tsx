"use client"

import * as React from "react"

import { usePathname } from "next/navigation"

import { Activity } from "@/components/animate-ui/icons/activity"
import { BookOpen } from "@/components/animate-ui/icons/book-open"
import { Database } from "@/components/animate-ui/icons/database"
import { Settings2 } from "@/components/animate-ui/icons/settings-2"
import { SidebarChats } from "@/components/sidebar/SidebarChats"
import { PAGE_ICONS } from "@/components/sidebar/page-icons"
import { SideBarMenuFoot, SideBarMenuGroup, SideBarMenuItem, SideBarMenuPinned } from "@/components/sidebar/SideBarMenuItem"
import { HEADER_TITLES } from "@/lib/header-titles"
import { VIZ_CHARTS } from "@/lib/viz-charts"
import { VIZ_TABLES, tableName } from "@/lib/viz-tables"
import { arrange, useNavRows, type NavEntry } from "@/lib/nav-rows"

// SideBarMenu (Brendan, 2026-11-06): the SearchBar on top, Chat second, then the rest A to Z, then the chats.
// pax-trinity's sidebar (components/shell.tsx) with Code/hq's row affordances and govblock's animate-ui icons.

const CHARTS = VIZ_CHARTS.map((c) => ({ href: c.href, label: HEADER_TITLES[c.href] ?? c.title }))
// A table goes by its chart's name, so two tables never share one. The GNDS 2.0 compiler sits with them, under Data
// (brief 58 follow-up). CINDA joins them (brief 65).
const TABLES = Object.keys(VIZ_TABLES).map((slug) => ({ href: `/viz/data/${slug}`, label: tableName(slug) }))
// The menu (Brendan, 2026-11-11): Chat and Search fixed at the top, a rule, then four folds. References are the pages
// you read; Tools the pages you run.
const REFERENCES = [
  { href: "/docs", label: "Docs" },
  { href: "/data-dictionary", label: "Data dictionary" },
  { href: "/glossary", label: "Glossary" },
  { href: "/schema", label: "Schema" },
  { href: "/comparison", label: "Comparison" },
  { href: "/nsrcpt", label: "NSR-CPT" },
  { href: "/about", label: "About" },
]
const TOOLS = [
  { href: "/graph", label: "Graph" },
  { href: "/lab", label: "Lab" },
  { href: "/sweep", label: "Sweep" },
  { href: "/sweep/medical", label: "Medical isotope routes" },
  { href: "/sweep/icrp", label: "ICRP 107 half-lives against ENSDF" },
  { href: "/gnds", label: "GNDS 2.0 compiler" },
  { href: "/cinda", label: "CINDA" },
  { href: "/janis", label: "JANIS" },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/factory", label: "Factory" },
]
// Every row the menu can show, for Pin to top, Hide and Archive (lib/nav-rows.ts).
const ALL: NavEntry[] = [
  { href: "/chat", label: "Chat", group: "Main" },
  { href: "/search", label: "Search", group: "Main" },
  ...CHARTS.map((c) => ({ ...c, group: "Charts" })),
  ...TABLES.map((c) => ({ ...c, group: "Data" })),
  ...REFERENCES.map((c) => ({ ...c, group: "References" })),
  ...TOOLS.map((c) => ({ ...c, group: "Tools" })),
]

export function SideBarMenu() {
  const path = usePathname()
  const isOn = (href: string) => path === href
  // A page and the pages beneath it light its row (/docs/*, /janis/*, /sweep/medical/*); /sweep itself only for the list and the pair.
  const sectionOn = (href: string) =>
    href === "/sweep" ? path === "/sweep" || path === "/sweep/pair" : path === href || path.startsWith(`${href}/`)
  const { rows } = useNavRows()
  const [showHidden, setShowHidden] = React.useState(false)
  const { pinned, archived, hiddenCount, place } = arrange(ALL, rows, showHidden)
  return (
    <div className="flex h-full flex-col px-3 pt-3">
      <nav className="-mx-1 flex max-h-[55%] shrink-0 flex-col gap-0.5 overflow-y-auto px-1">
        <SideBarMenuPinned pinned={pinned} isOn={isOn} />
        {place("/chat") && <SideBarMenuItem href="/chat" label="Chat" icon={PAGE_ICONS["/chat"]} on={path === "/chat"} />}
        {place("/search") && <SideBarMenuItem href="/search" label="Search" icon={PAGE_ICONS["/search"]} on={path === "/search"} />}
        <div aria-hidden className="my-2 border-t border-[var(--paper-rule-soft)]" />
        <SideBarMenuGroup label="Charts" icon={Activity} items={CHARTS} isOn={isOn} place={place} />
        <SideBarMenuGroup label="Data" icon={Database} items={TABLES} isOn={isOn} place={place} />
        <SideBarMenuGroup label="References" icon={BookOpen} items={REFERENCES} isOn={sectionOn} place={place} />
        <SideBarMenuGroup label="Tools" icon={Settings2} items={TOOLS} isOn={sectionOn} place={place} />
        <div aria-hidden className="my-2 border-t border-[var(--paper-rule-soft)]" />
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
