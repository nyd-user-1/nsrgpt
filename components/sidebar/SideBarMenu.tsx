"use client"

import * as React from "react"
import { FlaskConical } from "lucide-react"
import { usePathname } from "next/navigation"

import { Activity } from "@/components/animate-ui/icons/activity"
import { Database } from "@/components/animate-ui/icons/database"
import { SearchBar } from "@/components/search/SearchBar"
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
const TABLES = [...Object.keys(VIZ_TABLES).map((slug) => ({ href: `/viz/data/${slug}`, label: tableName(slug) })), { href: "/gnds", label: "GNDS 2.0 compiler" }, { href: "/cinda", label: "CINDA" }]
// Every row the menu can show, for Pin to top, Hide and Archive (lib/nav-rows.ts).
const ALL: NavEntry[] = [
  { href: "/chat", label: "Chat", group: "Main" },
  { href: "/about", label: "About", group: "Main" },
  { href: "/comparison", label: "Comparison", group: "Main" },
  ...CHARTS.map((c) => ({ ...c, group: "Charts" })),
  ...TABLES.map((c) => ({ ...c, group: "Data" })),
  { href: "/data-dictionary", label: "Data dictionary", group: "Main" },
  { href: "/docs", label: "Docs", group: "Main" },
  { href: "/factory", label: "Factory", group: "Main" },
  { href: "/glossary", label: "Glossary", group: "Main" },
  { href: "/graph", label: "Graph", group: "Main" },
  { href: "/janis", label: "JANIS", group: "Main" },
  { href: "/lab", label: "Lab", group: "Main" },
  { href: "/nsrcpt", label: "NSR-CPT", group: "Main" },
  { href: "/pipeline", label: "Pipeline", group: "Main" },
  { href: "/schema", label: "Schema", group: "Main" },
  { href: "/search", label: "Search", group: "Main" },
  { href: "/sweep", label: "Sweep", group: "Main" },
  { href: "/sweep/medical", label: "Medical isotope routes", group: "Main" },
  { href: "/sweep/icrp", label: "ICRP 107 half-lives against ENSDF", group: "Main" },
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
        {place("/chat") && <SideBarMenuItem href="/chat" label="Chat" icon={PAGE_ICONS["/chat"]} on={path === "/chat"} />}
        {place("/about") && <SideBarMenuItem href="/about" label="About" icon={PAGE_ICONS["/about"]} on={path === "/about"} />}
        <SideBarMenuGroup label="Charts" icon={Activity} items={CHARTS} isOn={isOn} place={place} />
        {place("/comparison") && <SideBarMenuItem href="/comparison" label="Comparison" icon={PAGE_ICONS["/comparison"]} on={path === "/comparison"} />}
        <SideBarMenuGroup label="Data" icon={Database} items={TABLES} isOn={isOn} place={place} />
        {place("/data-dictionary") && <SideBarMenuItem href="/data-dictionary" label="Data dictionary" icon={PAGE_ICONS["/data-dictionary"]} on={path === "/data-dictionary"} />}
        {place("/docs") && <SideBarMenuItem href="/docs" label="Docs" icon={PAGE_ICONS["/docs"]} on={path === "/docs" || path.startsWith("/docs/")} />}
        {place("/factory") && <SideBarMenuItem href="/factory" label="Factory" icon={PAGE_ICONS["/factory"]} on={path === "/factory"} />}
        {place("/glossary") && <SideBarMenuItem href="/glossary" label="Glossary" icon={PAGE_ICONS["/glossary"]} on={path === "/glossary"} />}
        {place("/graph") && <SideBarMenuItem href="/graph" label="Graph" icon={PAGE_ICONS["/graph"]} on={path === "/graph"} />}
        {place("/janis") && <SideBarMenuItem href="/janis" label="JANIS" icon={PAGE_ICONS["/janis"]} on={path === "/janis" || path.startsWith("/janis/")} />}
        {place("/lab") && <SideBarMenuItem href="/lab" label="Lab" icon={FlaskConical} on={path === "/lab"} />}
        {place("/nsrcpt") && <SideBarMenuItem href="/nsrcpt" label="NSR-CPT" icon={PAGE_ICONS["/nsrcpt"]} on={path === "/nsrcpt"} />}
        {place("/pipeline") && <SideBarMenuItem href="/pipeline" label="Pipeline" icon={PAGE_ICONS["/pipeline"]} on={path === "/pipeline"} />}
        {place("/schema") && <SideBarMenuItem href="/schema" label="Schema" icon={PAGE_ICONS["/schema"]} on={path === "/schema"} />}
        {place("/search") && <SideBarMenuItem href="/search" label="Search" icon={PAGE_ICONS["/search"]} on={path === "/search"} />}
        {place("/sweep") && <SideBarMenuItem href="/sweep" label="Sweep" icon={PAGE_ICONS["/sweep"]} on={path === "/sweep" || path === "/sweep/pair"} />}
        {/* Under the sweep, as a slice of it (brief 58, D). */}
        {place("/sweep/medical") && <SideBarMenuItem href="/sweep/medical" label="Medical isotope routes" icon={PAGE_ICONS["/sweep/medical"]} on={path.startsWith("/sweep/medical")} />}
        {place("/sweep/icrp") && <SideBarMenuItem href="/sweep/icrp" label="ICRP 107 half-lives against ENSDF" icon={PAGE_ICONS["/sweep/icrp"]} on={path === "/sweep/icrp"} />}
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
