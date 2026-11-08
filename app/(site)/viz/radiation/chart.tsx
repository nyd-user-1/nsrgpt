'use client'

import * as React from 'react'
import { useEChart } from '@/components/viz/use-echart'
import { EChartLegend } from '@/components/viz/EChartLegend'
import { VizControls } from '@/components/viz/VizControls'
import { NuclidePicker, type PickerOption } from '@/components/viz/NuclidePicker'
import { AXIS, halfLifeText, isDark, keyOf, loadDecay, nucName, sup, type Decay } from '@/lib/viz-physics'
import { TYPES, budget, type ElementFile, type Lines } from './data'
import { useData } from '@/lib/use-data'

// The decay radiation card (Brendan, 2026-11-06): everything one nuclide's decay gives off, from ENSDF through the
// IAEA Live Chart API. Each line stands at its energy, as tall as its intensity per 100 decays, both on log scales:
// α lines, β spectra (the dot at the mean energy, the dashed line out to the endpoint), γ rays, X-rays, and Auger and
// conversion electrons. Beside it, where an average decay's energy goes — what stays in a sample, what leaves it.

const MONO = { fontFamily: 'var(--font-mono), ui-monospace, monospace' } as const
const fmt = new Intl.NumberFormat('en', { maximumSignificantDigits: 4 })
const Y_MIN = 1e-4
const PRESETS: [number, number][] = [
  [27, 33],
  [55, 82],
  [53, 78],
  [95, 146],
  [11, 11],
  [88, 138],
  [38, 52],
  [94, 145],
]

type Item = { type: (typeof TYPES)[number]['id']; e: number; i: number; end?: number | null; kind?: string }

/** Every line of a nuclide's decay, as the chart draws them. */
function items(l: Lines): Item[] {
  return [
    ...(l.a ?? []).map(([e, i]): Item => ({ type: 'a', e, i })),
    ...(l.bm ?? []).map(([e, end, i]): Item => ({ type: 'bm', e, i, end })),
    ...(l.bp ?? []).map(([e, end, i]): Item => ({ type: 'bp', e, i, end })),
    ...(l.g ?? []).map(([e, i]): Item => ({ type: 'g', e, i })),
    ...(l.x ?? []).map(([e, i]): Item => ({ type: 'x', e, i })),
    ...(l.e ?? []).map(([e, i, kind]): Item => ({ type: 'e', e, i, kind })),
  ]
}

export function RadiationChart() {
  const { data: decay = null } = useData<Decay>('decay.json')
  const [key, setKey] = React.useState(keyOf(27, 33))
  React.useEffect(() => {
    // A link may name the nuclide (/viz/radiation?z=55&n=82, from the γ-line finder).
    const q = new URLSearchParams(window.location.search)
    const z = Number(q.get('z'))
    const n = Number(q.get('n'))
    if (z > 0 && n >= 0 && q.get('n') !== null) setKey(keyOf(z, n))
  }, [])
  const z = Math.floor(key / 1000)
  const n = key % 1000
  // The element's file, one per element (lib/use-data.ts); a failed load reads as no radiation listed.
  const { data: file, loading } = useData<ElementFile>(`radiation/${z}.json`)
  const nuc = file?.nuclides.find((x) => x.n === n) ?? null
  const lines = React.useMemo(() => nuc?.lines ?? null, [nuc])
  const latest = React.useRef(lines)
  latest.current = lines

  const options = React.useMemo<PickerOption[]>(
    () =>
      (decay?.nuclides ?? [])
        .filter((x) => x.t !== null && x.t > 0)
        .sort((a, b) => a.z - b.z || a.n - b.n)
        .map((x) => ({ key: keyOf(x.z, x.n), label: `${x.z + x.n}${x.el}`, alt: `${x.el}${x.z + x.n}` })),
    [decay],
  )
  const step = (dir: -1 | 1) => {
    const i = options.findIndex((o) => o.key === key)
    if (i >= 0) setKey(options[(i + dir + options.length) % options.length].key)
  }
  const name = (k: number) => {
    const x = decay?.nuclides.find((d) => d.z === Math.floor(k / 1000) && d.n === k % 1000)
    return x ? nucName(x) : `${sup(Math.floor(k / 1000) + (k % 1000))}`
  }
  const head = decay?.nuclides.find((d) => d.z === z && d.n === n)
  const b = lines ? budget(lines, z + n) : null
  const total = b ? [...b.stays, ...b.leaves].reduce((s, x) => s + x.kev, 0) : 0
  const strongest = lines ? items(lines).sort((p, q) => q.i - p.i).slice(0, 8) : []

  const ref = useEChart(
    loadDecay,
    () => {
      const l = latest.current
      const dark = isDark()
      const all = l ? items(l) : []
      return {
        backgroundColor: 'transparent',
        animation: false,
        grid: { left: 72, right: 32, top: 24, bottom: 56 },
        legend: { show: false, data: TYPES.filter((t) => all.some((x) => x.type === t.id)).map((t) => t.label), textStyle: { color: '#475569', fontSize: 12 }, itemWidth: 10, itemHeight: 10, icon: 'circle' },
        tooltip: {
          formatter: (p: unknown) => {
            const it = (p as { data: { it: Item } }).data?.it
            if (!it) return ''
            const t = TYPES.find((x) => x.id === it.type)!
            const what = it.type === 'bm' || it.type === 'bp' ? `${t.label}, mean ${fmt.format(it.e)} keV${it.end ? `, endpoint ${fmt.format(it.end)} keV` : ''}` : `${t.label}${it.kind ? ` (${it.kind})` : ''} ${fmt.format(it.e)} keV`
            return `${what} · ${fmt.format(it.i)} per 100 decays`
          },
        },
        xAxis: { ...AXIS, type: 'log', name: 'Energy, keV', nameLocation: 'middle', nameGap: 30, min: 1, max: 20000 },
        yAxis: { ...AXIS, type: 'log', name: 'Intensity, per 100 decays', nameLocation: 'middle', nameGap: 52, min: Y_MIN, max: 200 },
        series: TYPES.filter((t) => all.some((x) => x.type === t.id)).map((t) => {
          const color = dark ? t.dark : t.light
          return {
            type: 'custom',
            name: t.label,
            color,
            encode: { x: 0, y: 1 },
            data: all.filter((x) => x.type === t.id && x.i >= Y_MIN).map((it) => ({ value: [it.e, it.i, it.end ?? it.e], it })),
            renderItem: (_: unknown, api: { value: (i: number) => number; coord: (v: number[]) => number[] }) => {
              const top = api.coord([api.value(0), api.value(1)])
              const base = api.coord([api.value(0), Y_MIN])
              const end = api.coord([api.value(2), api.value(1)])
              const children: unknown[] = [
                { type: 'line', shape: { x1: top[0], y1: base[1], x2: top[0], y2: top[1] }, style: { stroke: color, lineWidth: 1.4, opacity: 0.85 } },
                { type: 'circle', shape: { cx: top[0], cy: top[1], r: 3 }, style: { fill: color } },
              ]
              // A β spectrum runs from its mean out to its endpoint.
              if (end[0] > top[0] + 1) children.push({ type: 'line', shape: { x1: top[0], y1: top[1], x2: end[0], y2: end[1] }, style: { stroke: color, lineWidth: 1, lineDash: [3, 3] } })
              return { type: 'group', children }
            },
          }
        }),
      }
    },
    false,
    undefined,
    { view: key * 2 + (lines ? 1 : 0), replace: true, onPick: () => {} },
  )

  return (
    <div className="relative flex min-h-0 w-full flex-1 flex-col">
      <div ref={ref} className="min-h-0 w-full flex-1" />

      <VizControls>
        <EChartLegend chart={ref} items={TYPES.filter((t) => lines && items(lines).some((x) => x.type === t.id)).map((t) => ({ name: t.label, color: isDark() ? t.dark : t.light }))} />
        <div className="flex flex-wrap gap-1">
          {PRESETS.map(([pz, pn]) => {
            const k = keyOf(pz, pn)
            return (
              <button
                key={k}
                type="button"
                aria-pressed={k === key}
                onClick={() => setKey(k)}
                className={`rounded-full border px-2 py-0.5 transition-colors ${k === key ? 'border-[var(--paper-text)] bg-[var(--paper-text)] text-[var(--paper)]' : 'border-[var(--paper-rule)]/30 text-[var(--paper-muted)] hover:bg-[var(--paper-quiet)]'}`}
                style={MONO}
              >
                {name(k)}
              </button>
            )
          })}
        </div>
        <NuclidePicker value={key} options={options} onPick={(k) => k !== null && setKey(k)} onStep={step} label="Nuclide" />
        {head && (
          <div style={MONO} className="text-[var(--paper-muted)]">
            {halfLifeText(head)}
            {head.m.length ? ` · ${head.m.map(([m, p]) => `${decay?.modes[m]?.label ?? m}${p === null ? '' : ` ${+p.toPrecision(4)}%`}`).join(', ')}` : ''}
          </div>
        )}

        {b && total > 0 ? (
          <div className="flex flex-col gap-2 border-t border-[var(--paper-rule)]/10 pt-2.5">
            <span className="text-[var(--paper-muted)]">
              Energy per decay <span style={MONO}>{fmt.format(total)} keV</span>
            </span>
            {(
              [
                ['Stays in the sample', b.stays],
                ['Leaves it', b.leaves],
              ] as const
            ).map(([title, parts]) => (
              <div key={title} className="flex flex-col gap-1">
                <span className="text-[var(--paper-faint)]">{title}</span>
                {parts
                  .filter((p) => p.kev > 0)
                  .map((p) => (
                    <div key={p.label} className="grid grid-cols-[72px_1fr_auto] items-center gap-2">
                      <span>{p.label}</span>
                      <span className="h-[3px] rounded-full bg-[var(--paper-rule)]/15">
                        <span className="block h-full rounded-full bg-[var(--paper-text)]/60" style={{ width: `${(p.kev / total) * 100}%` }} />
                      </span>
                      <span className="tabular-nums" style={MONO}>
                        {fmt.format(p.kev)}
                      </span>
                    </div>
                  ))}
              </div>
            ))}
          </div>
        ) : (
          <span className="text-[var(--paper-muted)]">{loading ? 'Loading…' : 'ENSDF lists no radiation for this decay.'}</span>
        )}

        {strongest.length > 0 && (
          <div className="flex flex-col gap-1 border-t border-[var(--paper-rule)]/10 pt-2.5">
            <span className="text-[var(--paper-muted)]">Strongest lines</span>
            <table className="w-full border-collapse" style={MONO}>
              <tbody>
                {strongest.map((it, j) => (
                  <tr key={j} className="border-t border-[var(--paper-rule)]/10">
                    <td className="py-0.5">{TYPES.find((t) => t.id === it.type)?.label}</td>
                    <td className="py-0.5 text-right">{fmt.format(it.e)} keV</td>
                    <td className="py-0.5 text-right">{fmt.format(it.i)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </VizControls>
    </div>
  )
}
