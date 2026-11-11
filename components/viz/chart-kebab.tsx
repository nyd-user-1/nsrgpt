"use client"
// Every chart's menu (Brendan, 2026-11-11 16:30, through the lead): a horizontal kebab (lucide Ellipsis) in the chart's top
// right corner, inside the plot, opening the house dropdown (components/kebab-menu.tsx) with the standard options. Brendan
// reviews the list and prunes, so all are here: Show legend, Show X axis, Show Y axis, Show grid lines, Log/Lin X,
// Log/Lin Y, Reset zoom, Undo zoom, a page's own rows (the book's Reconstruct), Fullscreen, Download PNG, Download SVG,
// Download data (CSV), Copy data, Open data table (where the chart has one), Copy link.
//
// Built once for every useEChart chart (components/viz/use-echart.ts): a chart renders <ChartBox chart={ref} … /> where it
// rendered <div ref={ref} … />. The menu works on the ECharts instance in that div. The view toggles (legend, axes, grid
// lines, log or linear) are kept per chart in a registry that use-echart re-applies after each of its redraws (theme, view),
// so a toggle outlives them. A page that draws a thing itself (the book's own legend, its zoom and scales) passes handlers
// that take the place of the generic action.
import * as React from "react"
import { usePathname } from "next/navigation"
import { ArrowDownToLine, Copy, Ellipsis, Expand, FileCode2, Grid3x3, Image as ImageIcon, Link2, ListTree, MoveHorizontal, MoveVertical, RotateCcw, Table2, Undo2 } from "lucide-react"
import { KebabMenu, MenuRow, MenuSeparator } from "@/components/kebab-menu"
import { useShellPanel } from "@/components/shell"
import { tableOf } from "@/lib/viz-tables"
import { cn } from "@/lib/utils"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Chart = any
type View = { legend?: boolean; xAxis?: boolean; yAxis?: boolean; grid?: boolean; xType?: "log" | "value"; yType?: "log" | "value" }

const views = new WeakMap<HTMLElement, View>()
const arr = <T,>(v: T | T[] | undefined): T[] => (Array.isArray(v) ? v : v ? [v] : [])

/** Re-apply a chart's menu toggles after its owner redraws it (use-echart calls this after each setOption). */
export function applyChartView(chart: Chart, el: HTMLElement | null) {
  const v = el ? views.get(el) : undefined
  if (!chart || !v) return
  const o = chart.getOption?.() ?? {}
  const nx = arr(o.xAxis).length, ny = arr(o.yAxis).length, nl = arr(o.legend).length
  const patch: Record<string, unknown> = {}
  if (v.legend !== undefined && nl) patch.legend = Array.from({ length: nl }, () => ({ show: v.legend }))
  const axis = (n: number, show: boolean | undefined, type: "log" | "value" | undefined, current: { type?: string }[]) =>
    Array.from({ length: n }, (_, i) => ({
      ...(show !== undefined ? { show } : {}),
      ...(v.grid !== undefined ? { splitLine: { show: v.grid } } : {}),
      ...(type && (current[i]?.type === "value" || current[i]?.type === "log") ? { type } : {}),
    }))
  if (nx) patch.xAxis = axis(nx, v.xAxis, v.xType, arr(o.xAxis))
  if (ny) patch.yAxis = axis(ny, v.yAxis, v.yType, arr(o.yAxis))
  chart.setOption(patch)
}

const instance = async (el: HTMLElement | null): Promise<Chart> => (el ? (await import("echarts")).getInstanceByDom(el) : null)
const save = (name: string, href: string) => {
  const a = document.createElement("a")
  a.href = href
  a.download = name
  a.click()
}
const slugOf = (path: string) => (path.split("/").filter(Boolean).pop() ?? "chart").replace(/[^A-Za-z0-9.-]+/g, "-")
const paperBg = () => getComputedStyle(document.documentElement).getPropertyValue("--paper").trim() || (document.documentElement.classList.contains("dark") ? "#15120d" : "#ffffff")

/** The chart's series as CSV rows: series, point, then the point's values. */
function seriesRows(chart: Chart): string[][] {
  const o = chart.getOption?.() ?? {}
  const rows: string[][] = [["series", "point", "values"]]
  for (const s of arr(o.series) as { name?: string; data?: unknown[] }[]) {
    ;(s.data ?? []).forEach((d, i) => {
      const v = Array.isArray(d) ? d : d && typeof d === "object" && "value" in (d as object) ? arr((d as { value: unknown }).value) : [d]
      rows.push([String(s.name ?? ""), String(i), ...v.map((x) => (x == null ? "" : String(x)))])
    })
  }
  return rows
}
const csvOf = (rows: (string | number)[][]) => rows.map((r) => r.map((c) => { const t = String(c); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t }).join(",")).join("\n")

export type ChartKebabProps = {
  /** A legend the page draws itself (the book's): its state and its toggle, in place of ECharts' legend. */
  legend?: { on: boolean; toggle: () => void }
  /** Axis scales the page keeps itself (the book's Plotter): in place of switching the axis type directly. */
  scales?: { x: "log" | "value"; y: "log" | "value"; set: (axis: "x" | "y", type: "log" | "value") => void }
  /** The page's zoom: reset to the whole range, and undo the last zoom. */
  zoom?: { reset: () => void; undo?: () => void; canUndo?: boolean }
  /** The page's own rows, after the zoom rows (the book's Reconstruct). */
  extra?: React.ReactNode
  /** The data as rows, the first a header, for Download data and Copy data; else the chart's series. */
  rows?: () => (string | number)[][]
}

export function ChartKebab({ chart, legend, scales, zoom, extra, rows, className }: ChartKebabProps & { chart: React.RefObject<HTMLDivElement | null>; className?: string }) {
  const path = usePathname()
  const { openPane } = useShellPanel()
  const [, bump] = React.useState(0)
  const [state, setState] = React.useState<{ legend: boolean; xAxis: boolean; yAxis: boolean; grid: boolean; xType?: string; yType?: string; dataZoom: boolean; gl: boolean } | null>(null)
  // a /viz chart's data table (lib/viz-tables.ts); other pages' charts have none
  const table = path.startsWith("/viz/") ? tableOf(slugOf(path)) : null
  // Read the chart's own state when the menu opens, so the checks tell the truth.
  const read = async () => {
    const c = await instance(chart.current)
    const o = c?.getOption?.() ?? {}
    const v = (chart.current && views.get(chart.current)) ?? {}
    const x0 = arr(o.xAxis)[0] as { show?: boolean; type?: string; splitLine?: { show?: boolean } } | undefined
    const y0 = arr(o.yAxis)[0] as { show?: boolean; type?: string; splitLine?: { show?: boolean } } | undefined
    setState({
      legend: v.legend ?? (arr(o.legend)[0] as { show?: boolean } | undefined)?.show !== false,
      xAxis: v.xAxis ?? x0?.show !== false,
      yAxis: v.yAxis ?? y0?.show !== false,
      grid: v.grid ?? (y0?.splitLine?.show ?? x0?.splitLine?.show ?? true) !== false,
      xType: x0?.type, yType: y0?.type,
      dataZoom: arr(o.dataZoom).length > 0,
      gl: arr(o.series).some((s) => /GL|3D/.test(String((s as { type?: string }).type ?? ""))) || arr(o.grid3D).length > 0,
    })
  }
  const toggle = async (k: keyof View, value: View[keyof View]) => {
    const el = chart.current
    if (!el) return
    views.set(el, { ...(views.get(el) ?? {}), [k]: value })
    applyChartView(await instance(el), el)
    bump((n) => n + 1)
  }
  const svg = async () => {
    const c = await instance(chart.current)
    if (!c) return
    const echarts = await import("echarts")
    const ssr = echarts.init(null as unknown as HTMLElement, undefined, { renderer: "svg", ssr: true, width: c.getWidth(), height: c.getHeight() })
    ssr.setOption({ ...c.getOption(), animation: false, backgroundColor: paperBg() })
    const text = ssr.renderToSVGString()
    ssr.dispose()
    save(`${slugOf(path)}.svg`, URL.createObjectURL(new Blob([text], { type: "image/svg+xml" })))
  }
  const dataText = async () => csvOf(rows ? rows() : seriesRows(await instance(chart.current)))
  const s = state
  const xLog = scales ? scales.x === "log" : s?.xType === "log"
  const yLog = scales ? scales.y === "log" : s?.yType === "log"
  const axisSwitchable = (t?: string) => t === "value" || t === "log"
  return (
    <div className={cn("absolute right-2 top-2 z-20", className)} onPointerDown={() => read()}>
      <KebabMenu label="Chart menu" width="w-60" trigger={<Ellipsis className="size-4" aria-hidden="true" />}
        triggerClassName="inline-flex size-7 items-center justify-center rounded-md text-[var(--paper-muted)] transition-colors hover:bg-[var(--paper-quiet)] hover:text-[var(--paper-text)]">
        <MenuRow icon={<ListTree />} label="Show legend" checked={legend ? legend.on : !!s?.legend} onClick={() => (legend ? legend.toggle() : toggle("legend", !s?.legend))} />
        <MenuRow icon={<MoveHorizontal />} label="Show X axis" checked={!!s?.xAxis} onClick={() => toggle("xAxis", !s?.xAxis)} />
        <MenuRow icon={<MoveVertical />} label="Show Y axis" checked={!!s?.yAxis} onClick={() => toggle("yAxis", !s?.yAxis)} />
        <MenuRow icon={<Grid3x3 />} label="Show grid lines" checked={!!s?.grid} onClick={() => toggle("grid", !s?.grid)} />
        <MenuSeparator />
        <MenuRow label={xLog ? "Linear X" : "Log X"} hint={xLog ? "log now" : "linear now"} disabled={!scales && !axisSwitchable(s?.xType)}
          onClick={() => (scales ? scales.set("x", xLog ? "value" : "log") : toggle("xType", xLog ? "value" : "log"))} />
        <MenuRow label={yLog ? "Linear Y" : "Log Y"} hint={yLog ? "log now" : "linear now"} disabled={!scales && !axisSwitchable(s?.yType)}
          onClick={() => (scales ? scales.set("y", yLog ? "value" : "log") : toggle("yType", yLog ? "value" : "log"))} />
        <MenuRow icon={<RotateCcw />} label="Reset zoom" disabled={!zoom && !s?.dataZoom}
          onClick={async () => (zoom ? zoom.reset() : (await instance(chart.current))?.dispatchAction({ type: "dataZoom", start: 0, end: 100 }))} />
        <MenuRow icon={<Undo2 />} label="Undo zoom" disabled={!zoom?.undo || !zoom.canUndo} onClick={() => zoom?.undo?.()} />
        {extra}
        <MenuSeparator />
        <MenuRow icon={<Expand />} label="Fullscreen" onClick={() => chart.current?.parentElement?.requestFullscreen?.()} />
        <MenuRow icon={<ImageIcon />} label="Download PNG" onClick={async () => { const c = await instance(chart.current); if (c) save(`${slugOf(path)}.png`, c.getDataURL({ type: "png", pixelRatio: 2, backgroundColor: paperBg() })) }} />
        <MenuRow icon={<FileCode2 />} label="Download SVG" disabled={!!s?.gl} hint={s?.gl ? "3D" : undefined} onClick={svg} />
        <MenuRow icon={<ArrowDownToLine />} label="Download data (CSV)" onClick={async () => save(`${slugOf(path)}.csv`, URL.createObjectURL(new Blob([await dataText()], { type: "text/csv" })))} />
        <MenuRow icon={<Copy />} label="Copy data" onClick={async () => navigator.clipboard?.writeText(await dataText())} />
        {table && <MenuRow icon={<Table2 />} label="Open data table" onClick={() => openPane(`/viz/data/${table}`)} />}
        <MenuRow icon={<Link2 />} label="Copy link" onClick={() => navigator.clipboard?.writeText(window.location.href)} />
      </KebabMenu>
    </div>
  )
}

/** A chart's box: the useEChart div filling it, and the chart menu in its top right corner. Takes the classes the chart's
 *  div had, so the layout is unchanged. */
export function ChartBox({ chart, className, kebab, kebabClassName, children }: { chart: React.RefObject<HTMLDivElement | null>; className?: string; kebab?: ChartKebabProps; kebabClassName?: string; children?: React.ReactNode }) {
  return (
    <div className={cn("relative", className)}>
      <div ref={chart} className="absolute inset-0" />
      {children}
      <ChartKebab chart={chart} {...kebab} className={kebabClassName} />
    </div>
  )
}

