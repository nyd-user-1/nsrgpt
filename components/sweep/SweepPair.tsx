"use client"

import * as React from "react"
import Link from "next/link"
import { FlaskConical } from "lucide-react"
import { useSearchParams } from "next/navigation"
import { useShellPanel } from "@/components/shell"
import { reactionText } from "@/components/sweep/SweepPage"
import { Pills } from "@/components/viz/Pills"
import { useEChart } from "@/components/viz/use-echart"
import { ChartBox } from "@/components/viz/chart-kebab"
import { labHref } from "@/lib/lab/canvases/from-pair"
import { RELEASE_SLOT, SLOTS, energyLabel, exforHref } from "@/lib/lab/canvases/plot"
import { evText, fetchPair, pctText, type PairRelease, type SweepPair } from "@/lib/sweep"

// /sweep/pair (brief 58, Part C.1, 2026-11-10): one sweep pair, as a /sweep row opens it in the second panel. The bins as
// a ratio chart in the Lab's plot style (lib/lab/canvases/plot.ts): each dataset measured over evaluated, hollow in the
// paper's ink, as its points where the route gives them, else as its mean ratio across its energy span; the evaluation's MF33 band 1 ± sd in its colour at low alpha; the bin means in its
// colour; a rule at 1. Beneath, the per-dataset table, each subentry linking to its record, and Open in the Lab, which
// opens the pair's canvas (lib/lab/canvases/from-pair.ts) in the main panel.

const MONO = { fontFamily: "var(--font-mono), ui-monospace, monospace" } as const
const TH = "whitespace-nowrap px-2 py-2 text-left text-[11px] font-normal text-[var(--paper-faint)]"
const TD = "whitespace-nowrap px-2 py-1.5"
const LINK = "underline decoration-[var(--paper-rule)]/30 underline-offset-2 hover:decoration-[var(--paper-text)]"

const isDark = () => typeof document !== "undefined" && document.documentElement.classList.contains("dark")
const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

function ratioOption(rel: PairRelease, dark: boolean) {
  const ink = dark ? "#f0e9d8" : "#16181d"
  const muted = dark ? "rgba(240,233,216,0.58)" : "rgba(22,24,29,0.58)"
  const rule = dark ? "rgba(240,233,216,0.14)" : "rgba(22,24,29,0.12)"
  const c = (dark ? SLOTS.dark : SLOTS.light)[RELEASE_SLOT[rel.release] ?? 0]
  const bins = rel.bins.filter((b) => b.e_lo > 0 && b.e_hi > 0)
  // The band: one rectangle per bin, from its lower edge to its upper, 1 ± the evaluation's relative sd.
  const band = bins.filter((b) => b.rel_sd_eval !== null).map((b) => [{ xAxis: b.e_lo, yAxis: 1 - b.rel_sd_eval! }, { xAxis: b.e_hi, yAxis: 1 + b.rel_sd_eval! }])
  const name = (d: PairRelease["datasets"][number]) => [d.author, d.year].filter(Boolean).join(" ") || d.dataset
  const series: Record<string, unknown>[] = rel.datasets.flatMap((d): Record<string, unknown>[] => {
    if (d.points.length)
      return [{ id: `exfor:${d.dataset}`, name: name(d), type: "scatter", symbol: "circle", symbolSize: 5, itemStyle: { color: "transparent", borderColor: ink, borderWidth: 1, opacity: 0.7 }, data: d.points, z: 2 }]
    // The route gives each dataset's mean over its span: a thin ink segment at that ratio, a hollow dot at each end.
    if (d.mean_log_ratio === null || d.e_min === null || d.e_max === null || d.e_min <= 0) return []
    const y = Math.exp(d.mean_log_ratio)
    const ends = d.e_max > d.e_min ? [[d.e_min, y], [d.e_max, y]] : [[d.e_min, y]]
    return [{ id: `exfor:${d.dataset}`, name: name(d), type: "line", symbol: "circle", symbolSize: 4, lineStyle: { width: 1, color: ink, opacity: 0.45 }, itemStyle: { color: "transparent", borderColor: ink, borderWidth: 1, opacity: 0.7 }, data: ends, z: 2 }]
  })
  series.push({
    id: `bins:${rel.release}`,
    name: rel.release,
    type: "line",
    symbol: "rect",
    symbolSize: 7,
    lineStyle: { width: 2, color: c },
    itemStyle: { color: c },
    data: bins.filter((b) => b.mean_log_ratio !== null).map((b) => [b.e_mid, Math.exp(b.mean_log_ratio!)]),
    markLine: { silent: true, symbol: "none", lineStyle: { color: muted, type: "dashed", width: 1 }, label: { show: false }, data: [{ yAxis: 1 }] },
    ...(band.length ? { markArea: { silent: true, itemStyle: { color: rgba(c, 0.15) }, data: band } } : {}),
    z: 3,
  })
  // The energy axis spans the bins and the datasets, to whole decades (left to itself, a log axis ran from 1e-10 eV).
  const es = [...bins.flatMap((b) => [b.e_lo, b.e_hi]), ...rel.datasets.flatMap((d) => [d.e_min ?? NaN, d.e_max ?? NaN, ...d.points.map((p) => p[0])])].filter((e) => Number.isFinite(e) && e > 0)
  const span = es.length ? { min: 10 ** Math.floor(Math.log10(Math.min(...es))), max: 10 ** Math.ceil(Math.log10(Math.max(...es))) } : {}
  return {
    backgroundColor: "transparent",
    animation: false,
    grid: { left: 56, right: 20, top: 16, bottom: 44 },
    tooltip: {
      formatter: (p: { seriesId?: string; seriesName?: string; value?: number[] }) => {
        const [e, y] = p.value ?? []
        if (String(p.seriesId).startsWith("bins:")) return `${p.seriesName}, bin mean<br/>${energyLabel(e)}: measured / evaluated ${y.toFixed(3)}`
        return `${p.seriesName}<br/>${energyLabel(e)}: measured / evaluated ${y.toFixed(3)}`
      },
    },
    xAxis: { type: "log", ...span, name: "Energy", nameLocation: "middle", nameGap: 26, nameTextStyle: { color: muted }, axisLabel: { color: muted, fontSize: 10, formatter: energyLabel }, axisLine: { lineStyle: { color: rule } }, splitLine: { show: false } },
    yAxis: { type: "value", name: "Measured / evaluated", scale: true, nameTextStyle: { color: muted }, axisLabel: { color: muted, fontSize: 10 }, axisLine: { show: true, lineStyle: { color: rule } }, splitLine: { lineStyle: { color: rule, type: "dashed" } } },
    dataZoom: [{ type: "inside", xAxisIndex: 0, filterMode: "none" }],
    series,
  }
}

function RatioChart({ rel }: { rel: PairRelease }) {
  const relRef = React.useRef(rel)
  relRef.current = rel
  const version = React.useRef(0)
  const last = React.useRef<PairRelease | null>(null)
  if (last.current !== rel) {
    version.current += 1
    last.current = rel
  }
  const ref = useEChart(
    async () => null,
    () => ratioOption(relRef.current, isDark()),
    false,
    undefined,
    { view: version.current, replace: true, onPick: () => {}, marks: true },
  )
  return <ChartBox chart={ref} className="h-[340px] w-full" />
}

export function SweepPairView() {
  const params = useSearchParams()
  const target = params.get("target") ?? ""
  const mt = Number(params.get("mt")) || 0
  const sub = params.get("sub") || "neutrons"
  const releases = (params.get("release") ?? "B-VIII.1").split(",").filter(Boolean)
  const key = `${target}|${mt}|${sub}|${releases.join(",")}`
  const [pair, setPair] = React.useState<SweepPair | null>(null)
  const [shown, setShown] = React.useState<string | null>(null)
  const { goTo } = useShellPanel()
  React.useEffect(() => {
    if (!target || !mt) return
    let on = true
    setPair(null)
    void fetchPair(target, mt, sub, releases).then((p) => {
      if (!on) return
      setPair(p)
      setShown(p.releases[0]?.release ?? null)
    })
    return () => {
      on = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  if (!target || !mt) return <p className="p-5 text-[13px] text-[var(--paper-muted)]">Open a pair from the sweep.</p>
  const rel = pair?.releases.find((r) => r.release === shown) ?? pair?.releases[0]
  const bins = rel?.bins ?? []
  // The route's own Lab pair (its reaction the EXFOR field the Lab's Data block takes), else one built from the bins.
  const lab = pair?.lab ?? {
    target,
    reaction: pair?.reaction?.replace(/^\(|\)$/g, "").toUpperCase() || "",
    mt,
    emin: bins.length ? Math.min(...bins.map((b) => b.e_lo)) : undefined,
    emax: bins.length ? Math.max(...bins.map((b) => b.e_hi)) : undefined,
    releases: pair?.releases.map((r) => r.release) ?? releases,
    sub,
  }
  const neutrons = sub === "neutrons"
  return (
    <div className="min-h-0 flex-1 overflow-y-auto text-[13px] text-[var(--paper-text)]">
      <div className="px-5 py-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <p className="m-0 text-[15px]" style={MONO}>
            {target} {reactionText(pair?.reaction ?? "")} <span className="text-[var(--paper-faint)]">MT {mt}{neutrons ? "" : ` · ${sub}`}</span>
          </p>
          <button
            type="button"
            disabled={!lab.reaction}
            onClick={() => goTo(labHref({ ...lab, sub: lab.sub ?? sub }), "main")}
            className="flex items-center gap-1.5 rounded-full border border-[var(--paper-rule)]/30 px-2.5 py-0.5 text-[12px] transition-colors hover:bg-[var(--paper-quiet)] disabled:opacity-35"
          >
            <FlaskConical className="h-3.5 w-3.5" />
            Open in the Lab
          </button>
        </div>
        {pair?.sample && <p className="m-0 mb-3 text-[12px] text-[var(--paper-faint)]">Sample rows: the sweep&apos;s route isn&apos;t answering yet.</p>}
        {!pair ? (
          <p className="text-[var(--paper-muted)]">Loading…</p>
        ) : !rel ? (
          <p className="text-[var(--paper-muted)]">No comparison is held for this pair.</p>
        ) : (
          <>
            {pair.releases.length > 1 && (
              <Pills className="mb-2" options={pair.releases.map((r) => ({ id: r.release, label: r.release }))} value={rel.release} onChange={setShown} />
            )}
            <RatioChart rel={rel} />
            <div className="mt-4 overflow-x-auto">
              <table className="w-full border-collapse" style={MONO}>
                <thead>
                  <tr>
                    <th className={TH}>Dataset</th>
                    <th className={TH}>Author</th>
                    <th className={`${TH} text-right`}>Year</th>
                    <th className={`${TH} text-right`}>Points</th>
                    <th className={`${TH} text-right`}>Off {rel.release}</th>
                    <th className={`${TH} text-right`}>±</th>
                  </tr>
                </thead>
                <tbody>
                  {[...rel.datasets].sort((a, b) => Math.abs(b.mean_log_ratio ?? 0) - Math.abs(a.mean_log_ratio ?? 0)).map((d) => (
                    <tr key={d.dataset} className="border-t border-[var(--paper-rule)]/10">
                      <td className={TD}>
                        <Link href={exforHref(d.dataset)} className={LINK}>{d.dataset}</Link>
                      </td>
                      <td className={TD}>{d.author || "—"}</td>
                      <td className={`${TD} text-right tabular-nums`}>{d.year ?? "—"}</td>
                      <td className={`${TD} text-right tabular-nums`}>{d.n}</td>
                      <td className={`${TD} text-right tabular-nums`}>{pctText(d.mean_log_ratio)}</td>
                      <td className={`${TD} text-right tabular-nums`}>{d.se === null ? "—" : `${(d.se * 100).toFixed(1)}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {bins.length > 0 && (
              <p className="mt-3 text-[11px] text-[var(--paper-faint)]">
                {bins.length} bins from {evText(lab.emin ?? null)} to {evText(lab.emax ?? null)}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
