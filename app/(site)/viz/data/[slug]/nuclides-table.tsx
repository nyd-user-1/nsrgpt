'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { MONO, SortTable, fmt, type SortCol } from '@/components/viz/SortTable'
import { formatSeconds, keyOf, loadDecay, modesText, type Decay } from '@/lib/viz-physics'
import { ELEMENTS, datasetsHref } from '@/lib/structure'
import { ELEMENT_NAMES, jpi, loadGround, type Ground, type GroundRow } from '@/app/(site)/viz/chart/data'
import { loadCounts, type Counts } from '@/app/(site)/viz/chart/colour'

// The nuclides table (brief 35, Part 3, 2026-11-09): one row per ground state in the IAEA Live Chart's
// livechart-ground.json (Z, N, A, Jπ, half-life, decay modes with their branchings, mass excess, binding per nucleon,
// abundance), with the counts this app holds for each: ENSDF and XUNDL datasets (the structure index), NSR papers
// (field.json) and EXFOR entries that take it as target. The page is components/viz/SortTable.tsx (brief 36). The filter
// takes a nuclide (137Cs, Cs-137), an element (Cs, caesium) or a mass (137). A row's nuclide opens its card on the chart;
// Datasets opens its datasets. ?nuclide=137Cs (the chart card's link) opens on that row, marked.

type Row = {
  z: number; n: number; a: number; el: string; code: string
  jpi: string; t: number | null; hl: string; modes: string
  me: number | null; ba: number | null; abundance: number | null
  ensdf: number; xundl: number; papers: number; exfor: number
}

const fixed = (v: number | null, d: number) => (v === null ? '—' : v.toFixed(d))
const COLS: SortCol<Row>[] = [
  {
    key: 'code', label: 'Nuclide', value: (r) => r.a * 1000 + r.z,
    cell: (r) => (
      <Link href={`/viz/chart?nuclide=${r.code}`} className="font-semibold underline decoration-[var(--paper-rule)]/25 underline-offset-2 hover:decoration-[var(--paper-text)]" style={MONO} title={`${r.code} on the chart of nuclides`}>
        <sup>{r.a}</sup>{r.el}
      </Link>
    ),
  },
  { key: 'z', label: 'Z', num: true, firstDir: 1, value: (r) => r.z },
  { key: 'n', label: 'N', num: true, firstDir: 1, value: (r) => r.n },
  { key: 'a', label: 'A', num: true, firstDir: 1, value: (r) => r.a },
  { key: 'jpi', label: 'Jπ', mono: true, value: (r) => (r.jpi === '—' ? null : r.jpi) },
  { key: 't', label: 'Half-life', mono: true, value: (r) => (r.t === Infinity ? Number.MAX_VALUE : r.t), cell: (r) => r.hl },
  { key: 'modes', label: 'Decay modes', value: (r) => r.modes || null, className: 'max-w-[260px] truncate text-[12px]', title: (r) => r.modes || undefined },
  { key: 'me', label: 'Mass excess (keV)', num: true, firstDir: 1, value: (r) => r.me, cell: (r) => fixed(r.me, 1) },
  { key: 'ba', label: 'B/A (keV)', num: true, value: (r) => r.ba, cell: (r) => fixed(r.ba, 3) },
  { key: 'abundance', label: 'Abundance (%)', num: true, value: (r) => r.abundance, cell: (r) => (r.abundance === null ? '—' : String(r.abundance)) },
  { key: 'ensdf', label: 'ENSDF datasets', num: true, value: (r) => r.ensdf, cell: (r) => fmt.format(r.ensdf) },
  { key: 'xundl', label: 'XUNDL datasets', num: true, value: (r) => r.xundl, cell: (r) => fmt.format(r.xundl) },
  { key: 'papers', label: 'NSR papers', num: true, value: (r) => r.papers, cell: (r) => fmt.format(r.papers) },
  { key: 'exfor', label: 'EXFOR entries', num: true, value: (r) => r.exfor, cell: (r) => fmt.format(r.exfor) },
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

/** "137Cs", "cs137", "Cs-137" → "137cs"; anything else as typed, spaces and hyphens gone. */
function norm(s: string) {
  const t = s.trim().toLowerCase().replace(/[-\s]/g, '')
  const m = /^([a-z]{1,2})(\d{1,3})$/.exec(t)
  return m ? `${m[2]}${m[1]}` : t
}
function matches(r: Row, typed: string) {
  const needle = norm(typed)
  const code = r.code.toLowerCase()
  return code === needle || code.startsWith(needle) || r.el.toLowerCase() === needle || String(r.a) === needle ||
    (needle.length > 2 && (ELEMENT_NAMES[r.z] ?? '').toLowerCase().startsWith(needle))
}
const rowKey = (r: Row) => r.code.toLowerCase()
const datasetsLink = (r: Row) => (
  <Link href={datasetsHref(r.a, r.el)} className="text-[12px] text-[var(--paper-muted)] underline decoration-[var(--paper-rule)]/25 underline-offset-2 hover:text-[var(--paper-text)]">
    Datasets
  </Link>
)

export function NuclidesTable() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [mark, setMark] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    const want = new URLSearchParams(window.location.search).get('nuclide')
    if (want) setMark(norm(want))
    void Promise.all([loadGround(), loadDecay(), loadCounts()]).then(([g, d, c]) => {
      if (live) setRows(rowsOf(g, d, c))
    })
    return () => { live = false }
  }, [])
  return (
    <SortTable
      rows={rows}
      cols={COLS}
      rowKey={rowKey}
      matches={matches}
      placeholder="Filter: 137Cs, Cs, caesium or 137"
      initialSort={{ key: 'code', dir: 1 }}
      mark={mark}
      sources="NUBASE2020, AME2020, ENSDF, the IAEA Live Chart, XUNDL, NSR, EXFOR"
      minWidth={1180}
      trailing={datasetsLink}
    />
  )
}
