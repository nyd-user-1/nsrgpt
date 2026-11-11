'use client'

import * as React from 'react'
import { useEChart } from '@/components/viz/use-echart'
import { ChartBox } from '@/components/viz/chart-kebab'
import { EChartLegend } from '@/components/viz/EChartLegend'
import { VizControls } from '@/components/viz/VizControls'
import { NuclidePicker, type PickerOption } from '@/components/viz/NuclidePicker'
import { AXIS, decayIndex, formatSeconds, halfLifeText, ink, isDark, keyOf, loadDecay, nucName, sup, type Decay } from '@/lib/viz-physics'
import { useData } from '@/lib/use-data'
import { atoms, logTimes, solveChain, timeSpan } from '@/lib/viz-bateman'

// Decay simulation, per chain (Brendan, 2026-11-05: "a second version with meaning and purpose behind it"). The
// first decay simulation runs every nuclide at once; this one asks what happens to one nuclide over time. It solves the
// Bateman equations exactly over ENSDF's network (lib/viz-bateman.ts), every branch and every daughter, and draws each
// member against time on log–log axes: its quantity (the start's being 1), its activity from one gram, or its atoms from
// one gram. That is the question behind ingrowth and equilibrium: how long until radon's daughters reach full strength
// in a room, why a sealed radium source gets six times more active in its first month, why old plutonium gives off more
// gamma rays than new (²⁴¹Am grows in for ~70 years).
//
// It opens on Wikipedia's DecayChain241Pu figure (brief 39, 2026-11-09): the ²⁴¹Pu chain's fifteen members as quantities
// over 1 to 10⁹ years, each labelled on its curve, Σ (every member together) in the ink, and a marker the reader drags
// along time to read every quantity at once. The four decay series start from the pills beside it. Each member wears a
// slot of the categorical palette in chain order; past the eighth the slots come round again with a dashed line, so
// hue and dash together keep fifteen members apart (the dataviz skill: no generated ninth hue).

const YEAR = 365.2422 * 86400
type Mode = 'quantity' | 'activity' | 'atoms'
const MODES: { id: Mode; label: string }[] = [
  { id: 'quantity', label: 'Quantity' },
  { id: 'activity', label: 'Activity' },
  { id: 'atoms', label: 'Atoms' },
]

type Preset = {
  label: string; z: number; n: number; note: string
  /** The members drawn, in the figure's order (the rest still count in Σ). */
  members?: [number, number][]
  /** The time window, seconds, for the quantity view. */
  span?: [number, number]
}
// The four decay series' heads and ²⁴¹Pu first (brief 39), then the earlier presets.
const PRESETS: Preset[] = [
  {
    label: '²⁴¹Pu', z: 94, n: 147,
    note: 'Reactor plutonium: ²⁴¹Pu (14 y) decays to ²⁴¹Am (432 y), whose activity keeps growing for about 70 years, which is why aged plutonium is a stronger gamma source than fresh. Past ²³⁷Np (2.1 million years) the chain is the neptunium series, ending at ²⁰⁹Bi.',
    members: [[94, 147], [95, 146], [93, 144], [91, 142], [92, 141], [90, 139], [88, 137], [89, 136], [87, 134], [85, 132], [83, 130], [84, 129], [81, 128], [82, 127], [83, 126]],
    span: [YEAR, 1e9 * YEAR],
  },
  { label: '²³²Th', z: 90, n: 142, note: 'The thorium series (4n): the chain stalls at ²²⁸Ra (5.8 y) and ²²⁸Th (1.9 y), so freshly purified thorium takes decades to come back to equilibrium. It ends at ²⁰⁸Pb.' },
  { label: '²³⁸U', z: 92, n: 146, note: 'The uranium series (4n+2): ²³⁴U (245,000 y) and ²³⁰Th (75,000 y) set the pace; the chain comes within a few percent of equilibrium after about a million years, the basis of uranium-series dating. It ends at ²⁰⁶Pb.' },
  { label: '²³⁵U', z: 92, n: 143, note: 'The actinium series (4n+3): ²³¹Pa (32,800 y) is the slow step after the head; ²²⁷Ac (21.8 y) and its short-lived daughters follow. It ends at ²⁰⁷Pb.' },
  { label: '²³⁷Np', z: 93, n: 144, note: 'The neptunium series (4n+1): long extinct in nature, made in reactors. ²³³U (159,000 y) and ²²⁹Th (7,900 y) set the pace down to ²⁰⁹Bi.' },
  { label: '²²²Rn', z: 86, n: 136, note: 'Radon gas: its short-lived daughters (²¹⁸Po, ²¹⁴Pb, ²¹⁴Bi, ²¹⁴Po) reach the radon’s own activity within about three hours; they, not the radon, give most of the lung dose.' },
  { label: '²²⁶Ra', z: 88, n: 138, note: 'A sealed radium source: one gram is about one curie (3.7 × 10¹⁰ Bq). Radon and its short-lived daughters grow in over a month, so total activity rises about sixfold, then holds for centuries.' },
  { label: '⁹⁰Sr', z: 38, n: 52, note: 'A fission product: ⁹⁰Y (64 h) grows in over about two weeks and then decays as fast as it is made, so the source gives off two betas per strontium decay.' },
]

/** The dataviz skill's categorical palette (references/palette.md), slots 1 to 8, per theme. */
const CATEGORICAL = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
}

const AVOGADRO = 6.02214076e23
// The chain's members in series order (series k + 1 draws member k), so a click on a line can name one.
let drawnMembers: number[] = []
const POINTS = 260

/** Years on the quantity view's axis: 1, 10, 100, 1,000, then 10⁴ … */
const yearsLabel = (s: number) => {
  const y = s / YEAR
  if (y >= 1e4 || y < 1e-2) return `10${sup(Math.round(Math.log10(y)))}`
  return y >= 1 ? y.toLocaleString('en', { maximumFractionDigits: 0 }) : String(+y.toPrecision(1))
}
const sci = (v: number) => (v >= 1e4 || v < 1e-2 ? v.toExponential(2) : v.toPrecision(3))

export function DecayChainChart() {
  const { data: decay = null } = useData<Decay>('decay.json')
  const [start, setStart] = React.useState(keyOf(94, 147))
  const [mode, setMode] = React.useState<Mode>('quantity')

  // Only nuclides that decay can start a chain.
  const options = React.useMemo<PickerOption[]>(
    () =>
      (decay?.nuclides ?? [])
        .filter((x) => x.t !== null && x.t > 0 && x.m.length > 0)
        .sort((a, b) => a.z - b.z || a.n - b.n)
        .map((x) => ({ key: keyOf(x.z, x.n), label: `${x.z + x.n}${x.el}`, alt: `${x.el}${x.z + x.n}` })),
    [decay],
  )
  const stepStart = (dir: -1 | 1) => {
    const i = options.findIndex((o) => o.key === start)
    if (i >= 0) setStart(options[(i + dir + options.length) % options.length].key)
  }

  const ref = useEChart(
    loadDecay,
    (d, view) => {
      const dark = isDark()
      const startKey = Math.floor(view / 3)
      const m: Mode = MODES[view % 3].id
      const startIdx = decayIndex(d).get(startKey)
      if (startIdx === undefined) return { series: [] }
      const head = d.nuclides[startIdx]
      const preset = PRESETS.find((p) => keyOf(p.z, p.n) === startKey)
      const n0 = m === 'quantity' ? 1 : AVOGADRO / (head.z + head.n)
      const chain = solveChain(d, startIdx, n0)
      const index = decayIndex(d)
      // the members drawn: the preset's, in its order, else the whole chain
      const drawn = preset?.members
        ? preset.members.map(([z, n]) => chain.members.indexOf(index.get(keyOf(z, n)) ?? -1)).filter((k) => k >= 0)
        : chain.members.map((_, k) => k)
      drawnMembers = drawn.map((k) => chain.members[k])
      const [t0, t1] = m === 'quantity' && preset?.span ? preset.span : timeSpan(d, chain)
      const times = logTimes(t0, t1, POINTS)
      const value = (k: number, t: number) => (m === 'activity' ? chain.lambda[k] * atoms(chain, k, t) : atoms(chain, k, t))
      const values = chain.members.map((_, k) => times.map((t) => value(k, t)))
      // Σ: every member together. Quantities sum to 1 for all time; activity sums every decay; atoms count the radioactive.
      const total = times.map((_, j) => values.reduce((s, v, k) => s + (m === 'atoms' && chain.lambda[k] === 0 ? 0 : v[j]), 0))
      const top = Math.max(...total, ...values.flat())
      const floor = m === 'quantity' ? 1e-30 : top * 1e-14
      const peakAt = total.indexOf(Math.max(...total))
      const palette = CATEGORICAL[dark ? 'dark' : 'light']
      const colour = (slot: number) => palette[slot % 8]
      const unit = m === 'activity' ? 'Bq' : m === 'atoms' ? 'atoms' : ''
      const tLabel = (t: number) => (m === 'quantity' ? `${yearsLabel(t)} years` : formatSeconds(t))
      const quantity = m === 'quantity'
      const sigmaName = quantity ? 'Σ' : m === 'atoms' ? 'All radioactive atoms' : 'Total activity'

      return {
        backgroundColor: 'transparent',
        animation: false,
        legend: { show: false, type: 'scroll' },
        grid: { left: 70, right: 72, top: 40, bottom: 48 },
        tooltip: {
          trigger: 'axis',
          // the dragged marker keeps its readout up
          alwaysShowContent: quantity,
          formatter: (ps: unknown) => {
            const list = ps as { seriesName: string; value: [number, number | null] }[]
            if (!list.length) return ''
            const t = list[0].value[0]
            const rows = list
              .filter((p) => p.value[1] !== null)
              .sort((a, b) => (b.value[1] as number) - (a.value[1] as number))
              .slice(0, quantity ? 20 : 8)
              .map((p) => `${p.seriesName} ${sci(p.value[1] as number)}${unit ? ` ${unit}` : ''}`)
            return [`t = ${tLabel(t)}`, ...rows].join('<br/>')
          },
        },
        xAxis: {
          type: 'log',
          name: quantity ? 'time, years' : 'time',
          nameLocation: 'middle',
          nameGap: 28,
          min: t0,
          max: t1,
          ...AXIS,
          axisLabel: { ...(AXIS as { axisLabel?: object }).axisLabel, formatter: (v: number) => (quantity ? yearsLabel(v) : formatSeconds(v)) },
          splitLine: { lineStyle: { color: 'rgba(100,116,139,0.1)' } },
          // The marker to drag: a handle under the axis moves it along time; the readout lists every member there.
          ...(quantity
            ? {
                axisPointer: {
                  show: true,
                  snap: false,
                  value: Math.sqrt(t0 * t1),
                  lineStyle: { color: ink(dark), width: 1, type: 'dashed' },
                  label: { show: true, formatter: (p: { value: number }) => `${yearsLabel(p.value)} y`, backgroundColor: ink(dark), color: dark ? '#15120d' : '#ffffff' },
                  handle: { show: true, size: 22, margin: 34, color: ink(dark) },
                },
              }
            : {}),
        },
        yAxis: {
          type: 'log',
          name: quantity ? 'quantity (starting quantity 1)' : m === 'atoms' ? 'atoms (from 1 g)' : 'activity, Bq (from 1 g)',
          nameLocation: 'middle',
          nameGap: 54,
          min: floor,
          ...(quantity ? { max: 10 } : {}),
          ...AXIS,
          axisLabel: { ...(AXIS as { axisLabel?: object }).axisLabel, formatter: (v: number) => (v === 1 ? '1' : `10${sup(Math.round(Math.log10(v)))}`) },
          splitLine: { lineStyle: { color: 'rgba(100,116,139,0.1)' } },
        },
        series: [
          {
            name: sigmaName,
            type: 'line',
            showSymbol: false,
            lineStyle: { color: ink(dark), width: quantity ? 4 : 2.5 },
            itemStyle: { color: ink(dark) },
            data: times.map((t, j) => [t, total[j] > floor ? total[j] : null]),
            endLabel: quantity ? { show: true, formatter: 'Σ', color: ink(dark), fontSize: 13, fontWeight: 600 } : undefined,
            markLine: quantity
              ? undefined
              : {
                  symbol: 'none',
                  silent: true,
                  label: { color: dark ? '#cbd5e1' : '#475569', fontSize: 10, formatter: (p: { name: string }) => p.name },
                  lineStyle: { color: dark ? '#64748b' : '#94a3b8', type: 'dashed' },
                  data: [
                    ...(head.t && head.t >= t0 && head.t <= t1 ? [{ name: `T½ of ${nucName(head)}`, xAxis: head.t }] : []),
                    ...(head.t && head.t * 10 >= t0 && head.t * 10 <= t1 ? [{ name: '10 half-lives', xAxis: head.t * 10 }] : []),
                    ...(m === 'activity' && peakAt > 0 && peakAt < POINTS - 1 ? [{ name: 'total activity peaks', xAxis: times[peakAt] }] : []),
                  ],
                },
          },
          ...drawn.map((k, slot) => {
            const v = values[k]
            const peak = v.indexOf(Math.max(...v))
            const x = d.nuclides[chain.members[k]]
            const stable = chain.lambda[k] === 0
            const c = colour(slot)
            const dashed = slot >= 8
            return {
              name: `${nucName(x)}${stable ? ' (stable)' : ''}`,
              type: 'line',
              showSymbol: false,
              emphasis: { focus: 'series', lineStyle: { width: 3 } },
              lineStyle: { color: c, width: 1.75, type: dashed ? 'dashed' : 'solid', opacity: 0.95 },
              itemStyle: { color: c },
              data: times.map((t, j) => [t, v[j] > floor ? v[j] : null]),
              // Each member named on its curve, at its highest point in view; the label in the ink, the dot in its colour.
              markPoint:
                v[peak] > floor
                  ? {
                      symbol: 'circle',
                      symbolSize: 6,
                      itemStyle: { color: c, borderColor: ink(dark), borderWidth: 0.5 },
                      label: {
                        show: quantity || k > 0,
                        formatter: nucName(x),
                        position: peak === 0 ? 'right' : peak >= POINTS - 2 ? 'left' : 'top',
                        color: ink(dark),
                        fontSize: 11,
                      },
                      data: [{ coord: [times[peak], v[peak]], name: `${nucName(x)} at its highest: ${sci(v[peak])}${unit ? ` ${unit}` : ''}, ${tLabel(times[peak])}` }],
                      tooltip: { formatter: (p: { name: string }) => p.name },
                    }
                  : undefined,
            }
          }),
        ],
      }
    },
    false,
    undefined,
    {
      view: start * 3 + MODES.findIndex((x) => x.id === mode),
      replace: true,
      // A click on a member's line starts the chain from that member; there is no data table for this chart.
      onPick: (p) => {
        const i = typeof p.seriesIndex === 'number' && p.seriesIndex > 0 ? drawnMembers[p.seriesIndex - 1] : undefined
        const x = i === undefined || !decay ? undefined : decay.nuclides[i]
        if (x && x.t !== null && x.t > 0 && x.m.length) setStart(keyOf(x.z, x.n))
      },
    },
  )

  const preset = PRESETS.find((p) => keyOf(p.z, p.n) === start)
  const head = decay ? decay.nuclides[decayIndex(decay).get(start) ?? -1] : undefined
  const CHIP = 'rounded-full border px-3 py-1 text-[12px] transition-colors'
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <VizControls>
        <EChartLegend chart={ref} />
        <NuclidePicker value={start} options={options} onPick={(k) => k !== null && setStart(k)} onStep={stepStart} label="Start nuclide" />
        <div className="ml-1 flex overflow-hidden rounded-full border border-[var(--paper-rule)] text-[12px]">
          {MODES.map((x) => (
            <button
              key={x.id}
              type="button"
              onClick={() => setMode(x.id)}
              aria-pressed={mode === x.id}
              className={`px-3 py-1 transition-colors ${mode === x.id ? 'bg-[var(--paper-text)] text-[var(--paper)]' : 'text-[var(--paper-muted)] hover:bg-[var(--paper-quiet)]'}`}
            >
              {x.label}
            </button>
          ))}
        </div>
        {PRESETS.map((p) => {
          const k = keyOf(p.z, p.n)
          return (
            <button
              key={p.label}
              type="button"
              onClick={() => setStart(k)}
              className={`${CHIP} ${start === k ? 'border-[var(--paper-text)] text-[var(--paper-text)]' : 'border-[var(--paper-rule)] text-[var(--paper-muted)] hover:bg-[var(--paper-quiet)]'}`}
            >
              {p.label}
            </button>
          )
        })}
      </VizControls>
      <ChartBox chart={ref} className="min-h-0 w-full flex-1" />
      <VizControls>
        {preset ? (
          <p className="m-0 text-[var(--paper-text)]">{preset.note}</p>
        ) : head ? (
          <p className="m-0 text-[var(--paper-text)]">
            {nucName(head)}, T½ {halfLifeText(head)}: everything it becomes, over time.
          </p>
        ) : null}
        <p className="m-0 mt-1">
          The starting nuclide at time zero, nothing else. Each line is one member of its decay chain: how much of it there is
          against the starting quantity of 1 (Quantity), how many decays per second it gives from one gram (Activity), or how many
          atoms of it there are from one gram (Atoms), from the exact solution of the Bateman equations over every branch ENSDF
          records. Σ is every member together. On Quantity, drag the handle under the time axis to read every member at one time.
          A click on a line starts the chain from that member. Ground states only, so isomers such as ⁹⁹ᵐTc are not shown.
        </p>
        <p className="m-0 mt-1 text-[var(--paper-faint)]">Sources: ENSDF (decay modes and half-lives)</p>
      </VizControls>
    </div>
  )
}
