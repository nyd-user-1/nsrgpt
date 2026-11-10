"use client"

import * as React from "react"
import Link from "next/link"
import { fetchMedical, type MedList, type MedRoute } from "@/lib/sweep-medical"

// /sweep/medical (brief 58, Part D, 2026-11-10): the production routes for the medical isotopes (brief 57, Part D), each
// route's yield from every evaluation and from the data, the spread across evaluations, and the verdict, sorted by the
// spread. A row opens the route's page. Generators (decay only) show the parent and its half-life. Every number from
// GET /sweep/medical; until it answers, the sample in lib/sweep-medical.ts, and the page says so.

const MONO = { fontFamily: "var(--font-mono), ui-monospace, monospace" } as const
const TH = "whitespace-nowrap px-2 py-2 text-left text-[11px] font-normal text-[var(--paper-faint)]"
const TD = "whitespace-nowrap px-2 py-1.5"

/** A yield to three significant figures. */
export const yieldText = (v: number | null) => (v === null || !Number.isFinite(v) ? "—" : v >= 1000 ? Math.round(v).toLocaleString("en") : String(+v.toPrecision(3)))

/** The verdict as a tinted pill: agree, or disagree beyond the data. */
export function Verdict({ r }: { r: MedRoute }) {
  if (r.agree === null) return <span className="text-[var(--paper-faint)]">—</span>
  return r.agree ? (
    <span className="rounded-full bg-[var(--paper-quiet)] px-2 py-0.5 text-[11px] text-[var(--paper-muted)]">agree</span>
  ) : (
    <span className="rounded-full bg-[color-mix(in_oklab,var(--pax2-red)_14%,var(--paper))] px-2 py-0.5 text-[11px] text-[var(--pax2-red)]">disagree beyond the data</span>
  )
}

export function MedicalPage() {
  const [list, setList] = React.useState<MedList | null>(null)
  React.useEffect(() => {
    void fetchMedical().then(setList)
  }, [])
  const routes = React.useMemo(() => [...(list?.routes ?? [])].sort((a, b) => (b.spread_pct ?? -1) - (a.spread_pct ?? -1)), [list])
  // One column per evaluation any route holds, in the order they first appear.
  const sources = React.useMemo(() => [...new Set(routes.flatMap((r) => r.yields.map((y) => y.source)))], [routes])
  return (
    <div className="min-h-0 flex-1 overflow-y-auto text-[13px] text-[var(--paper-text)]">
      <div className="px-5 py-5">
        {list?.sample && <p className="m-0 mb-3 text-[12px] text-[var(--paper-faint)]">Sample rows: the medical routes&apos; route isn&apos;t answering yet.</p>}
        {!list ? (
          <p className="text-[var(--paper-muted)]">Loading…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={MONO}>
              <thead>
                <tr>
                  <th className={TH}>Product</th>
                  <th className={TH}>Route</th>
                  <th className={TH}>Irradiation</th>
                  {sources.map((s) => (
                    <th key={s} className={`${TH} text-right`}>{s}</th>
                  ))}
                  <th className={`${TH} text-right`}>Data</th>
                  <th className={`${TH} text-right`}>Spread</th>
                  <th className={TH}>Verdict</th>
                </tr>
              </thead>
              <tbody>
                {routes.map((r) => {
                  const unit = r.yields.find((y) => y.unit)?.unit || list.unit
                  return (
                    <tr key={r.route} className="border-t border-[var(--paper-rule)]/10 hover:bg-[var(--paper-quiet)]">
                      <td className={TD}>{r.product}</td>
                      <td className={TD}>
                        <Link href={`/sweep/medical/${encodeURIComponent(r.route)}`} className="underline decoration-[var(--paper-rule)]/30 underline-offset-2 hover:decoration-[var(--paper-text)]">
                          {r.label}
                        </Link>
                      </td>
                      <td className={TD}>{r.decay_only ? `decay${r.parent ? ` of ${r.parent}` : ""}${r.half_life ? `, T½ ${r.half_life}` : ""}` : r.irradiation}</td>
                      {sources.map((s) => {
                        const y = r.yields.find((x) => x.source === s)
                        return (
                          <td key={s} className={`${TD} text-right tabular-nums`} title={y && unit ? unit : undefined}>
                            {y ? yieldText(y.value) : "—"}
                          </td>
                        )
                      })}
                      <td className={`${TD} text-right tabular-nums`} title={unit || undefined}>
                        {yieldText(r.data_yield)}
                        {r.data_spread !== null && <span className="text-[var(--paper-faint)]"> ±{(r.data_spread * 100).toFixed(0)}%</span>}
                      </td>
                      <td className={`${TD} text-right tabular-nums`}>{r.spread_pct === null ? "—" : `${r.spread_pct.toFixed(0)}%`}</td>
                      <td className={TD}>
                        <Verdict r={r} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {list.unit && <p className="mt-3 text-[11px] text-[var(--paper-faint)]">Yields in {list.unit} unless a cell&apos;s title says otherwise.</p>}
          </div>
        )}
      </div>
    </div>
  )
}
