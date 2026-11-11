"use client"

import { Copy, Download } from "lucide-react"
import { useMemo, useRef, type CSSProperties } from "react"
import { toast } from "sonner"

import { useEChart, type ChartClick } from "@/components/viz/use-echart"
import { ChartBox } from "@/components/viz/chart-kebab"
import { copyPng } from "@/lib/canvas-png"
import { downloadSvg, svgFileName } from "@/lib/canvas-svg"
import type { Dataset, Series } from "@/lib/lab/blocks"
import { datasetOfSeries, plotOption, type PlotMode } from "@/lib/lab/canvases/plot"

// The Plot block's chart (brief 52): lib/lab/canvases/plot.ts's option through useEChart. A click on an EXFOR point opens
// its subentry in the right panel. Export: the chart as an SVG file (ECharts' own SVG renderer) and Copy as a PNG, as
// /graph's canvas does.

const isDark = () => typeof document !== "undefined" && document.documentElement.classList.contains("dark")

export function PlotChart({ points, series, ratio, mode, highlight, title, onPoint, className, style }: {
  points?: Dataset
  series: Series[]
  ratio: Series[]
  mode: PlotMode
  highlight?: [number, number]
  title: string
  onPoint?: (datasetId: string) => void
  className?: string
  style?: CSSProperties
}) {
  // A new version each time what the chart draws changes, so useEChart rebuilds with it.
  const version = useRef(0)
  const last = useRef<unknown[]>([])
  const now = [points, series, ratio, mode, highlight?.[0], highlight?.[1]]
  if (now.some((v, i) => v !== last.current[i])) {
    version.current += 1
    last.current = now
  }
  const props = useRef({ points, series, ratio, mode, highlight })
  props.current = { points, series, ratio, mode, highlight }
  const pick = useMemo(() => (p: ChartClick) => {
    const id = datasetOfSeries((p as ChartClick & { seriesId?: string }).seriesId)
    if (id) onPoint?.(id)
  }, [onPoint])
  const ref = useEChart(
    async () => null,
    () => plotOption({ ...props.current, dark: isDark() }),
    false,
    undefined,
    { view: version.current, replace: true, onPick: pick },
  )

  const instance = async () => {
    const echarts = await import("echarts")
    return ref.current ? { echarts, chart: echarts.getInstanceByDom(ref.current) } : null
  }
  const exportSvg = async () => {
    const got = await instance()
    if (!got?.chart || !ref.current) return
    try {
      const { width, height } = ref.current.getBoundingClientRect()
      const ssr = got.echarts.init(null, null, { renderer: "svg", ssr: true, width, height })
      ssr.setOption(got.chart.getOption())
      const svg = ssr.renderToSVGString()
      ssr.dispose()
      downloadSvg(svg, svgFileName(title))
      toast.success("Plot saved as an SVG")
    } catch {
      toast.error("Couldn't export the plot")
    }
  }
  const copy = async () => {
    const got = await instance()
    if (!got?.chart) return
    try {
      const paper = getComputedStyle(document.documentElement).getPropertyValue("--paper").trim() || (isDark() ? "#15120d" : "#ffffff")
      const blob = await (await fetch(got.chart.getDataURL({ type: "png", pixelRatio: 2, backgroundColor: paper }))).blob()
      const how = await copyPng(blob, svgFileName(title).replace(/\.svg$/, ".png"))
      toast.success(how === "copied" ? "Plot copied as a PNG" : "Plot saved as a PNG")
    } catch {
      toast.error("Couldn't copy the plot")
    }
  }

  return (
    <div className={className} style={style}>
      <div className="nodrag nowheel relative h-full w-full">
        <ChartBox chart={ref} className="h-full w-full" />
        <div className="absolute right-1 top-1 flex gap-1">
          <button type="button" title="Export SVG" aria-label="Export the plot as SVG" onClick={exportSvg} className="flex h-6 w-6 items-center justify-center rounded-full border border-[var(--paper-rule)] bg-[var(--paper)] text-[var(--paper-muted)] hover:text-[var(--paper-text)]">
            <Download className="h-3.5 w-3.5" />
          </button>
          <button type="button" title="Copy" aria-label="Copy the plot as a PNG" onClick={copy} className="flex h-6 w-6 items-center justify-center rounded-full border border-[var(--paper-rule)] bg-[var(--paper)] text-[var(--paper-muted)] hover:text-[var(--paper-text)]">
            <Copy className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
