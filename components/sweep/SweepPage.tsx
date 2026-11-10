"use client"

import * as React from "react"
import Link from "next/link"
import { Check, SlidersHorizontal } from "lucide-react"
import { useSearchParams } from "next/navigation"
import { useShellPanel } from "@/components/shell"
import { useSwitchboard } from "@/components/SwitchboardPanel"
import { Pills } from "@/components/viz/Pills"
import { VizControls, VizSection } from "@/components/viz/VizControls"
import { short } from "@/lib/datasets"
import { exforHref } from "@/lib/lab/canvases/plot"
import {
  evText,
  fetchFlags,
  fetchList,
  fetchReleases,
  fetchRetro,
  pctText,
  type ListQuery,
  type SweepFlags,
  type SweepList,
  type SweepReleases,
  type RetroQuery,
  type SweepRetro,
  type SweepRow,
} from "@/lib/sweep"

// /sweep (brief 58, Part C, 2026-11-10): every measured cross section against every evaluation, ranked by disagreement
// (brief 57's sweep, worker-3's routes). Three tabs: the ranked list (B-VIII.1 by default, z descending, 100 a page,
// its filters in the right panel's chart layer), the retrodiction (VIII.0's ranking against what VIII.1 changed) and
// the flags (VIII.1 entries no public list names, and EXFOR datasets a rule caught). A row opens its pair in the second
// panel (/sweep/pair). Every number comes from the API; until a route answers, its sample (lib/sweep-sample.ts) shows
// and the page says so.

type Tab = "list" | "retro" | "flags"
const TABS = [
  { id: "list", label: "VIII.1 list" },
  { id: "retro", label: "Retrodiction" },
  { id: "flags", label: "Flags" },
] as const

const MONO = { fontFamily: "var(--font-mono), ui-monospace, monospace" } as const
const TH = "whitespace-nowrap px-2 py-2 text-left text-[11px] font-normal text-[var(--paper-faint)]"
const TD = "whitespace-nowrap px-2 py-1.5"
const ROW = "border-t border-[var(--paper-rule)]/10"
const LINK = "underline decoration-[var(--paper-rule)]/30 underline-offset-2 hover:decoration-[var(--paper-text)]"
const INPUT = "h-8 w-full rounded-md border border-[var(--paper-rule)]/30 bg-[var(--paper)] px-2 text-[12px] text-[var(--paper-text)] outline-none placeholder:text-[var(--paper-faint)] focus:border-[var(--paper-text)]"
const DEFAULT_RELEASES = ["B-VIII.1", "B-VIII.0", "JEFF-3.3", "JENDL-5", "TENDL-2023", "CENDL-3.2"]

/** "(n,f)" from "N,F"; a reaction the route already writes "(n,α)" stays as it is. */
export const reactionText = (r: string) => (!r ? "—" : r.startsWith("(") ? r : `(${r.toLowerCase()})`)
const fixed = (v: number | null, d: number) => (v === null || !Number.isFinite(v) ? "—" : v.toFixed(d))
const pct = (v: number | null) => (v === null || !Number.isFinite(v) ? "—" : `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%`)

/** The pair's address in the second panel. */
export function pairHref(r: { target: string; mt: number; sublibrary: string }, releases: string[]): string {
  const s = new URLSearchParams({ target: r.target, mt: String(r.mt), sub: r.sublibrary, release: releases.join(",") })
  return `/sweep/pair?${s.toString()}`
}

function Sample({ on }: { on: boolean | undefined }) {
  if (!on) return null
  return <p className="m-0 mb-3 text-[12px] text-[var(--paper-faint)]">Sample rows: the sweep&apos;s route isn&apos;t answering yet.</p>
}

export function SweepPage() {
  const params = useSearchParams()
  const [tab, setTab] = React.useState<Tab>("list")
  React.useEffect(() => {
    const t = params.get("tab")
    if (t === "retrodiction") setTab("retro")
    else if (t === "flags") setTab("flags")
  }, [params])
  const { openVizControls } = useSwitchboard()
  return (
    <div className="min-h-0 flex-1 overflow-y-auto text-[13px] text-[var(--paper-text)]">
      <div className="px-5 py-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Pills options={TABS} value={tab} onChange={setTab} />
          {tab === "list" && (
            <button
              type="button"
              onClick={openVizControls}
              className="flex items-center gap-1.5 rounded-full border border-[var(--paper-rule)]/30 px-2.5 py-0.5 text-[12px] text-[var(--paper-muted)] transition-colors hover:bg-[var(--paper-quiet)]"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Filters
            </button>
          )}
        </div>
        {tab === "list" && <ListTab />}
        {tab === "retro" && <RetroTab />}
        {tab === "flags" && <FlagsTab />}
      </div>
    </div>
  )
}

// ── The ranked list ──────────────────────────────────────────────────────────────────────────────────────────────

function ListTab() {
  const { openPane } = useShellPanel()
  const [q, setQ] = React.useState<ListQuery>({ release: "B-VIII.1", sort: "z", dir: "desc", page: 1 })
  const [list, setList] = React.useState<SweepList | null>(null)
  const [releases, setReleases] = React.useState<SweepReleases | null>(null)
  React.useEffect(() => {
    void fetchReleases().then(setReleases)
  }, [])
  React.useEffect(() => {
    let on = true
    setList(null)
    void fetchList(q).then((l) => on && setList(l))
    return () => {
      on = false
    }
  }, [q])
  const set = (patch: Partial<ListQuery>) => setQ((c) => ({ ...c, page: 1, ...patch }))
  const relNames = releases?.releases.length ? releases.releases.map((r) => r.release) : DEFAULT_RELEASES
  const subs = [...new Set((releases?.releases.find((r) => r.release === q.release)?.sublibraries ?? ["neutrons"]).filter(Boolean))]
  const pages = list ? Math.max(1, Math.ceil(list.total / 100)) : 1
  const sortBy = (sort: ListQuery["sort"]) => set({ sort, dir: q.sort === sort && q.dir === "desc" ? "asc" : "desc" })
  const arrow = (sort: ListQuery["sort"]) => (q.sort === sort ? (q.dir === "desc" ? " ↓" : " ↑") : "")
  const open = (r: SweepRow) => openPane(pairHref(r, r.lab?.releases.length ? r.lab.releases : [q.release]))

  return (
    <>
      <VizControls>
        <VizSection title="Release">
          <Pills options={relNames.map((r) => ({ id: r, label: r }))} value={q.release} onChange={(release) => set({ release, sub: undefined })} />
        </VizSection>
        <VizSection title="Sublibrary">
          <Pills
            options={[{ id: "", label: "All" }, ...subs.map((s) => ({ id: s, label: s }))]}
            value={q.sub ?? ""}
            onChange={(sub) => set({ sub: sub || undefined })}
          />
        </VizSection>
        <VizSection title="Nuclide">
          <ApplyInput placeholder="U-235" value={q.nuclide ?? ""} onApply={(v) => set({ nuclide: v || undefined })} />
        </VizSection>
        <VizSection title="MT">
          <ApplyInput placeholder="18" value={q.mt ? String(q.mt) : ""} numeric onApply={(v) => set({ mt: Number(v) || undefined })} />
        </VizSection>
        <VizSection title="Minimum datasets">
          <ApplyInput placeholder="2" value={q.min_datasets ? String(q.min_datasets) : ""} numeric onApply={(v) => set({ min_datasets: Number(v) || undefined })} />
        </VizSection>
        <VizSection>
          <label className="flex cursor-pointer items-center justify-between gap-3 text-[12px]">
            <span>Single-dataset disagreements</span>
            <input type="checkbox" checked={!!q.single} onChange={(e) => set({ single: e.target.checked || undefined })} className="h-4 w-4 accent-[var(--paper-text)]" />
          </label>
          {q.single && (
            <p className="m-0 text-[11px] text-[var(--paper-faint)]">
              Pairs one dataset drives: a bad evaluation or a bad dataset, and I can&apos;t tell which.
            </p>
          )}
        </VizSection>
        {releases?.method && (
          <VizSection>
            <p className="m-0 text-[11px] leading-relaxed text-[var(--paper-muted)]">{releases.method}</p>
            {releases.run_date && <p className="m-0 text-[11px] text-[var(--paper-faint)]">Run {releases.run_date}</p>}
          </VizSection>
        )}
      </VizControls>

      <Sample on={list?.sample} />
      {!list ? (
        <p className="text-[var(--paper-muted)]">Loading…</p>
      ) : list.rows.length === 0 ? (
        <p className="text-[var(--paper-muted)]">No pairs match.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={MONO}>
              <thead>
                <tr>
                  <th className={TH}>Target</th>
                  <th className={TH}>Reaction</th>
                  <th className={TH}>Release</th>
                  <th className={`${TH} text-right`}>Points</th>
                  <th className={`${TH} text-right`}>Datasets</th>
                  <th className={`${TH} text-right`}>
                    <button type="button" onClick={() => sortBy("mean")} className="hover:text-[var(--paper-text)]">Mean ratio{arrow("mean")}</button>
                  </th>
                  <th className={`${TH} text-right`}>
                    <button type="button" onClick={() => sortBy("z")} className="hover:text-[var(--paper-text)]">z{arrow("z")}</button>
                  </th>
                  <th className={`${TH} text-right`}>Largest bin</th>
                  <th className={`${TH} text-right`}>MF33 sd</th>
                  <th className={TH}>Driver</th>
                  <th className={`${TH} text-right`}>
                    <button type="button" onClick={() => sortBy("support")} className="hover:text-[var(--paper-text)]">Support{arrow("support")}</button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.rows.map((r) => (
                  <tr key={`${r.target}-${r.sublibrary}-${r.mt}`} onClick={() => open(r)} className={`${ROW} cursor-pointer hover:bg-[var(--paper-quiet)]`}>
                    <td className={TD}>{r.target}</td>
                    <td className={TD} title={`MT ${r.mt}${r.sublibrary !== "neutrons" ? ` · ${r.sublibrary}` : ""}`}>
                      {reactionText(r.reaction)}
                    </td>
                    <td className={TD}>{list.release}</td>
                    <td className={`${TD} text-right tabular-nums`}>{short(r.n_points)}</td>
                    <td className={`${TD} text-right tabular-nums`}>{r.n_datasets}</td>
                    <td className={`${TD} text-right tabular-nums`}>{fixed(r.mean_ratio, 3)}</td>
                    <td className={`${TD} text-right tabular-nums`}>{fixed(r.z, 1)}</td>
                    <td className={`${TD} text-right tabular-nums`}>
                      {pctText(r.max_bin_dev)} <span className="text-[var(--paper-faint)]">at {evText(r.max_bin_e_ev)}</span>
                    </td>
                    <td className={`${TD} text-right tabular-nums`}>{r.mf33 ? pct(r.rel_sd_eval) : "—"}</td>
                    <td className={TD}>
                      {r.driver_dataset ? (
                        <Link href={exforHref(r.driver_dataset)} onClick={(e) => e.stopPropagation()} className={LINK}>
                          {r.driver_dataset}
                        </Link>
                      ) : (
                        "—"
                      )}
                      {r.driver_effect !== null && <span className="text-[var(--paper-faint)]"> {pctText(r.driver_effect)}</span>}
                    </td>
                    <td className={`${TD} text-right tabular-nums`}>
                      {r.support_points === null ? "—" : `${short(r.support_points)} / ${r.support_datasets ?? "—"}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center gap-3 text-[12px] text-[var(--paper-muted)]">
            <button type="button" disabled={q.page <= 1} onClick={() => setQ((c) => ({ ...c, page: c.page - 1 }))} className="rounded-full border border-[var(--paper-rule)]/30 px-2.5 py-0.5 disabled:opacity-35">
              Previous
            </button>
            <span className="tabular-nums" style={MONO}>
              {q.page} / {pages} · {short(list.total)} pairs
            </span>
            <button type="button" disabled={q.page >= pages} onClick={() => setQ((c) => ({ ...c, page: c.page + 1 }))} className="rounded-full border border-[var(--paper-rule)]/30 px-2.5 py-0.5 disabled:opacity-35">
              Next
            </button>
          </div>
        </>
      )}
    </>
  )
}

/** A text box that applies on Enter or when it loses focus. */
function ApplyInput({ value, placeholder, numeric, onApply }: { value: string; placeholder: string; numeric?: boolean; onApply: (v: string) => void }) {
  const [draft, setDraft] = React.useState(value)
  React.useEffect(() => setDraft(value), [value])
  const apply = () => {
    const v = draft.trim()
    if (v !== value) onApply(v)
  }
  return (
    <input
      value={draft}
      inputMode={numeric ? "numeric" : undefined}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={apply}
      onKeyDown={(e) => {
        if (e.key === "Enter") apply()
      }}
      className={INPUT}
      style={MONO}
    />
  )
}

// ── The retrodiction ─────────────────────────────────────────────────────────────────────────────────────────────

/** The release pairs the retrodiction route takes (worker-3, 2026-11-10): VIII.0 → VIII.1 on the POINT files (the
 *  default) and on MF3, and the two pairs before it. */
const RETRO_PAIRS: { id: string; label: string; q: RetroQuery }[] = [
  { id: "B-VIII.0:B-VIII.1", label: "VIII.0 → VIII.1", q: {} },
  { id: "B-VIII.0:B-VIII.1 (MF3)", label: "VIII.0 → VIII.1, MF3", q: { from: "B-VIII.0", to: "B-VIII.1", method: "mf3" } },
  { id: "B-VII.1:B-VIII.0", label: "VII.1 → VIII.0", q: { from: "B-VII.1", to: "B-VIII.0" } },
  { id: "B-VII.0:B-VII.1", label: "VII.0 → VII.1", q: { from: "B-VII.0", to: "B-VII.1" } },
]
const short1 = (r: string) => r.replace(/^B-/, "")

function RetroTab() {
  const [pairId, setPairId] = React.useState(RETRO_PAIRS[0].id)
  const [retro, setRetro] = React.useState<SweepRetro | null>(null)
  // The four pairs side by side come with the plain route's summary; kept from the first answer.
  const [pairs, setPairs] = React.useState<SweepRetro["pairs"]>([])
  React.useEffect(() => {
    let on = true
    setRetro(null)
    void fetchRetro(RETRO_PAIRS.find((p) => p.id === pairId)?.q ?? {}).then((r) => {
      if (!on) return
      setRetro(r)
      if (r.pairs.length) setPairs(r.pairs)
    })
    return () => {
      on = false
    }
  }, [pairId])
  const picker = <Pills className="mb-4" options={RETRO_PAIRS.map((p) => ({ id: p.id, label: p.label }))} value={pairId} onChange={setPairId} />
  if (!retro) return <>{picker}<p className="text-[var(--paper-muted)]">Loading…</p></>
  const from = short1(retro.summary.from)
  const to = short1(retro.summary.to)
  const top20 = retro.summary.top.find((t) => t.n === 20)
  const tiles = [
    { label: `Top 20 changed in ${to}`, value: pct(top20?.hit_rate ?? null) },
    { label: "Over the base rate", value: top20?.enrichment == null ? "—" : `${top20.enrichment.toFixed(1)}×` },
    { label: "Of those, moved toward the data", value: pct(top20?.toward ?? null) },
  ]
  return (
    <>
      {picker}
      <Sample on={retro.sample} />
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {tiles.map((t) => (
          <div key={t.label} className="border-t border-[var(--paper-rule)]/15 pt-3">
            <div className="text-[28px] font-semibold tabular-nums" style={MONO}>{t.value}</div>
            <div className="mt-1 text-[12px] text-[var(--paper-muted)]">{t.label}</div>
          </div>
        ))}
      </div>
      {/* The four release pairs side by side: the direction result read beside the pairs that show none. */}
      {pairs.length > 1 && (
        <div className="mb-8 overflow-x-auto">
          <table className="w-full border-collapse" style={MONO}>
            <thead>
              <tr>
                <th className={TH}>Releases</th>
                <th className={TH}>Compared on</th>
                <th className={`${TH} text-right`}>Pairs</th>
                <th className={`${TH} text-right`}>Changed</th>
                <th className={`${TH} text-right`}>Base rate</th>
                <th className={`${TH} text-right`}>Top 20 changed</th>
                <th className={`${TH} text-right`}>Over base</th>
                <th className={`${TH} text-right`}>Top 20 toward the data</th>
                <th className={`${TH} text-right`}>All changed toward the data</th>
              </tr>
            </thead>
            <tbody>
              {RETRO_PAIRS.map((rp) => pairs.find((p) => p.key === rp.id)).filter((p): p is SweepRetro["pairs"][number] => !!p).map((p) => (
                <tr key={p.key} onClick={() => setPairId(p.key)} className={`${ROW} cursor-pointer hover:bg-[var(--paper-quiet)] ${p.key === pairId ? "font-semibold" : ""}`}>
                  <td className={TD}>{short1(p.from)} → {short1(p.to)}</td>
                  <td className="px-2 py-1.5 text-[11px] text-[var(--paper-muted)]">{p.method}</td>
                  <td className={`${TD} text-right tabular-nums`}>{p.supported ?? "—"}</td>
                  <td className={`${TD} text-right tabular-nums`}>{p.changed ?? "—"}</td>
                  <td className={`${TD} text-right tabular-nums`}>{pct(p.base_rate)}</td>
                  <td className={`${TD} text-right tabular-nums`}>{pct(p.top20?.hit_rate ?? null)}</td>
                  <td className={`${TD} text-right tabular-nums`}>{p.top20?.enrichment == null ? "—" : `${p.top20.enrichment.toFixed(2)}×`}</td>
                  <td className={`${TD} text-right tabular-nums`}>{pct(p.top20?.toward ?? null)}</td>
                  <td className={`${TD} text-right tabular-nums`}>{pct(p.all_toward)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse" style={MONO}>
          <thead>
            <tr>
              <th className={`${TH} text-right`}>Rank</th>
              <th className={TH}>Target</th>
              <th className={TH}>Reaction</th>
              <th className={`${TH} text-right`}>z on {from}</th>
              <th className={`${TH} text-right`}>{from} off the data</th>
              <th className={`${TH} text-right`}>{to} off the data</th>
              <th className={`${TH} text-center`}>Changed</th>
              <th className={`${TH} text-center`}>Moved toward the data</th>
              <th className={`${TH} text-right`}>RMS change</th>
            </tr>
          </thead>
          <tbody>
            {retro.rows.map((r) => (
              <tr key={`${r.rank}-${r.target}-${r.mt}`} className={ROW}>
                <td className={`${TD} text-right tabular-nums`}>{r.rank}</td>
                <td className={TD}>{r.target}</td>
                <td className={TD} title={`MT ${r.mt}`}>{reactionText(r.reaction)}</td>
                <td className={`${TD} text-right tabular-nums`}>{fixed(r.z, 1)}</td>
                <td className={`${TD} text-right tabular-nums`}>{pctText(r.mean_log_ratio_v80)}</td>
                <td className={`${TD} text-right tabular-nums`}>{pctText(r.mean_log_ratio_v81)}</td>
                <td className={`${TD} text-center`}>{r.changed ? <Check className="inline h-3.5 w-3.5" aria-label="changed" /> : ""}</td>
                <td className={`${TD} text-center`}>{r.moved_toward_data ? <Check className="inline h-3.5 w-3.5" aria-label="moved toward the data" /> : ""}</td>
                <td className={`${TD} text-right tabular-nums`}>{r.rms_log === null ? "—" : `${(r.rms_log * 100).toFixed(2)}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ── The flags ────────────────────────────────────────────────────────────────────────────────────────────────────

function FlagsTab() {
  const [flags, setFlags] = React.useState<SweepFlags | null>(null)
  React.useEffect(() => {
    void fetchFlags().then(setFlags)
  }, [])
  if (!flags) return <p className="text-[var(--paper-muted)]">Loading…</p>
  const caption = "mb-2 mt-1 text-[10px] uppercase tracking-[0.14em] text-[var(--paper-faint)]"
  return (
    <>
      <Sample on={flags.sample} />
      <p className={caption}>VIII.1 entries no public list names</p>
      <div className="mb-8 overflow-x-auto">
        <table className="w-full border-collapse" style={MONO}>
          <thead>
            <tr>
              <th className={TH}>Target</th>
              <th className={TH}>Reaction</th>
              <th className={`${TH} text-right`}>z</th>
              <th className={`${TH} text-right`}>Largest bin</th>
              <th className={`${TH} text-right`}>MF33 sd</th>
              <th className={TH}>Datasets</th>
            </tr>
          </thead>
          <tbody>
            {flags.evaluation.map((r) => (
              <tr key={`${r.target}-${r.sublibrary}-${r.mt}`} className={ROW}>
                <td className={TD}>{r.target}</td>
                <td className={TD} title={`MT ${r.mt}`}>{reactionText(r.reaction)}</td>
                <td className={`${TD} text-right tabular-nums`}>{fixed(r.z, 1)}</td>
                <td className={`${TD} text-right tabular-nums`}>
                  {pctText(r.max_bin_dev)} <span className="text-[var(--paper-faint)]">at {evText(r.max_bin_e_ev)}</span>
                </td>
                <td className={`${TD} text-right tabular-nums`}>{r.mf33 ? pct(r.rel_sd_eval) : "—"}</td>
                <td className="px-2 py-1.5">
                  {r.datasets.map((d, i) => (
                    <span key={d.subentry}>
                      {i > 0 && ", "}
                      <Link href={exforHref(d.subentry)} className={LINK}>{d.subentry}</Link>
                      {(d.author || d.year) && <span className="text-[var(--paper-faint)]"> {[d.author, d.year].filter(Boolean).join(" ")}</span>}
                    </span>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {flags.publicLists.length > 0 && (
        <p className="-mt-6 mb-8 text-[11px] text-[var(--paper-faint)]">
          Public lists read:{" "}
          {flags.publicLists.map((p, i) => (
            <span key={p.url}>
              {i > 0 && " · "}
              <a href={p.url} target="_blank" rel="noopener noreferrer" className={LINK}>{new URL(p.url).hostname}</a>
              {p.n !== null && ` (${p.n})`}
            </span>
          ))}
        </p>
      )}
      <p className={caption}>EXFOR datasets by rule</p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse" style={MONO}>
          <thead>
            <tr>
              <th className={TH}>Rule</th>
              <th className={TH}>Subentry</th>
              <th className={TH}>Author</th>
              <th className={`${TH} text-right`}>Year</th>
              <th className={TH}>Pair</th>
              <th className={TH}>Finding</th>
              <th className={TH}>Reference</th>
            </tr>
          </thead>
          <tbody>
            {flags.exfor.map((r) => (
              <tr key={`${r.rule}-${r.subentry}`} className={ROW}>
                <td className={TD}>{r.rule}</td>
                <td className={TD}>
                  <Link href={exforHref(r.subentry)} className={LINK}>{r.subentry}</Link>
                </td>
                <td className={TD}>{r.author || "—"}</td>
                <td className={`${TD} text-right tabular-nums`}>{r.year ?? "—"}</td>
                <td className={TD}>
                  {r.target} {reactionText(r.reaction)}
                </td>
                <td className="px-2 py-1.5">{r.note || "—"}</td>
                <td className={TD}>
                  {r.nsr_key ? (
                    <Link href={`/datasets/nsr/${encodeURIComponent(r.nsr_key)}`} className={LINK}>{r.nsr_key}</Link>
                  ) : r.reference ? (
                    <Link href={`/datasets/exfor/${encodeURIComponent(r.entry || r.subentry)}`} className={LINK} title="The EXFOR entry, with its NSR paper">
                      {r.reference}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
