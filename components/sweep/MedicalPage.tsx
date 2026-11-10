"use client"

import * as React from "react"
import Link from "next/link"
import { RELEASES, fetchMedical, halfLifeText, type MedList, type MedRoute } from "@/lib/sweep-medical"

// /sweep/medical (brief 58, Part D, 2026-11-10): the production routes for the medical isotopes (brief 57, Part D), each
// route's yield from every evaluation, the IAEA's curve and the data, the spread across evaluations, and the verdict,
// sorted by the spread. A row opens the route's page. Generators (decay only) show their chain and the parent's
// half-life. Every number from GET /sweep/medical; until it answers, the sample in lib/sweep-medical.ts, and the page
// says so.

const MONO = { fontFamily: "var(--font-mono), ui-monospace, monospace" } as const
const TH = "whitespace-nowrap px-2 py-2 text-left text-[11px] font-normal text-[var(--paper-faint)]"
const TD = "whitespace-nowrap px-2 py-1.5"

/** A yield to three significant figures; past a million (a reactor route's atoms per gram per hour), as 1.19e12. */
export const yieldText = (v: number | null) =>
  v === null || !Number.isFinite(v) ? "—" : Math.abs(v) >= 1e6 ? v.toExponential(2).replace("e+", "e") : v >= 1000 ? Math.round(v).toLocaleString("en") : String(+v.toPrecision(3))

/** The verdict: agree or disagree beyond the data as a tinted pill; any other verdict (no data, one evaluation, not held
 *  as a cross section) as plain text. */
export function Verdict({ r }: { r: MedRoute }) {
  if (r.agree === true) return <span className="whitespace-nowrap rounded-full bg-[var(--paper-quiet)] px-2 py-0.5 text-[11px] text-[var(--paper-muted)]">agree</span>
  if (r.agree === false)
    return <span className="whitespace-nowrap rounded-full bg-[color-mix(in_oklab,var(--pax2-red)_14%,var(--paper))] px-2 py-0.5 text-[11px] text-[var(--pax2-red)]">disagree beyond the data</span>
  return <span className="text-[11px] text-[var(--paper-faint)]">{r.verdict || "—"}</span>
}

export function MedicalPage() {
  const [list, setList] = React.useState<MedList | null>(null)
  React.useEffect(() => {
    void fetchMedical().then(setList)
  }, [])
  const routes = React.useMemo(() => [...(list?.routes ?? [])].sort((a, b) => (b.spread_pct ?? -1) - (a.spread_pct ?? -1)), [list])
  // A column per release any route holds.
  const releases = React.useMemo(() => RELEASES.filter((s) => routes.some((r) => r.yields.some((y) => y.source === s && y.held))), [routes])
  const iaea = routes.some((r) => r.iaea_yield !== null)
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
                  <th className={TH}>Unit</th>
                  {releases.map((s) => (
                    <th key={s} className={`${TH} text-right`}>{s}</th>
                  ))}
                  {iaea && <th className={`${TH} text-right`}>IAEA</th>}
                  <th className={`${TH} text-right`}>Data</th>
                  <th className={`${TH} text-right`}>Spread</th>
                  <th className={TH}>Verdict</th>
                </tr>
              </thead>
              <tbody>
                {routes.map((r) => (
                  <tr key={r.route} className="border-t border-[var(--paper-rule)]/10 align-top hover:bg-[var(--paper-quiet)]">
                    <td className={TD}>{r.product}</td>
                    <td className={TD}>
                      <Link href={`/sweep/medical/${encodeURIComponent(r.route)}`} className="underline decoration-[var(--paper-rule)]/30 underline-offset-2 hover:decoration-[var(--paper-text)]">
                        {r.label}
                      </Link>
                    </td>
                    <td className={TD}>{r.decay_only && r.parent_half_life_s !== null ? `generator, parent T½ ${halfLifeText(r.parent_half_life_s)}` : r.irradiation}</td>
                    <td className="min-w-[180px] px-2 py-1.5 text-[11px] text-[var(--paper-muted)]">{r.unit || "—"}</td>
                    {releases.map((s) => {
                      const y = r.yields.find((x) => x.source === s)
                      return (
                        <td key={s} className={`${TD} text-right tabular-nums`} title={y?.rel_sd != null ? `MF33 ±${(y.rel_sd * 100).toFixed(1)}%` : undefined}>
                          {y?.held ? yieldText(y.value) : "—"}
                        </td>
                      )
                    })}
                    {iaea && <td className={`${TD} text-right tabular-nums`}>{yieldText(r.iaea_yield)}</td>}
                    <td className={`${TD} text-right tabular-nums`}>
                      {yieldText(r.data_yield)}
                      {r.data_spread_pct !== null && <span className="text-[var(--paper-faint)]"> ±{r.data_spread_pct.toFixed(0)}%</span>}
                    </td>
                    <td className={`${TD} text-right tabular-nums`}>{r.spread_pct === null ? "—" : `${r.spread_pct.toFixed(0)}%`}</td>
                    <td className="max-w-[260px] px-2 py-1.5">
                      <Verdict r={r} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
