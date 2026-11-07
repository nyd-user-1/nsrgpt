"use client"

import { openCommandK } from "@/components/search/CommandKHost"

// SearchBar (2026-11-06): Code/hq's Quick search (app/ui/quick-search-item.tsx), a button dressed as a search field
// that opens the ⌘K search (CommandPalette). Colours are the paper tokens.
export function SearchBar() {
  return (
    <button
      type="button"
      onClick={openCommandK}
      className="flex w-full shrink-0 items-center gap-2 rounded-lg border border-[color-mix(in_oklab,var(--paper-text)_18%,var(--paper))] bg-[var(--paper-quiet)] px-2.5 py-1.5 text-xs text-[var(--paper-faint)] transition-colors hover:border-[color-mix(in_oklab,var(--paper-text)_32%,var(--paper))] hover:text-[var(--paper-text)]"
    >
      {/* lucide search */}
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </svg>
      <span className="min-w-0 flex-1 truncate text-left">Quick search…</span>
      <span className="shrink-0 rounded border border-[color-mix(in_oklab,var(--paper-text)_18%,var(--paper))] px-1 font-mono text-[10px]">⌘K</span>
    </button>
  )
}
