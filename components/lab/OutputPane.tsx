"use client"

import { ChevronDown, ChevronUp, Download } from "lucide-react"
import { lazy, Suspense, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react"

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

/** A bottom sheet's bar and open heights (the Lab's pane, the JANIS book's Series sheet). */
export const SHEET_BAR = 36
const SHEET_OPEN = 260
/** An open sheet is at least this tall; a drag that ends below it shuts the sheet. */
const SHEET_MIN_OPEN = SHEET_BAR + 24
/** The tallest a sheet drags, as a share of the viewport. */
const SHEET_MAX = 0.6
/** The bar's hover, the rail rows' (components/sidebar/SideBarMenuItem.tsx). */
export const SHEET_BAR_HOVER = "hover:bg-[color-mix(in_oklab,var(--paper-text)_8%,var(--paper))]"

/** A bottom sheet (Brendan, 2026-11-11 01:30): shut on load, the whole bar toggles it (a tab still picks its tab). While
 *  it is open the inset rails' gripper (components/nsr/graph/InsetPanel.tsx) sits on its top line and drags its height
 *  from 36 px to 60% of the viewport, remembered per browser under `storageKey`; double-click for 260, arrow keys in
 *  24 px steps; 500 ms open and close, none while dragging. Wear it with <Sheet>, `bar` on the bar. */
export function useSheet(storageKey: string) {
  const [h, setH] = useState(SHEET_BAR)
  const [dragging, setDragging] = useState(false)
  const last = useRef(SHEET_OPEN)
  const box = useRef<HTMLDivElement>(null)
  const open = h > SHEET_BAR
  const max = () => Math.round(window.innerHeight * SHEET_MAX)
  const clamp = (v: number, min = SHEET_MIN_OPEN) => Math.max(min, Math.min(v, max()))
  // Read after mount, as the rails' widths are: the sheet loads shut, so the remembered height is first seen on opening.
  useEffect(() => {
    try {
      const v = Number(localStorage.getItem(storageKey))
      if (v >= SHEET_MIN_OPEN) last.current = v
    } catch {}
  }, [storageKey])
  // An open height, once the drag is done, is the one remembered.
  useEffect(() => {
    if (dragging || !open) return
    last.current = h
    try { localStorage.setItem(storageKey, String(h)) } catch {}
  }, [h, open, dragging, storageKey])
  useEffect(() => {
    if (!dragging) return
    const s = document.body.style
    const prev = [s.cursor, s.userSelect]
    s.cursor = "row-resize"; s.userSelect = "none"
    return () => { s.cursor = prev[0]; s.userSelect = prev[1] }
  }, [dragging])
  const setOpen = (want: boolean | ((o: boolean) => boolean)) =>
    setH((cur) => ((typeof want === "function" ? want(cur > SHEET_BAR) : want) ? (cur > SHEET_BAR ? cur : clamp(last.current)) : SHEET_BAR))
  const end = () => {
    setDragging(false)
    setH((cur) => (cur < SHEET_MIN_OPEN ? SHEET_BAR : cur))
  }
  const grip = {
    role: "separator" as const,
    "aria-orientation": "horizontal" as const,
    "aria-label": "Resize the pane",
    tabIndex: 0,
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
      setDragging(true)
    },
    // The sheet's top line follows the pointer.
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
      const r = box.current?.getBoundingClientRect()
      setH(clamp((r?.bottom ?? window.innerHeight) - e.clientY, SHEET_BAR))
    },
    onPointerUp: end,
    onPointerCancel: end,
    onLostPointerCapture: end,
    onDoubleClick: () => setH(clamp(SHEET_OPEN)),
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return
      e.preventDefault()
      setH((cur) => clamp(cur + (e.key === "ArrowUp" ? 24 : -24)))
    },
  }
  const bar = { onClick: () => setOpen((o) => !o) }
  // The grip stays through a drag that reaches the bar, so the drag can come back up; it goes when the sheet shuts.
  return { open, setOpen, bar, grip, gripShown: open || dragging, dragging, box, style: { height: h }, motion: dragging ? "" : "transition-[height] duration-[500ms] ease-in-out" }
}

/** A bottom sheet's frame, the inset rails' (InsetPanel): the outer box carries the height and the grip, centred on the
 *  top line, 64 by 18, row-resize; the inner box draws the line and clips the bar and body. */
export function Sheet({ sheet, children }: { sheet: ReturnType<typeof useSheet>; children: ReactNode }) {
  return (
    <div ref={sheet.box} style={sheet.style} className={cn("relative shrink-0", sheet.motion)}>
      {sheet.gripShown && (
        <div {...sheet.grip} className="group absolute left-1/2 top-0 z-40 flex h-[14px] w-16 -translate-x-1/2 cursor-row-resize touch-none items-center justify-center outline-none">
          <span className={`h-1 w-8 rounded-full transition-colors group-hover:bg-[#033882] group-focus-visible:bg-[#033882] ${sheet.dragging ? "bg-[#033882]" : "bg-[rgba(22,24,29,0.18)] dark:bg-[rgba(240,233,216,0.2)]"}`} />
        </div>
      )}
      <div className="flex h-full flex-col overflow-hidden border-t border-[var(--paper-rule)] bg-[var(--paper)]">{children}</div>
    </div>
  )
}

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

export function OutputPane({ block, outputs, logs, preview }: { block: Block | null; outputs: Outputs | undefined; logs: RunLog[]; preview?: ReactNode }) {
  const [tab, setTab] = useState<"output" | "logs">("output")
  const [handle, setHandle] = useState<string | null>(null)
  // Shut on load (Brendan, 2026-11-09); the bar (anywhere on it) toggles it, a tab opens it on that tab, the grip on its
  // top line drags it.
  const sheet = useSheet("lab:pane-h")
  const { open, setOpen } = sheet
  const handles = Object.entries(outputs ?? {}).filter(([, v]) => v !== undefined) as [string, AnyValue][]
  const cur = handles.find(([h]) => h === handle) ?? handles[0]
  const table = cur ? asTable(cur[1]) : null
  const base = fileName(`${block?.title ?? "output"}${cur ? ` ${cur[0]}` : ""}`)
  /** A control on the bar acts for itself, not for the bar's toggle. */
  const own = (f: () => void) => (e: { stopPropagation: () => void }) => { e.stopPropagation(); f() }

  return (
    <Sheet sheet={sheet}>
      <div {...sheet.bar} className={cn("flex h-9 shrink-0 cursor-pointer items-center gap-1 px-2 transition-colors", SHEET_BAR_HOVER)}>
        <button type="button" className={TAB(tab === "output")} onClick={own(() => { setTab("output"); setOpen(true) })}>Output</button>
        <button type="button" className={TAB(tab === "logs")} onClick={own(() => { setTab("logs"); setOpen(true) })}>Logs{logs.length ? ` ${short(logs.length)}` : ""}</button>
        {tab === "output" && handles.length > 1 && (
          <div className="ml-2 flex gap-1 border-l border-[var(--paper-rule)] pl-2">
            {handles.map(([h]) => <button key={h} type="button" className={TAB(cur?.[0] === h)} onClick={own(() => setHandle(h))}>{h}</button>)}
          </div>
        )}
        {tab === "output" && table && <span className="ml-2 text-[11px] text-[var(--paper-muted)]">{table.rows.length > SHOWN ? `first ${SHOWN} of ${short(table.rows.length)} rows` : plural(table.rows.length, "row")}</span>}
        <div className="ml-auto flex items-center gap-1">
          {tab === "output" && cur && (
            <>
              {table && (
                <button type="button" className={cn(TAB(false), "flex items-center gap-1")} onClick={own(() => save(toCsv(table), `${base}.csv`, "text/csv;charset=utf-8"))}>
                  <Download className="h-3 w-3" />CSV
                </button>
              )}
              <button type="button" className={cn(TAB(false), "flex items-center gap-1")} onClick={own(() => save(JSON.stringify(cur[1], null, 1), `${base}.json`, "application/json"))}>
                <Download className="h-3 w-3" />JSON
              </button>
            </>
          )}
          <button type="button" aria-label={open ? "Close the pane" : "Open the pane"} aria-expanded={open} className={TAB(false)} onClick={own(() => setOpen((o) => !o))}>
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
          ) : preview ? (
            <div className="h-full min-h-[200px]">{preview}</div>
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
    </Sheet>
  )
}
