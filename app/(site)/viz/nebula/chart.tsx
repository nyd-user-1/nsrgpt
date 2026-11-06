'use client'

import * as React from 'react'
import { diagonalTip, firstSeriesRow, useEChart } from '@/components/viz/use-echart'
import { AXIS, decayIndex, familyColor, familyOf, ink, keyOf, loadMassesAndDecay, nucName } from '@/lib/viz-physics'

// Binding energy per nucleon against mass number, every AME2020 nuclide (chart batch A, 2026-11-04), each dot in
// its decay mode's colour. The top of the curve is ⁶²Ni, a hair above ⁵⁸Fe and ⁵⁶Fe; both ends are marked.
export function NebulaChart({ fill }: { fill?: boolean }) {
  // Why the two labelled nuclides are labelled, shown when one is hovered (Brendan, 2026-11-06).
  const DOT = 3.5
  const WHY: Record<number, string> = {
    [keyOf(28, 34)]: 'The highest binding energy per nucleon of any nucleus.',
    [keyOf(26, 30)]: 'The lowest mass per nucleon of any nucleus.',
  }
  const ref = useEChart(loadMassesAndDecay, ([masses, decay]) => {
    const index = decayIndex(decay)
    const at = (z: number, n: number) => decay.nuclides[index.get(keyOf(z, n)) ?? -1]
    const data = masses.map((m, row) => ({
      value: [m.z + m.n, (m.b ?? 0) / 1000, row],
      itemStyle: { color: familyColor(familyOf(at(m.z, m.n))), opacity: m.est ? 0.45 : 0.85 },
    }))
    const mark = (z: number, n: number, dx: number) => {
      const m = masses.find((x) => x.z === z && x.n === n)
      return m && {
        // The key names the nuclide, so a click on the label finds its dot.
        name: String(keyOf(z, n)),
        coord: [z + n, (m.b ?? 0) / 1000],
        label: { show: true, position: 'top', offset: [dx, -2], formatter: `${nucName(m)} ${((m.b ?? 0) / 1000).toFixed(3)}`, color: ink(), fontSize: 11 },
      }
    }
    return {
      backgroundColor: 'transparent',
      animationDuration: 1200,
      tooltip: {
        position: diagonalTip,
        formatter: (p: unknown) => {
          const row = (p as { value?: number[] }).value?.[2]
          const m = typeof row === 'number' ? masses[row] : undefined
          if (!m) return ''
          // As the two labels read: the nuclide and its B/A to three places; the axis names the quantity (2026-11-06).
          const head = `${nucName(m)} ${((m.b ?? 0) / 1000).toFixed(3)}${m.est ? ' (extrapolated)' : ''}`
          const why = WHY[keyOf(m.z, m.n)]
          return why ? `${head}<br/><span style="font-size:11px;opacity:0.7">${why}</span>` : head
        },
      },
      grid: { left: 40, right: 24, top: 40, bottom: 30 },
      // A faint grid behind the points (Brendan, 2026-11-06), as the other charts' split lines are drawn.
      xAxis: { type: 'value', name: 'A', max: 300, ...AXIS, splitLine: { show: true, lineStyle: { color: 'rgba(100,116,139,0.14)' } } },
      // One decimal on every tick, as the top one (9.2) has (Brendan, 2026-11-06).
      yAxis: { type: 'value', name: 'B/A, MeV', min: 0, max: 9.2, ...AXIS, axisLabel: { ...AXIS.axisLabel, formatter: (v: number) => v.toFixed(1) }, splitLine: { show: true, lineStyle: { color: 'rgba(100,116,139,0.14)' } } },
      series: [
        {
          type: 'scatter',
          data,
          symbolSize: DOT,
          markPoint: {
            symbol: 'circle',
            // No ring (Brendan, 2026-11-06): the points only carry the labels.
            symbolSize: 7,
            itemStyle: { color: 'transparent', borderWidth: 0 },
            data: [
              // Either side of the peak: lighter nuclei release energy by fusing, heavier ones by splitting.
              { name: 'fusion', coord: [62, 9.05], label: { show: true, position: 'left', distance: 8, formatter: '← fusion', color: '#94a3b8', fontSize: 11 } },
              { name: 'fission', coord: [62, 9.05], label: { show: true, position: 'right', distance: 8, formatter: 'fission →', color: '#94a3b8', fontSize: 11 } },
            ].filter(Boolean),
          },
          // The peak of the curve (Brendan, 2026-11-06): a faint dashed line at A = 62, ⁶²Ni.
          markLine: {
            silent: true,
            symbol: 'none',
            label: { show: false },
            lineStyle: { type: 'dashed', color: 'rgba(148,163,184,0.55)', width: 1 },
            data: [{ xAxis: 62 }],
          },
        },
      ],
    }
  }, false, firstSeriesRow, { marks: true, onPick: () => {} })
  // A click on either label shows its nuclide's tooltip, as hovering its dot does (Brendan, 2026-11-06).
  React.useEffect(() => {
    let live = true
    let off = () => {}
    void Promise.all([import('echarts'), loadMassesAndDecay()]).then(async ([echarts, [masses]]) => {
      for (let i = 0; i < 600 && live; i++) {
        const c = ref.current ? echarts.getInstanceByDom(ref.current) : undefined
        if (c) {
          const on = (p: unknown) => {
            const q = p as { componentType?: string; name?: string }
            if (q.componentType !== 'markPoint') return
            const row = masses.findIndex((m) => String(keyOf(m.z, m.n)) === q.name)
            if (row >= 0) c.dispatchAction({ type: 'showTip', seriesIndex: 0, dataIndex: row })
          }
          c.on('click', on)
          off = () => !c.isDisposed() && c.off('click', on)
          return
        }
        await new Promise((r) => requestAnimationFrame(r))
      }
    })
    return () => {
      live = false
      off()
    }
  }, [ref])
  return <div ref={ref} className={fill ? 'h-full min-h-0 w-full flex-1' : 'h-[78vh] w-full'} />
}
