'use client'

// A choice from a list (Brendan, 2026-11-06: no browser dropdowns, ever): the site's dropdown menu
// (components/ui/dropdown-menu.tsx), dressed as the header's chart switcher (components/AppLayout.tsx ChartSwitcher),
// in place of a <select>. A long list gets a search field at its top that filters as you type, as the nuclide picker
// does; options can sit under group headings; the current one wears a check. ↓ from the field moves into the list.

import * as React from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

export type MenuOption<T extends string | number> = { value: T; label: string; group?: string }

const SUPERS = '⁰¹²³⁴⁵⁶⁷⁸⁹'
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (c) => String(SUPERS.indexOf(c)))
    .replace(/[\s,-]+/g, '')
const HOVER = 'hover:bg-[color-mix(in_oklab,var(--paper-text)_14%,var(--paper))]'

export function MenuSelect<T extends string | number>({
  value,
  options,
  onChange,
  label,
  search = options.length > 12,
  className = '',
  contentClassName = '',
  contentAttrs,
}: {
  value: T
  options: MenuOption<T>[]
  onChange: (v: T) => void
  /** Accessible name for the trigger, e.g. "X axis". */
  label: string
  /** A search field at the top; on by default past a dozen options. */
  search?: boolean
  className?: string
  /** Extra classes for the open list, e.g. a z-index above an overlay. */
  contentClassName?: string
  /** Attributes for the open list, e.g. the dev inspector's mark so its clicks stay the inspector's own. */
  contentAttrs?: Record<`data-${string}`, string>
}) {
  const [query, setQuery] = React.useState('')
  const current = options.find((o) => o.value === value)
  const q = norm(query)
  const shown = q ? options.filter((o) => norm(`${o.label} ${o.group ?? ''}`).includes(q)) : options

  return (
    <DropdownMenu onOpenChange={(open) => !open && setQuery('')}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className={`flex min-w-0 items-center justify-between gap-1.5 rounded-md border border-[var(--paper-rule)]/30 bg-[var(--paper)] px-2 py-1 text-left text-[11px] text-[var(--paper-text)] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--paper-faint)] data-[state=open]:bg-[color-mix(in_oklab,var(--paper-text)_14%,var(--paper))] ${HOVER} ${className}`}
        >
          <span className="min-w-0 flex-1 truncate">{current?.label ?? '—'}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--paper-muted)]" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        {...contentAttrs}
        className={`nysgpt-app max-h-[60vh] w-[var(--radix-dropdown-menu-trigger-width)] min-w-[240px] rounded-xl border-[var(--paper-rule)] bg-[var(--paper)] p-1 text-[var(--paper-text)] ${contentClassName}`}
      >
        {search && (
          <div className="sticky top-0 z-10 mb-1 flex items-center gap-2 rounded-lg border border-[var(--paper-rule)]/20 bg-[var(--paper)] px-2 py-1.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-[var(--paper-faint)]" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              // The menu's own keys (its type-to-find) would take the letters; ↓ ↑ and Esc still reach it.
              onKeyDown={(e) => {
                if (!['ArrowDown', 'ArrowUp', 'Escape', 'Tab'].includes(e.key)) e.stopPropagation()
              }}
              placeholder="Search"
              aria-label={`Search ${label.toLowerCase()}`}
              className="min-w-0 flex-1 bg-transparent text-[12px] text-[var(--paper-text)] outline-none placeholder:text-[var(--paper-faint)]"
            />
          </div>
        )}
        {shown.map((o, i) => {
          const heading = o.group && o.group !== shown[i - 1]?.group ? o.group : null
          const on = o.value === value
          return (
            <React.Fragment key={String(o.value)}>
              {heading && <DropdownMenuLabel className="px-2 pt-2 pb-1 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--paper-faint)]">{heading}</DropdownMenuLabel>}
              <DropdownMenuItem
                onSelect={() => onChange(o.value)}
                className={`text-[12px] focus:bg-[var(--paper-quiet)] focus:text-[var(--paper-text)] ${on ? 'font-medium text-[var(--paper-strong,var(--paper-text))]' : ''}`}
              >
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {on && <Check className="h-3.5 w-3.5 text-[var(--paper-strong,var(--paper-text))]" />}
              </DropdownMenuItem>
            </React.Fragment>
          )
        })}
        {!shown.length && <p className="px-2 py-2 text-[12px] text-[var(--paper-muted)]">Nothing matches.</p>}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
