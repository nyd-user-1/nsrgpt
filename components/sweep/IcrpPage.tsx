"use client"

import * as React from "react"
import Link from "next/link"
import { SlidersHorizontal } from "lucide-react"
import { useSwitchboard } from "@/components/SwitchboardPanel"
import { VizControls, VizSection } from "@/components/viz/VizControls"
import { fetchIcrp, type IcrpTable } from "@/lib/icrp"

// /sweep/icrp (brief 58, item E, 2026-11-10): ICRP 107's half-lives against ENSDF's, every ground state and first isomer
// (brief 48). One table, sorted by how many of ENSDF's standard uncertainties apart the two are; the right panel filters
// by the note; a row opens the nuclide's card on the chart of nuclides. The method paragraph at the foot.

const MONO = { fontFamily: "var(--font-mono), ui-monospace, monospace" } as const
const TH = "whitespace-nowrap px-2 py-2 text-left text-[11px] font-normal text-[var(--paper-faint)]"
const TD = "whitespace-nowrap px-2 py-1.5"
const ALL = "All"

/** "Cs-137" or "U-235m" → the chart's ?nuclide=Cs-137 (the card is the ground state's). */
const cardHref = (nuclide: string) => `/viz/chart?nuclide=${encodeURIComponent(nuclide.replace(/m\d?$/, ""))}`
const diffText = (v: number | null) => (v === null ? "—" : Math.abs(v) >= 1e4 ? `${v.toExponential(1)}%` : `${v >= 0 ? "+" : ""}${+v.toPrecision(3)}%`)
const sigmaText = (v: number | null) => (v === null ? "—" : v >= 1e4 ? v.toExponential(1) : String(+v.toPrecision(3)))

export function IcrpPage() {
  const [table, setTable] = React.useState<IcrpTable | null>(null)
  const [note, setNote] = React.useState(ALL)
  const { openVizControls } = useSwitchboard()
  React.useEffect(() => {
    void fetchIcrp().then(setTable)
  }, [])
  const notes = React.useMemo(() => {
    const n = new Map<string, number>()
    for (const r of table?.rows ?? []) n.set(r.note, (n.get(r.note) ?? 0) + 1)
    return [...n.entries()].sort((a, b) => b[1] - a[1])
  }, [table])
  const rows = React.useMemo(
    () => (table?.rows ?? []).filter((r) => note === ALL || r.note === note).sort((a, b) => (b.sigma ?? -1) - (a.sigma ?? -1)),
    [table, note],
  )
  return (
    <div className="min-h-0 flex-1 overflow-y-auto text-[13px] text-[var(--paper-text)]">
      <VizControls>
        <VizSection title="Note">
          <div className="flex flex-col gap-1">
            {[[ALL, table?.rows.length ?? 0] as [string, number], ...notes].map(([n, c]) => (
              <button
                key={n}
                type="button"
                aria-pressed={note === n}
                onClick={() => setNote(n)}
                className={`flex items-start justify-between gap-3 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-[var(--paper-quiet)] ${note === n ? "font-medium" : "text-[var(--paper-muted)]"}`}
              >
                <span>{n}</span>
                <span className="tabular-nums" style={MONO}>{c}</span>
              </button>
            ))}
          </div>
        </VizSection>
      </VizControls>
      <div className="px-5 py-5">
        <div className="mb-3 flex justify-end">
          <button type="button" onClick={openVizControls} className="flex items-center gap-1.5 rounded-full border border-[var(--paper-rule)]/30 px-2.5 py-0.5 text-[12px] text-[var(--paper-muted)] transition-colors hover:bg-[var(--paper-quiet)]">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filters
          </button>
        </div>
        {table?.partial && <p className="m-0 mb-3 text-[12px] text-[var(--paper-faint)]">The rows that don&apos;t agree within three sigma; the full table loads when its route answers.</p>}
        {!table ? (
          <p className="text-[var(--paper-muted)]">Loading…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={MONO}>
              <thead>
                <tr>
                  <th className={TH}>Nuclide</th>
                  <th className={`${TH} text-right`}>ICRP 107</th>
                  <th className={`${TH} text-right`}>ENSDF</th>
                  <th className={`${TH} text-right`}>Level (keV)</th>
                  <th className={TH}>Jπ</th>
                  <th className={`${TH} text-right`}>Difference</th>
                  <th className={`${TH} text-right`}>Sigma</th>
                  <th className={TH}>Note</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.nuclide}-${r.level_kev}-${i}`} className="border-t border-[var(--paper-rule)]/10 hover:bg-[var(--paper-quiet)]">
                    <td className={TD}>
                      <Link href={cardHref(r.nuclide)} className="underline decoration-[var(--paper-rule)]/30 underline-offset-2 hover:decoration-[var(--paper-text)]">
                        {r.nuclide}
                      </Link>
                    </td>
                    <td className={`${TD} text-right`}>{r.icrp}</td>
                    <td className={`${TD} text-right`}>{r.ensdf_text}</td>
                    <td className={`${TD} text-right tabular-nums`}>{r.level_kev === null ? "—" : r.level_kev}</td>
                    <td className={TD}>{r.jpi || "—"}</td>
                    <td className={`${TD} text-right tabular-nums`}>{diffText(r.diff_pct)}</td>
                    <td className={`${TD} text-right tabular-nums`}>{sigmaText(r.sigma)}</td>
                    <td className="px-2 py-1.5 text-[var(--paper-muted)]">{r.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-5 max-w-[860px] text-[12px] leading-relaxed text-[var(--paper-muted)]">{table.method}</p>
          </div>
        )}
      </div>
    </div>
  )
}
