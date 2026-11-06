'use client'

import * as React from 'react'
import { X } from 'lucide-react'
import { useEChart, valueRow, type ChartClick } from '@/components/viz/use-echart'
import { loadMatrixRows, loadNuclideMatrix, nuclideName } from '@/lib/viz-data'
import { isDark } from '@/lib/viz-physics'

// Pearson r across nine nuclide measures (chart batch B, 2026-11-04), over the nuclides that have all nine
// (nuclide-matrix.json). The snapshot holds the 36 pairs; the chart draws both halves and a diagonal of 1. Each
// off-diagonal cell carries its pair's table row at value[3] (−1 on the diagonal), and a table row points at the
// first of its two cells.
//
// Brief 06 (2026-11-05): every cell keeps a visible 1px border, hovered or not (the old 2px gap in the paper's own
// colour vanished, and the hover outline replaced it); a click on an off-diagonal cell opens the scatter of its two
// measures beside the matrix, one dot per nuclide.

const SERIF = { fontFamily: 'var(--font-display), Georgia, serif' } as const
const MONO = { fontFamily: 'var(--font-mono), ui-monospace, monospace' } as const
const full = new Intl.NumberFormat('en', { maximumSignificantDigits: 4 })

/** The nine measures as axis names, with their units. */
const AXIS_NAMES = ['log₁₀ T½ (s)', 'Qα (keV)', 'Qβ− (keV)', 'Sₙ (keV)', 'Sₚ (keV)', 'log₁₀ E(2⁺) (keV)', 'log₁₀ B(E2) (e²b²)', 'Mass excess (keV)', 'log₁₀ levels']
const AXIS = { nameTextStyle: { color: '#64748b' }, axisLabel: { color: '#475569', fontSize: 10 }, axisLine: { lineStyle: { color: '#94a3b8' } } }

function PairScatter({ pair }: { pair: [number, number] }) {
  const [i, j] = pair
  const ref = useEChart(
    loadMatrixRows,
    (rows) => ({
      backgroundColor: 'transparent',
      animationDuration: 400,
      tooltip: {
        formatter: (p: unknown) => {
          const r = rows[(p as { dataIndex: number }).dataIndex]
          if (!r) return ''
          return `${nuclideName(r.z, r.n, r.el)} — ${AXIS_NAMES[i]} ${full.format(r.v[i])} · ${AXIS_NAMES[j]} ${full.format(r.v[j])}`
        },
      },
      grid: { left: 64, right: 16, top: 16, bottom: 48 },
      xAxis: { type: 'value', scale: true, name: AXIS_NAMES[i], nameLocation: 'middle', nameGap: 28, splitLine: { show: false }, ...AXIS },
      yAxis: { type: 'value', scale: true, name: AXIS_NAMES[j], nameLocation: 'middle', nameGap: 48, splitLine: { lineStyle: { color: 'rgba(100,116,139,0.12)' } }, ...AXIS },
      series: [{ type: 'scatter', data: rows.map((r) => [r.v[i], r.v[j]]), symbolSize: 5, itemStyle: { color: '#1e3a8a', opacity: 0.6 } }],
    }),
    false,
    undefined,
    { onPick: () => {}, marks: true },
  )
  return <div ref={ref} className="min-h-0 w-full flex-1" />
}

export function MatrixChart() {
  const [pair, setPair] = React.useState<[number, number] | null>(null)
  const [meta, setMeta] = React.useState<{ labels: string[]; n: number; r: Map<string, number> } | null>(null)
  React.useEffect(() => {
    loadNuclideMatrix().then(
      (d) => setMeta({ labels: d.labels, n: d.n, r: new Map(d.cells.map(([a, b, r]): [string, number] => [`${Math.min(a, b)}-${Math.max(a, b)}`, r])) }),
      () => {},
    )
  }, [])

  const ref = useEChart(
    loadNuclideMatrix,
    (d) => {
      const names = d.labels
      const data: [number, number, number, number][] = []
      d.cells.forEach(([i, j, r], k) => data.push([i, j, r, k], [j, i, r, k]))
      names.forEach((_, i) => data.push([i, i, 1, -1]))
      const border = isDark() ? 'rgba(240,233,216,0.28)' : 'rgba(22,24,29,0.22)'
      return {
        backgroundColor: 'transparent',
        animationDuration: 600,
        tooltip: {
          formatter: (p: unknown) => {
            const v = (p as { value: [number, number, number] }).value
            return `${names[v[0]]} × ${names[v[1]]} — r = ${v[2].toFixed(3)} over ${d.n} nuclides`
          },
        },
        grid: { left: 110, right: 90, top: 16, bottom: 90 },
        xAxis: { type: 'category', data: names, axisLabel: { color: '#334155', rotate: 40 }, axisLine: { lineStyle: { color: '#94a3b8' } }, splitArea: { show: true, areaStyle: { color: ['rgba(148,163,184,0.04)', 'rgba(148,163,184,0.08)'] } } },
        yAxis: { type: 'category', data: names, inverse: true, axisLabel: { color: '#334155' }, axisLine: { lineStyle: { color: '#94a3b8' } }, splitArea: { show: true, areaStyle: { color: ['rgba(148,163,184,0.04)', 'rgba(148,163,184,0.08)'] } } },
        visualMap: {
          min: -1,
          max: 1,
          calculable: true,
          orient: 'vertical',
          right: 8,
          top: 'center',
          inRange: { color: ['#dc2626', '#fca5a5', '#f8fafc', '#93c5fd', '#1e3a8a'] },
          textStyle: { color: '#64748b' },
        },
        series: [
          {
            type: 'heatmap',
            data,
            label: {
              show: true,
              fontSize: 10,
              formatter: (p: unknown) => (p as { value: [number, number, number] }).value[2].toFixed(2),
              color: '#334155',
            },
            itemStyle: { borderColor: border, borderWidth: 1 },
          },
        ],
      }
    },
    false,
    valueRow(3),
    {
      marks: true,
      point: (row) => ({ seriesIndex: 0, dataIndex: row * 2 }),
      onPick: (p: ChartClick) => {
        const v = p.value as number[] | undefined
        if (Array.isArray(v) && v[0] !== v[1]) setPair([v[0], v[1]])
      },
    },
  )

  const key = pair ? `${Math.min(pair[0], pair[1])}-${Math.max(pair[0], pair[1])}` : ''
  const r = meta?.r.get(key)
  return (
    <div className="flex min-h-0 w-full flex-1 gap-4">
      <div ref={ref} className="min-h-0 min-w-0 flex-1" />
      {pair && meta ? (
        <div className="flex w-[380px] shrink-0 flex-col text-[var(--paper-text)]">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-[22px] leading-none" style={SERIF}>
                {meta.labels[pair[0]]} × {meta.labels[pair[1]]}
              </div>
              <div className="mt-2 text-[11px] text-[var(--paper-muted)]" style={MONO}>
                {r !== undefined ? `r = ${r.toFixed(3)} · ` : ''}
                {meta.n} nuclides
              </div>
            </div>
            <button
              type="button"
              aria-label="Close the scatter"
              onClick={() => setPair(null)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--paper-faint)] transition-colors hover:bg-[var(--paper-quiet)] hover:text-[var(--paper-text)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <PairScatter key={`${pair[0]}-${pair[1]}`} pair={pair} />
        </div>
      ) : null}
    </div>
  )
}
