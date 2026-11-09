'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'

// A sortable, filterable table page (brief 36, 2026-11-09), lifted from the nuclides table (brief 35) so the nuclides and
// reactions tables share it: a filter bar stuck to the top with the row count and the pager, column headings stuck under
// it, every column sorting (blanks last whichever way it runs), a hundred rows to a page, an optional marked row the
// page opens on, and a Sources line beneath.

const SANS = { fontFamily: 'var(--font-sans, "DM Sans"), sans-serif' } as const
export const MONO = { fontFamily: 'var(--font-mono), ui-monospace, monospace' } as const
const PER = 100
export const fmt = new Intl.NumberFormat('en')

export type SortCol<R> = {
  key: string
  label: string
  /** The value the column sorts by; null or '' sort last. */
  value: (r: R) => number | string | null
  /** Right-aligned, tabular figures; first press sorts largest first unless `firstDir` says otherwise. */
  num?: boolean
  mono?: boolean
  firstDir?: 1 | -1
  /** What the cell shows; defaults to the value (numbers with thousands separators). */
  cell?: (r: R) => ReactNode
  /** The cell's hover text (a truncated cell shows itself whole). */
  title?: (r: R) => string | undefined
  className?: string
}

export function SortTable<R>({ rows, cols, rowKey, matches, placeholder, initialSort, mark, sources, minWidth = 900, trailing }: {
  rows: R[] | null
  cols: SortCol<R>[]
  rowKey: (r: R) => string
  /** Whether a row matches the filter text (already trimmed and lower-cased). */
  matches: (r: R, needle: string) => boolean
  placeholder: string
  initialSort: { key: string; dir: 1 | -1 }
  /** A row key the page opens on, marked (a ?nuclide= or ?reaction= link). */
  mark?: string | null
  sources: string
  minWidth?: number
  /** A last, unsorted cell per row (a link). */
  trailing?: (r: R) => ReactNode
}) {
  const [q, setQ] = useState('')
  const [sort, setSort] = useState(initialSort)
  const [page, setPage] = useState(0)
  const [marked, setMarked] = useState<string | null>(null)
  const markedRow = useRef<HTMLTableRowElement | null>(null)

  const shown = useMemo(() => {
    if (!rows) return []
    const needle = q.trim().toLowerCase()
    const out = needle ? rows.filter((r) => matches(r, needle)) : rows
    const col = cols.find((c) => c.key === sort.key) ?? cols[0]
    return [...out].sort((x, y) => {
      const kx = col.value(x), ky = col.value(y)
      const bx = kx === null || kx === '', by = ky === null || ky === ''
      if (bx !== by) return bx ? 1 : -1
      const c = typeof kx === 'number' && typeof ky === 'number' ? kx - ky : String(kx).localeCompare(String(ky), 'en', { numeric: true })
      return c * sort.dir
    })
  }, [rows, q, sort, cols, matches])

  // The marked row: its page, once the rows arrive.
  useEffect(() => {
    if (!rows || !mark) return
    const at = shown.findIndex((r) => rowKey(r) === mark)
    if (at >= 0) {
      setMarked(mark)
      setPage(Math.floor(at / PER))
    }
    // once, when the rows arrive
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, mark])
  useEffect(() => {
    markedRow.current?.scrollIntoView({ block: 'center' })
  }, [marked, page])

  const toggle = (c: SortCol<R>) => {
    setSort((s) => (s.key === c.key ? { key: c.key, dir: s.dir === 1 ? -1 : 1 } : { key: c.key, dir: c.firstDir ?? (c.num ? -1 : 1) }))
    setPage(0)
  }

  if (!rows) return <p className="px-6 py-6 text-[13px] text-[var(--paper-muted)]" style={SANS}>Loading the data…</p>
  const pages = Math.max(1, Math.ceil(shown.length / PER))
  const from = page * PER
  const view = shown.slice(from, from + PER)
  const btn = 'flex h-6 w-6 items-center justify-center rounded-md text-[var(--paper-faint)] transition-colors hover:bg-[var(--paper-quiet)] hover:text-[var(--paper-text)] disabled:opacity-30 disabled:hover:bg-transparent'

  return (
    <div className="px-6 pb-8" style={SANS}>
      <div className="sticky top-0 z-20 flex h-14 flex-wrap items-center justify-between gap-3 bg-[var(--paper)]">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--paper-faint)]" />
            <input
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(0) }}
              placeholder={placeholder}
              className="h-8 w-full rounded-md border border-[var(--paper-rule)]/30 bg-transparent pl-9 pr-3 text-[13px] text-[var(--paper-text)] outline-none placeholder:text-[var(--paper-faint)] focus:border-[var(--paper-text)]"
            />
          </div>
          <p className="m-0 text-[12px] text-[var(--paper-muted)]">
            {shown.length === 0 ? `No row matches “${q}”` : `Rows ${fmt.format(from + 1)}–${fmt.format(from + view.length)} of ${fmt.format(shown.length)}`}
          </p>
        </div>
        <div className="flex items-center gap-2" style={MONO}>
          <button type="button" aria-label="Previous page" className={btn} disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-[11px] tabular-nums text-[var(--paper-faint)]">{page + 1} / {pages}</span>
          <button type="button" aria-label="Next page" className={btn} disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      {/* No scroll box of its own: the page scrolls both ways, so the headings can stick under the filter bar. */}
      <table className="w-full border-collapse text-[13px] text-[var(--paper-text)]" style={{ minWidth }}>
        <thead>
          <tr className="shadow-[inset_0_-1px_0_var(--paper-rule)]">
            {cols.map((c) => (
              <th key={c.key} className={`sticky top-14 z-10 bg-[var(--paper)] py-2 pr-4 align-bottom text-[10px] font-normal uppercase tracking-[0.14em] text-[var(--paper-faint)] ${c.num ? 'text-right' : 'text-left'}`} style={MONO}>
                <button type="button" onClick={() => toggle(c)} title={`Sort by ${c.label}`} className={`inline-flex items-center gap-1 uppercase hover:text-[var(--paper-text)] ${sort.key === c.key ? 'text-[var(--paper-text)]' : ''}`}>
                  {c.label}
                  <span className="text-[9px]">{sort.key === c.key ? (sort.dir === 1 ? '▲' : '▼') : '↕'}</span>
                </button>
              </th>
            ))}
            {trailing && <th className="sticky top-14 z-10 bg-[var(--paper)] py-2" />}
          </tr>
        </thead>
        <tbody>
          {view.map((r) => {
            const k = rowKey(r)
            const on = k === marked
            return (
              <tr
                key={k}
                ref={(el) => { if (on) markedRow.current = el }}
                className={`border-b border-[var(--paper-rule-soft)] transition-colors hover:bg-[var(--paper-quiet)] ${on ? 'bg-[var(--paper-quiet)] shadow-[inset_2px_0_0_var(--paper-text)]' : ''}`}
              >
                {cols.map((c) => {
                  const v = c.value(r)
                  const shownV = c.cell ? c.cell(r) : v === null || v === '' ? '—' : typeof v === 'number' ? fmt.format(v) : v
                  return (
                    <td key={c.key} className={`py-1.5 pr-4 ${c.num ? 'text-right tabular-nums' : 'text-left'} ${c.className ?? ''}`} style={c.num || c.mono ? MONO : undefined} title={c.title?.(r)}>
                      {shownV}
                    </td>
                  )
                })}
                {trailing && <td className="py-1.5 text-right">{trailing(r)}</td>}
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="m-0 mt-3 text-[11px] text-[var(--paper-faint)]">Sources: {sources}</p>
    </div>
  )
}
