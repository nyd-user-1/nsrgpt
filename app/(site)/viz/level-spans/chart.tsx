'use client'

import * as React from 'react'
import { useEChart, valueRow } from '@/components/viz/use-echart'
import { VizControls } from '@/components/viz/VizControls'
import { MenuSelect } from '@/components/viz/MenuSelect'
import { loadLevelStats, nuclideName, type LevelStats } from '@/lib/viz-data'
import { useData } from '@/lib/use-data'

// One isotope chain at a time, one bar per nuclide (chart batch B, 2026-11-04; ECharts' custom-ohlc pattern): the
// bar runs from the ground state to the highest known level, the left tick sits at the first excited level, the
// right tick at the median level. From level-stats.json, which counts every ENSDF adopted level with an absolute
// energy. Each bar carries its table row at value[5].

const full = new Intl.NumberFormat('en', { maximumSignificantDigits: 4 })
const SANS = { fontFamily: 'var(--font-sans, "DM Sans"), sans-serif' } as const
const MIN_CHAIN = 3

type Api = {
  value: (i: number) => number
  coord: (v: number[]) => number[]
  size: (v: number[]) => number[]
  visual: (k: string) => string
}

/** Low–high line, first excited tick to the left, median tick to the right. */
function renderItem(_: unknown, api: Api) {
  const x = api.value(0)
  const low = api.coord([x, api.value(1)])
  const high = api.coord([x, api.value(2)])
  const first = api.coord([x, api.value(3)])
  const median = api.coord([x, api.value(4)])
  const w = Math.max(3, api.size([1, 0])[0] * 0.3)
  const style = { stroke: api.visual('color'), lineWidth: 2 }
  return {
    type: 'group',
    children: [
      { type: 'line', shape: { x1: low[0], y1: low[1], x2: high[0], y2: high[1] }, style },
      { type: 'line', shape: { x1: first[0] - w, y1: first[1], x2: first[0], y2: first[1] }, style },
      { type: 'line', shape: { x1: median[0], y1: median[1], x2: median[0] + w, y2: median[1] }, style },
    ],
  }
}

type Chain = { z: number; el: string; count: number }
const NO_CHAINS: Chain[] = []

/** The elements with at least MIN_CHAIN nuclides, by Z: the picker's list. */
function chainsOf(d: LevelStats): Chain[] {
  const by = new Map<number, Chain>()
  for (const [rz, , el] of d.rows) {
    const c = by.get(rz) ?? { z: rz, el, count: 0 }
    c.count++
    by.set(rz, c)
  }
  return [...by.values()].filter((c) => c.count >= MIN_CHAIN).sort((a, b) => a.z - b.z)
}

export function LevelSpansChart() {
  const [z, setZ] = React.useState(50)
  const { data: chains = NO_CHAINS } = useData('level-stats.json', { select: chainsOf })
  // The chain's table rows, in bar order, for a table press pointing at its bar.
  const shown = React.useRef<number[]>([])

  const ref = useEChart(
    loadLevelStats,
    (d, zSel) => {
      const rows = d.rows.map((r, k) => ({ r, k })).filter(({ r }) => r[0] === zSel).sort((a, b) => a.r[1] - b.r[1])
      shown.current = rows.map(({ k }) => k)
      const names = rows.map(({ r }) => nuclideName(r[0], r[1], r[2]))
      const el = rows[0]?.r[2] ?? ''
      return {
        backgroundColor: 'transparent',
        animationDuration: 500,
        tooltip: {
          formatter: (p: unknown) => {
            const v = (p as { value: number[] }).value
            return `${names[v[0]]} — first excited ${full.format(v[3] * 1000)} keV · median ${full.format(v[4] * 1000)} keV · highest ${full.format(v[2] * 1000)} keV · ${v[6]} levels`
          },
        },
        // Axis labels (brief 06, 2026-11-05): both axes named in full along their length, the isotope names a size
        // up and dropped where they would overlap, the energies in MeV with one decimal.
        grid: { left: 72, right: 24, top: 16, bottom: 64 },
        xAxis: {
          type: 'category',
          data: names,
          name: el ? `${el} isotopes, by mass number` : 'Isotopes, by mass number',
          nameLocation: 'middle',
          nameGap: 36,
          nameTextStyle: { color: '#64748b', fontSize: 12 },
          axisLabel: { color: '#475569', fontSize: 12, hideOverlap: true },
          axisTick: { alignWithLabel: true },
          axisLine: { lineStyle: { color: '#94a3b8' } },
        },
        yAxis: {
          type: 'value',
          name: 'Level energy (MeV)',
          nameLocation: 'middle',
          nameGap: 48,
          min: 0,
          nameTextStyle: { color: '#64748b', fontSize: 12 },
          axisLabel: { color: '#475569', fontSize: 12, formatter: (v: number) => v.toFixed(1) },
          splitLine: { lineStyle: { color: 'rgba(100,116,139,0.12)' } },
        },
        series: [
          {
            type: 'custom',
            renderItem,
            itemStyle: { color: '#1e3a8a' },
            encode: { x: 0, y: [1, 2, 3, 4] },
            data: rows.map(({ r, k }, i) => [i, 0, r[5] / 1000, r[3] / 1000, r[4] / 1000, k, r[6]]),
          },
        ],
      }
    },
    false,
    valueRow(5),
    {
      view: z,
      marks: true,
      point: (row) => {
        const i = shown.current.indexOf(row)
        return i >= 0 ? { seriesIndex: 0, dataIndex: i } : null
      },
    },
  )

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <VizControls>
        Isotope chain
        <MenuSelect
          label="Isotope chain"
          value={z}
          options={(chains.length ? chains : [{ z, el: '', count: 0 }]).map((c) => ({ value: c.z, label: c.el ? `${c.el} (Z ${c.z}) · ${c.count}` : `Z ${c.z}` }))}
          onChange={setZ}
          className="min-w-[180px] text-[12px]"
        />
      </VizControls>
      <div ref={ref} className="min-h-0 w-full flex-1" />
      <VizControls>
      <p className="m-0 text-[12px] leading-relaxed text-[var(--paper-muted)]" style={SANS}>
        Each bar is one isotope. It runs from the ground state at 0 MeV up to the highest level known; the tick on the left
        marks the first excited level and the tick on the right the median level.
      </p>
      </VizControls>
    </div>
  )
}
