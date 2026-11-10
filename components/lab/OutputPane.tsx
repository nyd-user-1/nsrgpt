"use client"

import { ChevronDown, ChevronUp, Download } from "lucide-react"
import { lazy, Suspense, useState } from "react"

import type { RunLog } from "@/components/lab/useLab"
import { isDataset, seriesList, type AnyValue, type Block, type Dataset, type Outputs } from "@/lib/lab/blocks"
import { num, plural, seriesRows, short, toCsv } from "@/lib/lab/format"
import { cn } from "@/lib/utils"

const ChatMarkdown = lazy(() => import("@/components/chat/ChatMessage").then((m) => ({ default: m.ChatMarkdown })))

// The pane beneath the canvas (brief 52): the selected block's output as a table or text with Export (CSV, JSON), and the
// Logs tab, each run's time, block, status and duration. Tables show their first 500 rows; the export holds them all.

const SHOWN = 500

const TAB = (on: boolean) =>
  cn("rounded-md px-2 py-1 text-xs transition-colors", on ? "bg-[var(--paper-quiet)] text-[var(--paper-text)]" : "text-[var(--paper-muted)] hover:text-[var(--paper-text)]")

function save(body: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }))
  const a = Object.assign(document.createElement("a"), { href: url, download: name })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const fileName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "-").trim() || "output"

function Table({ d }: { d: Dataset }) {
  const cell = (v: unknown) => (typeof v === "number" ? num(v) : v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v))
  return (
    <table className="w-full border-collapse font-mono text-[11px]">
      <thead className="sticky top-0 bg-[var(--paper)]">
        <tr>{d.columns.map((c) => <th key={c} className="border-b border-[var(--paper-rule)] px-2 py-1 text-left font-medium text-[var(--paper-muted)]">{c}</th>)}</tr>
      </thead>
      <tbody>
        {d.rows.slice(0, SHOWN).map((r, i) => (
          <tr key={i} className="hover:bg-[var(--paper-quiet)]">
            {d.columns.map((c) => <td key={c} className="whitespace-nowrap px-2 py-0.5 text-[var(--paper-text)]">{cell(r[c])}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** A port value as a table, when it is one. */
const asTable = (v: AnyValue): Dataset | null => (isDataset(v) ? v : typeof v === "string" ? null : seriesRows(seriesList(v)))

export function OutputPane({ block, outputs, logs }: { block: Block | null; outputs: Outputs | undefined; logs: RunLog[] }) {
  const [tab, setTab] = useState<"output" | "logs">("output")
  const [handle, setHandle] = useState<string | null>(null)
  // Shut on load (Brendan, 2026-11-09); a tab opens it.
  const [open, setOpen] = useState(false)
  const handles = Object.entries(outputs ?? {}).filter(([, v]) => v !== undefined) as [string, AnyValue][]
  const cur = handles.find(([h]) => h === handle) ?? handles[0]
  const table = cur ? asTable(cur[1]) : null
  const base = fileName(`${block?.title ?? "output"}${cur ? ` ${cur[0]}` : ""}`)

  return (
    <div className={cn("flex shrink-0 flex-col border-t border-[var(--paper-rule)] bg-[var(--paper)]", open ? "h-[260px]" : "h-9")}>
      <div className="flex h-9 shrink-0 items-center gap-1 px-2">
        <button type="button" className={TAB(tab === "output")} onClick={() => { setTab("output"); setOpen(true) }}>Output</button>
        <button type="button" className={TAB(tab === "logs")} onClick={() => { setTab("logs"); setOpen(true) }}>Logs{logs.length ? ` ${short(logs.length)}` : ""}</button>
        {tab === "output" && handles.length > 1 && (
          <div className="ml-2 flex gap-1 border-l border-[var(--paper-rule)] pl-2">
            {handles.map(([h]) => <button key={h} type="button" className={TAB(cur?.[0] === h)} onClick={() => setHandle(h)}>{h}</button>)}
          </div>
        )}
        {tab === "output" && table && <span className="ml-2 text-[11px] text-[var(--paper-muted)]">{table.rows.length > SHOWN ? `first ${SHOWN} of ${short(table.rows.length)} rows` : plural(table.rows.length, "row")}</span>}
        <div className="ml-auto flex items-center gap-1">
          {tab === "output" && cur && (
            <>
              {table && (
                <button type="button" className={cn(TAB(false), "flex items-center gap-1")} onClick={() => save(toCsv(table), `${base}.csv`, "text/csv;charset=utf-8")}>
                  <Download className="h-3 w-3" />CSV
                </button>
              )}
              <button type="button" className={cn(TAB(false), "flex items-center gap-1")} onClick={() => save(JSON.stringify(cur[1], null, 1), `${base}.json`, "application/json")}>
                <Download className="h-3 w-3" />JSON
              </button>
            </>
          )}
          <button type="button" aria-label={open ? "Close the pane" : "Open the pane"} className={TAB(false)} onClick={() => setOpen((o) => !o)}>
            {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
      {open && (
        <div className="min-h-0 flex-1 overflow-auto px-2 pb-2">
          {tab === "logs" ? (
            logs.length ? (
              <Table d={{ columns: ["time", "block", "kind", "status", "duration", "error"], rows: logs.map((l) => ({ time: new Date(l.at).toLocaleTimeString(), block: l.title, kind: l.kind, status: l.status, duration: l.ms < 1000 ? `${l.ms} ms` : `${(l.ms / 1000).toFixed(1)} s`, error: l.error ?? "" })) }} />
            ) : (
              <p className="p-2 text-xs text-[var(--paper-muted)]">No runs yet.</p>
            )
          ) : !block ? (
            <p className="p-2 text-xs text-[var(--paper-muted)]">Select a block.</p>
          ) : !cur ? (
            <p className="p-2 text-xs text-[var(--paper-muted)]">{block.kind === "plot" ? "The plot draws on the block." : "Run the block."}</p>
          ) : typeof cur[1] === "string" ? (
            <Suspense fallback={<p className="whitespace-pre-wrap text-xs">{cur[1]}</p>}>
              <div className="max-w-3xl p-2"><ChatMarkdown content={cur[1]} size="sm" /></div>
            </Suspense>
          ) : table ? (
            <Table d={table} />
          ) : null}
        </div>
      )}
    </div>
  )
}
