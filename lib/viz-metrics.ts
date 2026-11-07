// The chart types each metric can be drawn as (Brendan, 2026-11-06). The chart type at a framed chart's foot is a
// switcher, and it offers every chart type the metric's data fits; which ones fit follows from the data's shape.
//
// Some types are pages of their own: the same data, drawn another way (the pages listed together below). The rest
// are drawn by components/viz/MetricView.tsx on the metric's first page, as ?view=<type>. That covers the metrics
// with one value per nuclide in the IAEA Live Chart ground states (public/viz-data/livechart-ground.json), which fit:
//   Scatter Plot (the value by A) · Heatmap (N × Z) · 3D Scatter Plot (N, Z, the value) · Bar Chart (ranked) ·
//   Line Chart (the value by N, a line per element) · Bubble Chart (N × Z, sized by the value).

import { VIZ_CHARTS } from './viz-charts'

export type View = 'scatter' | 'heatmap' | 'scatter3d' | 'bar' | 'line' | 'bubble'

export const VIEW_TITLE: Record<View, string> = {
  scatter: 'Scatter Plot',
  heatmap: 'Heatmap',
  scatter3d: '3D Scatter Plot',
  bar: 'Bar Chart',
  line: 'Line Chart',
  bubble: 'Bubble Chart',
}

/** A ground-state column (livechart-ground.json), how it reads, and how it's drawn. */
export type MetricValue = { id: string; label: string; unit: string; log?: boolean; scale?: number }

type Metric = { pages: string[]; value?: MetricValue }

const METRICS: Metric[] = [
  { pages: ['/viz/nebula', '/viz/surface'], value: { id: 'ba', label: 'Binding energy per nucleon', unit: 'MeV', scale: 1 / 1000 } },
  { pages: ['/viz/bar-large', '/viz/heatmap'], value: { id: 't', label: 'Half-life', unit: 's', log: true } },
  { pages: ['/viz/separation'], value: { id: 'sn', label: 'Neutron separation energy', unit: 'MeV', scale: 1 / 1000 } },
  { pages: ['/viz/weight', '/viz/scatter3d'] },
  { pages: ['/viz/simplex', '/viz/spectra', '/viz/gamma-atlas', '/viz/gamma-punchcard'] },
  { pages: ['/viz/levels', '/viz/level-spans', '/viz/level-candles'] },
  { pages: ['/viz/graph', '/viz/reactions'] },
  { pages: ['/viz/decay', '/viz/decay2'] },
]

export type ChartTypeOption = { title: string; href: string; on: boolean }

const titleOf = (href: string) => VIZ_CHARTS.find((c) => c.href === href)?.title ?? ''
const isView = (v: string | null): v is View => !!v && v in VIEW_TITLE

/** Every chart type the page's metric can be drawn as, the page's own first; empty off the list. */
export function chartTypes(path: string | null, view: string | null): ChartTypeOption[] {
  const m = METRICS.find((x) => path && x.pages.includes(path))
  if (!m) {
    const own = VIZ_CHARTS.find((c) => c.href === path)
    return own ? [{ title: own.title, href: own.href, on: true }] : []
  }
  const shown = isView(view) && m.value ? view : null
  const pages = m.pages.map((href) => ({ title: titleOf(href), href, on: href === path && !shown }))
  const taken = new Set(pages.map((p) => p.title))
  const views = m.value
    ? (Object.keys(VIEW_TITLE) as View[])
        .filter((v) => !taken.has(VIEW_TITLE[v]))
        .map((v) => ({ title: VIEW_TITLE[v], href: `${m.pages[0]}?view=${v}`, on: shown === v }))
    : []
  // The page's own type leads, then the rest in the order above.
  const own = pages.find((p) => p.href === path)
  return own ? [own, ...pages.filter((p) => p !== own), ...views] : [...pages, ...views]
}

/** The view to draw in place of the page's own chart, when ?view= names one its metric fits. */
export function metricView(path: string | null, view: string | null): { value: MetricValue; view: View } | null {
  const m = METRICS.find((x) => path && x.pages.includes(path))
  return m?.value && isView(view) ? { value: m.value, view } : null
}
