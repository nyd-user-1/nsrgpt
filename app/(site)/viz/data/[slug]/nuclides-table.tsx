'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { formatSeconds, keyOf, loadDecay, modesText, type Decay } from '@/lib/viz-physics'
import { ELEMENTS, datasetsHref } from '@/lib/structure'
import { ELEMENT_NAMES, jpi, loadGround, type Ground, type GroundRow } from '@/app/(site)/viz/chart/data'
import { loadCounts, type Counts } from '@/app/(site)/viz/chart/colour'

// The nuclides table (brief 35, Part 3, 2026-11-09): one row per ground state in the IAEA Live Chart's
// livechart-ground.json (Z, N, A, Jπ, half-life, decay modes with their branchings, mass excess, binding per nucleon,
// abundance), with the counts this app holds for each: ENSDF and XUNDL datasets (the structure index), NSR papers
// (field.json) and EXFOR entries that take it as target. Every column sorts; the filter takes a nuclide (137Cs, Cs-137),
// an element (Cs, caesium) or a mass (137). A row's nuclide opens its card on the chart; Datasets opens its datasets.
// ?nuclide=137Cs (the chart card's link) opens on that row, marked.

const SANS = { fontFamily: 'var(--font-sans, "DM Sans"), sans-serif' } as const
const MONO = { fontFamily: 'var(--font-mono), ui-monospace, monospace' } as const
const PER = 100
const fmt = new Intl.NumberFormat('en')

type Row = {
  z: number; n: number; a: number; el: string; code: string
  jpi: string; t: number | null; hl: string; modes: string
  me: number | null; ba: number | null; abundance: number | null
  ensdf: number; xundl: number; papers: number; exfor: number
}

type Col = { key: keyof Row; label: string; num?: boolean; text?: (r: Row) => string }
const kev = (v: number | null, d = 1) => (v === null ? '—' : v.toFixed(d))
const COLS: Col[] = [
  { key: 'code', label: 'Nuclide' },
  { key: 'z', label: 'Z', num: true },
  { key: 'n', label: 'N', num: true },
  { key: 'a', label: 'A', num: true },
  { key: 'jpi', label: 'Jπ' },
  { key: 't', label: 'Half-life', text: (r) => r.hl },
  { key: 'modes', label: 'Decay modes' },
  { key: 'me', label: 'Mass excess (keV)', num: true, text: (r) => kev(r.me) },
  { key: 'ba', label: 'B/A (keV)', num: true, text: (r) => kev(r.ba, 3) },
  { key: 'abundance', label: 'Abundance (%)', num: true, text: (r) => (r.abundance === null ? '—' : String(r.abundance)) },
  { key: 'ensdf', label: 'ENSDF datasets', num: true, text: (r) => fmt.format(r.ensdf) },
  { key: 'xundl', label: 'XUNDL datasets', num: true, text: (r) => fmt.format(r.xundl) },
  { key: 'papers', label: 'NSR papers', num: true, text: (r) => fmt.format(r.papers) },
  { key: 'exfor', label: 'EXFOR entries', num: true, text: (r) => fmt.format(r.exfor) },
]

function rowsOf(g: Ground, d: Decay, c: Counts): Row[] {
  const decay = new Map(d.nuclides.map((x) => [keyOf(x.z, x.n), x]))
  return g.rows.map((r: GroundRow) => {
    const k = keyOf(r.z, r.n)
    const x = decay.get(k)
    const el = ELEMENTS[r.z] ?? `Z${r.z}`
    const a = r.z + r.n
    // decay.json's modes and half-life where it has the nuclide (every branching, the limit sign), else the Live Chart's
    const stable = x ? x.t === null : r.t === null
    const t = stable ? Infinity : x ? (x.t !== null && x.t > 0 ? x.t : null) : r.t
    const hl = stable ? 'Stable' : t === null ? '—' : `${x?.lim ?? ''}${formatSeconds(t)}`
    const modes = x ? modesText(x, d.modes) : r.mode ? `${r.mode}${r.pct === null ? '' : ` ${r.pct}%`}` : ''
    return {
      z: r.z, n: r.n, a, el, code: `${a}${el}`, jpi: jpi(r), t, hl, modes, me: r.me, ba: r.ba, abundance: r.abundance,
      ensdf: c.ensdf.get(k) ?? 0, xundl: c.xundl.get(k) ?? 0, papers: c.papers.get(k) ?? 0, exfor: c.exfor.get(k) ?? 0,
    }
  })
}

/** "137Cs", "cs137", "Cs-137" → "137cs"; anything else lower-cased with spaces and hyphens gone. */
function norm(s: string) {
  const t = s.trim().toLowerCase().replace(/[-\s]/g, '')
  const m = /^([a-z]{1,2})(\d{1,3})$/.exec(t)
  return m ? `${m[2]}${m[1]}` : t
}

export function NuclidesTable() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<{ key: keyof Row; dir: 1 | -1 }>({ key: 'a', dir: 1 })
  const [page, setPage] = useState(0)
  const [mark, setMark] = useState<string | null>(null)
  const marked = useRef<HTMLTableRowElement | null>(null)

  useEffect(() => {
    let live = true
    void Promise.all([loadGround(), loadDecay(), loadCounts()]).then(([g, d, c]) => {
      if (live) setRows(rowsOf(g, d, c))
    })
    return () => { live = false }
  }, [])

  const shown = useMemo(() => {
    if (!rows) return []
    const needle = norm(q)
    let out = rows
    if (needle) {
      out = rows.filter((r) => {
        const code = r.code.toLowerCase()
        return code === needle || code.startsWith(needle) || r.el.toLowerCase() === needle || String(r.a) === needle ||
          (needle.length > 2 && (ELEMENT_NAMES[r.z] ?? '').toLowerCase().startsWith(needle))
      })
    }
    const { key, dir } = sort
    return [...out].sort((x, y) => {
      const kx = x[key], ky = y[key]
      // blanks last, whichever way the column runs
      const bx = kx === null || kx === '' || kx === '—', by = ky === null || ky === '' || ky === '—'
      if (bx !== by) return bx ? 1 : -1
      const c = typeof kx === 'number' && typeof ky === 'number' ? kx - ky : String(kx).localeCompare(String(ky), 'en', { numeric: true })
      return c * dir || x.a - y.a || x.z - y.z
    })
  }, [rows, q, sort])

  // ?nuclide= opens on that row's page with the row marked.
  useEffect(() => {
    if (!rows) return
    const want = new URLSearchParams(window.location.search).get('nuclide')
    if (!want) return
    const code = norm(want)
    const at = shown.findIndex((r) => r.code.toLowerCase() === code)
    if (at >= 0) {
      setMark(shown[at].code)
      setPage(Math.floor(at / PER))
    }
    // once, when the rows arrive
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows])
  useEffect(() => {
    marked.current?.scrollIntoView({ block: 'center' })
  }, [mark, page])

  const toggle = (key: keyof Row) => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: ['ensdf', 'xundl', 'papers', 'exfor', 'ba'].includes(key) ? -1 : 1 }))
    setPage(0)
  }

  if (!rows) return <p className="px-6 py-6 text-[13px] text-[var(--paper-muted)]" style={SANS}>Loading the data…</p>
  const pages = Math.max(1, Math.ceil(shown.length / PER))
  const from = page * PER
  const view = shown.slice(from, from + PER)
  const btn = 'flex h-6 w-6 items-center justify-center rounded-md text-[var(--paper-faint)] transition-colors hover:bg-[var(--paper-quiet)] hover:text-[var(--paper-text)] disabled:opacity-30 disabled:hover:bg-transparent'

  return (
    <div className="px-6 pb-8" style={SANS}>
      <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 bg-[var(--paper)] py-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--paper-faint)]" />
            <input
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(0) }}
              placeholder="Filter: 137Cs, Cs, caesium or 137"
              className="h-8 w-full rounded-md border border-[var(--paper-rule)]/30 bg-transparent pl-9 pr-3 text-[13px] text-[var(--paper-text)] outline-none placeholder:text-[var(--paper-faint)] focus:border-[var(--paper-text)]"
            />
          </div>
          <p className="m-0 text-[12px] text-[var(--paper-muted)]">
            {shown.length === 0 ? `No nuclide matches “${q}”` : `Rows ${fmt.format(from + 1)}–${fmt.format(from + view.length)} of ${fmt.format(shown.length)}`}
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
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1180px] border-collapse text-[13px] text-[var(--paper-text)]">
          <thead>
            <tr className="border-b border-[var(--paper-rule)]">
              {COLS.map((c) => (
                <th key={c.key} className={`py-2 pr-4 align-bottom text-[10px] font-normal uppercase tracking-[0.14em] text-[var(--paper-faint)] ${c.num ? 'text-right' : 'text-left'}`} style={MONO}>
                  <button type="button" onClick={() => toggle(c.key)} title={`Sort by ${c.label}`} className={`inline-flex items-center gap-1 uppercase hover:text-[var(--paper-text)] ${sort.key === c.key ? 'text-[var(--paper-text)]' : ''}`}>
                    {c.label}
                    <span className="text-[9px]">{sort.key === c.key ? (sort.dir === 1 ? '▲' : '▼') : '↕'}</span>
                  </button>
                </th>
              ))}
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {view.map((r) => {
              const on = r.code === mark
              return (
                <tr
                  key={r.code}
                  ref={(el) => { if (on) marked.current = el }}
                  className={`border-b border-[var(--paper-rule-soft)] transition-colors hover:bg-[var(--paper-quiet)] ${on ? 'bg-[var(--paper-quiet)] shadow-[inset_2px_0_0_var(--paper-text)]' : ''}`}
                >
                  {COLS.map((c) => {
                    if (c.key === 'code')
                      return (
                        <td key="code" className="py-1.5 pr-4">
                          <Link href={`/viz/chart?nuclide=${r.code}`} className="font-semibold underline decoration-[var(--paper-rule)]/25 underline-offset-2 hover:decoration-[var(--paper-text)]" style={MONO} title={`${r.code} on the chart of nuclides`}>
                            <sup>{r.a}</sup>{r.el}
                          </Link>
                        </td>
                      )
                    const v = c.text ? c.text(r) : String(r[c.key] ?? '—')
                    return (
                      <td key={c.key} className={`py-1.5 pr-4 ${c.num ? 'text-right tabular-nums' : 'text-left'} ${c.key === 'modes' ? 'max-w-[260px] truncate text-[12px]' : ''}`} style={c.num || c.key === 't' || c.key === 'jpi' ? MONO : undefined} title={c.key === 'modes' ? v : undefined}>
                        {v || '—'}
                      </td>
                    )
                  })}
                  <td className="py-1.5 text-right">
                    <Link href={datasetsHref(r.a, r.el)} className="text-[12px] text-[var(--paper-muted)] underline decoration-[var(--paper-rule)]/25 underline-offset-2 hover:text-[var(--paper-text)]">
                      Datasets
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="m-0 mt-3 text-[11px] text-[var(--paper-faint)]">Sources: NUBASE2020, AME2020, ENSDF, the IAEA Live Chart, XUNDL, NSR, EXFOR</p>
    </div>
  )
}
