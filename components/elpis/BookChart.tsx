"use client"
// /elpis/book (briefs 67, 69, 77): the book page's chart, through components/viz/use-echart.ts. Brief 77: every series is
// JANIS's own, from the page file JANIS's book generator made (components/elpis/use-janis-page.ts): drawn in JANIS's
// order (EXFOR first, then the libraries), each in JANIS's colour with JANIS's mark (shape and size) or stroke (width and
// dash), on JANIS's axes (scale and range). Our frame: the house axis ticks (a labelled tick on every decade), the
// chart menu, the zoom box. Dark theme only: JANIS's black and dark grey draw in the paper's ink.
//
// The zoom box: mouse down inside the plot and drag draws a dashed rectangle; on mouse up both axes zoom to it, animated,
// and the Plotter's fields follow (onZoom). A double click goes back to the page's range (`full`). The Plotter's Apply and
// scale selects come in through `version` and redraw without animation.
import { useEffect, useRef } from "react"
import { useEChart } from "@/components/viz/use-echart"
import { energyLabel } from "@/lib/lab/canvases/plot"
import { ChartBox, type ChartKebabProps } from "@/components/viz/chart-kebab"
import type { JanisMark, JanisSeries } from "@/components/elpis/use-janis-page"

export type Range = { xmin: number; xmax: number; ymin: number; ymax: number }
export type Scales = { x: "log" | "value"; y: "log" | "value" }

const isDark = () => typeof document !== "undefined" && document.documentElement.classList.contains("dark")

/** An energy on the axis: 10 µeV, 100 meV, 1 eV, 10 keV, 1 MeV, 1 GeV. */
export function energyTick(v: number): string {
  const f = (x: number) => Number(x.toPrecision(3)).toString()
  if (v >= 1e9) return `${f(v / 1e9)} GeV`
  if (v >= 1e6) return `${f(v / 1e6)} MeV`
  if (v >= 1e3) return `${f(v / 1e3)} keV`
  if (v >= 1) return `${f(v)} eV`
  if (v >= 1e-3) return `${f(v * 1e3)} meV`
  return `${f(v * 1e6)} µeV`
}
/** A cross section on the axis: 100000 b, 1 b, 10 mb, 1 µb, 10 nb. */
export function barnTick(v: number): string {
  const f = (x: number) => Number(x.toPrecision(3)).toString()
  if (v >= 1) return `${f(v)} b`
  if (v >= 1e-3) return `${f(v * 1e3)} mb`
  if (v >= 1e-6) return `${f(v * 1e6)} µb`
  return `${f(v * 1e9)} nb`
}
const DECADES = Array.from({ length: 41 }, (_, i) => 10 ** (i - 20))
const decadesIn = (min: number, max: number) => DECADES.filter((d) => d >= min * (1 - 1e-9) && d <= max * (1 + 1e-9))

/** JANIS's mark shapes (PlotMark) as ECharts path symbols in a 10 × 10 box; `stroke` draws the path's outline only. */
const SHAPE: Record<string, { path: string; stroke: boolean }> = {
  Asterisk: { path: "M5 0V10M0 5H10M1.5 1.5L8.5 8.5M8.5 1.5L1.5 8.5", stroke: true },
  Circle: { path: "M10 5A5 5 0 1 1 0 5A5 5 0 1 1 10 5Z", stroke: true },
  Point: { path: "M7 5A2 2 0 1 1 3 5A2 2 0 1 1 7 5Z", stroke: false },
  Cross: { path: "M5 0V10M0 5H10", stroke: true },
  CrossDiag: { path: "M0 0L10 10M10 0L0 10", stroke: true },
  CrossDiagCircle: { path: "M10 5A5 5 0 1 1 0 5A5 5 0 1 1 10 5ZM1.5 1.5L8.5 8.5M8.5 1.5L1.5 8.5", stroke: true },
  CrossDiagSquare: { path: "M0 0H10V10H0ZM0 0L10 10M10 0L0 10", stroke: true },
  Diamond: { path: "M5 0L10 5L5 10L0 5Z", stroke: true },
  FilledCircle: { path: "M10 5A5 5 0 1 1 0 5A5 5 0 1 1 10 5Z", stroke: false },
  FilledSquare: { path: "M0 0H10V10H0Z", stroke: false },
  FilledTriangle: { path: "M5 0L10 10H0Z", stroke: false },
  Home: { path: "M5 0L10 4V10H0V4Z", stroke: true },
  Square: { path: "M0 0H10V10H0Z", stroke: true },
  Triangle: { path: "M5 0L10 10H0Z", stroke: true },
}
/** A JANIS mark as an ECharts symbol: its shape, size (JANIS's size is the mark's half width in pixels), rotation and fill.
 *  "Triangle(0,true)" is filled, "Square(15)" turned 15 degrees. */
export function markSymbol(m: JanisMark | null) {
  const s = SHAPE[m?.shape ?? ""] ?? SHAPE.Square
  const args = (m?.args ?? "").split(",").map((a) => a.trim())
  const filled = !s.stroke || args[1] === "true"
  const rotate = Number(args[0]) || 0
  return { symbol: `path://${s.path}`, size: Math.max(2, 2 * (m?.size ?? 3)), rotate: -rotate, filled }
}
/** A JANIS colour, with black and dark grey drawn in the ink on the dark theme. */
export const janisColor = (c: string | null | undefined, dark: boolean, ink: string) =>
  !c ? ink : dark && /^#(000000|404040|333333)$/i.test(c) ? ink : c

/** The page's own range (JANIS's xrange and yrange). */
export const pageRange = (x: { min: number | null; max: number | null }, y: { min: number | null; max: number | null }): Range | null =>
  x.min && x.max && y.min && y.max ? { xmin: x.min, xmax: x.max, ymin: y.min, ymax: y.max } : null

export function bookOption(o: { series: JanisSeries[]; range: Range; scales: Scales; hidden: Set<string>; title: string | null }) {
  const { series, range, scales, hidden, title } = o
  const dark = isDark()
  const ink = dark ? "#f0e9d8" : "#16181d"
  const muted = dark ? "rgba(240,233,216,0.62)" : "#64748b"
  const rule = dark ? "rgba(240,233,216,0.18)" : "rgba(22,24,29,0.14)"
  const paper = dark ? "#15120d" : "#ffffff"
  const logX = scales.x === "log", logY = scales.y === "log"
  const axis = (type: "log" | "value", name: string, min: number, max: number, energy: boolean) => ({
    type, name, min, max, nameLocation: "middle", nameGap: energy ? 30 : 66, logBase: 10,
    nameTextStyle: { color: muted, fontSize: 12 },
    axisLine: { lineStyle: { color: rule } },
    axisTick: { lineStyle: { color: rule }, ...(type === "log" ? { customValues: decadesIn(min, max) } : {}) },
    splitLine: { show: true, lineStyle: { color: rule, type: "dashed" } },
    axisLabel: { color: muted, fontSize: 11, hideOverlap: false, ...(type === "log" ? { customValues: decadesIn(min, max) } : {}), formatter: (v: number) => (energy ? energyTick(v) : barnTick(v)) },
  })
  const keep = (x: number | null | undefined, y: number | null | undefined) => x != null && y != null && (!logX || x > 0) && (!logY || y > 0)
  return {
    animationDuration: 0,
    animationDurationUpdate: 0,
    title: title ? { text: title, left: "center", top: 0, textStyle: { color: ink, fontSize: 14, fontWeight: 500 } } : { show: false },
    grid: { left: 86, right: 28, top: title ? 36 : 18, bottom: 48 },
    xAxis: axis(scales.x, "Incident energy", range.xmin, range.xmax, true),
    yAxis: axis(scales.y, "Cross section (b)", range.ymin, range.ymax, false),
    tooltip: {
      trigger: "item", backgroundColor: paper, borderColor: rule, textStyle: { color: ink, fontSize: 12 },
      formatter: (p: { seriesName: string; value: [number, number] }) => `${p.seriesName}<br/>${energyLabel(p.value[0])} · ${p.value[1].toPrecision(4)} b`,
    },
    series: series.map((s, k) => {
      const name = s.ref
      const color = janisColor(s.color, dark, ink)
      const data = (s.x ?? []).map((x, i) => [x, s.y?.[i]] as [number | null, number | null | undefined])
      if (s.mark) {
        const m = markSymbol(s.mark)
        return {
          id: name, name: s.legend || s.exfor_id || name, type: "scatter", symbol: m.symbol, symbolSize: m.size, symbolRotate: m.rotate,
          clip: true, z: 2 + k / 1000, silent: false, data: hidden.has(name) ? [] : data.filter((d) => keep(d[0], d[1])),
          itemStyle: m.filled ? { color, borderWidth: 0 } : { color: "transparent", borderColor: color, borderWidth: 1 },
          ...(data.length > 4000 ? { large: true, largeThreshold: 4000 } : {}),
        }
      }
      return {
        id: name, name: s.legend || name, type: "line", symbol: "none", showSymbol: false, smooth: false, clip: true, connectNulls: false, z: 4 + k / 1000,
        data: hidden.has(name) ? [] : data.map((d) => (keep(d[0], d[1]) ? d : [d[0], null])),
        lineStyle: { width: s.stroke?.width ?? 1, color, type: s.stroke?.dash ?? "solid" }, itemStyle: { color },
        ...(data.length > 20000 ? { sampling: "lttb", large: true } : {}),
      }
    }),
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Chart = any
const ticked = (min: number, max: number, type: "log" | "value") =>
  type === "log" ? { min, max, axisTick: { customValues: decadesIn(min, max) }, axisLabel: { customValues: decadesIn(min, max) } } : { min, max }

export function BookChart({ series, range, full, scales, hidden, title, version, onZoom, kebab }: {
  series: JanisSeries[]
  range: Range
  full: Range
  scales: Scales
  hidden: Set<string>
  /** JANIS's chart title, or null when the chart menu turns it off. */
  title: string | null
  version: number
  onZoom: (r: Range) => void
  kebab?: ChartKebabProps
}) {
  const state = useRef({ series, range, full, scales, hidden, title })
  state.current = { series, range, full, scales, hidden, title }
  const zoom = useRef(onZoom)
  zoom.current = onZoom
  const ref = useEChart(async () => null, () => bookOption(state.current), false, undefined, { view: version, replace: true, still: true, onPick: () => {} })

  useEffect(() => {
    let disposed = false
    let off: (() => void) | undefined
    const attach = async () => {
      const echarts = await import("echarts")
      let chart: Chart = null
      for (let i = 0; i < 200 && !disposed && !chart; i++) {
        chart = ref.current ? echarts.getInstanceByDom(ref.current) : null
        if (!chart) await new Promise((r) => setTimeout(r, 50))
      }
      if (!chart || disposed) return
      const zr = chart.getZr()
      const ink = () => (isDark() ? "#f0e9d8" : "#16181d")
      let start: [number, number] | null = null
      let rect: Chart = null
      const grid = () => chart.getModel().getComponent("grid", 0).coordinateSystem.getRect() as { x: number; y: number; width: number; height: number }
      const clamp = (x: number, y: number): [number, number] => {
        const g = grid()
        return [Math.min(Math.max(x, g.x), g.x + g.width), Math.min(Math.max(y, g.y), g.y + g.height)]
      }
      const clear = () => {
        if (rect) zr.remove(rect)
        rect = null
        start = null
      }
      const down = (e: { offsetX: number; offsetY: number; event?: MouseEvent }) => {
        if (e.event && e.event.button !== 0) return
        if (!chart.containPixel({ gridIndex: 0 }, [e.offsetX, e.offsetY])) return
        start = [e.offsetX, e.offsetY]
        rect = new echarts.graphic.Rect({
          shape: { x: e.offsetX, y: e.offsetY, width: 0, height: 0 },
          style: { fill: isDark() ? "rgba(240,233,216,0.08)" : "rgba(22,24,29,0.06)", stroke: ink(), lineWidth: 1, lineDash: [4, 3] },
          z: 1000, zlevel: 1, silent: true,
        })
        zr.add(rect)
      }
      const move = (e: { offsetX: number; offsetY: number }) => {
        if (!start || !rect) return
        const [x, y] = clamp(e.offsetX, e.offsetY)
        rect.setShape({ x: Math.min(start[0], x), y: Math.min(start[1], y), width: Math.abs(x - start[0]), height: Math.abs(y - start[1]) })
      }
      const up = (e: { offsetX: number; offsetY: number }) => {
        if (!start) return
        const [x, y] = clamp(e.offsetX, e.offsetY)
        const [x0, y0] = start
        clear()
        if (Math.abs(x - x0) < 6 || Math.abs(y - y0) < 6) return
        const a = chart.convertFromPixel({ gridIndex: 0 }, [Math.min(x0, x), Math.max(y0, y)]) as [number, number]
        const b = chart.convertFromPixel({ gridIndex: 0 }, [Math.max(x0, x), Math.min(y0, y)]) as [number, number]
        const next = { xmin: a[0], xmax: b[0], ymin: a[1], ymax: b[1] }
        chart.setOption({ animationDurationUpdate: 450, animationEasingUpdate: "cubicOut", xAxis: ticked(next.xmin, next.xmax, state.current.scales.x), yAxis: ticked(next.ymin, next.ymax, state.current.scales.y) })
        zoom.current(next)
      }
      const dbl = () => {
        clear()
        const f = state.current.full
        chart.setOption({ animationDurationUpdate: 450, animationEasingUpdate: "cubicOut", xAxis: ticked(f.xmin, f.xmax, state.current.scales.x), yAxis: ticked(f.ymin, f.ymax, state.current.scales.y) })
        zoom.current(f)
      }
      const leave = () => { if (start) clear() }
      zr.on("mousedown", down)
      zr.on("mousemove", move)
      zr.on("mouseup", up)
      zr.on("dblclick", dbl)
      zr.on("globalout", leave)
      off = () => {
        zr.off("mousedown", down)
        zr.off("mousemove", move)
        zr.off("mouseup", up)
        zr.off("dblclick", dbl)
        zr.off("globalout", leave)
      }
    }
    attach()
    return () => {
      disposed = true
      off?.()
    }
  }, [ref])

  return <ChartBox chart={ref} className="h-full w-full select-none" kebab={kebab} kebabClassName="right-8 top-5" />
}
