'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { SortTable, type SortCol } from '@/components/viz/SortTable'
import { fetchData } from '@/lib/use-data'

// The reactions table (brief 36, Part 3, 2026-11-09): every EXFOR target, reaction and quantity with its entries,
// subentries, datasets and data points, from exfor-reactions.json (scripts/viz/exfor-reactions.mjs over
// nsr.exfor_serve_search_index, the rows behind the API's /exfor/search and /exfor/pickers/reactions). Every column
// sorts; the filter takes a target (U-235, 235U), a reaction (N,G), a quantity (SIG) or words of its description. A row
// opens the EXFOR dataset index on its target and reaction.

type File = { source: string; cols: string[]; quantities: Record<string, string>; rows: [string, string, string, number, number, number, number][] }
type Row = { target: string; reaction: string; quantity: string; desc: string | null; entries: number; subentries: number; datasets: number; points: number; key: string }

/** "PU-239" → "Pu-239"; "C-0" (natural carbon) stays. */
const pretty = (t: string) => t.replace(/^([A-Z])([A-Z]?)-/, (_, a: string, b: string) => `${a}${b.toLowerCase()}-`)

const COLS: SortCol<Row>[] = [
  { key: 'target', label: 'Target', mono: true, value: (r) => r.target },
  { key: 'reaction', label: 'Reaction', mono: true, value: (r) => r.reaction },
  { key: 'quantity', label: 'Quantity', mono: true, value: (r) => r.quantity, title: (r) => r.desc ?? undefined },
  { key: 'desc', label: 'Description', value: (r) => r.desc, className: 'max-w-[320px] truncate text-[12px] text-[var(--paper-muted)]', title: (r) => r.desc ?? undefined },
  { key: 'entries', label: 'Entries', num: true, value: (r) => r.entries },
  { key: 'subentries', label: 'Subentries', num: true, value: (r) => r.subentries },
  { key: 'datasets', label: 'Datasets', num: true, value: (r) => r.datasets },
  { key: 'points', label: 'Data points', num: true, value: (r) => r.points },
]

/** "235u" or "u235" → "u-235", so a typed nuclide finds its target. */
function norm(s: string) {
  const t = s.replace(/\s+/g, '')
  const m = /^(\d{1,3})([a-z]{1,2})$/.exec(t) ?? /^([a-z]{1,2})(\d{1,3})$/.exec(t)
  if (!m) return t
  return /^\d/.test(m[1]) ? `${m[2]}-${m[1]}` : `${m[1]}-${m[2]}`
}
function matches(r: Row, needle: string) {
  const n = norm(needle)
  const target = r.target.toLowerCase()
  return target === n || target.startsWith(n) || r.reaction.toLowerCase() === needle || r.quantity.toLowerCase() === needle ||
    (needle.length > 2 && (r.desc ?? '').toLowerCase().includes(needle))
}
const rowKey = (r: Row) => r.key
const datasetsLink = (r: Row) => (
  <Link href={`/datasets/exfor?target=${encodeURIComponent(r.target)}&reaction=${encodeURIComponent(r.reaction)}`} className="whitespace-nowrap text-[12px] text-[var(--paper-muted)] underline decoration-[var(--paper-rule)]/25 underline-offset-2 hover:text-[var(--paper-text)]">
    Datasets
  </Link>
)

export function ReactionsTable() {
  const [rows, setRows] = useState<Row[] | null>(null)
  useEffect(() => {
    let live = true
    void fetchData<File>('exfor-reactions.json').then((f) => {
      if (!live) return
      setRows(f.rows.map(([target, reaction, quantity, entries, subentries, datasets, points]) => ({
        target: pretty(target), reaction, quantity, desc: f.quantities[quantity] ?? null, entries, subentries, datasets, points,
        key: `${target}|${reaction}|${quantity}`,
      })))
    })
    return () => { live = false }
  }, [])
  return (
    <SortTable
      rows={rows}
      cols={COLS}
      rowKey={rowKey}
      matches={matches}
      placeholder="Filter: U-235, N,G, SIG or a word"
      initialSort={{ key: 'entries', dir: -1 }}
      sources="EXFOR (IAEA X4Pro and J4)"
      minWidth={1000}
      trailing={datasetsLink}
    />
  )
}
