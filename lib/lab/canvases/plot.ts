import type { Dataset, Series } from "@/lib/lab/blocks"
import { offDatasets, releaseOf } from "@/lib/lab/canvases/compare"
import { bandMethodText } from "@/lib/lab/kinds/data"

// The Lab's Plot option (brief 53), for ECharts through components/viz/use-echart.ts. σ against energy, log-log: the
// EXFOR points hollow in the paper's ink, one series per dataset (its author and year in the legend; ids
// `exfor:<dataset_id>`, so a click opens the subentry), the evaluations as 2 px lines in the dataviz palette's first
// slots with their MF33 band at low alpha. Beneath (mode "both") or alone (mode "ratio"): measured over evaluated per
// energy bin, each evaluation's band 1 ± its relative sd, a rule at 1, the highlight window shaded in both.
//
// Colour follows the evaluation, never its rank: ENDF/B-VIII.1 is always slot 1, JEFF-3.3 slot 2, JENDL-5 slot 3. The
// datasets share the neutral ink (past three hues the palette can't keep every pair apart in a scatter); hover and the
// tooltip name them.

export type PlotMode = "sigma" | "ratio" | "both"

/** The dataviz palette's categorical slots (references/palette.md), light and dark steps. */
export const SLOTS = {
  light: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"],
  dark: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"],
}
/** The ENDF/B line takes nine colours from eight slots: B-II repeats B-VIII.1's, the pair furthest apart; the other old
 *  releases share a slot with a library they are rarely drawn beside. */
export const RELEASE_SLOT: Record<string, number> = {
  "B-VIII.1": 0, "JEFF-3.3": 1, "JENDL-5": 2, "B-VIII.0": 3, "B-VII.1": 4, "TENDL-2023": 5, "CENDL-3.2": 6,
  "B-VII.0": 7, "B-VI.8": 5, "B-V": 6, "B-IV": 2, "B-III": 1, "B-II": 0,
}

const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

/** An energy in eV as the axis writes it: 1 keV, 20 keV, 1.5 MeV. */
export function energyLabel(v: number): string {
  const f = (x: number) => (Math.abs(x) >= 100 ? x.toFixed(0) : Number(x.toPrecision(3)).toString())
  if (v >= 1e6) return `${f(v / 1e6)} MeV`
  if (v >= 1e3) return `${f(v / 1e3)} keV`
  return `${f(v)} eV`
}

/** The EXFOR subentry a point's series names, from its id (`exfor:<dataset_id>`), and the page that shows it. */
export const datasetOfSeries = (seriesId: string | undefined) => (seriesId?.startsWith("exfor:") ? seriesId.slice(6) : null)
export const exforHref = (datasetId: string) => `/datasets/exfor/${encodeURIComponent(datasetId)}`

type Label = { author?: string; year?: number | string }

/** The datasets' author and year, from the EXFOR Data block's meta (`datasets: [{ dataset_id, author, year }]`). */
function labelsOf(ds: Dataset | undefined): Map<string, Label> {
  const list = (ds?.meta?.datasets ?? []) as { dataset_id?: string; author?: string; year?: number | string }[]
  return new Map(list.filter((d) => d.dataset_id).map((d) => [String(d.dataset_id), { author: d.author, year: d.year }]))
}

export function plotOption({ points, series = [], ratio = [], mode = "both", highlight, dark = false }: {
  points?: Dataset
  series?: Series[]
  ratio?: Series[]
  mode?: PlotMode
  highlight?: readonly [number, number]
  dark?: boolean
}): Record<string, unknown> {
  const slots = dark ? SLOTS.dark : SLOTS.light
  const ink = dark ? "#f0e9d8" : "#16181d"
  const muted = dark ? "rgba(240,233,216,0.62)" : "#64748b"
  const rule = dark ? "rgba(240,233,216,0.18)" : "rgba(22,24,29,0.14)"
  const pointInk = dark ? "rgba(240,233,216,0.55)" : "rgba(22,24,29,0.5)"
  const shade = dark ? "rgba(240,233,216,0.07)" : "rgba(22,24,29,0.05)"
  let next = Object.keys(RELEASE_SLOT).length
  const slotOf = new Map<string, number>()
  const colorOf = (s: Series) => {
    const rel = releaseOf(s)
    if (!slotOf.has(rel)) slotOf.set(rel, RELEASE_SLOT[rel] ?? next++ % slots.length)
    return slots[slotOf.get(rel)!]
  }

  const showSigma = mode !== "ratio"
  const showRatio = mode !== "sigma" && ratio.length > 0
  const grids = showSigma && showRatio
    ? [{ left: 64, right: 150, top: 36, height: "52%" }, { left: 64, right: 150, top: "70%", bottom: 40 }]
    : [{ left: 64, right: 150, top: 36, bottom: 40 }]
  const ratioGrid = showSigma ? 1 : 0

  // The energy range: the points' and curves', so the axes start where the data does.
  const xs: number[] = []
  for (const r of points?.rows ?? []) if (typeof r.e_ev === "number") xs.push(r.e_ev)
  for (const s of [...series, ...ratio]) if (s.x.length) xs.push(s.x[0], s.x[s.x.length - 1])
  const xmin = xs.length ? Math.min(...xs) : undefined
  const xmax = xs.length ? Math.max(...xs) : undefined
  const axisCommon = {
    type: "log",
    min: xmin,
    max: xmax,
    nameTextStyle: { color: muted },
    axisLabel: { color: muted, fontSize: 10, formatter: energyLabel },
    axisLine: { lineStyle: { color: rule } },
    splitLine: { show: false },
  }
  const xAxis = grids.map((_, i) => ({ ...axisCommon, gridIndex: i, name: i === grids.length - 1 ? "Neutron energy" : "", nameLocation: "middle", nameGap: 26 }))
  const yAxis: Record<string, unknown>[] = []
  if (showSigma) yAxis.push({ type: "log", gridIndex: 0, name: "σ (b)", nameTextStyle: { color: muted }, axisLabel: { color: muted, fontSize: 10 }, axisLine: { show: true, lineStyle: { color: rule } }, splitLine: { lineStyle: { color: rule, type: "dashed" } } })
  if (showRatio) yAxis.push({ type: "value", gridIndex: ratioGrid, name: "Measured / evaluated", scale: true, nameTextStyle: { color: muted }, axisLabel: { color: muted, fontSize: 10 }, axisLine: { show: true, lineStyle: { color: rule } }, splitLine: { lineStyle: { color: rule, type: "dashed" } } })

  const window = highlight ? { silent: true, itemStyle: { color: shade }, data: [[{ xAxis: highlight[0] }, { xAxis: highlight[1] }]] } : undefined
  const out: Record<string, unknown>[] = []
  const evalNames: string[] = []

  if (showSigma) {
    // The points, one series per dataset; not those in other units (σ√E) or excluded, which aren't barns.
    const off = offDatasets(points)
    const byDs = new Map<string, [number, number, number | null][]>()
    for (const r of points?.rows ?? []) {
      const id = String(r.dataset_id ?? "")
      if (off.has(id)) continue
      const e = Number(r.e_ev), y = Number(r.xs_b)
      if (!(e > 0) || !(y > 0)) continue
      byDs.set(id, [...(byDs.get(id) ?? []), [e, y, r.dxs_b == null ? null : Number(r.dxs_b)]])
    }
    const labels = labelsOf(points)
    for (const [id, pts] of byDs) {
      const l = labels.get(id)
      out.push({
        id: `exfor:${id}`,
        name: l?.author ? `${l.author}${l.year ? ` ${l.year}` : ""}` : id,
        type: "scatter",
        xAxisIndex: 0,
        yAxisIndex: 0,
        symbol: "circle",
        symbolSize: 8,
        itemStyle: { color: "transparent", borderColor: pointInk, borderWidth: 1 },
        emphasis: { focus: "series", itemStyle: { borderColor: ink, borderWidth: 1.5 } },
        data: pts,
        z: 2,
      })
    }
    // The evaluations, each with its band from the matching ratio series' relative sd.
    for (const s of series) {
      const c = colorOf(s)
      evalNames.push(s.name)
      const r = ratio.find((x) => x.name === s.name)
      const relAt = (e: number) => {
        if (!r?.lo || !r.x.length) return null
        let k = 0
        while (k < r.x.length - 1 && Math.abs(Math.log(r.x[k + 1] / e)) < Math.abs(Math.log(r.x[k] / e))) k++
        return r.hi![k] - 1
      }
      out.push({ id: `eval:${s.name}`, name: s.name, type: "line", xAxisIndex: 0, yAxisIndex: 0, showSymbol: false, lineStyle: { width: 2, color: c }, itemStyle: { color: c }, data: s.x.map((x, i) => [x, s.y[i]]), z: 3, ...(window && out.length === byDs.size ? { markArea: window } : {}) })
      const lo = s.lo ?? (r?.lo ? s.x.map((x, i) => { const d = relAt(x); return d === null ? s.y[i] : s.y[i] * (1 - d) }) : null)
      const hi = s.hi ?? (r?.hi ? s.x.map((x, i) => { const d = relAt(x); return d === null ? s.y[i] : s.y[i] * (1 + d) }) : null)
      if (lo && hi) {
        const stack = `band:${s.name}`
        out.push({ name: s.name, type: "line", xAxisIndex: 0, yAxisIndex: 0, stack, showSymbol: false, silent: true, lineStyle: { opacity: 0 }, data: s.x.map((x, i) => [x, lo[i]]), z: 1, tooltip: { show: false } })
        out.push({ name: s.name, type: "line", xAxisIndex: 0, yAxisIndex: 0, stack, showSymbol: false, silent: true, lineStyle: { opacity: 0 }, areaStyle: { color: rgba(c, 0.15) }, data: s.x.map((x, i) => [x, hi[i] - lo[i]]), z: 1, tooltip: { show: false } })
      }
    }
    if (window && !series.length) out.push({ type: "line", xAxisIndex: 0, yAxisIndex: 0, data: [], markArea: window })
  }

  if (showRatio) {
    // Three evaluations sit within a few percent of each other here: thin lines, a dash and a marker shape per slot, and a
    // faint band, so none hides another; the legend toggles each (window-3, brief 52 follow-up).
    const DASH = ["solid", [6, 4], [2, 3], [8, 3, 2, 3]]
    const SHAPE = ["circle", "triangle", "diamond", "rect"]
    let first = true
    for (const s of ratio) {
      const c = colorOf(s)
      const k = (slotOf.get(releaseOf(s)) ?? 0) % DASH.length
      if (!evalNames.includes(s.name)) evalNames.push(s.name)
      out.push({
        id: `ratio:${s.name}`,
        name: s.name,
        type: "line",
        xAxisIndex: ratioGrid,
        yAxisIndex: yAxis.length - 1,
        symbol: SHAPE[k],
        symbolSize: 6,
        lineStyle: { width: 1.5, color: c, type: DASH[k] },
        itemStyle: { color: c, borderColor: dark ? "#16181d" : "#ffffff", borderWidth: 1 },
        data: s.x.map((x, i) => [x, s.y[i]]),
        z: 3,
        ...(first
          ? { markLine: { silent: true, symbol: "none", lineStyle: { color: muted, type: "dashed", width: 1 }, label: { show: false }, data: [{ yAxis: 1 }] }, ...(window ? { markArea: window } : {}) }
          : {}),
      })
      first = false
      if (s.lo && s.hi) {
        const stack = `ratio-band:${s.name}`
        out.push({ name: s.name, type: "line", xAxisIndex: ratioGrid, yAxisIndex: yAxis.length - 1, stack, step: "middle", showSymbol: false, silent: true, lineStyle: { opacity: 0 }, data: s.x.map((x, i) => [x, s.lo![i]]), z: 1, tooltip: { show: false } })
        out.push({ name: s.name, type: "line", xAxisIndex: ratioGrid, yAxisIndex: yAxis.length - 1, stack, step: "middle", showSymbol: false, silent: true, lineStyle: { opacity: 0 }, areaStyle: { color: rgba(c, 0.08) }, data: s.x.map((x, i) => [x, s.hi![i] - s.lo![i]]), z: 1, tooltip: { show: false } })
      }
    }
  }

  const datasetNames = out.filter((s) => String(s.id ?? "").startsWith("exfor:")).map((s) => String(s.name))
  return {
    backgroundColor: "transparent",
    animation: false,
    grid: grids,
    xAxis,
    yAxis,
    axisPointer: { link: [{ xAxisIndex: "all" }] },
    dataZoom: [{ type: "inside", xAxisIndex: grids.map((_, i) => i), filterMode: "none" }],
    legend: [
      { data: evalNames, top: 4, left: 64, textStyle: { color: ink, fontSize: 11 }, itemWidth: 22, itemHeight: 8 },
      ...(datasetNames.length ? [{ data: datasetNames, type: "scroll", orient: "vertical", right: 4, top: 36, bottom: 40, width: 140, textStyle: { color: muted, fontSize: 10 }, icon: "circle", itemWidth: 8, itemHeight: 8, pageTextStyle: { color: muted } }] : []),
    ],
    tooltip: {
      trigger: "item",
      formatter: (p: { seriesId?: string; seriesName: string; value: [number, number, number | null] }) => {
        const [e, y, dy] = p.value
        // The band's method under an evaluation's or a ratio's value: MF33, or File 32 where MF33 is empty.
        const bm = ratio.find((r) => r.name === p.seriesName)?.meta?.band_method
        const band = typeof bm === "string" ? `<br/>band: ${bandMethodText(bm)}` : ""
        if (String(p.seriesId).startsWith("ratio:")) return `${p.seriesName}<br/>${energyLabel(e)}: measured / evaluated ${y.toFixed(3)}${band}`
        if (String(p.seriesId).startsWith("eval:")) return `${p.seriesName}<br/>${energyLabel(e)}: ${y.toPrecision(4)} b${band}`
        const ds = datasetOfSeries(p.seriesId)
        return `${p.seriesName}${ds ? ` · ${ds}` : ""}<br/>${energyLabel(e)}: ${y.toPrecision(4)} b${dy ? ` ± ${Number(dy).toPrecision(2)}` : ""}`
      },
    },
    series: out,
  }
}
