"use client"

import * as React from "react"
import { FlaskConical, List } from "lucide-react"
import { useSwitchboard } from "@/components/SwitchboardPanel"
import { useParams, useRouter } from "next/navigation"
import { Verdict, yieldText } from "@/components/sweep/MedicalPage"
import { EChartLegend } from "@/components/viz/EChartLegend"
import { useEChart } from "@/components/viz/use-echart"
import { VizControls, VizSection } from "@/components/viz/VizControls"
import { labHref } from "@/lib/lab/canvases/from-pair"
import { RELEASE_SLOT, SLOTS, energyLabel } from "@/lib/lab/canvases/plot"
import { PageTitle } from "@/lib/page-title"
import { fetchRoute, type MedDetail } from "@/lib/sweep-medical"

// /sweep/medical/[route] (brief 58, Part D.2, 2026-11-10): one production route. The chart, log-log: the EXFOR points
// by dataset, hollow in the paper's ink; each evaluation's curve in its release's colour (the Lab's slots); the IAEA
// recommended curve, dashed, where held; its legend in the right panel as the charts' legends are. Beneath: the yield
// table, the verdict sentence, the chain where the product is a daughter, Open in the Lab with the route's pair, and the
// method paragraph. A decay-only route (a generator) shows the parent and its half-life and no chart.

const MONO = { fontFamily: "var(--font-mono), ui-monospace, monospace" } as const
const TH = "whitespace-nowrap px-2 py-2 text-left text-[11px] font-normal text-[var(--paper-faint)]"
const TD = "whitespace-nowrap px-2 py-1.5"
const isDark = () => typeof document !== "undefined" && document.documentElement.classList.contains("dark")

function routeOption(d: MedDetail, dark: boolean) {
  const ink = dark ? "#f0e9d8" : "#16181d"
  const muted = dark ? "rgba(240,233,216,0.58)" : "rgba(22,24,29,0.58)"
  const rule = dark ? "rgba(240,233,216,0.14)" : "rgba(22,24,29,0.12)"
  const slots = dark ? SLOTS.dark : SLOTS.light
  let free = 0
  const used = new Set(Object.values(RELEASE_SLOT))
  const colourOf = (release: string) => {
    if (release in RELEASE_SLOT) return slots[RELEASE_SLOT[release]]
    while (used.has(free) && free < slots.length - 1) free++
    used.add(free)
    return slots[free]
  }
  const series = d.series.map((s) => {
    const data = s.points.map((p) => [p.e_ev, p.xs_b])
    if (s.kind === "exfor")
      return { id: `exfor:${s.source}`, name: s.label, type: "scatter", symbolSize: 5, itemStyle: { color: "transparent", borderColor: ink, borderWidth: 1, opacity: 0.75 }, data, z: 2 }
    if (s.kind === "iaea") return { id: `iaea:${s.source}`, name: s.label, type: "line", showSymbol: false, lineStyle: { width: 2, type: "dashed", color: ink }, itemStyle: { color: ink }, data, z: 3 }
    const c = colourOf(s.source)
    return { id: `eval:${s.source}`, name: s.label, type: "line", showSymbol: false, lineStyle: { width: 2, color: c }, itemStyle: { color: c }, data, z: 3 }
  })
  return {
    backgroundColor: "transparent",
    animation: false,
    grid: { left: 60, right: 20, top: 16, bottom: 44 },
    legend: { show: false, data: d.series.map((s) => s.label) },
    tooltip: {
      formatter: (p: { seriesName?: string; value?: number[] }) => {
        const [e, y] = p.value ?? []
        return `${p.seriesName}<br/>${energyLabel(e)}: ${+y.toPrecision(3)} b`
      },
    },
    xAxis: { type: "log", name: "Energy", nameLocation: "middle", nameGap: 26, nameTextStyle: { color: muted }, axisLabel: { color: muted, fontSize: 10, formatter: energyLabel }, axisLine: { lineStyle: { color: rule } }, splitLine: { show: false } },
    yAxis: { type: "log", name: "σ (b)", nameTextStyle: { color: muted }, axisLabel: { color: muted, fontSize: 10 }, axisLine: { show: true, lineStyle: { color: rule } }, splitLine: { lineStyle: { color: rule, type: "dashed" } } },
    dataZoom: [{ type: "inside", xAxisIndex: 0, filterMode: "none" }],
    series,
  }
}

function RouteChart({ d }: { d: MedDetail }) {
  const dRef = React.useRef(d)
  dRef.current = d
  const ref = useEChart(async () => null, () => routeOption(dRef.current, isDark()), false, undefined, { onPick: () => {}, marks: true })
  return (
    <>
      <div ref={ref} className="h-[360px] w-full" />
      <VizControls>
        <VizSection>
          <EChartLegend chart={ref} />
        </VizSection>
      </VizControls>
    </>
  )
}

export function MedicalRoute() {
  const params = useParams<{ route: string }>()
  const id = decodeURIComponent(String(params?.route ?? ""))
  const [d, setD] = React.useState<MedDetail | null>(null)
  const router = useRouter()
  const { openVizControls } = useSwitchboard()
  React.useEffect(() => {
    if (!id) return
    let on = true
    setD(null)
    void fetchRoute(id).then((x) => on && setD(x))
    return () => {
      on = false
    }
  }, [id])
  const r = d?.route
  return (
    <div className="min-h-0 flex-1 overflow-y-auto text-[13px] text-[var(--paper-text)]">
      {r && <PageTitle title={r.decay_only ? `${r.product} from ${r.parent ?? "its parent"}` : `${r.product} from ${r.label}`} />}
      <div className="mx-auto max-w-[1000px] px-5 py-5">
        {d?.sample && <p className="m-0 mb-3 text-[12px] text-[var(--paper-faint)]">Sample rows: the medical routes&apos; route isn&apos;t answering yet.</p>}
        {!d || !r ? (
          <p className="text-[var(--paper-muted)]">Loading…</p>
        ) : r.decay_only ? (
          <p className="m-0 text-[15px] leading-relaxed">
            {r.product} comes from the decay of {r.parent ?? "its parent"}
            {r.half_life ? `, whose half-life is ${r.half_life} (ICRP 107)` : ""}. No cross section enters this route.
          </p>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <p className="m-0 text-[12px] text-[var(--paper-muted)]">{r.irradiation}</p>
              <span className="flex items-center gap-2">
              {d.series.length > 0 && (
                <button type="button" onClick={openVizControls} className="flex items-center gap-1.5 rounded-full border border-[var(--paper-rule)]/30 px-2.5 py-0.5 text-[12px] text-[var(--paper-muted)] transition-colors hover:bg-[var(--paper-quiet)]">
                  <List className="h-3.5 w-3.5" />
                  Legend
                </button>
              )}
              {d.lab && (
                <button
                  type="button"
                  onClick={() => router.push(labHref(d.lab!))}
                  className="flex items-center gap-1.5 rounded-full border border-[var(--paper-rule)]/30 px-2.5 py-0.5 text-[12px] transition-colors hover:bg-[var(--paper-quiet)]"
                >
                  <FlaskConical className="h-3.5 w-3.5" />
                  Open in the Lab
                </button>
              )}
              </span>
            </div>
            {d.series.length > 0 ? <RouteChart d={d} /> : <p className="text-[var(--paper-muted)]">No cross section is held for this route.</p>}
            <div className="mt-5 overflow-x-auto">
              <table className="w-full border-collapse" style={MONO}>
                <thead>
                  <tr>
                    <th className={TH}>Evaluation</th>
                    <th className={`${TH} text-right`}>Yield</th>
                    <th className={`${TH} text-right`}>Uncertainty</th>
                    <th className={TH}>Method</th>
                  </tr>
                </thead>
                <tbody>
                  {r.yields.map((y) => (
                    <tr key={y.source} className="border-t border-[var(--paper-rule)]/10">
                      <td className={TD}>{y.source}</td>
                      <td className={`${TD} text-right tabular-nums`}>
                        {yieldText(y.value)} <span className="text-[var(--paper-faint)]">{y.unit}</span>
                      </td>
                      <td className={`${TD} text-right tabular-nums`}>{y.sd === null ? "—" : yieldText(y.sd)}</td>
                      <td className={TD}>{y.method || "—"}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-[var(--paper-rule)]/10">
                    <td className={TD}>Data</td>
                    <td className={`${TD} text-right tabular-nums`}>{yieldText(r.data_yield)}</td>
                    <td className={`${TD} text-right tabular-nums`}>{r.data_spread === null ? "—" : `${(r.data_spread * 100).toFixed(0)}%`}</td>
                    <td className={TD}>the measurements against the best evaluation</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="mt-5 flex flex-col gap-3 text-[14px] leading-relaxed">
              <p className="m-0 flex flex-wrap items-center gap-2">
                <Verdict r={r} />
                <span>{d.verdict_text}</span>
              </p>
              {d.chain && <p className="m-0 text-[var(--paper-muted)]">{d.chain}</p>}
              {d.method && <p className="m-0 text-[12px] text-[var(--paper-muted)]">{d.method}</p>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
