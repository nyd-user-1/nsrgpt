'use client'

// A nuclide (or element) picker for the radar charts (Brendan, 2026-11-05): a field that opens a list
// beneath it, with a search box at the top that filters as you type, and ‹ › beside it to step to the
// previous or next one. The list draws only the rows in view, so 3,500 nuclides open at once.

import * as React from 'react'
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'

export type PickerOption = { key: number; label: string; alt?: string }

const ROW_H = 30
const LIST_H = 270
const MONO = { fontFamily: 'var(--font-mono), ui-monospace, monospace' } as const
const SUPERS = '⁰¹²³⁴⁵⁶⁷⁸⁹'
const norm = (s: string) => s.toLowerCase().replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (c) => String(SUPERS.indexOf(c))).replace(/[\s-]+/g, '')

const STEP =
  'flex h-8 w-8 items-center justify-center rounded-full text-[var(--paper-muted)] transition-colors hover:bg-[var(--paper-quiet)] hover:text-[var(--paper-text)] disabled:opacity-30'

export function NuclidePicker({
  value,
  options,
  onPick,
  onStep,
  swatch,
  label,
  noneLabel,
}: {
  /** The key now shown, or null for none. */
  value: number | null
  options: PickerOption[]
  onPick: (key: number | null) => void
  onStep: (dir: -1 | 1) => void
  /** Classes for the colour dot before the field. */
  swatch?: string
  /** Accessible name, e.g. "Nuclide" or "Overlay nuclide". */
  label: string
  /** When set, the list starts with a "none" row that clears the field. */
  noneLabel?: string
}) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [active, setActive] = React.useState(0)
  const [scroll, setScroll] = React.useState(0)
  const root = React.useRef<HTMLDivElement>(null)
  const list = React.useRef<HTMLDivElement>(null)
  const search = React.useRef<HTMLInputElement>(null)

  const current = options.find((o) => o.key === value)
  const rows = React.useMemo(() => {
    const q = norm(query)
    const hits = q ? options.filter((o) => norm(o.label).includes(q) || (o.alt && norm(o.alt).includes(q))) : options
    return noneLabel && !q ? [{ key: -1, label: noneLabel }, ...hits] : hits
  }, [options, query, noneLabel])

  // Opening: search box focused, list scrolled to the current one.
  React.useEffect(() => {
    if (!open) return
    search.current?.focus()
    const i = Math.max(0, rows.findIndex((r) => r.key === value))
    setActive(i)
    const top = Math.max(0, i * ROW_H - LIST_H / 2)
    requestAnimationFrame(() => list.current?.scrollTo({ top }))
    setScroll(top)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // A press anywhere else closes the list.
  React.useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [open])

  const pick = (key: number) => {
    onPick(key === -1 ? null : key)
    setOpen(false)
    setQuery('')
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') return setOpen(false)
    if (e.key === 'Enter') {
      e.preventDefault()
      if (rows[active]) pick(rows[active].key)
      return
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const next = Math.min(rows.length - 1, Math.max(0, active + (e.key === 'ArrowDown' ? 1 : -1)))
    setActive(next)
    const el = list.current
    if (el && (next * ROW_H < el.scrollTop || (next + 1) * ROW_H > el.scrollTop + LIST_H)) el.scrollTop = next * ROW_H - LIST_H / 2
  }

  const first = Math.max(0, Math.floor(scroll / ROW_H) - 4)
  const last = Math.min(rows.length, first + Math.ceil(LIST_H / ROW_H) + 8)

  return (
    <div ref={root} className="relative flex items-center gap-1.5" style={MONO}>
      {swatch && <span className={`mr-1 h-2.5 w-2.5 shrink-0 rounded-full ${swatch}`} />}
      <button
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-36 items-center justify-between rounded-xl border border-[var(--paper-rule)] bg-[var(--paper)] px-3 text-[13px] text-[var(--paper-text)] transition-colors hover:bg-[var(--paper-quiet)]"
      >
        <span className={current ? '' : 'text-[var(--paper-faint)]'}>{current?.label ?? noneLabel ?? '—'}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-[var(--paper-faint)] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <button type="button" aria-label={`Previous ${label.toLowerCase()}`} onClick={() => onStep(-1)} disabled={value === null} className={STEP}>
        <ChevronLeft className="h-4 w-4" />
      </button>
      <button type="button" aria-label={`Next ${label.toLowerCase()}`} onClick={() => onStep(1)} disabled={value === null} className={STEP}>
        <ChevronRight className="h-4 w-4" />
      </button>

      {open && (
        <div
          className="absolute left-0 top-full z-30 mt-1.5 w-56 overflow-hidden rounded-xl border border-[var(--paper-rule)] bg-[var(--paper)] shadow-lg"
          style={swatch ? { marginLeft: 22 } : undefined}
        >
          <input
            ref={search}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
              list.current?.scrollTo({ top: 0 })
              setScroll(0)
            }}
            onKeyDown={onKey}
            placeholder="Search, e.g. 208Pb"
            spellCheck={false}
            aria-label={`Search ${label.toLowerCase()}`}
            className="w-full border-b border-[var(--paper-rule)] bg-transparent px-3 py-2 text-[13px] text-[var(--paper-text)] outline-none placeholder:text-[var(--paper-faint)]"
          />
          <div
            ref={list}
            role="listbox"
            onScroll={(e) => setScroll((e.target as HTMLDivElement).scrollTop)}
            className="overflow-y-auto"
            style={{ height: Math.min(LIST_H, Math.max(ROW_H, rows.length * ROW_H)) }}
          >
            {rows.length === 0 ? (
              <p className="m-0 px-3 py-2 text-[12px] text-[var(--paper-faint)]">No match</p>
            ) : (
              <div style={{ height: rows.length * ROW_H, position: 'relative' }}>
                {rows.slice(first, last).map((r, j) => {
                  const i = first + j
                  return (
                    <button
                      key={r.key}
                      type="button"
                      role="option"
                      aria-selected={r.key === value}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => pick(r.key)}
                      className={`absolute left-0 right-0 flex items-center px-3 text-left text-[13px] ${i === active ? 'bg-[var(--paper-quiet)]' : ''} ${r.key === value ? 'text-[var(--paper-text)]' : 'text-[var(--paper-muted)]'}`}
                      style={{ top: i * ROW_H, height: ROW_H }}
                    >
                      {r.label}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
