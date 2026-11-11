'use client'

// Several choices from a list (Brendan's rule, 2026-11-06: no browser dropdowns, ever): MenuSelect's menu
// (components/viz/MenuSelect.tsx) with a check on every option chosen. A click toggles an option and keeps the menu open;
// a long list gets the same search field. The trigger reads the one option chosen, "<first> and n more", or the
// placeholder when none is. First used for Elpis's search forms (brief 69, elpis-wire, 2026-11-11), where a form reads
// the choices through hidden inputs (MenuMultiSelect's `name`).

import * as React from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { MenuOption } from '@/components/viz/MenuSelect'

const HOVER = 'hover:bg-[color-mix(in_oklab,var(--paper-text)_14%,var(--paper))]'
const norm = (s: string) => s.toLowerCase().replace(/[\s,-]+/g, '')

export function MenuMultiSelect<T extends string | number>({
  value,
  options,
  onChange,
  label,
  placeholder = 'Any',
  name,
  search = options.length > 12,
  className = '',
}: {
  value: T[]
  options: MenuOption<T>[]
  onChange: (v: T[]) => void
  /** Accessible name for the trigger, e.g. "Library". */
  label: string
  /** The trigger's text when nothing is chosen. */
  placeholder?: string
  /** When set, a hidden input of this name per choice, for a form read with FormData. */
  name?: string
  search?: boolean
  className?: string
}) {
  const [query, setQuery] = React.useState('')
  const chosen = options.filter((o) => value.includes(o.value))
  const q = norm(query)
  const shown = q ? options.filter((o) => norm(o.label).includes(q)) : options
  const text = !chosen.length ? placeholder : chosen.length === 1 ? chosen[0].label : `${chosen[0].label} and ${chosen.length - 1} more`
  const flip = (v: T) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])

  return (
    <>
      {name && value.map((v) => <input key={String(v)} type="hidden" name={name} value={String(v)} />)}
      <DropdownMenu onOpenChange={(open) => !open && setQuery('')}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={label}
            className={`flex min-w-0 items-center justify-between gap-1.5 rounded-md border border-[var(--paper-rule)]/30 bg-[var(--paper)] px-2 py-1 text-left text-[11px] text-[var(--paper-text)] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--paper-faint)] data-[state=open]:bg-[color-mix(in_oklab,var(--paper-text)_14%,var(--paper))] ${HOVER} ${className}`}
          >
            <span className={`min-w-0 flex-1 truncate ${chosen.length ? '' : 'text-[var(--paper-muted)]'}`}>{text}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--paper-muted)]" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          sideOffset={6}
          className="nysgpt-app max-h-[60vh] w-[var(--radix-dropdown-menu-trigger-width)] min-w-[240px] rounded-xl border-[var(--paper-rule)] bg-[var(--paper)] p-1 text-[var(--paper-text)]"
        >
          {search && (
            <div className="sticky top-0 z-10 mb-1 flex items-center gap-2 rounded-lg border border-[var(--paper-rule)]/20 bg-[var(--paper)] px-2 py-1.5">
              <Search className="h-3.5 w-3.5 shrink-0 text-[var(--paper-faint)]" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (!['ArrowDown', 'ArrowUp', 'Escape', 'Tab'].includes(e.key)) e.stopPropagation()
                }}
                placeholder="Search"
                aria-label={`Search ${label.toLowerCase()}`}
                className="min-w-0 flex-1 bg-transparent text-[12px] text-[var(--paper-text)] outline-none placeholder:text-[var(--paper-faint)]"
              />
            </div>
          )}
          {shown.map((o) => {
            const on = value.includes(o.value)
            return (
              <DropdownMenuItem
                key={String(o.value)}
                onSelect={(e) => { e.preventDefault(); flip(o.value) }}
                className={`text-[12px] focus:bg-[var(--paper-quiet)] focus:text-[var(--paper-text)] ${on ? 'font-medium text-[var(--paper-strong,var(--paper-text))]' : ''}`}
              >
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {on && <Check className="h-3.5 w-3.5 text-[var(--paper-strong,var(--paper-text))]" />}
              </DropdownMenuItem>
            )
          })}
          {!shown.length && <p className="px-2 py-2 text-[12px] text-[var(--paper-muted)]">Nothing matches.</p>}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}
