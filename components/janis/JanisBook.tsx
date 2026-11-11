"use client"
// /janis/book/{n|g|p|d|t|h|a}/[nuclide]/[mt] (brief 67): JANIS Web's book page. The two side columns are inset rails with
// their tabs, as /graph's panels (InsetPanel, Brendan 2026-11-11), closed on load; the Node table is the Series sheet, the
// Lab's pane (useSheet: the whole bar toggles, the grip on its top line drags), closed on load; the chart takes the room
// left, with an undo circle for the zoom box and its own legend (an accordion that moves corner to corner, Brendan
// 01:12). Left, "By nuclide": elements that open to isotopes that open to MT rows, the page's own highlighted. Centre:
// the chart with its zoom box (BookChart) and the Node table (Node, Settings, Display); the stepper row above the chart
// is gone (Brendan, 2026-11-11 02:24). JANIS Web's nav strip and the tab strip are gone from this page. Right: the Plotter (scales, ranges, Apply),
// the reaction's Q value and the two links. Placeholder rows and series only.
import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ChevronDown, ChevronRight, ChevronUp, Move, Undo2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CircleButton } from "@/components/ui/circle-button"
import { SHEET_BAR_HOVER, Sheet, useSheet } from "@/components/lab/OutputPane"
import { Input } from "@/components/ui/input"
import { SERIF } from "@/app/(site)/(plate)/viz/box-style"
import { INSET, InsetBody, InsetPanel } from "@/components/nsr/graph/InsetPanel"
import { useRailClosed } from "@/components/rail-toggle"
import { BookChart, EXFOR_SETS, FULL, LIBRARIES, type Range, type Scales } from "@/components/janis/BookChart"
import { HOVER, LINE, LINK, TINT } from "@/components/janis/parts"
import { BOOK_MTS, bookNuclides, mtLabel, nuclideLabel, PROJECTILES, symbolOfZ, Z_MAX } from "@/lib/janis-tree"
import { RELEASE_SLOT, SLOTS } from "@/lib/lab/canvases/plot"
import { cn } from "@/lib/utils"

const BASE_NAME: Record<string, string> = { n: "Incident neutron data", g: "Incident gamma data", p: "Incident proton data", d: "Incident deuteron data", t: "Incident triton data", h: "Incident He3 data", a: "Incident alpha data" }
/** The sheet's tab, the Lab's OutputPane TAB. */
const SHEET_TAB = (on: boolean) =>
  cn("rounded-md px-2 py-1 text-xs transition-colors", on ? "bg-[var(--paper-quiet)] text-[var(--paper-text)]" : "text-[var(--paper-muted)] hover:text-[var(--paper-text)]")
const exp = (v: number) => (Number.isFinite(v) ? v.toExponential(3) : "")

/** JANIS's naming of a product: "Li8" for Z 3, A 8. */
const short = (z: number, a: number) => `${symbolOfZ(z)}${a}`

export function JanisBook({ p, z, a, mt }: { p: string; z: number; a: number | "Nat"; mt: number }) {
  const proj = PROJECTILES.find((x) => x.key === p) ?? PROJECTILES[0]
  const here = nuclideLabel(z, a)
  const href = (label: string, m: number) => `/janis/book/${proj.key}/${label}/${m}`
  const label = (m: number) => mtLabel(m, proj.symbol)

  const target = typeof a === "number" ? short(z, a) : `${symbolOfZ(z)}0`

  // The Plotter and the chart share the range and the scales; the zoom box writes them back.
  const [range, setRange] = useState<Range>(FULL)
  const [scales, setScales] = useState<Scales>({ x: "log", y: "log" })
  const [fields, setFields] = useState({ xmin: exp(FULL.xmin), xmax: exp(FULL.xmax), ymin: exp(FULL.ymin), ymax: exp(FULL.ymax) })
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [version, setVersion] = useState(0)
  const redraw = () => setVersion((v) => v + 1)
  // Each box zoom stacks the range it left; the undo circle pops one step; the double click (BookChart hands back FULL)
  // goes to the whole range and empties the stack.
  const [undo, setUndo] = useState<Range[]>([])
  const zoomed = (r: Range) => {
    setUndo((u) => (r === FULL ? [] : [...u, range]))
    setRange(r)
    setFields({ xmin: exp(r.xmin), xmax: exp(r.xmax), ymin: exp(r.ymin), ymax: exp(r.ymax) })
  }
  const back = () => {
    const prev = undo[undo.length - 1]
    if (!prev) return
    setUndo((u) => u.slice(0, -1))
    setRange(prev)
    setFields({ xmin: exp(prev.xmin), xmax: exp(prev.xmax), ymin: exp(prev.ymin), ymax: exp(prev.ymax) })
    redraw()
  }
  const apply = () => {
    const n = { xmin: Number(fields.xmin), xmax: Number(fields.xmax), ymin: Number(fields.ymin), ymax: Number(fields.ymax) }
    if (Object.values(n).some((v) => !Number.isFinite(v)) || n.xmin >= n.xmax || n.ymin >= n.ymax) return
    setRange(n)
    redraw()
  }
  const show = (name: string, on: boolean) => {
    setHidden((h) => {
      const next = new Set(h)
      if (on) next.delete(name)
      else next.add(name)
      return next
    })
    redraw()
  }

  // The Series sheet: the Lab's pane (useSheet), shut on load, the bar toggling it, the grip on its top line dragging it.
  const sheet = useSheet("janis:book-sheet-h")

  // The rail: the page's element and isotope open, its MT row scrolled into view once the rail is open.
  const leftClosed = useRailClosed("left")
  const [openZ, setOpenZ] = useState<Set<number>>(() => new Set([z]))
  const [openIso, setOpenIso] = useState<Set<string>>(() => new Set([here]))
  const picked = useRef<HTMLAnchorElement>(null)
  useEffect(() => {
    setOpenZ((s) => new Set(s).add(z))
    setOpenIso((s) => new Set(s).add(here))
    if (!leftClosed) {
      picked.current?.scrollIntoView({ block: "center", inline: "nearest" })
      picked.current?.focus({ preventScroll: true })
    }
  }, [z, here, leftClosed])
  // Arrow keys walk the rail (Brendan, 2026-11-11): ↓ and ↑ move the focus through every row, element, isotope and MT.
  const railKeys = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return
    const rows = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("button, a[href]"))
    const next = rows[rows.indexOf(document.activeElement as HTMLElement) + (e.key === "ArrowDown" ? 1 : -1)]
    if (!next) return
    e.preventDefault()
    next.focus()
    next.scrollIntoView({ block: "nearest" })
  }
  const flip = <T,>(set: React.Dispatch<React.SetStateAction<Set<T>>>, v: T) =>
    set((s) => {
      const next = new Set(s)
      if (next.has(v)) next.delete(v)
      else next.add(v)
      return next
    })

  const libraryRows = LIBRARIES.map((lib) => ({ name: lib, node: `${lib} / Cross sections / ${target} / ${label(mt)}` }))

  return (
    <div className="flex h-full min-h-0 flex-1">
      {/* left: by nuclide, an inset rail with its tab, closed on load (InsetPanel, as /graph's) */}
      <InsetPanel side="left" storageKey="janis:book-left-w">
        <div className={cn(INSET.header, LINE)}><h3 className={INSET.title}>By nuclide</h3></div>
        <InsetBody>
        <ul className="text-sm" aria-label="By nuclide" onKeyDown={railKeys}>
          {Array.from({ length: Z_MAX + 1 }, (_, zz) => (
            <li key={zz}>
              <button type="button" aria-expanded={openZ.has(zz)} onClick={() => flip(setOpenZ, zz)} className={cn("flex w-full items-center gap-1.5 px-3 py-1 text-left text-[var(--paper-text)]", HOVER)}>
                <ChevronRight className={cn("size-3.5 shrink-0 text-[var(--paper-muted)] transition-transform", openZ.has(zz) && "rotate-90")} aria-hidden="true" />
                <span className="font-mono text-[13px]">{zz}-{symbolOfZ(zz)}</span>
              </button>
              {openZ.has(zz) && (
                <ul>
                  {bookNuclides(zz).map((iso) => (
                    <li key={iso.label}>
                      <button type="button" aria-expanded={openIso.has(iso.label)} onClick={() => flip(setOpenIso, iso.label)} className={cn("flex w-full items-center gap-1.5 py-1 pl-7 pr-3 text-left text-[var(--paper-text)]", HOVER)}>
                        <ChevronRight className={cn("size-3.5 shrink-0 text-[var(--paper-muted)] transition-transform", openIso.has(iso.label) && "rotate-90")} aria-hidden="true" />
                        <span className="font-mono text-[13px]">{iso.label}</span>
                      </button>
                      {openIso.has(iso.label) && (
                        <ul>
                          {BOOK_MTS.map((m) => {
                            const on = iso.label === here && m.mt === mt
                            return (
                              <li key={m.mt}>
                                <Link ref={on ? picked : undefined} href={href(iso.label, m.mt)} aria-current={on ? "page" : undefined}
                                  className={cn("block py-1 pl-14 pr-3 text-[13px]", on ? cn(TINT, "border-l-2 border-[var(--paper-strong)] pl-[54px] font-medium text-[var(--paper-text)]") : cn("text-[var(--paper-strong)]", HOVER))}>
                                  {label(m.mt)}
                                </Link>
                              </li>
                            )
                          })}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
        </InsetBody>
      </InsetPanel>

      {/* centre: the chart in the room the rails and the sheet leave, the Node sheet. JANIS Web's own nav strip (the
          layout's) is hidden on this page only; the plot's series list is the sheet. */}
      <style>{'nav[aria-label="JANIS"]{display:none}'}</style>
      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="min-h-[240px] flex-1 px-2 pt-2">
          <div className="relative h-full w-full">
            <BookChart range={range} scales={scales} hidden={hidden} version={version} onZoom={zoomed} />
            {/* the undo circle rides inside the plot across from the legend's corner (Brendan, 2026-11-11 02:33) */}
            <ChartLegend hidden={hidden} onToggle={(name, on) => show(name, on)}
              aside={undo.length > 0 ? (
                <CircleButton aria-label="Undo the last zoom" title="Undo the last zoom" onClick={back} className="size-8">
                  <Undo2 className="size-4" aria-hidden="true" />
                </CircleButton>
              ) : null} />
          </div>
        </div>

        {/* the Series sheet: the Lab's OutputPane (useSheet), a 36 px bar, 260 px open, dragged to 60% of the viewport */}
        <Sheet sheet={sheet}>
          <div {...sheet.bar} className={cn("flex h-9 shrink-0 cursor-pointer items-center gap-1 px-2 transition-colors", SHEET_BAR_HOVER)}>
            <button type="button" className={SHEET_TAB(sheet.open)} aria-expanded={sheet.open} onClick={(e) => { e.stopPropagation(); sheet.setOpen(true) }}>Series</button>
            <div className="ml-auto flex items-center gap-1">
              <button type="button" aria-label={sheet.open ? "Close the pane" : "Open the pane"} aria-expanded={sheet.open} className={SHEET_TAB(false)} onClick={(e) => { e.stopPropagation(); sheet.setOpen((o) => !o) }}>
                {sheet.open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
          {sheet.open && (
        <div className="min-h-0 flex-1 overflow-auto px-2 pb-2">
          <table className={cn("w-full border text-sm text-[var(--paper-text)]", LINE)}>
            <thead>
              <tr className={cn("border-b", LINE, TINT)}>
                {["Node", "Settings", "Display"].map((h) => <th key={h} className="px-3 py-2 text-left text-xs font-medium text-[var(--paper-muted)]">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              <tr className={cn("border-b", LINE)}><td colSpan={3} className="px-3 py-2 font-medium">NEA / {BASE_NAME[proj.key]}</td></tr>
              <tr className={cn("border-b", LINE)}><td colSpan={3} className="px-3 py-2 pl-6 font-mono text-[13px]">EXFOR / Cross sections / {target} / (,A){z - 2}-{symbolOfZ(Math.max(z - 2, 0)).toUpperCase()}-{typeof a === "number" ? a - 3 : "0"}</td></tr>
              {EXFOR_SETS.map((s) => {
                const name = `EXFOR ${s.id}`
                return (
                  <NodeRow key={s.id} indent="pl-10" mark={<Marker symbol={s.symbol} />} node={<span className="font-mono text-[13px]">{s.id}</span>} on={!hidden.has(name)} onToggle={(v) => show(name, v)} />
                )
              })}
              {libraryRows.map((r) => (
                <NodeRow key={r.name} indent="pl-6" mark={<Swatch name={r.name} />} node={<span className="font-mono text-[13px]">{r.node}</span>} on={!hidden.has(r.name)} onToggle={(v) => show(r.name, v)} />
              ))}
            </tbody>
          </table>
        </div>
          )}
        </Sheet>
      </section>

      {/* right: the plotter, an inset rail with its tab, closed on load */}
      <InsetPanel side="right" storageKey="janis:book-right-w">
        <div className={cn(INSET.header, LINE)}><h3 className={INSET.title}>Plotter</h3></div>
        <InsetBody className="px-4 pt-4" >
        <section aria-label="Plotter">
        <div className="grid grid-cols-2 gap-2 text-xs text-[var(--paper-muted)]">
          {(["x", "y"] as const).map((k) => (
            <label key={k} className="flex flex-col gap-1">{k.toUpperCase()} scale
              <select value={scales[k] === "log" ? "Log" : "Lin"} onChange={(e) => { setScales((s) => ({ ...s, [k]: e.target.value === "Log" ? "log" : "value" })); redraw() }}
                className="h-9 rounded-md border border-[var(--paper-rule)] bg-[var(--paper)] px-2 text-sm text-[var(--paper-text)]">
                <option>Log</option><option>Lin</option>
              </select>
            </label>
          ))}
          {(["xmin", "xmax", "ymin", "ymax"] as const).map((k) => (
            <label key={k} className="flex flex-col gap-1">{`${k[0].toUpperCase()} ${k.slice(1)}`}
              <Input value={fields[k]} onChange={(e) => setFields((f) => ({ ...f, [k]: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter") apply() }}
                className="h-9 font-mono text-xs text-[var(--paper-text)]" inputMode="decimal" />
            </label>
          ))}
        </div>
        <Button onClick={apply} className="mt-3 h-9 w-full rounded-full">Apply</Button>

        <h3 className="mb-2 mt-6 text-lg tracking-tight text-[var(--paper-text)]" style={SERIF}>Cross section</h3>
        <dl className="text-sm">
          <dt className="text-xs text-[var(--paper-muted)]">Reaction Q value</dt>
          <dd className="font-mono text-[var(--paper-text)]">—</dd>
        </dl>
        <div className="mt-6 flex flex-col gap-2 text-sm">
          <Link href="/janis/search/exfor" className={LINK}>Additional EXFOR</Link>
          <Link href="/janis/search/endf" className={LINK}>Additional ENDF</Link>
        </div>
        </section>
        </InsetBody>
      </InsetPanel>
    </div>
  )
}

/** The corners the legend steps through, in order, and its insets inside the plot (BookChart's grid: 72, 24, 18, 48). */
const CORNERS = ["top left", "top right", "bottom right", "bottom left"] as const
const INSETS = { left: 84, right: 36, top: 28, bottom: 58 }

/** The chart's legend (Brendan, 2026-11-11 01:12), drawn here instead of by ECharts: 12 px padding, 6 px between rows,
 *  12 px type; an accordion, open on load, its title "Legend" in the display face with the chevron beside it as one
 *  button (Brendan, 02:20), and a Move button at the right that slides it to the next corner, top left, top right,
 *  bottom right, bottom left, 300 ms ease-out. A row toggles its series, as ECharts' did. `aside` (the undo circle) sits
 *  inside the plot at the same height, across from the legend's corner, and crosses with it. */
function ChartLegend({ hidden, onToggle, aside }: { hidden: Set<string>; onToggle: (name: string, on: boolean) => void; aside?: React.ReactNode }) {
  const [open, setOpen] = useState(true)
  const [corner, setCorner] = useState(0)
  const frame = useRef<HTMLDivElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ W: 0, H: 0, w: 0, h: 0 })
  useEffect(() => {
    const f = frame.current, b = box.current
    if (!f || !b) return
    const read = () => setSize({ W: f.clientWidth, H: f.clientHeight, w: b.offsetWidth, h: b.offsetHeight })
    read()
    const ro = new ResizeObserver(read)
    ro.observe(f)
    ro.observe(b)
    return () => ro.disconnect()
  }, [])
  const where = CORNERS[corner]
  const x = where.endsWith("left") ? INSETS.left : Math.max(INSETS.left, size.W - size.w - INSETS.right)
  const y = where.startsWith("top") ? INSETS.top : Math.max(INSETS.top, size.H - size.h - INSETS.bottom)
  const ax = where.endsWith("left") ? Math.max(INSETS.left, size.W - 32 - INSETS.right) : INSETS.left
  const rows = [...LIBRARIES.map((n) => ({ name: n, mark: <Swatch name={n} /> })), ...EXFOR_SETS.map((s) => ({ name: `EXFOR ${s.id}`, mark: <Marker symbol={s.symbol} /> }))]
  const icon = cn("inline-flex size-6 items-center justify-center rounded-md text-[var(--paper-muted)] transition-colors hover:text-[var(--paper-text)]", HOVER)
  return (
    <div ref={frame} className="pointer-events-none absolute inset-0 overflow-hidden">
      <div ref={box} style={{ padding: 12, transform: `translate(${x}px, ${y}px)` }}
        className={cn("pointer-events-auto absolute left-0 top-0 rounded-md border bg-[var(--paper)] shadow-sm transition-transform duration-300 ease-out", LINE)}>
        <div className="flex items-center justify-between gap-8">
          <button type="button" aria-expanded={open} title={open ? "Fold the legend" : "Unfold the legend"} onClick={() => setOpen((o) => !o)}
            className="flex items-center gap-1.5 text-[var(--paper-text)]">
            <span className="text-xl font-normal leading-none tracking-tight" style={SERIF}>Legend</span>
            <ChevronDown className={cn("size-4 text-[var(--paper-muted)] transition-transform", !open && "-rotate-90")} aria-hidden="true" />
          </button>
          <button type="button" aria-label={`Move the legend to the ${CORNERS[(corner + 1) % 4]}`} title={`Move to the ${CORNERS[(corner + 1) % 4]}`} onClick={() => setCorner((c) => (c + 1) % 4)} className={icon}>
            <Move className="size-3.5" />
          </button>
        </div>
        {open && (
          <ul className="mt-2 flex flex-col" style={{ rowGap: 6 }}>
            {rows.map((r) => {
              const on = !hidden.has(r.name)
              return (
                <li key={r.name}>
                  <button type="button" aria-pressed={on} onClick={() => onToggle(r.name, !on)}
                    className={cn("flex items-center gap-2 whitespace-nowrap text-[12px] leading-4", on ? "text-[var(--paper-text)]" : "text-[var(--paper-muted)] opacity-60")}>
                    <span className="inline-flex w-[18px] justify-center">{r.mark}</span>{r.name}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
      {aside && (
        <div style={{ transform: `translate(${ax}px, ${y + 8}px)` }} className="pointer-events-auto absolute left-0 top-0 transition-transform duration-300 ease-out">
          {aside}
        </div>
      )}
    </div>
  )
}

function NodeRow({ indent, mark, node, on, onToggle }: { indent: string; mark: React.ReactNode; node: React.ReactNode; on: boolean; onToggle: (v: boolean) => void }) {
  return (
    <tr className={cn("border-b last:border-b-0", LINE, HOVER)}>
      <td className={cn("px-3 py-1.5", indent)}><span className="inline-flex items-center gap-2">{mark}{node}</span></td>
      <td className="px-3 py-1.5">
        <span className="inline-flex gap-3 font-mono text-xs text-[var(--paper-muted)]">
          {[["P", "Points"], ["T", "Table"], ["I", "Information"]].map(([k, t]) => (
            <label key={k} title={t} className="inline-flex items-center gap-1"><input type="checkbox" defaultChecked={k === "P"} className="accent-[var(--paper-strong)]" />{k}</label>
          ))}
        </span>
      </td>
      <td className="px-3 py-1.5"><input type="checkbox" checked={on} onChange={(e) => onToggle(e.target.checked)} aria-label="Display" className="accent-[var(--paper-strong)]" /></td>
    </tr>
  )
}

function Swatch({ name }: { name: string }) {
  const [dark, setDark] = useState(false)
  useEffect(() => setDark(document.documentElement.classList.contains("dark")), [])
  const c = (dark ? SLOTS.dark : SLOTS.light)[RELEASE_SLOT[name] ?? 0]
  return <span aria-hidden="true" className="inline-block h-0.5 w-4 rounded" style={{ background: c }} />
}

function Marker({ symbol }: { symbol: string }) {
  const path = symbol === "circle" ? <circle cx="6" cy="6" r="4" /> : symbol === "rect" ? <rect x="2" y="2" width="8" height="8" /> : symbol === "triangle" ? <path d="M6 1.5 10.5 10h-9z" /> : <path d="M6 1 11 6 6 11 1 6z" />
  return <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" className="fill-none stroke-[var(--paper-text)]" strokeWidth="1.25">{path}</svg>
}
