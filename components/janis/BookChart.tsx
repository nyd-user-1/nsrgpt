"use client"
// /janis/book (brief 67): the book page's chart, through components/viz/use-echart.ts. Log-log, cross section against
// incident energy, placeholder series shaped like B-11 (n,α): seven library lines in the dataviz palette (colour by
// library, lib/lab/canvases/plot.ts's slots) and four EXFOR point sets with distinct markers in the paper's ink, the
// legend boxed top left as JANIS draws it. No data is read.
//
// The zoom box: mouse down inside the plot and drag draws a dashed rectangle (the pointer stays the house crosshair
// use-echart sets); on mouse up both axes zoom to the rectangle, animated, and the Plotter's fields follow (onZoom).
// A double click goes back to the whole range. The Plotter's Apply and scale selects come in through `view`.
import { useEffect, useRef } from "react"
import { useEChart } from "@/components/viz/use-echart"
import { energyLabel, RELEASE_SLOT, SLOTS } from "@/lib/lab/canvases/plot"

export type Range = { xmin: number; xmax: number; ymin: number; ymax: number }
export type Scales = { x: "log" | "value"; y: "log" | "value" }
export const LIBRARIES = ["ENDF/B-VIII.1", "JEFF-3.3", "JENDL-5", "ENDF/B-VIII.0", "ENDF/B-VII.1", "TENDL-2023", "CENDL-3.2"]
export const EXFOR_SETS = [
  { id: "X0001.002", symbol: "circle", lo: 13.4e6, hi: 14.9e6, n: 6 },
  { id: "X0002.003", symbol: "rect", lo: 8.2e6, hi: 12.5e6, n: 9 },
  { id: "X0003.002", symbol: "triangle", lo: 14.0e6, hi: 14.3e6, n: 3 },
  { id: "X0004.004", symbol: "diamond", lo: 10.5e6, hi: 19.5e6, n: 11 },
] as const
const THRESHOLD = 7.23e6
export const FULL: Range = { xmin: 6e6, xmax: 3e7, ymin: 1e-4, ymax: 0.1 }

const isDark = () => typeof document !== "undefined" && document.documentElement.classList.contains("dark")

/** A threshold rise then a slow fall, in barns: B-11 (n,α)'s shape, not its values. */
function shape(e: number, k: number): number {
  const x = (e - THRESHOLD) / 1e6
  if (x <= 0) return 0
  const wobble = 1 + [0, 0.07, -0.09, 0.05, 0.11, -0.13, 0.15][k] * Math.sin(1.3 * k + 4 * Math.log10(e / 1e6))
  return 0.05 * (1 - Math.exp(-x / 1.3)) * Math.exp(-x / 10) * wobble
}
/** The same few numbers on every draw, so the points do not jump. */
const jitter = (i: number, j: number) => Math.sin(i * 12.9898 + j * 78.233) * 0.5

function lineOf(k: number): [number, number][] {
  const out: [number, number][] = []
  const top = k === 6 ? 2e7 : 3e7
  for (let i = 0; i <= 160; i++) {
    const e = THRESHOLD * Math.pow(top / THRESHOLD, i / 160) * (i === 0 ? 1.0004 : 1)
    out.push([e, Math.max(shape(e, k), 1e-6)])
  }
  return out
}

function pointsOf(j: number): [number, number][] {
  const s = EXFOR_SETS[j]
  return Array.from({ length: s.n }, (_, i) => {
    const e = s.lo + ((s.hi - s.lo) * (i + 0.5)) / s.n
    return [e, shape(e, 0) * (1 + 0.25 * jitter(i, j))]
  })
}

export function bookOption(range: Range, scales: Scales, hidden: Set<string>) {
  const dark = isDark()
  const slots = dark ? SLOTS.dark : SLOTS.light
  const ink = dark ? "#f0e9d8" : "#16181d"
  const muted = dark ? "rgba(240,233,216,0.62)" : "#64748b"
  const rule = dark ? "rgba(240,233,216,0.18)" : "rgba(22,24,29,0.14)"
  const paper = dark ? "#15120d" : "#ffffff"
  const names = [...LIBRARIES, ...EXFOR_SETS.map((s) => `EXFOR ${s.id}`)]
  const axis = (type: "log" | "value", name: string, min: number, max: number, energy: boolean) => ({
    type, name, min, max, nameLocation: "middle", nameGap: energy ? 30 : 52, logBase: 10,
    nameTextStyle: { color: muted, fontSize: 12 },
    axisLine: { lineStyle: { color: rule } }, axisTick: { lineStyle: { color: rule } },
    splitLine: { show: true, lineStyle: { color: rule, type: "dashed" } },
    axisLabel: { color: muted, fontSize: 11, hideOverlap: true, formatter: (v: number) => (energy ? energyLabel(v) : Number(v.toPrecision(2)).toExponential(0)) },
  })
  return {
    // No draw-in on load or on a stepper click (Brendan, 2026-11-11); the zoom box keeps its 450 ms update.
    animationDuration: 0,
    animationDurationUpdate: 450,
    animationEasingUpdate: "cubicOut",
    grid: { left: 72, right: 24, top: 18, bottom: 48 },
    xAxis: axis(scales.x, "Incident energy", range.xmin, range.xmax, true),
    yAxis: axis(scales.y, "Cross section (b)", range.ymin, range.ymax, false),
    // hidden: the page draws the legend (JanisBook.tsx ChartLegend, 2026-11-11); `selected` still hides the series
    legend: {
      show: false,
      data: names.map((n) => (LIBRARIES.includes(n) ? { name: n, icon: "path://M0,3 L18,3 L18,5 L0,5 Z" } : { name: n })), selected: Object.fromEntries(names.map((n) => [n, !hidden.has(n)])),
      orient: "vertical", left: 84, top: 28, padding: [8, 10], itemGap: 4, itemWidth: 18, itemHeight: 8,
      backgroundColor: paper, borderColor: rule, borderWidth: 1, borderRadius: 6,
      textStyle: { color: ink, fontSize: 11 }, inactiveColor: muted,
    },
    tooltip: {
      trigger: "item", backgroundColor: paper, borderColor: rule, textStyle: { color: ink, fontSize: 12 },
      formatter: (p: { seriesName: string; value: [number, number] }) => `${p.seriesName}<br/>${energyLabel(p.value[0])} · ${p.value[1].toPrecision(3)} b`,
    },
    series: [
      ...LIBRARIES.map((name, k) => ({
        name, type: "line", data: lineOf(k), symbol: "none", showSymbol: false, smooth: false, clip: true,
        lineStyle: { width: 2, color: slots[RELEASE_SLOT[name] ?? k] }, itemStyle: { color: slots[RELEASE_SLOT[name] ?? k] },
      })),
      ...EXFOR_SETS.map((s, j) => ({
        name: `EXFOR ${s.id}`, type: "scatter", data: pointsOf(j), symbol: s.symbol, symbolSize: 7, clip: true,
        itemStyle: { color: "transparent", borderColor: ink, borderWidth: 1.25 },
      })),
    ],
  }
}

const fmt = (r: Range): Range => r
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Chart = any

export function BookChart({ range, scales, hidden, version, onZoom }: {
  range: Range
  scales: Scales
  hidden: Set<string>
  version: number
  onZoom: (r: Range) => void
}) {
  const state = useRef({ range, scales, hidden })
  state.current = { range, scales, hidden }
  const zoom = useRef(onZoom)
  zoom.current = onZoom
  // onPick: a click on this chart opens nothing (Brendan, 2026-11-11 02:38); use-echart's default sends a click to the
  // page's data table in the second panel, and the book has none.
  const ref = useEChart(async () => null, () => bookOption(state.current.range, state.current.scales, state.current.hidden), false, undefined, { view: version, replace: true, still: true, onPick: () => {} })

  // The zoom box, on the chart's own zrender events, once use-echart has made the chart.
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
        const next = fmt({ xmin: a[0], xmax: b[0], ymin: a[1], ymax: b[1] })
        chart.setOption({ xAxis: { min: next.xmin, max: next.xmax }, yAxis: { min: next.ymin, max: next.ymax } })
        zoom.current(next)
      }
      const dbl = () => {
        clear()
        chart.setOption({ xAxis: { min: FULL.xmin, max: FULL.xmax }, yAxis: { min: FULL.ymin, max: FULL.ymax } })
        zoom.current(FULL)
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

  return <div ref={ref} className="h-full w-full select-none" />
}
