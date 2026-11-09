import { seriesList, type Dataset, type KindDef } from "@/lib/lab/blocks"
import type { PlotMode } from "@/lib/lab/canvases/plot"
import { plural } from "@/lib/lab/format"

// Plot (brief 52): σ against energy (log-log) with the EXFOR points and the evaluations, and the ratio against energy with
// the highlight window shaded. It computes nothing: the block draws its inputs (components/lab/PlotChart.tsx, with
// lib/lab/canvases/plot.ts's option), so a run only checks there is something to draw and counts it.

export type PlotParams = { mode: PlotMode; highlight?: [number, number] }

export const plot: KindDef<PlotParams> = {
  kind: "plot",
  title: "Plot",
  inputs: { points: "dataset", series: "series", ratio: "series" },
  outputs: {},
  defaults: { mode: "both", highlight: [9e3, 1.8e4] },
  async run(_p, inputs) {
    const points = (inputs.points ?? []).reduce((n, d) => n + ((d as Dataset).rows?.length ?? 0), 0)
    const curves = [...(inputs.series ?? []), ...(inputs.ratio ?? [])].flatMap(seriesList).length
    if (!points && !curves) throw new Error("Connect points or series to draw.")
    return {}
  },
  summary: () => "",
}

/** The Plot's foot: what it draws. */
export function plotSummary(points: number, curves: number): string {
  return [points ? plural(points, "point") : "", curves ? plural(curves, "curve") : ""].filter(Boolean).join(" · ")
}
