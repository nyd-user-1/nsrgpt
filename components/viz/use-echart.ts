'use client'

import * as React from 'react'
import { usePathname } from 'next/navigation'
import { VIZ_POINT } from '@/lib/pane'

import { useShellPanel } from '@/components/shell'
import { inspectorOn } from '@/components/dev/inspector-state'

// The /viz pages' one shared mechanism: mount an ECharts canvas in a ref'd div, loading echarts
// (and echarts-gl, when the chart needs WebGL) on the client only — the GL bundle touches window
// at import time, so neither may load during SSR. The chart's data (lib/viz-data.ts, a static file
// under public/viz-data/) is fetched alongside the libraries, and the option builder runs on it once
// both are in; resize follows the div.
//
// The theme (2026-11-04): the charts sit on the app's paper in light or dark, so the option is
// recoloured for the active mode here, once for all twelve, and redrawn when <html>'s class flips.
// Dark: the slate axis ink lightens, the navy series brightens, the diverging matrix ramp goes to
// its dark form. Light: ramps that climb from navy to near-white run the other way, so the dense
// end reads on white; near-white marks go navy. Both: the GL scenes' black environment becomes
// transparent, the paper shows through.
//
// The click (2026-11-04): a click anywhere on a chart opens its data table, /viz/data/<slug>, in the second
// panel — on the row of the datum clicked when the chart can name it (`rowOf`). A drag (a 3D orbit, a
// zoom) is not a click, nor is a press on a zoom slider along the foot. Nothing else rides the charts.

/** What ECharts hands a click on a datum. */
export type ChartClick = { seriesIndex?: number; dataIndex?: number; dataType?: string; seriesType?: string; value?: unknown }
/** The row a click names when the chart's first series draws the snapshot's rows in order. */
export const firstSeriesRow = (p: ChartClick) => (p.seriesIndex === 0 && typeof p.dataIndex === 'number' ? p.dataIndex : null)
/** The row a click names when each datum carries its snapshot row at position `i` of its value array. */
export const valueRow = (i: number) => (p: ChartClick) =>
  Array.isArray(p.value) && typeof p.value[i] === 'number' ? (p.value[i] as number) : null

const DARK: Record<string, string> = {
  '#334155': '#cbd5e1',
  '#475569': '#94a3b8',
  '#64748b': '#94a3b8',
  '#1e3a8a': '#60a5fa',
  '#f9f9f9': '#15120d',
}
const DARK_RAMP: Record<string, string> = {
  '#dc2626': '#f87171',
  '#fca5a5': '#991b1b',
  '#f8fafc': '#1e293b',
  '#93c5fd': '#1d4ed8',
  '#1e3a8a': '#60a5fa',
}
const LIGHT: Record<string, string> = {
  '#e0f2fe': '#1e3a8a',
  '#bfefff': '#1d4ed8',
  '#1e293b': '#cbd5e1',
  '#10192e': '#cbd5e1',
  '#f9f9f9': '#ffffff',
}
/** Ramps that start this dark climb to near-white — reversed on light paper. */
const DARK_START = new Set(['#172554', '#0b1a3a', '#13306b', '#060b18'])

function themed(v: unknown, dark: boolean, inRamp = false): unknown {
  if (typeof v === 'string') {
    if (v === '#05070d') return 'none'
    const map = dark ? (inRamp ? DARK_RAMP : DARK) : inRamp ? {} : LIGHT
    return map[v] ?? v
  }
  if (Array.isArray(v)) {
    const out = v.map((x) => themed(x, dark, inRamp))
    return !dark && inRamp && typeof v[0] === 'string' && DARK_START.has(v[0]) ? out.reverse() : out
  }
  if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, themed(x, dark, inRamp || k === 'visualMap')]))
  }
  return v
}

const isDark = () => document.documentElement.classList.contains('dark')

type Option = { dataZoom?: { type?: string }[]; xAxis?: unknown; yAxis?: unknown; tooltip?: Record<string, unknown> }

/** ECharts' own axis pointer is off on cartesian charts (Brendan, 2026-11-05): the inspector's rules (below)
 *  are the chart's one crosshair, so ECharts' grey dashed cross, or an axis chart's snapped line, would be a
 *  second. The tooltip still follows the pointer. Applied on every draw: the theme flip's redraw replaces
 *  the whole option. */
function withCross(o: unknown): Option {
  const option = o as Option
  if (option.xAxis && option.yAxis) option.tooltip = { ...(option.tooltip ?? {}), axisPointer: { type: 'none' } }
  return option
}

/** The inspector's rules (components/dev/inspector.tsx TraceOverlay), to the pixel: 1px of this blue. */
const RULE = 'rgba(59,130,246,0.5)'

/** Two rules through a point. Over a chart they cross the window, as the inspector's do; at a datum a table
 *  row points to, they stay inside the chart's box. */
function makeRules() {
  const line = () => {
    const d = document.createElement('div')
    d.setAttribute('aria-hidden', 'true')
    Object.assign(d.style, { position: 'fixed', left: '0', top: '0', pointerEvents: 'none', zIndex: '2147483644', background: RULE, display: 'none' })
    document.body.append(d)
    return d
  }
  const v = line()
  const h = line()
  return {
    at(x: number, y: number, box?: DOMRect) {
      Object.assign(v.style, { display: '', left: `${x}px`, top: box ? `${box.top}px` : '0', width: '1px', height: box ? `${box.height}px` : '100dvh' })
      Object.assign(h.style, { display: '', top: `${y}px`, left: box ? `${box.left}px` : '0', height: '1px', width: box ? `${box.width}px` : '100dvw' })
    },
    hide() {
      v.style.display = 'none'
      h.style.display = 'none'
    },
    remove() {
      v.remove()
      h.remove()
    },
  }
}

/** A datum's place in its series' data as it stands now: a zoom that filters (the strips, the spectra) drops
 *  data, so ECharts' event index (the raw one) and the index into what's drawn part ways. -1 when filtered out. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const insideIndex = (data: any, raw: number): number => (typeof data?.indexOfRawIndex === 'function' ? data.indexOfRawIndex(raw) : raw)

/** Where a datum sits on a 2D chart's canvas, or null (GL scenes, polar, anything that won't say). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pixelOf(chart: any, at: { seriesIndex: number; dataIndex: number }): [number, number] | null {
  try {
    const series = chart?.getModel?.()?.getSeriesByIndex(at.seriesIndex)
    const cs = series?.coordinateSystem
    if (!cs || cs.type !== 'cartesian2d') return null
    const data = series.getData()
    const i = insideIndex(data, at.dataIndex)
    if (i < 0) return null
    const p = cs.dataToPoint(cs.dimensions.map((d: string) => data.get(data.mapDimension(d), i)))
    return p && Number.isFinite(p[0]) && Number.isFinite(p[1]) ? [p[0], p[1]] : null
  } catch {
    return null
  }
}

// ── Marks (brief 06, 2026-11-05) ─────────────────────────────────────────────────────────────────────────────
// The reader always sees which datum is under the pointer, or picked in the data table. One mark per mark type:
//   dots (scatter)                 the dot again, 1.6× and outlined in ink, on a canvas layer of its own above
//   bars, candles, OHLC (custom)   a muted full-height band behind the bar, on a canvas layer beneath the chart
//   heatmap cells                  an ink outline round the cell, above its neighbours
//   bars on a value axis (sticks)  an ink outline round the stick
// Both layers are separate canvases, so moving a mark repaints that layer alone, never the thousands of marks
// beneath it: hover costs what it cost before. The series' own emphasis is switched off for the same reason
// (ECharts would otherwise repaint the hovered datum's layer, and the rule says don't recolour bars or candles).
// A chart opts in with `marks: true`.

type At = { seriesIndex: number; dataIndex: number }
type MarkKind = 'dot' | 'band' | 'cell' | 'stick'

const HOVER_Z = 10
const PICKED_Z = 9
const BAND_Z = -1
/** The most picked rows drawn at once. */
const MAX_PICKED = 3000

/** The paper's ink as the page has it now (the Trinity themes included), for the canvas. */
function inkNow(): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--paper-text').trim()
  return v || (isDark() ? '#f0e9d8' : '#16181d')
}

/** The band's colour: the ink, faint. */
function bandColour(ink: string): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(ink)
  if (m) return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},0.09)`
  return isDark() ? 'rgba(240,233,216,0.09)' : 'rgba(22,24,29,0.07)'
}

type SeriesOpt = { type?: string; emphasis?: Record<string, unknown> }

/** Marks on: the series' own hover emphasis off, for every type a mark stands in for. */
function withMarks(o: Option, on: boolean): Option {
  if (!on) return o
  const series = (o as unknown as { series?: SeriesOpt | SeriesOpt[] }).series
  const list = Array.isArray(series) ? series : series ? [series] : []
  for (const s of list) {
    if (s && ['scatter', 'effectScatter', 'heatmap', 'bar', 'candlestick', 'custom'].includes(s.type ?? '')) {
      s.emphasis = { ...(s.emphasis ?? {}), disabled: true }
    }
  }
  return o
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function kindOf(chart: any, seriesIndex: number): MarkKind | null {
  const s = chart?.getModel?.()?.getSeriesByIndex(seriesIndex)
  const cs = s?.coordinateSystem
  if (!s || !cs || cs.type !== 'cartesian2d') return null
  const type = s.subType as string
  if (type === 'scatter' || type === 'effectScatter') return 'dot'
  if (type === 'heatmap') return 'cell'
  if (type === 'bar' || type === 'candlestick' || type === 'custom') {
    const base = cs.getBaseAxis?.()
    if (base?.type === 'category' && base.dim === 'x') return 'band'
    return type === 'bar' ? 'stick' : null
  }
  return null
}

/** The x axes that carry bars or candles — the band's axes. Read after every draw, by index. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function bandAxesOf(chart: any): number[] {
  const out = new Set<number>()
  const model = chart?.getModel?.()
  model?.eachSeries?.((s: { seriesIndex: number; coordinateSystem?: { getBaseAxis?: () => { model?: { componentIndex: number } } } }) => {
    if (kindOf(chart, s.seriesIndex) !== 'band') return
    const idx = s.coordinateSystem?.getBaseAxis?.()?.model?.componentIndex
    if (typeof idx === 'number') out.add(idx)
  })
  return [...out]
}

/** The full-height band at category `c` of x axis `axisIndex`, in the axis's grid; null when out of view. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function bandRect(chart: any, axisIndex: number, c: number) {
  const model = chart.getModel()
  const axisModel = model.getComponent('xAxis', axisIndex)
  if (!axisModel) return null
  const grid = model.getComponent('grid', axisModel.get('gridIndex') ?? 0)?.coordinateSystem?.getRect?.()
  if (!grid) return null
  const x = chart.convertToPixel({ xAxisIndex: axisIndex }, c)
  if (!Number.isFinite(x) || x < grid.x - 1 || x > grid.x + grid.width + 1) return null
  const w = Math.max(3, axisModel.axis.getBandWidth())
  return { x: x - w / 2, y: grid.y, width: w, height: grid.height }
}

/** The category under pixel x on x axis `axisIndex`, or null. (ECharts' convertFromPixel answers NaN for category axes.) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function categoryAt(chart: any, axisIndex: number, x: number, y: number): number | null {
  const model = chart.getModel()
  const axisModel = model.getComponent('xAxis', axisIndex)
  if (!axisModel || !chart.containPixel({ gridIndex: axisModel.get('gridIndex') ?? 0 }, [x, y])) return null
  const n = axisModel.getCategories?.()?.length ?? 0
  const p0 = chart.convertToPixel({ xAxisIndex: axisIndex }, 0)
  const p1 = chart.convertToPixel({ xAxisIndex: axisIndex }, 1)
  if (!n || !Number.isFinite(p0) || !Number.isFinite(p1) || p1 === p0) return null
  return Math.max(0, Math.min(n - 1, Math.round((x - p0) / (p1 - p0))))
}

/** The shape that marks one datum (a dot, a cell, a stick), or null. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function markShape(chart: any, kind: MarkKind, at: At): { circle?: { cx: number; cy: number; r: number }; rect?: { x: number; y: number; width: number; height: number }; fill: string } | null {
  const s = chart.getModel().getSeriesByIndex(at.seriesIndex)
  const data = s?.getData()
  if (!data) return null
  const i = insideIndex(data, at.dataIndex)
  if (i < 0) return null
  const style = (data.getItemVisual(i, 'style') ?? {}) as { fill?: string }
  const fill = typeof style.fill === 'string' ? style.fill : 'transparent'
  if (kind === 'stick') {
    const l = data.getItemLayout(i) as { x: number; y: number; width: number; height: number } | undefined
    if (!l) return null
    const x = Math.min(l.x, l.x + l.width) - 1.5
    const y = Math.min(l.y, l.y + l.height)
    return { rect: { x, y, width: Math.abs(l.width) + 3, height: Math.abs(l.height) }, fill }
  }
  const p = pixelOf(chart, at)
  if (!p) return null
  if (kind === 'cell') {
    const cs = s.coordinateSystem
    const w = Math.max(6, cs.getAxis('x').getBandWidth())
    const h = Math.max(6, cs.getAxis('y').getBandWidth())
    return { rect: { x: p[0] - w / 2, y: p[1] - h / 2, width: w, height: h }, fill: 'none' }
  }
  const size = data.getItemVisual(i, 'symbolSize') as number | number[] | undefined
  const [w, h] = Array.isArray(size) ? size : [size ?? 6, size ?? 6]
  const symbol = data.getItemVisual(i, 'symbol') as string | undefined
  if (symbol === 'rect') {
    const W = w * 1.6
    const H = Math.max(h * 1.6, 2.5)
    return { rect: { x: p[0] - W / 2, y: p[1] - H / 2, width: W, height: H }, fill }
  }
  return { circle: { cx: p[0], cy: p[1], r: Math.max(w, h) * 0.8 }, fill }
}

/** Optional extras (2026-11-04, chart batches A and B).
 *  `view`: a state of the chart's own — points or bars, one isotope chain or another, a selected nuclide. When
 *    it changes, build runs again with it: merged, so marks animate to their new places, or replaced whole when
 *    `replace` is set, which universalTransition between series of different types needs.
 *  `point`: the datum a table row points at, for charts whose first series isn't drawn in table order; it may
 *    act on the row itself and return null.
 *  `onPick`: a click on a datum goes here instead of opening the data table; a click on blank ground does nothing.
 *  `marks`: the hover and picked-row marks above (brief 06). */
export type EChartExtras = {
  view?: number
  replace?: boolean
  point?: (row: number) => { seriesIndex: number; dataIndex: number } | null
  onPick?: (p: ChartClick) => void
  marks?: boolean
}

type Shape = { attr: (o: Record<string, unknown>) => void }
type MouseParams = ChartClick & { componentType?: string }

/** The marks' machinery for one chart: the hover marks, the band under the pointer, the picked rows. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeMarks(echarts: any, chart: any) {
  const G = echarts.graphic
  const zr = chart.getZr()
  let ink = inkNow()
  let axes = bandAxesOf(chart)
  const add = <T extends Shape>(el: T): T => {
    zr.add(el)
    return el
  }
  const hoverDot = add(new G.Circle({ shape: { cx: 0, cy: 0, r: 0 }, style: {}, zlevel: HOVER_Z, silent: true, ignore: true }))
  const hoverBox = add(new G.Rect({ shape: { x: 0, y: 0, width: 0, height: 0 }, style: {}, zlevel: HOVER_Z, silent: true, ignore: true }))
  const hoverBands = new Map<number, Shape>()
  let hoverCat: number | null = null
  let picked: Shape[] = []
  let pickedRows: number[] = []
  let resolve: ((row: number) => At | null) | undefined

  const shapeOf = (m: NonNullable<ReturnType<typeof markShape>>, zlevel: number) =>
    m.circle
      ? new G.Circle({ shape: m.circle, style: { fill: m.fill, stroke: ink, lineWidth: 1.5 }, zlevel, silent: true })
      : new G.Rect({ shape: m.rect, style: { fill: m.fill, stroke: ink, lineWidth: 1.5 }, zlevel, silent: true })

  const hideHover = () => {
    hoverDot.attr({ ignore: true })
    hoverBox.attr({ ignore: true })
  }
  const showHover = (kind: MarkKind, at: At) => {
    const m = markShape(chart, kind, at)
    if (!m) return hideHover()
    const style = { fill: m.fill, stroke: ink, lineWidth: 1.5 }
    if (m.circle) {
      hoverBox.attr({ ignore: true })
      hoverDot.attr({ ignore: false, shape: m.circle, style })
    } else {
      hoverDot.attr({ ignore: true })
      hoverBox.attr({ ignore: false, shape: m.rect, style })
    }
  }
  const showBand = (c: number | null) => {
    hoverCat = c
    for (const a of axes) {
      let el = hoverBands.get(a)
      if (!el) {
        const made: Shape = add(new G.Rect({ shape: { x: 0, y: 0, width: 0, height: 0 }, style: {}, zlevel: BAND_Z, silent: true, ignore: true }))
        hoverBands.set(a, made)
        el = made
      }
      const r = c === null ? null : bandRect(chart, a, c)
      el.attr(r ? { ignore: false, shape: r, style: { fill: bandColour(ink) } } : { ignore: true })
    }
    for (const [a, el] of hoverBands) if (!axes.includes(a)) el.attr({ ignore: true })
  }
  const drawPicked = () => {
    for (const el of picked) zr.remove(el)
    picked = []
    if (!pickedRows.length) return
    const at = resolve ?? ((row: number) => ({ seriesIndex: 0, dataIndex: row }))
    for (const row of pickedRows) {
      if (picked.length >= MAX_PICKED) break
      const d = at(row)
      if (!d) continue
      const kind = kindOf(chart, d.seriesIndex)
      if (kind === 'band') {
        for (const a of axes) {
          const r = bandRect(chart, a, d.dataIndex)
          if (r) picked.push(add(new G.Rect({ shape: r, style: { fill: bandColour(ink) }, zlevel: BAND_Z, silent: true })))
        }
      } else if (kind) {
        const m = markShape(chart, kind, d)
        if (m) picked.push(add(shapeOf(m, PICKED_Z)))
      }
    }
  }

  chart.on('mouseover', (p: MouseParams) => {
    if (p.componentType !== 'series' || typeof p.seriesIndex !== 'number' || typeof p.dataIndex !== 'number') return
    const kind = kindOf(chart, p.seriesIndex)
    if (kind && kind !== 'band') showHover(kind, { seriesIndex: p.seriesIndex, dataIndex: p.dataIndex })
  })
  chart.on('mouseout', (p: MouseParams) => {
    if (p.componentType === 'series') hideHover()
  })
  // The band follows the pointer's column, found from the pixel: a large candlestick series hovers as one shape.
  zr.on('mousemove', (e: { offsetX: number; offsetY: number }) => {
    if (!axes.length) return
    let c: number | null = null
    for (const a of axes) {
      c = categoryAt(chart, a, e.offsetX, e.offsetY)
      if (c !== null) break
    }
    if (c !== hoverCat) showBand(c)
  })
  zr.on('globalout', () => {
    hideHover()
    showBand(null)
  })
  // A zoom moves every datum: the picked marks follow once it has settled; a hover mark would sit stale.
  chart.on('datazoom', () => {
    hideHover()
    showBand(null)
    requestAnimationFrame(drawPicked)
  })

  return {
    /** After a redraw, a resize or a theme flip: re-read the ink and the band axes, re-place the picked marks. */
    refresh() {
      ink = inkNow()
      axes = bandAxesOf(chart)
      hideHover()
      showBand(null)
      drawPicked()
    },
    leave() {
      hideHover()
      showBand(null)
    },
    pick(rows: number[], point?: (row: number) => At | null) {
      pickedRows = rows
      resolve = point
      drawPicked()
    },
  }
}

export function useEChart<D>(
  load: () => Promise<D>,
  build: (data: D, view: number) => unknown,
  gl = false,
  rowOf?: (p: ChartClick) => number | null,
  extras: EChartExtras = {},
): React.RefObject<HTMLDivElement | null> {
  const ref = React.useRef<HTMLDivElement>(null)
  const path = usePathname()
  const { openPane } = useShellPanel()
  const now = { path, openPane, rowOf, build, view: extras.view ?? 0, replace: !!extras.replace, point: extras.point, onPick: extras.onPick, marks: !!extras.marks }
  const latest = React.useRef(now)
  latest.current = now
  const redraw = React.useRef<(() => void) | null>(null)
  React.useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let chart: any
    let disposed = false
    let ro: ResizeObserver | undefined
    let mo: MutationObserver | undefined
    let onMsg: ((e: MessageEvent) => void) | undefined
    let onEvt: EventListener | undefined
    let rules: ReturnType<typeof makeRules> | undefined
    let marked: ReturnType<typeof makeMarks> | undefined
    let unhook: (() => void) | undefined
    ;(async () => {
      const [echarts, data] = await Promise.all([
        import('echarts').then(async (m) => {
          if (gl) await import('echarts-gl' as string)
          return m
        }),
        load(),
      ])
      if (disposed || !ref.current) return
      chart = echarts.init(ref.current, undefined, { renderer: 'canvas' })
      let dark = isDark()
      const option = withMarks(withCross(build(data, latest.current.view)), latest.current.marks)
      const slider = Array.isArray(option.dataZoom) && option.dataZoom.some((d) => d.type === 'slider')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      chart.setOption(themed(option, dark) as any)
      // The datum under a click, when there is one; the canvas's own click decides whether it was a click.
      let hit: number | null = null
      let picked: ChartClick | null = null
      let down: [number, number] | null = null
      chart.on('click', (p: ChartClick) => {
        hit = latest.current.rowOf?.(p) ?? null
        picked = p
      })
      const zr = chart.getZr()
      // The + cursor belongs to the chart's ground and its data ALONE (Brendan, 2026-11-04): the
      // old CSS !important blanketed the whole canvas — slider included, since it's the same
      // canvas. Here zrender itself decides: blank ground and data (default/pointer) become the
      // cross; the zoom slider's own move/resize cursors stay; off the canvas, nothing changes.
      // The patch sits on the handler's DOM proxy (2026-11-05): a hover sets the cursor through
      // proxy.setCursor directly (zrender Handler.mousemove), so patching zr.setCursorStyle left
      // the arrow on every move after the first.
      const box = ref.current
      const r = makeRules()
      rules = r
      let cross = true
      let over = false
      const proxy = zr.handler?.proxy as { setCursor?: (c?: string) => void } | undefined
      if (proxy?.setCursor) {
        const setCursor = proxy.setCursor.bind(proxy)
        proxy.setCursor = (c?: string) => {
          const next = !c || c === 'default' || c === 'pointer' ? 'crosshair' : c
          cross = next === 'crosshair'
          if (!cross) r.hide()
          setCursor(next)
        }
      }
      zr.setCursorStyle('crosshair')
      marked = latest.current.marks ? makeMarks(echarts, chart) : undefined
      // The rules ride the + (Brendan, 2026-11-05): anywhere over the chart — plot, axes, a GL scene —
      // the inspector's two blue lines cross at the pointer; where the cursor is the slider's own, none.
      // While the inspector itself is on, its rules are already there.
      const move = (e: PointerEvent) => {
        if (e.pointerType === 'touch') return
        over = true
        if (cross && !inspectorOn()) r.at(e.clientX, e.clientY)
        else r.hide()
      }
      const leave = () => {
        over = false
        r.hide()
        marked?.leave()
      }
      // Rules left at a pointed datum go when the page moves under them.
      const stale = () => {
        if (!over) r.hide()
      }
      box.addEventListener('pointermove', move)
      box.addEventListener('pointerleave', leave)
      window.addEventListener('scroll', stale, true)
      unhook = () => {
        box.removeEventListener('pointermove', move)
        box.removeEventListener('pointerleave', leave)
        window.removeEventListener('scroll', stale, true)
      }
      zr.on('mousedown', (e: { offsetX: number; offsetY: number }) => {
        down = [e.offsetX, e.offsetY]
      })
      zr.on('click', (e: { offsetX: number; offsetY: number }) => {
        const moved = down ? Math.hypot(e.offsetX - down[0], e.offsetY - down[1]) : 0
        down = null
        if (moved > 4 || (slider && e.offsetY > chart.getHeight() - 48)) {
          hit = null
          picked = null
          return
        }
        // A beat, so a datum's click event (which a GL layer may send after the canvas's) lands first.
        window.setTimeout(() => {
          const row = hit
          const p = picked
          hit = null
          picked = null
          if (latest.current.onPick) {
            if (p) latest.current.onPick(p)
            return
          }
          const slug = latest.current.path?.split('/').filter(Boolean).pop()
          if (slug) latest.current.openPane(`/viz/data/${slug}${row !== null && row >= 0 ? `?row=${row}` : ''}`)
        }, 0)
      })
      ro = new ResizeObserver(() => {
        chart?.resize()
        stale()
        marked?.refresh()
      })
      ro.observe(box)
      mo = new MutationObserver(() => {
        if (isDark() === dark) return
        dark = isDark()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        chart?.setOption(themed(withMarks(withCross(latest.current.build(data, latest.current.view)), latest.current.marks), dark) as any, true)
        marked?.refresh()
      })
      redraw.current = () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        chart?.setOption(themed(withMarks(withCross(latest.current.build(data, latest.current.view)), latest.current.marks), dark) as any, latest.current.replace)
        marked?.refresh()
      }
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
      // A table row pointing here (VIZ_POINT, 2026-11-04): the crosshair walks to that datum —
      // showTip lands the tooltip on series 0 at the row's index, and the rules cross at the datum
      // (2026-11-05: they replaced ECharts' cross, which used to land there).
      // The table's picked rows ride the same message (brief 06): `rows` is the whole selection, drawn as marks.
      const point = (d: { type?: string; slug?: string; row?: number; rows?: number[] } | null) => {
        if (!d || d.type !== VIZ_POINT) return
        const slug = latest.current.path?.split('/').filter(Boolean).pop()
        if (d.slug && slug && d.slug !== slug) return
        if (Array.isArray(d.rows)) marked?.pick(d.rows, latest.current.point)
        if (typeof d.row !== 'number') return
        const at = latest.current.point ? latest.current.point(d.row) : { seriesIndex: 0, dataIndex: d.row }
        if (!at) return
        chart?.dispatchAction({ type: 'showTip', ...at })
        if (over) return
        const p = pixelOf(chart, at)
        if (!p) return r.hide()
        const b = box.getBoundingClientRect()
        r.at(b.left + p[0], b.top + p[1], b)
      }
      onMsg = (e: MessageEvent) => { if (e.origin === window.location.origin) point(e.data as Parameters<typeof point>[0]) }
      onEvt = ((e: Event) => point((e as CustomEvent).detail)) as EventListener
      window.addEventListener('message', onMsg)
      window.addEventListener(VIZ_POINT, onEvt)
    })()
    return () => {
      disposed = true
      redraw.current = null
      ro?.disconnect()
      mo?.disconnect()
      if (onMsg) window.removeEventListener('message', onMsg)
      if (onEvt) window.removeEventListener(VIZ_POINT, onEvt)
      unhook?.()
      rules?.remove()
      chart?.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  React.useEffect(() => {
    redraw.current?.()
  }, [extras.view])
  return ref
}
