"use client"

import * as React from "react"
import { FlaskConical, List } from "lucide-react"
import { useParams, useRouter } from "next/navigation"
import { useSwitchboard } from "@/components/SwitchboardPanel"
import { Verdict, yieldText } from "@/components/sweep/MedicalPage"
import { EChartLegend } from "@/components/viz/EChartLegend"
import { useEChart } from "@/components/viz/use-echart"
import { VizControls, VizSection } from "@/components/viz/VizControls"
import { labHref } from "@/lib/lab/canvases/from-pair"
import { RELEASE_SLOT, SLOTS, energyLabel } from "@/lib/lab/canvases/plot"
import { PageTitle } from "@/lib/page-title"
import { fetchRoute, halfLifeText, type MedDetail } from "@/lib/sweep-medical"

// /sweep/medical/[route] (brief 58, Part D.2, 2026-11-10): one production route. The chart, log-log: the EXFOR points,
// hollow in the paper's ink, each naming its dataset; each evaluation's curve in its release's colour (the Lab's slots);
// the IAEA recommended curve, dashed, where held; its legend in the right panel as the charts' legends are. Beneath: the
// yields per source, the verdict and its numbers, the chain, the assumptions, the stopping-power check where it ran, and
// Open in the Lab with the route's pair. A generator shows its chain and half-lives and no chart.

const MONO = { fontFamily: "var(--font-mono), ui-monospace, monospace" } as const
const TH = "whitespace-nowrap px-2 py-2 text-left text-[11px] font-normal text-[var(--paper-faint)]"
const TD = "whitespace-nowrap px-2 py-1.5"
const BTN = "flex items-center gap-1.5 rounded-full border border-[var(--paper-rule)]/30 px-2.5 py-0.5 text-[12px] text-[var(--paper-muted)] transition-colors hover:bg-[var(--paper-quiet)]"
const isDark = () => typeof document !== "undefined" && document.documentElement.classList.contains("dark")

function routeOption(d: MedDetail, dark: boolean) {
  const ink = dark ? "#f0e9d8" : "#16181d"
  const muted = dark ? "rgba(240,233,216,0.58)" : "rgba(22,24,29,0.58)"
  const rule = dark ? "rgba(240,233,216,0.14)" : "rgba(22,24,29,0.12)"
  const slots = dark ? SLOTS.dark : SLOTS.light
  const series = d.series.map((s) => {
    if (s.kind === "exfor")
      return { id: `exfor:${s.source}`, name: s.label, type: "scatter", symbolSize: 5, itemStyle: { color: "transparent", borderColor: ink, borderWidth: 1, opacity: 0.75 }, data: s.points.map((p) => ({ value: [p.e_ev, p.xs_b], name: p.dataset ?? "" })), z: 2 }
    if (s.kind === "iaea") return { id: `iaea:${s.source}`, name: s.label, type: "line", showSymbol: false, lineStyle: { width: 2, type: "dashed", color: ink }, itemStyle: { color: ink }, data: s.points.map((p) => [p.e_ev, p.xs_b]), z: 3 }
    const c = slots[RELEASE_SLOT[s.source] ?? 7]
    return { id: `eval:${s.source}`, name: s.label, type: "line", showSymbol: false, lineStyle: { width: 2, color: c }, itemStyle: { color: c }, data: s.points.map((p) => [p.e_ev, p.xs_b]), z: 3 }
  })
  return {
    backgroundColor: "transparent",
    animation: false,
    grid: { left: 60, right: 20, top: 16, bottom: 44 },
    legend: { show: false, data: d.series.map((s) => s.label) },
    tooltip: {
      formatter: (p: { seriesName?: string; name?: string; value?: number[] }) => {
        const [e, y] = p.value ?? []
        return `${p.seriesName}${p.name ? ` ${p.name}` : ""}<br/>${energyLabel(e)}: ${+y.toPrecision(3)} b`
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
      {r && <PageTitle title={r.decay_only ? `${r.product} generator` : `${r.product} from ${r.label}`} />}
      <div className="mx-auto max-w-[1000px] px-5 py-5">
        {d?.sample && <p className="m-0 mb-3 text-[12px] text-[var(--paper-faint)]">Sample rows: the medical routes&apos; route isn&apos;t answering yet.</p>}
        {!d || !r ? (
          <p className="text-[var(--paper-muted)]">Loading…</p>
        ) : r.decay_only ? (
          <div className="flex flex-col gap-3 text-[15px] leading-relaxed">
            <p className="m-0">{r.chain || `${r.product} comes from the decay of its parent.`}</p>
            <p className="m-0 text-[13px] text-[var(--paper-muted)]">
              {r.parent_half_life_s !== null && `Parent half-life ${halfLifeText(r.parent_half_life_s)}. `}
              {r.product_half_life_s !== null && `${r.product} half-life ${halfLifeText(r.product_half_life_s)}. `}
              No cross section enters this route.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <p className="m-0 text-[12px] text-[var(--paper-muted)]">
                {r.irradiation}
                {r.chain ? ` · ${r.chain}` : ""}
              </p>
              <span className="flex items-center gap-2">
                {d.series.length > 0 && (
                  <button type="button" onClick={openVizControls} className={BTN}>
                    <List className="h-3.5 w-3.5" />
                    Legend
                  </button>
                )}
                {d.lab && (
                  <button type="button" onClick={() => router.push(labHref(d.lab!))} className={BTN}>
                    <FlaskConical className="h-3.5 w-3.5" />
                    Open in the Lab
                  </button>
                )}
              </span>
            </div>
            {d.series.length > 0 ? <RouteChart d={d} /> : <p className="text-[var(--paper-muted)]">No cross section is drawn for this route.</p>}
            <div className="mt-5 overflow-x-auto">
              <table className="w-full border-collapse" style={MONO}>
                <thead>
                  <tr>
                    <th className={TH}>Source</th>
                    <th className={`${TH} text-right`}>Yield</th>
                    <th className={TH}>Unit</th>
                    <th className={`${TH} text-right`}>MF33 sd</th>
                    <th className={TH}>From</th>
                    <th className={TH}>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {d.yields.map((y) => (
                    <tr key={y.source} className="border-t border-[var(--paper-rule)]/10 align-top">
                      <td className={TD}>{y.source}</td>
                      <td className={`${TD} text-right tabular-nums`}>{y.held ? yieldText(y.value) : "—"}</td>
                      <td className="px-2 py-1.5 text-[11px] text-[var(--paper-muted)]">{y.held ? y.unit || "—" : ""}</td>
                      <td className={`${TD} text-right tabular-nums`}>{y.rel_sd === null ? "—" : `${(y.rel_sd * 100).toFixed(1)}%`}</td>
                      <td className={TD}>{y.from || "—"}</td>
                      <td className="px-2 py-1.5 text-[var(--paper-muted)]">{y.note || ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-5 flex flex-col gap-3 text-[14px] leading-relaxed">
              <p className="m-0 flex flex-wrap items-center gap-2">
                <Verdict r={r} />
                {r.verdict_detail && <span>{r.verdict_detail}</span>}
              </p>
              {r.assumptions && <p className="m-0 text-[12px] text-[var(--paper-muted)]">Assumed: {r.assumptions}.</p>}
              {r.stopping_check !== null && (
                <p className="m-0 text-[12px] text-[var(--paper-muted)]">
                  Stopping-power check: my yield over the IAEA&apos;s recommended curve is {r.stopping_check.toFixed(3)} of the IAEA&apos;s own published yield.
                </p>
              )}
              {r.iaea && r.iaea !== "held" && r.iaea !== "not applicable" && <p className="m-0 text-[12px] text-[var(--paper-muted)]">IAEA curve: {r.iaea}.</p>}
              {r.note && <p className="m-0 text-[12px] text-[var(--paper-muted)]">{r.note}</p>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
