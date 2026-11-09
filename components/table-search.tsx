"use client"

import * as React from "react"
import { Search } from "lucide-react"

import { cn } from "@/lib/utils"

// Ported whole from pax2 (src/components/pax2-table2.tsx, 2026-11-08) for the Glossary and the Data dictionary, under
// NSRgpt's names and the paper palette. The in-card standard: the search sits in the card's own header row right after
// the title, the column header row pins, and the card's rows and tiles filter in place as you type. Wrap the whole card;
// drop <SearchField /> after the h2. Matching runs over `tbody tr` plus anything tagged data-find.

const Ctx = React.createContext<{ q: string; setQ: (v: string) => void }>({ q: "", setQ: () => {} })

export function SearchScope({ children, value: controlled, onChange }: { children: React.ReactNode; value?: string; onChange?: (v: string) => void }) {
  const [own, setOwn] = React.useState("")
  // Controlled when the block already filters its own rows in state.
  const q = onChange ? (controlled ?? "") : own
  const setQ = onChange ?? setOwn
  const ref = React.useRef<HTMLDivElement>(null)
  // Runs after every render so freshly-streamed rows respect the live query.
  React.useEffect(() => {
    if (onChange) return
    const root = ref.current
    if (!root) return
    const needle = q.trim().toLowerCase()
    for (const el of root.querySelectorAll<HTMLElement>("tbody tr, [data-find]")) {
      el.style.display = !needle || (el.textContent ?? "").toLowerCase().includes(needle) ? "" : "none"
    }
  })
  const value = React.useMemo(() => ({ q, setQ }), [q, setQ])
  return (
    <Ctx.Provider value={value}>
      <div ref={ref} className="contents">
        {children}
      </div>
    </Ctx.Provider>
  )
}

export function SearchField({ placeholder = "Search…", className }: { placeholder?: string; className?: string }) {
  const { q, setQ } = React.useContext(Ctx)
  return (
    <label className={cn("ml-1 flex h-7 w-44 items-center gap-1.5 rounded-full bg-[var(--paper-quiet)] px-2.5 transition-colors focus-within:bg-[color-mix(in_oklab,var(--paper-text)_8%,var(--paper))]", className)}>
      <Search className="size-3.5 shrink-0 text-[var(--paper-faint)]" />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} aria-label={placeholder} className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--paper-text)] outline-none placeholder:text-[var(--paper-faint)]" />
    </label>
  )
}
