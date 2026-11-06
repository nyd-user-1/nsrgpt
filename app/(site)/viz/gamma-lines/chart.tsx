'use client'

import * as React from 'react'
import Link from 'next/link'
import { useEChart } from '@/components/viz/use-echart'
import { AXIS, formatSeconds, ink, isDark, keyOf, loadDecay, nucName, type Decay } from '@/lib/viz-physics'

// The γ-line finder (Brendan, 2026-11-06): a detector shows a peak; which nuclides emit there? Every γ line of every
// ground-state decay in ENSDF (the IAEA Live Chart API, public/viz-data/gamma/), by energy. Type an energy and a
// window: the lines inside it list strongest first, with the emitter's half-life, and the chart shows the
// neighbourhood, the window shaded. Filters drop short-lived emitters (under an hour, to start) and weak lines. The lines load 100 keV at a
// time, only the slices the window touches. A nuclide's name opens its decay radiation card.

const MONO = { fontFamily: 'var(--font-mono), ui-monospace, monospace' } as const
const fmt = new Intl.NumberFormat('en', { maximumSignificantDigits: 5 })
const SPAN = 25
const Y_MIN = 1e-4
type Index = { bin: number; bins: number[]; els: string[]; count: number }
type Line = [number, number, number, number]

let indexP: Promise<Index> | null = null
const loadIndex = () => {
  if (!indexP) {
    indexP = fetch('/viz-data/gamma/index.json').then((r) => {
      if (!r.ok) throw new Error(`/viz-data/gamma/index.json: ${r.status}`)
      return r.json() as Promise<Index>
    })
    indexP.catch(() => (indexP = null))
  }
  return indexP
}
const slices = new Map<number, Promise<Line[]>>()
const loadSlice = (b: number) => {
  let p = slices.get(b)
  if (!p) {
    p = fetch(`/viz-data/gamma/${b}.json`).then((r) => (r.ok ? (r.json() as Promise<Line[]>) : []))
    p.catch(() => slices.delete(b))
    slices.set(b, p)
  }
  return p
}

const HALF_LIVES = [
  { label: 'Any', s: 0 },
  { label: '1 min', s: 60 },
  { label: '1 h', s: 3600 },
  { label: '1 d', s: 86400 },
  { label: '1 y', s: 3.15576e7 },
]
const INTENSITIES = [
  { label: 'Any', i: 0 },
  { label: '0.1 %', i: 0.1 },
  { label: '1 %', i: 1 },
  { label: '10 %', i: 10 },
]

export function GammaLinesChart() {
  const [energy, setEnergy] = React.useState('661.66')
  const [window_, setWindow] = React.useState('2')
  // An hour by default: a detector's peaks are mostly long-lived emitters, and the exotic short-lived ones crowd every energy.
  const [minT, setMinT] = React.useState(3600)
  const [minI, setMinI] = React.useState(0)
  const [decay, setDecay] = React.useState<Decay | null>(null)
  const [near, setNear] = React.useState<Line[]>([])
  const e = Number(energy)
  const w = Math.max(0, Number(window_) || 0)
  const valid = Number.isFinite(e) && e > 0

  React.useEffect(() => {
    void loadDecay().then(setDecay)
  }, [])
  // The slices the view touches.
  React.useEffect(() => {
    if (!valid) return
    let live = true
    loadIndex()
      .then(async (idx) => {
        const from = Math.floor(Math.max(0, e - SPAN) / idx.bin)
        const to = Math.floor((e + SPAN) / idx.bin)
        const got = await Promise.all(idx.bins.filter((b) => b >= from && b <= to).map(loadSlice))
        if (live) setNear(got.flat().filter((l) => l[0] >= e - SPAN && l[0] <= e + SPAN))
      })
      .catch(() => live && setNear([]))
    return () => {
      live = false
    }
  }, [e, valid])

  const half = React.useMemo(() => new Map((decay?.nuclides ?? []).map((x) => [keyOf(x.z, x.n), x])), [decay])
  const passes = React.useCallback((l: Line) => {
    const t = half.get(keyOf(l[2], l[3]))?.t
    return l[1] >= minI && (minT === 0 || (t !== null && t !== undefined && t >= minT))
  }, [half, minI, minT])
  const matches = React.useMemo(() => (valid ? near.filter((l) => Math.abs(l[0] - e) <= w && passes(l)).sort((a, b) => b[1] - a[1]) : []), [near, e, w, valid, passes])
  const nameOf = (l: Line) => {
    const x = half.get(keyOf(l[2], l[3]))
    return x ? nucName(x) : `Z ${l[2]}, N ${l[3]}`
  }

  const latest = React.useRef({ near, e, w, passes, nameOf })
  latest.current = { near, e, w, passes, nameOf }
  // Redraw when what the chart shows changes.
  const [rev, setRev] = React.useState(0)
  React.useEffect(() => setRev((r) => r + 1), [near, e, w, passes])
  const ref = useEChart(
    loadDecay,
    () => {
      const v = latest.current
      const dark = isDark()
      const hit = ink(dark)
      const faint = dark ? 'rgba(240,233,216,0.28)' : 'rgba(22,24,29,0.25)'
      const data = v.near.filter((l) => l[1] >= Y_MIN && v.passes(l)).map((l) => {
        const on = Math.abs(l[0] - v.e) <= v.w
        return { value: [l[0], l[1]], name: v.nameOf(l), on }
      })
      return {
        backgroundColor: 'transparent',
        animation: false,
        grid: { left: 380, right: 32, top: 24, bottom: 56 },
        tooltip: {
          formatter: (p: unknown) => {
            const d = (p as { data: { value: [number, number]; name: string } }).data
            return `${d.name} — ${fmt.format(d.value[0])} keV · ${fmt.format(d.value[1])} per 100 decays`
          },
        },
        xAxis: { ...AXIS, type: 'value', name: 'γ energy, keV', nameLocation: 'middle', nameGap: 30, min: Math.max(0, v.e - SPAN), max: v.e + SPAN },
        yAxis: { ...AXIS, type: 'log', name: 'Intensity, per 100 decays', nameLocation: 'middle', nameGap: 52, min: Y_MIN, max: 200 },
        series: [
          {
            type: 'custom',
            encode: { x: 0, y: 1 },
            data,
            markArea: { silent: true, itemStyle: { color: dark ? 'rgba(91,156,255,0.12)' : 'rgba(47,111,220,0.08)' }, data: [[{ xAxis: v.e - v.w }, { xAxis: v.e + v.w }]] },
            renderItem: (params: { dataIndex: number }, api: { value: (i: number) => number; coord: (v: number[]) => number[] }) => {
              const top = api.coord([api.value(0), api.value(1)])
              const base = api.coord([api.value(0), Y_MIN])
              const color = data[params.dataIndex]?.on ? hit : faint
              return {
                type: 'group',
                children: [
                  { type: 'line', shape: { x1: top[0], y1: base[1], x2: top[0], y2: top[1] }, style: { stroke: color, lineWidth: 1.4 } },
                  { type: 'circle', shape: { cx: top[0], cy: top[1], r: 2.6 }, style: { fill: color } },
                ],
              }
            },
          },
        ],
      }
    },
    false,
    undefined,
    { view: rev, replace: true, onPick: () => {} },
  )

  return (
    <div className="relative flex min-h-0 w-full flex-1 flex-col">
      <div ref={ref} className="min-h-0 w-full flex-1" />

      <div className="z-10 absolute bottom-4 left-4 top-4 flex w-[350px] flex-col gap-3 overflow-hidden rounded-xl border border-[var(--paper-rule)]/15 bg-[var(--paper)]/90 px-3 py-3 text-[11px] text-[var(--paper-text)] backdrop-blur-sm">
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[var(--paper-muted)]">Energy, keV</span>
            <input value={energy} onChange={(ev) => setEnergy(ev.target.value)} inputMode="decimal" className="rounded-md border border-[var(--paper-rule)]/30 bg-[var(--paper)] px-2 py-1 text-[13px]" style={MONO} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[var(--paper-muted)]">Window, ± keV</span>
            <input value={window_} onChange={(ev) => setWindow(ev.target.value)} inputMode="decimal" className="rounded-md border border-[var(--paper-rule)]/30 bg-[var(--paper)] px-2 py-1 text-[13px]" style={MONO} />
          </label>
        </div>
        <Chips label="Half-life at least" options={HALF_LIVES.map((h) => ({ id: h.s, label: h.label }))} value={minT} onChange={setMinT} />
        <Chips label="Intensity at least" options={INTENSITIES.map((h) => ({ id: h.i, label: h.label }))} value={minI} onChange={setMinI} />

        <div className="flex min-h-0 flex-1 flex-col border-t border-[var(--paper-rule)]/10 pt-2.5">
          <span className="mb-1 text-[var(--paper-muted)]">
            {valid ? `${matches.length.toLocaleString('en')} line${matches.length === 1 ? '' : 's'} within ${fmt.format(w)} keV` : 'Type an energy in keV.'}
          </span>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <table className="w-full border-collapse" style={MONO}>
              <thead className="sticky top-0 bg-[var(--paper)]">
                <tr className="text-left text-[10px] uppercase tracking-[0.12em] text-[var(--paper-faint)]">
                  <th className="py-1 font-normal">Nuclide</th>
                  <th className="py-1 text-right font-normal">Half-life</th>
                  <th className="py-1 text-right font-normal">keV</th>
                  <th className="py-1 text-right font-normal">Per 100</th>
                </tr>
              </thead>
              <tbody>
                {matches.slice(0, 300).map((l, j) => {
                  const x = half.get(keyOf(l[2], l[3]))
                  return (
                    <tr key={j} className="border-t border-[var(--paper-rule)]/10">
                      <td className="py-1">
                        <Link href={`/viz/radiation?z=${l[2]}&n=${l[3]}`} className="underline-offset-2 hover:underline">
                          {nameOf(l)}
                        </Link>
                      </td>
                      <td className="py-1 text-right text-[var(--paper-muted)]">{x?.t ? formatSeconds(x.t) : '—'}</td>
                      <td className="py-1 text-right">{fmt.format(l[0])}</td>
                      <td className="py-1 text-right">{fmt.format(l[1])}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

function Chips({ label, options, value, onChange }: { label: string; options: { id: number; label: string }[]; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[var(--paper-muted)]">{label}</span>
      <div className="flex flex-wrap gap-1">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={value === o.id}
            onClick={() => onChange(o.id)}
            className={`rounded-full border px-2 py-0.5 transition-colors ${value === o.id ? 'border-[var(--paper-text)] bg-[var(--paper-text)] text-[var(--paper)]' : 'border-[var(--paper-rule)]/30 text-[var(--paper-muted)] hover:bg-[var(--paper-quiet)]'}`}
            style={MONO}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}
