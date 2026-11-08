'use client'

import * as React from 'react'
import { useEChart } from '@/components/viz/use-echart'
import { EChartLegend } from '@/components/viz/EChartLegend'
import { VizControls } from '@/components/viz/VizControls'
import { NuclidePicker, type PickerOption } from '@/components/viz/NuclidePicker'
import { AXIS, FAMILY, decayIndex, familyOf, formatSeconds, halfLifeText, ink, isDark, keyOf, loadDecay, nucName, type Decay } from '@/lib/viz-physics'
import { useData } from '@/lib/use-data'
import { atoms, logTimes, solveChain, timeSpan } from '@/lib/viz-bateman'

// Decay simulation, per chain (Brendan, 2026-11-05: "a second version with meaning and purpose behind it"). The
// first decay simulation runs every nuclide at once; this one asks what happens to one gram of one nuclide over
// time. It solves the Bateman equations exactly over ENSDF's network (lib/viz-bateman.ts) — every branch, every
// daughter — and draws each member's activity (or number of atoms) against time on log–log axes. That is the
// question behind ingrowth and equilibrium: how long until radon's daughters reach full strength in a room, why a
// sealed radium source gets six times more active in its first month, why old plutonium gives off more gamma rays
// than new (²⁴¹Am grows in for ~70 years), when a strontium-90 source is really a strontium-plus-yttrium source.
// Marked on the chart: the start's half-life and ten half-lives, each daughter's activity peak, and the moment
// total activity peaks.

const PRESETS: { label: string; z: number; n: number; note: string }[] = [
  { label: '²²²Rn', z: 86, n: 136, note: 'Radon gas: its short-lived daughters (²¹⁸Po, ²¹⁴Pb, ²¹⁴Bi, ²¹⁴Po) reach the radon’s own activity within about three hours; they, not the radon, give most of the lung dose.' },
  { label: '²²⁶Ra', z: 88, n: 138, note: 'A sealed radium source: one gram is about one curie (3.7 × 10¹⁰ Bq). Radon and its short-lived daughters grow in over a month, so total activity rises about sixfold, then holds for centuries.' },
  { label: '⁹⁰Sr', z: 38, n: 52, note: 'A fission product: ⁹⁰Y (64 h) grows in over about two weeks and then decays as fast as it is made, so the source gives off two betas per strontium decay.' },
  { label: '²⁴¹Pu', z: 94, n: 147, note: 'Reactor plutonium: ²⁴¹Pu (14 y) decays to ²⁴¹Am (432 y), whose activity keeps growing for about 70 years. That is why aged plutonium is a stronger gamma source than fresh.' },
  { label: '²³²Th', z: 90, n: 142, note: 'Thorium: the chain stalls at ²²⁸Ra (5.8 y) and ²²⁸Th (1.9 y), so freshly purified thorium takes decades to come back to equilibrium.' },
  { label: '²³⁸U', z: 92, n: 146, note: 'Uranium ore: ²³⁴U (245,000 y) and ²³⁰Th (75,000 y) set the pace; the chain comes within a few percent of equilibrium after about a million years, the basis of uranium-series dating.' },
]
const AVOGADRO = 6.02214076e23
// The chain's members in series order (series k + 1 draws member k), so a click on a line can name one.
let drawnMembers: number[] = []
const POINTS = 260


export function DecayChainChart() {
  const { data: decay = null } = useData<Decay>('decay.json')
  const [start, setStart] = React.useState(keyOf(88, 138))
  const [showAtoms, setShowAtoms] = React.useState(false)

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
      const startIdx = decayIndex(d).get(Math.floor(view / 2))
      const byAtoms = view % 2 === 1
      if (startIdx === undefined) return { series: [] }
      const head = d.nuclides[startIdx]
      const n0 = AVOGADRO / (head.z + head.n)
      const chain = solveChain(d, startIdx, n0)
      drawnMembers = chain.members
      const [t0, t1] = timeSpan(d, chain)
      const times = logTimes(t0, t1, POINTS)
      const values = chain.members.map((_, k) => times.map((t) => (byAtoms ? atoms(chain, k, t) : chain.lambda[k] * atoms(chain, k, t))))
      const total = times.map((_, j) => values.reduce((s, v, k) => s + (byAtoms && chain.lambda[k] === 0 ? 0 : v[j]), 0))
      const top = Math.max(...total, ...values.flat())
      const floor = top * 1e-14
      const peakAt = total.indexOf(Math.max(...total))
      const fam = (i: number) => {
        const f = familyOf(d.nuclides[i])
        return dark ? FAMILY[f].dark : FAMILY[f].light
      }
      const unit = byAtoms ? 'atoms' : 'Bq'
      const fmt = (v: number) => (v >= 1e4 || v < 1e-2 ? v.toExponential(2) : v.toPrecision(3))

      return {
        backgroundColor: 'transparent',
        animation: false,
        legend: { show: false, type: 'scroll', textStyle: { color: dark ? '#cbd5e1' : '#334155' } },
        grid: { left: 70, right: 28, top: 40, bottom: 48 },
        tooltip: {
          trigger: 'axis',
          formatter: (ps: unknown) => {
            const list = ps as { seriesName: string; value: [number, number | null] }[]
            if (!list.length) return ''
            const t = list[0].value[0]
            const rows = list
              .filter((p) => p.value[1] !== null)
              .sort((a, b) => (b.value[1] as number) - (a.value[1] as number))
              .slice(0, 8)
              .map((p) => `${p.seriesName} ${fmt(p.value[1] as number)} ${unit}`)
            return [`t = ${formatSeconds(t)}`, ...rows].join('<br/>')
          },
        },
        xAxis: {
          type: 'log',
          name: 'time',
          nameLocation: 'middle',
          nameGap: 28,
          min: t0,
          max: t1,
          ...AXIS,
          axisLabel: { ...(AXIS as { axisLabel?: object }).axisLabel, formatter: (v: number) => formatSeconds(v) },
          splitLine: { lineStyle: { color: 'rgba(100,116,139,0.1)' } },
        },
        yAxis: {
          type: 'log',
          name: byAtoms ? 'atoms (from 1 g)' : 'activity, Bq (from 1 g)',
          nameLocation: 'middle',
          nameGap: 54,
          min: floor,
          ...AXIS,
          splitLine: { lineStyle: { color: 'rgba(100,116,139,0.1)' } },
        },
        series: [
          {
            name: byAtoms ? 'All radioactive atoms' : 'Total activity',
            type: 'line',
            showSymbol: false,
            lineStyle: { color: ink(dark), width: 2.5 },
            itemStyle: { color: ink(dark) },
            data: times.map((t, j) => [t, total[j] > floor ? total[j] : null]),
            markLine: {
              symbol: 'none',
              silent: true,
              label: { color: dark ? '#cbd5e1' : '#475569', fontSize: 10, formatter: (p: { name: string }) => p.name },
              lineStyle: { color: dark ? '#64748b' : '#94a3b8', type: 'dashed' },
              data: [
                ...(head.t && head.t >= t0 && head.t <= t1 ? [{ name: `T½ of ${nucName(head)}`, xAxis: head.t }] : []),
                ...(head.t && head.t * 10 >= t0 && head.t * 10 <= t1 ? [{ name: '10 half-lives', xAxis: head.t * 10 }] : []),
                ...(!byAtoms && peakAt > 0 && peakAt < POINTS - 1 ? [{ name: 'total activity peaks', xAxis: times[peakAt] }] : []),
              ],
            },
          },
          ...chain.members.map((i, k) => {
            const v = values[k]
            const peak = v.indexOf(Math.max(...v))
            const x = d.nuclides[i]
            const stable = chain.lambda[k] === 0
            return {
              name: `${nucName(x)}${stable ? ' (stable)' : ''}`,
              type: 'line',
              showSymbol: false,
              emphasis: { focus: 'series', lineStyle: { width: 3 } },
              lineStyle: { color: stable ? ink(dark) : fam(i), width: 1.5, type: stable ? 'dotted' : 'solid', opacity: 0.9 },
              itemStyle: { color: stable ? ink(dark) : fam(i) },
              data: times.map((t, j) => [t, v[j] > floor ? v[j] : null]),
              // Each daughter's peak, where its curve turns over.
              markPoint:
                k > 0 && !stable && peak > 0 && peak < POINTS - 1
                  ? {
                      symbol: 'circle',
                      symbolSize: 7,
                      label: { show: false },
                      itemStyle: { color: fam(i), borderColor: ink(dark), borderWidth: 1 },
                      data: [{ coord: [times[peak], v[peak]], name: `${nucName(x)} peaks at ${formatSeconds(times[peak])}` }],
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
      view: start * 2 + (showAtoms ? 1 : 0),
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
          {[false, true].map((a) => (
            <button
              key={String(a)}
              type="button"
              onClick={() => setShowAtoms(a)}
              aria-pressed={showAtoms === a}
              className={`px-3 py-1 transition-colors ${showAtoms === a ? 'bg-[var(--paper-text)] text-[var(--paper)]' : 'text-[var(--paper-muted)] hover:bg-[var(--paper-quiet)]'}`}
            >
              {a ? 'Atoms' : 'Activity'}
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
      <div ref={ref} className="min-h-0 w-full flex-1" />
      <VizControls>
        {preset ? (
          <p className="m-0 text-[var(--paper-text)]">{preset.note}</p>
        ) : head ? (
          <p className="m-0 text-[var(--paper-text)]">
            {nucName(head)}, T½ {halfLifeText(head)}: everything one gram of it becomes, over time.
          </p>
        ) : null}
        <p className="m-0 mt-1">
          One gram of the starting nuclide at time zero, nothing else. Each line is one member of its decay chain: how many decays
          per second it gives (or how many atoms of it there are) as time passes, from the exact solution of the Bateman equations
          over every branch ENSDF records. Dots mark each daughter&apos;s peak, and a click on a line starts the chain from that member; dashed lines mark the start&apos;s half-life, ten
          half-lives, and when total activity peaks. Ground states only, so isomers such as ⁹⁹ᵐTc are not shown.
        </p>
      </VizControls>
    </div>
  )
}
