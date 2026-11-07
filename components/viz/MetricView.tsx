'use client'

import { diagonalTip, useEChart } from '@/components/viz/use-echart'
import { loadGround } from '@/app/(site)/viz/explorer/data'
import { GL_VIEW } from '@/lib/viz-3d'
import { formatSeconds, sup } from '@/lib/nuclide'
import { AXIS, isDark } from '@/lib/viz-physics'
import type { MetricValue, View } from '@/lib/viz-metrics'

// A metric drawn as another chart type (Brendan, 2026-11-06): the chart-type switcher at a framed chart's foot
// (components/viz/FramedBox.tsx, lib/viz-metrics.ts). One value per nuclide, from the IAEA Live Chart ground states;
// a log metric is drawn on log₁₀ of its value.

type Point = { z: number; n: number; name: string; v: number; p: number }

const RAMP_LIGHT = ['#1b2f80', '#2f6fdc', '#2aa1d6', '#22b39a', '#5cbf4a', '#b5c935', '#f2c230', '#f08a24', '#e0482f']
const RAMP_DARK = ['#5468d9', '#4d8cf0', '#38b6e8', '#2fcfb0', '#6fd65a', '#c8dc45', '#ffd447', '#ff9a3c', '#ff6047']
const DOT = '#2f6fdc'
const RULE = 'rgba(100,116,139,0.14)'
/** An x axis along the plot's foot, not through y = 0 (a log value crosses it). */
const FOOT = { axisLine: { ...AXIS.axisLine, onZero: false } }

async function loadPoints(value: MetricValue): Promise<Point[]> {
  const g = await loadGround()
  const zi = g.cols.indexOf('z')
  const ni = g.cols.indexOf('n')
  const vi = g.cols.indexOf(value.id)
  const out: Point[] = []
  for (const r of g.rows) {
    const raw = r[vi]
    if (typeof raw !== 'number') continue
    if (value.log && raw <= 0) continue
    const z = r[zi] as number
    const n = r[ni] as number
    const v = raw * (value.scale ?? 1)
    out.push({ z, n, name: z === 0 && n === 1 ? 'n' : `${sup(z + n)}${g.els[z]}`, v, p: value.log ? Math.log10(v) : v })
  }
  return out
}

const valueText = (value: MetricValue, v: number) =>
  value.id === 't' ? formatSeconds(v) : `${v.toFixed(3)} ${value.unit}`
const tickText = (value: MetricValue) => (p: number) =>
  value.log ? `10${sup(Math.round(p))}` : Number.isInteger(p) ? String(p) : p.toFixed(1)

function option(points: Point[], value: MetricValue, view: View) {
  const dark = isDark()
  const ramp = dark ? RAMP_DARK : RAMP_LIGHT
  const ps = points.map((q) => q.p)
  const lo = Math.min(...ps)
  const hi = Math.max(...ps)
  const name = `${value.label}${value.unit && !value.log ? `, ${value.unit}` : value.log ? `, ${value.unit} (log)` : ''}`
  const tooltip = {
    position: diagonalTip,
    formatter: (p: unknown) => {
      const i = (p as { value?: number[] }).value?.[3] ?? (p as { dataIndex?: number }).dataIndex
      const q = typeof i === 'number' ? points[i] : undefined
      return q ? `${q.name} ${valueText(value, q.v)}` : ''
    },
  }
  const colour = {
    type: 'continuous' as const,
    dimension: 2,
    min: lo,
    max: hi,
    show: view === 'heatmap' || view === 'bubble',
    right: 8,
    top: 'middle',
    itemHeight: 160,
    calculable: false,
    text: [tickText(value)(hi), tickText(value)(lo)],
    textStyle: { color: '#475569', fontSize: 10 },
    inRange: { color: ramp },
  }
  const base = { backgroundColor: 'transparent', animation: false, tooltip }
  // The axis names start at the axis line, so a long one never runs off the left edge.
  const yValue = { type: 'value', name, ...AXIS, nameTextStyle: { ...AXIS.nameTextStyle, align: 'left' }, scale: true, axisLabel: { ...AXIS.axisLabel, formatter: tickText(value) }, splitLine: { lineStyle: { color: RULE } } }

  if (view === 'scatter3d') {
    const axis = (nm: string, fmt?: (p: number) => string) => ({ type: 'value', name: nm, nameTextStyle: { color: '#64748b' }, axisLabel: { color: '#475569', ...(fmt ? { formatter: fmt } : {}) }, axisLine: { lineStyle: { color: '#1e293b' } } })
    return {
      ...base,
      visualMap: { ...colour, dimension: 2 },
      xAxis3D: axis('N'),
      yAxis3D: axis('Z'),
      zAxis3D: axis(name, tickText(value)),
      grid3D: { boxWidth: 130, boxDepth: 110, boxHeight: 80, viewControl: { ...GL_VIEW, distance: 250, alpha: 18, beta: 38 }, environment: '#05070d' },
      series: [{ type: 'scatter3D', symbolSize: 4, itemStyle: { opacity: 0.85 }, data: points.map((q, i) => [q.n, q.z, q.p, i]) }],
    }
  }
  if (view === 'heatmap') {
    const maxN = Math.max(...points.map((q) => q.n))
    const maxZ = Math.max(...points.map((q) => q.z))
    const cat = (nm: string, len: number) => ({ type: 'category', name: nm, data: Array.from({ length: len + 1 }, (_, i) => i), ...AXIS, axisLabel: { ...AXIS.axisLabel, interval: 19 }, splitArea: { show: false } })
    return {
      ...base,
      grid: { left: 40, right: 90, top: 40, bottom: 30 },
      xAxis: cat('N', maxN),
      yAxis: cat('Z', maxZ),
      visualMap: colour,
      series: [{ type: 'heatmap', progressive: 2000, data: points.map((q, i) => [q.n, q.z, q.p, i]) }],
    }
  }
  if (view === 'bubble') {
    const size = (p: number) => 2 + 12 * ((p - lo) / (hi - lo || 1))
    return {
      ...base,
      grid: { left: 40, right: 90, top: 40, bottom: 30 },
      xAxis: { type: 'value', name: 'N', ...AXIS, ...FOOT, splitLine: { lineStyle: { color: RULE } } },
      yAxis: { type: 'value', name: 'Z', ...AXIS, splitLine: { lineStyle: { color: RULE } } },
      visualMap: colour,
      series: [{ type: 'scatter', symbolSize: (d: number[]) => size(d[2]), itemStyle: { opacity: 0.55 }, data: points.map((q, i) => [q.n, q.z, q.p, i]) }],
    }
  }
  if (view === 'bar') {
    const order = points.map((_, i) => i).sort((a, b) => points[b].p - points[a].p)
    return {
      ...base,
      grid: { left: 40, right: 24, top: 40, bottom: 30 },
      xAxis: { type: 'category', name: 'Rank', data: order.map((_, k) => k + 1), ...AXIS, ...FOOT, axisLabel: { ...AXIS.axisLabel, interval: 499 } },
      yAxis: yValue,
      series: [{ type: 'bar', large: true, barCategoryGap: 0, itemStyle: { color: DOT }, data: order.map((i, k) => ({ value: [k, points[i].p, 0, i] })) }],
    }
  }
  if (view === 'line') {
    // One line per element, along its isotope chain; coloured light to heavy.
    const byZ = new Map<number, number[]>()
    points.forEach((q, i) => byZ.set(q.z, [...(byZ.get(q.z) ?? []), i]))
    const maxZ = Math.max(...byZ.keys())
    return {
      ...base,
      grid: { left: 40, right: 24, top: 40, bottom: 30 },
      xAxis: { type: 'value', name: 'N', ...AXIS, ...FOOT, splitLine: { lineStyle: { color: RULE } } },
      yAxis: yValue,
      series: [...byZ.entries()].map(([z, idx]) => ({
        type: 'line',
        symbol: 'circle',
        symbolSize: 3,
        lineStyle: { width: 1 },
        color: ramp[Math.min(ramp.length - 1, Math.floor((z / (maxZ + 1)) * ramp.length))],
        data: idx.sort((a, b) => points[a].n - points[b].n).map((i) => [points[i].n, points[i].p, 0, i]),
      })),
    }
  }
  // Scatter: the value by mass number.
  return {
    ...base,
    grid: { left: 40, right: 24, top: 40, bottom: 30 },
    xAxis: { type: 'value', name: 'A', ...AXIS, ...FOOT, splitLine: { lineStyle: { color: RULE } } },
    yAxis: yValue,
    series: [{ type: 'scatter', symbolSize: 3.5, itemStyle: { color: DOT, opacity: 0.8 }, data: points.map((q, i) => [q.z + q.n, q.p, 0, i]) }],
  }
}

function Flat({ value, view }: { value: MetricValue; view: View }) {
  const ref = useEChart(() => loadPoints(value), (points) => option(points, value, view), false, undefined, { onPick: () => {} })
  return <div ref={ref} className="min-h-0 w-full flex-1" />
}

function Deep({ value }: { value: MetricValue }) {
  const ref = useEChart(() => loadPoints(value), (points) => option(points, value, 'scatter3d'), true, undefined, { onPick: () => {} })
  return <div ref={ref} className="min-h-0 w-full flex-1" />
}

export function MetricView({ value, view }: { value: MetricValue; view: View }) {
  return view === 'scatter3d' ? <Deep value={value} /> : <Flat key={view} value={value} view={view} />
}
