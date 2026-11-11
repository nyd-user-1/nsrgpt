"use client"
// Brendan's side-by-side with JANIS (2026-11-11 15:00): EXFOR points small (2.5–3 px), filled, at 55% under the lines, coloured
// by set from the palette past 40 sets as JANIS colours them; lines 1.5 px on top; a labelled tick on every decade of both
// log axes (energy 10 µeV … 1 GeV, cross section b, mb, µb); the range from the lines drawn.
// /elpis/book (briefs 67, 69): the book page's chart, through components/viz/use-echart.ts. Cross section against
// incident energy from the lake: one line per library release that holds the section (/endf/xs; colour by release,
// lib/lab/canvases/plot.ts's slots) and one marker set per EXFOR subentry (/exfor/points; eight markers, four shapes
// outlined then filled, in the paper's ink). The page draws the legend (ElpisBook.tsx ChartLegend); `hidden` hides series
// by name. A dashed line marks the threshold when the reaction's Q value is below zero.
//
// The zoom box: mouse down inside the plot and drag draws a dashed rectangle (the pointer stays the house crosshair
// use-echart sets); on mouse up both axes zoom to the rectangle, animated, and the Plotter's fields follow (onZoom).
// A double click goes back to the data's whole range (`full`). The Plotter's Apply and scale selects come in through
// `view` and redraw without animation (brief 69: no animation on rail or Plotter clicks).
import { useEffect, useRef } from "react"
import { useEChart } from "@/components/viz/use-echart"
import { energyLabel, RELEASE_SLOT, SLOTS } from "@/lib/lab/canvases/plot"
import { libraryName } from "@/lib/elpis"
import type { BookLine, BookSet } from "@/components/elpis/use-book"

export type Range = { xmin: number; xmax: number; ymin: number; ymax: number }
export type Scales = { x: "log" | "value"; y: "log" | "value" }

/** A set's marker: four shapes, outlined for the first four sets, filled for the next four, then round again. */
export const SHAPES = ["circle", "rect", "triangle", "diamond"] as const
export const markerOf = (j: number) => ({ symbol: SHAPES[j % 4], filled: Math.floor(j / 4) % 2 === 1 })
/** A release's colour slot. */
export const slotOf = (release: string, k: number) => RELEASE_SLOT[release] ?? k % 8

const isDark = () => typeof document !== "undefined" && document.documentElement.classList.contains("dark")

/** The data's range from the lines drawn (Brendan, 2026-11-11): energy where they are above zero, cross section from their
 *  smallest positive value (not below 1e-5 b) to their largest, each widened to whole decades. A line whose File 3 is only
 *  the background inside the resonance range (the API's note) is drawn but does not set the range; EXFOR's points set it
 *  only when no line is drawn (their 2nd percentile up). */
export function rangeOf(lines: BookLine[], sets: BookSet[]): Range | null {
  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity
  const full = lines.filter((l) => !/only the background/.test(l.note ?? ""))
  for (const l of full.length ? full : lines)
    for (let i = 0; i < l.x.length; i++) {
      const x = l.x[i], y = l.y[i]
      if (!(x > 0) || !(y > 0)) continue
      if (x < xmin) xmin = x
      if (x > xmax) xmax = x
      if (y < ymin) ymin = y
      if (y > ymax) ymax = y
    }
  if (!lines.length) {
    const ps: number[] = []
    for (const st of sets)
      for (let i = 0; i < st.x.length; i++) {
        const x = st.x[i], y = st.y[i]
        if (!(x > 0) || !(y > 0)) continue
        xmin = Math.min(xmin, x); xmax = Math.max(xmax, x); ymax = Math.max(ymax, y); ps.push(y)
      }
    ps.sort((p, q) => p - q)
    if (ps.length) ymin = ps[Math.floor(ps.length * 0.02)]
  }
  if (!Number.isFinite(xmin) || !Number.isFinite(ymax) || xmax <= xmin) return null
  ymin = Math.max(ymin, 1e-5)
  const down = (v: number) => 10 ** Math.floor(Math.log10(v) + 1e-9)
  const up = (v: number) => 10 ** Math.ceil(Math.log10(v) - 1e-9)
  return { xmin: down(xmin), xmax: up(xmax), ymin: down(ymin), ymax: up(Math.max(ymax, ymin * 10)) }
}

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
/** Every decade a book's axes can reach, 1e-12 to 1e12. */
const DECADES = Array.from({ length: 25 }, (_, i) => 10 ** (i - 12))
/** Past this many EXFOR sets the points are coloured by set from the palette, as JANIS colours them. */
export const MANY_SETS = 40
/** A set's look: past MANY_SETS a palette colour and a dot; else the ink and one of four shapes. */
export function setLook(j: number, n: number, dark: boolean): { color: string; symbol: string } {
  if (n > MANY_SETS) return { color: (dark ? SLOTS.dark : SLOTS.light)[j % 8], symbol: "circle" }
  return { color: dark ? "#f0e9d8" : "#16181d", symbol: SHAPES[j % 4] }
}

export function bookOption(o: { lines: BookLine[]; sets: BookSet[]; spans?: Record<string, [number, number]>; range: Range; scales: Scales; hidden: Set<string>; threshold: number | null }) {
  const { lines, sets, range, scales, hidden, threshold } = o
  const spans = o.spans ?? {}
  const dark = isDark()
  const slots = dark ? SLOTS.dark : SLOTS.light
  const ink = dark ? "#f0e9d8" : "#16181d"
  const muted = dark ? "rgba(240,233,216,0.62)" : "#64748b"
  const rule = dark ? "rgba(240,233,216,0.18)" : "rgba(22,24,29,0.14)"
  const paper = dark ? "#15120d" : "#ffffff"
  const names = [...lines.map((l) => libraryName(l.release)), ...sets.map((s) => s.id)]
  const logY = scales.y === "log"
  const many = sets.reduce((n, s) => n + s.x.length, 0) > 20000
  // A labelled tick on every decade of a log axis, none hidden: the decades given outright (ECharts' own log ticks skip
  // decades on a wide axis), the ones inside the range shown, zoomed or not.
  const axis = (type: "log" | "value", name: string, min: number, max: number, energy: boolean) => ({
    type, name, min, max, nameLocation: "middle", nameGap: energy ? 30 : 66, logBase: 10,
    nameTextStyle: { color: muted, fontSize: 12 },
    axisLine: { lineStyle: { color: rule } },
    axisTick: { lineStyle: { color: rule }, ...(type === "log" ? { customValues: DECADES } : {}) },
    splitLine: { show: true, lineStyle: { color: rule, type: "dashed" } },
    axisLabel: { color: muted, fontSize: 11, hideOverlap: false, ...(type === "log" ? { customValues: DECADES } : {}), formatter: (v: number) => (energy ? energyTick(v) : barnTick(v)) },
  })
  const setInfo = new Map(sets.map((s) => [s.id, s]))
  return {
    // No draw-in on load, on a rail click or on the Plotter (Brendan, 2026-11-11; brief 69); the zoom box asks for its
    // own 450 ms when it sets the axes.
    animationDuration: 0,
    animationDurationUpdate: 0,
    grid: { left: 86, right: 28, top: 18, bottom: 48 },
    xAxis: axis(scales.x, "Incident energy", range.xmin, range.xmax, true),
    yAxis: axis(scales.y, "Cross section (b)", range.ymin, range.ymax, false),
    legend: { show: false, data: names, selected: Object.fromEntries(names.map((n) => [n, !hidden.has(n)])) },
    tooltip: {
      trigger: "item", backgroundColor: paper, borderColor: rule, textStyle: { color: ink, fontSize: 12 },
      formatter: (p: { seriesName: string; value: [number, number] }) => {
        const s = setInfo.get(p.seriesName)
        const who = s ? ` · ${[s.author, s.year].filter(Boolean).join(", ")}` : ""
        return `${p.seriesName}${who}<br/>${energyLabel(p.value[0])} · ${p.value[1].toPrecision(4)} b`
      },
    },
    series: [
      // EXFOR first, under the lines: small filled points at 55%, coloured by set past MANY_SETS.
      ...sets.map((st, j) => {
        const look = setLook(j, sets.length, dark)
        return {
          name: st.id, type: "scatter", symbol: look.symbol, symbolSize: sets.length > MANY_SETS ? 2.5 : 3, clip: true, z: 2,
          data: st.x.map((x, i) => [x, st.y[i]]).filter((d) => !logY || d[1] > 0),
          itemStyle: { color: look.color, opacity: 0.55, borderWidth: 0 },
          ...(many ? { large: true, largeThreshold: 2000 } : {}),
        }
      }),
      // A line whose File 3 is only the background inside the resonance range: solid outside the span, dashed inside it,
      // two series under one name so the legend toggles both.
      ...lines.flatMap((l, k) => {
        const sp = spans[l.release]
        if (!sp) return []
        const color = slots[slotOf(l.release, k)]
        const lo = l.x.findIndex((x) => x >= sp[0]), hiRaw = l.x.findIndex((x) => x > sp[1])
        const hi = hiRaw < 0 ? l.x.length - 1 : hiRaw
        const inside = l.x.slice(Math.max(0, lo - 1), hi + 1).map((x, i) => { const y = l.y[Math.max(0, lo - 1) + i]; return [x, logY && !(y > 0) ? null : y] })
        return [{
          name: libraryName(l.release), type: "line", symbol: "none", showSymbol: false, smooth: false, clip: true, connectNulls: false,
          data: inside, lineStyle: { width: 1.5, color, type: [5, 4] }, itemStyle: { color }, z: 4,
        }]
      }),
      ...lines.map((l, k) => {
        const color = slots[slotOf(l.release, k)]
        const sp = spans[l.release]
        return {
          name: libraryName(l.release), type: "line", symbol: "none", showSymbol: false, smooth: false, clip: true, connectNulls: false,
          data: l.x.map((x, i) => [x, (logY && !(l.y[i] > 0)) || (sp && x > sp[0] && x < sp[1]) ? null : l.y[i]]),
          lineStyle: { width: 1.5, color }, itemStyle: { color }, z: 4,
          ...(k === 0 && threshold && threshold > range.xmin && threshold < range.xmax ? {
            markLine: {
              silent: true, symbol: "none", animation: false,
              lineStyle: { color: muted, type: "dashed", width: 1 },
              label: { color: muted, fontSize: 11, formatter: `Threshold ${energyLabel(threshold)}`, position: "insideEndTop" },
              data: [{ xAxis: threshold }],
            },
          } : {}),
        }
      }),
    ],
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Chart = any

export function BookChart({ lines, sets, spans, range, full, scales, hidden, threshold, version, onZoom }: {
  lines: BookLine[]
  sets: BookSet[]
  spans?: Record<string, [number, number]>
  range: Range
  full: Range
  scales: Scales
  hidden: Set<string>
  threshold: number | null
  version: number
  onZoom: (r: Range) => void
}) {
  const state = useRef({ lines, sets, spans, range, full, scales, hidden, threshold })
  state.current = { lines, sets, spans, range, full, scales, hidden, threshold }
  const zoom = useRef(onZoom)
  zoom.current = onZoom
  // onPick: a click on this chart opens nothing (Brendan, 2026-11-11 02:38); use-echart's default sends a click to the
  // page's data table in the second panel, and the book has none.
  const ref = useEChart(async () => null, () => bookOption(state.current), false, undefined, { view: version, replace: true, still: true, onPick: () => {} })

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
        const next = { xmin: a[0], xmax: b[0], ymin: a[1], ymax: b[1] }
        chart.setOption({ animationDurationUpdate: 450, animationEasingUpdate: "cubicOut", xAxis: { min: next.xmin, max: next.xmax }, yAxis: { min: next.ymin, max: next.ymax } })
        zoom.current(next)
      }
      const dbl = () => {
        clear()
        const f = state.current.full
        chart.setOption({ animationDurationUpdate: 450, animationEasingUpdate: "cubicOut", xAxis: { min: f.xmin, max: f.xmax }, yAxis: { min: f.ymin, max: f.ymax } })
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

  return <div ref={ref} className="h-full w-full select-none" />
}
