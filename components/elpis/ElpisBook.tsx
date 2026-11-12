"use client"
// /elpis/book/{n|g|p|d|t|h|a}/[nuclide]/[mt] (briefs 67, 69, 72, 77): JANIS Web's book page. Brief 77: everything on the
// page is what JANIS itself made. JANIS 4.1's own book generator ran on a box against JANIS's own data packages, and its
// output is read here as files (components/elpis/use-janis-page.ts):
// - the left rail is JANIS's outline ("By nuclide": element, nuclide, MT, in JANIS's page order);
// - the chart draws JANIS's series in JANIS's order, colours, marks and strokes, on JANIS's axes and title, with the values
//   JANIS's Tabler gives (components/elpis/BookChart.tsx);
// - the sheet is JANIS's selection tree (its labels and order), with P, T and I as JANIS has them;
// - the right rail is JANIS's Plotter card (scales, ranges, Apply, X variable).
// Our frame stays: inset rails closed on load, the sheet as the Lab's pane, the legend off on load and in the chart menu,
// the title on and off in the chart menu, the zoom box, keyboard up and down on the rail. The rail's title is the
// JANIS/ELPIS switch (brief 72 5p): JANIS shows JANIS's run; ELPIS shows the ELPIS run, JANIS's same engine with the
// libraries JANIS has no package for added (lake/janis/book-elpis/), its extra rail rows marked ✅.
import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ChevronDown, ChevronRight, ChevronUp, Heading, Move, Undo2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CircleButton } from "@/components/ui/circle-button"
import { SHEET_BAR_HOVER, Sheet, useSheet } from "@/components/lab/OutputPane"
import { Input } from "@/components/ui/input"
import { MenuSelect } from "@/components/viz/MenuSelect"
import { AtomSpinner } from "@/components/AtomSpinner"
import { SERIF } from "@/app/(site)/(plate)/viz/box-style"
import { INSET, InsetBody, InsetPanel } from "@/components/nsr/graph/InsetPanel"
import { useRailClosed } from "@/components/rail-toggle"
import { MenuRow } from "@/components/kebab-menu"
import { PageTitle } from "@/lib/page-title"
import { BookChart, energyTick, janisColor, markSymbol, pageRange, type Range, type Scales } from "@/components/elpis/BookChart"
import { byNuclide, exforDataset, mtOf, useJanisNav, useJanisPage, type JanisOutline, type JanisSeries } from "@/components/elpis/use-janis-page"
import { HOVER, LINE, LINK, Mark, TINT } from "@/components/elpis/parts"
import { PROJECTILES } from "@/lib/janis-tree"
import { cn } from "@/lib/utils"

const exp = (v: number) => (Number.isFinite(v) ? v.toExponential(3) : "")
const fieldsOf = (r: Range) => ({ xmin: exp(r.xmin), xmax: exp(r.xmax), ymin: exp(r.ymin), ymax: exp(r.ymax) })
/** Until the page answers: B-11 (n,α)'s window, so the axes have something to draw. */
const WAITING: Range = { xmin: 1e6, xmax: 1e8, ymin: 1e-4, ymax: 1 }
type View = "JANIS" | "ELPIS"

export function ElpisBook({ p, label, mt, chosen = true, mtChosen = true }: { p: string; label: string; mt: number; chosen?: boolean; mtChosen?: boolean }) {
  const proj = PROJECTILES.find((x) => x.key === p) ?? PROJECTILES[0]
  const href = (l: string, m: number) => `/elpis/book/${proj.key}/${l}/${m}`
  const [view, setView] = useState<View>("JANIS")
  useEffect(() => { const v = localStorage.getItem("elpis:book-view"); if (v === "ELPIS" || v === "JANIS") setView(v) }, [])
  const pickView = (v: View) => { setView(v); localStorage.setItem("elpis:book-view", v) }
  const elpis = view === "ELPIS"
  // JANIS's run, and the ELPIS run (JANIS's engine with the libraries JANIS has no package for); ELPIS falls back to JANIS's
  // until its files exist
  const janisNav = useJanisNav(proj.key)
  const elpisNav = useJanisNav(proj.key, elpis)
  const nav = elpis && elpisNav ? elpisNav : janisNav
  const inJanis = useMemo(() => new Set(byNuclide(janisNav).flatMap((e) => e.children ?? []).flatMap((n) => (n.children ?? []).map((l) => `${n.label}/${l.reac}`))), [janisNav])
  const elements = useMemo(() => byNuclide(nav), [nav])
  const nuclideNode = useMemo(() => elements.flatMap((e) => e.children ?? []).find((n) => n.label === label), [elements, label])
  const leaf = nuclideNode?.children?.find((l) => mtOf(l.reac) === mt)

  // A book opened without a nuclide lands on JANIS's first page; a nuclide without an MT on its first MT.
  const router = useRouter()
  const redirectTo = (() => {
    if (!nav) return null
    if (!chosen) {
      const first = elements[0]?.children?.[0]
      const l = first?.children?.[0]
      return first && l ? href(first.label, mtOf(l.reac)) : null
    }
    if (mtChosen || !nuclideNode) return null
    const l = nuclideNode.children?.[0]
    return l && mtOf(l.reac) !== mt ? href(label, mtOf(l.reac)) : null
  })()
  useEffect(() => {
    if (redirectTo) router.replace(redirectTo)
  }, [redirectTo, router])

  const janisPage = useJanisPage(proj.key, label, mt)
  const elpisPage = useJanisPage(proj.key, label, mt, elpis)
  const page = elpis && elpisPage ? elpisPage : janisPage
  const series = useMemo(() => page?.series ?? [], [page])

  const full = useMemo(() => (page ? pageRange(page.x, page.y) ?? WAITING : WAITING), [page])
  const [legendOn, setLegendOn] = useState(false)
  const [titleOn, setTitleOn] = useState(true)
  const [range, setRange] = useState<Range>(full)
  const [scales, setScales] = useState<Scales>({ x: "log", y: "log" })
  const [fields, setFields] = useState(fieldsOf(full))
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [tables, setTables] = useState<Set<string>>(new Set())
  const [infos, setInfos] = useState<Set<string>>(new Set())
  const [version, setVersion] = useState(0)
  const redraw = () => setVersion((v) => v + 1)
  const [undo, setUndo] = useState<Range[]>([])
  useEffect(() => {
    setRange(full)
    setFields(fieldsOf(full))
    setUndo([])
    setHidden(new Set())
    setScales({ x: page?.x.scale === "LIN_SCALE" ? "value" : "log", y: page?.y.scale === "LIN_SCALE" ? "value" : "log" })
    setVersion((v) => v + 1)
  }, [full, page])
  useEffect(() => { redraw() }, [series, titleOn])
  const zoomed = (r: Range) => {
    setUndo((u) => (r === full ? [] : [...u, range]))
    setRange(r)
    setFields(fieldsOf(r))
  }
  const back = () => {
    const prev = undo[undo.length - 1]
    if (!prev) return
    setUndo((u) => u.slice(0, -1))
    setRange(prev)
    setFields(fieldsOf(prev))
    redraw()
  }
  const apply = () => {
    const n = { xmin: Number(fields.xmin), xmax: Number(fields.xmax), ymin: Number(fields.ymin), ymax: Number(fields.ymax) }
    if (Object.values(n).some((v) => !Number.isFinite(v)) || n.xmin >= n.xmax || n.ymin >= n.ymax) return
    setRange(n)
    redraw()
  }
  const show = (refs: string[], on: boolean) => {
    setHidden((h) => {
      const next = new Set(h)
      for (const r of refs) if (on) next.delete(r)
      else next.add(r)
      return next
    })
    redraw()
  }
  const flip = <T,>(set: React.Dispatch<React.SetStateAction<Set<T>>>, v: T) =>
    set((s) => {
      const next = new Set(s)
      if (next.has(v)) next.delete(v)
      else next.add(v)
      return next
    })

  const sheet = useSheet("elpis:book-sheet-h")
  const leftClosed = useRailClosed("left")
  const [openEl, setOpenEl] = useState<Set<string>>(() => new Set())
  const [openNuc, setOpenNuc] = useState<Set<string>>(() => new Set([label]))
  const picked = useRef<HTMLAnchorElement>(null)
  const element = elements.find((e) => (e.children ?? []).some((n) => n.label === label))?.label
  useEffect(() => {
    if (element) setOpenEl((s) => new Set(s).add(element))
    setOpenNuc((s) => new Set(s).add(label))
    if (!leftClosed) {
      picked.current?.scrollIntoView({ block: "center", inline: "nearest" })
      picked.current?.focus({ preventScroll: true })
    }
  }, [element, label, leftClosed, nav])
  const railKeys = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return
    const rows = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("button, a[href]"))
    const next = rows[rows.indexOf(document.activeElement as HTMLElement) + (e.key === "ArrowDown" ? 1 : -1)]
    if (!next) return
    e.preventDefault()
    next.focus()
    next.scrollIntoView({ block: "nearest" })
  }

  // The legend as JANIS writes it: the series in reverse drawing order, each with JANIS's text (EXFOR sets past 20 have
  // none, as JANIS leaves them).
  const legendRows: LegendRow[] = [...series].reverse().filter((s) => s.legend).map((s) => ({ key: s.ref, text: s.legend!, mark: <SeriesMark s={s} /> }))
  const byRef = useMemo(() => new Map(series.map((s) => [s.ref, s])), [series])
  const title = page?.title ?? null
  const missing = nav && chosen && mtChosen && !leaf && page === null

  return (
    <div className="flex h-full min-h-0 flex-1">
      <PageTitle title={leaf ? `${label} · ${leaf.label}` : label} />
      <InsetPanel side="left" storageKey="elpis:book-left-w">
        <div className={cn(INSET.header, LINE)}>
          <MenuSelect label="Book view" value={view} className="h-8 border-0 bg-transparent px-0 text-base shadow-none" onChange={(v) => pickView(v as View)}
            options={[{ value: "JANIS", label: "JANIS" }, { value: "ELPIS", label: "ELPIS" }]} />
        </div>
        <InsetBody>
          {nav === undefined && <div className="flex justify-center px-3 py-4 text-[var(--paper-muted)]"><AtomSpinner size={28} label={`Loading the ${proj.symbol} book`} /></div>}
          <ul className="text-sm" aria-label="By nuclide" onKeyDown={railKeys}>
            {elements.map((el) => (
              <li key={el.label}>
                <button type="button" aria-expanded={openEl.has(el.label)} onClick={() => flip(setOpenEl, el.label)} className={cn("flex w-full items-center gap-1.5 px-3 py-1 text-left text-[var(--paper-text)]", HOVER)}>
                  <ChevronRight className={cn("size-3.5 shrink-0 text-[var(--paper-muted)] transition-transform", openEl.has(el.label) && "rotate-90")} aria-hidden="true" />
                  <span className="font-mono text-[13px]">{el.label}</span>
                </button>
                {openEl.has(el.label) && (
                  <ul>
                    {(el.children ?? []).map((nuc) => (
                      <li key={nuc.label}>
                        <button type="button" aria-expanded={openNuc.has(nuc.label)} onClick={() => flip(setOpenNuc, nuc.label)} className={cn("flex w-full items-center gap-1.5 py-1 pl-7 pr-3 text-left text-[var(--paper-text)]", HOVER)}>
                          <ChevronRight className={cn("size-3.5 shrink-0 text-[var(--paper-muted)] transition-transform", openNuc.has(nuc.label) && "rotate-90")} aria-hidden="true" />
                          <span className="font-mono text-[13px]">{nuc.label}</span>
                        </button>
                        {openNuc.has(nuc.label) && (
                          <ul>
                            {(nuc.children ?? []).map((lf: JanisOutline) => {
                              const m = mtOf(lf.reac)
                              const on = nuc.label === label && m === mt
                              return (
                                <li key={lf.reac}>
                                  <Link ref={on ? picked : undefined} href={href(nuc.label, m)} aria-current={on ? "page" : undefined}
                                    className={cn("flex items-center py-1 pl-14 pr-3 text-[13px]", on ? cn(TINT, "border-l-2 border-[var(--paper-strong)] pl-[54px] font-medium text-[var(--paper-text)]") : cn("text-[var(--paper-strong)]", HOVER))}>
                                    {lf.label}
                                    {elpis && !inJanis.has(`${nuc.label}/${lf.reac}`) && <Mark kind="ours" />}
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

      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="min-h-[240px] flex-1 px-2 pt-2">
          <div className="relative h-full w-full">
            <BookChart series={series} range={range} full={full} scales={scales} hidden={hidden} title={titleOn ? title : null} version={version} onZoom={zoomed}
              kebab={{
                legend: { on: legendOn, toggle: () => setLegendOn((o) => !o) },
                scales: { x: scales.x, y: scales.y, set: (axis, t) => { setScales((sc) => ({ ...sc, [axis]: t })); redraw() } },
                zoom: { reset: () => { setRange(full); setFields(fieldsOf(full)); setUndo([]); redraw() }, undo: back, canUndo: undo.length > 0 },
                extra: <MenuRow icon={<Heading />} label={titleOn ? "Hide the title" : "Show the title"} onClick={() => setTitleOn((t) => !t)} />,
                rows: () => [["series", "energy_ev", "value_b"], ...series.flatMap((s) => (s.x ?? []).map((x, i) => [s.legend || s.exfor_id || s.ref, x ?? "", s.y?.[i] ?? ""]))],
              }} />
            {(page === undefined || missing) && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-8 text-center text-sm text-[var(--paper-muted)]">
                {page === undefined ? <AtomSpinner size={40} label={`Reading ${label} MT${mt}`} /> : `JANIS's ${proj.name.toLowerCase()} book has no page for ${label} MT${mt}.`}
              </div>
            )}
            {legendRows.length > 0 && (
              <ChartLegend show={legendOn} rows={legendRows} hidden={hidden} onToggle={show}
                aside={undo.length > 0 ? (
                  <CircleButton aria-label="Undo the last zoom" title="Undo the last zoom" onClick={back} className="size-8">
                    <Undo2 className="size-4" aria-hidden="true" />
                  </CircleButton>
                ) : null} />
            )}
          </div>
        </div>

        <Sheet sheet={sheet}>
          <div {...sheet.bar} className={cn("flex h-9 shrink-0 cursor-pointer items-center gap-1 px-2 transition-colors", SHEET_BAR_HOVER)}>
            <button type="button" className={cn("rounded-md px-2 py-1 text-xs transition-colors", sheet.open ? "bg-[var(--paper-quiet)] text-[var(--paper-text)]" : "text-[var(--paper-muted)] hover:text-[var(--paper-text)]")} aria-expanded={sheet.open} onClick={(e) => { e.stopPropagation(); sheet.setOpen(true) }}>Series</button>
            <div className="ml-auto flex items-center gap-1">
              <button type="button" aria-label={sheet.open ? "Close the pane" : "Open the pane"} aria-expanded={sheet.open} className="rounded-md px-2 py-1 text-xs text-[var(--paper-muted)] transition-colors hover:text-[var(--paper-text)]" onClick={(e) => { e.stopPropagation(); sheet.setOpen((o) => !o) }}>
                {sheet.open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
          {sheet.open && (
            <div className="min-h-0 flex-1 overflow-auto px-2 pb-2">
              <table className={cn("w-full border text-sm text-[var(--paper-text)]", LINE)}>
                <thead>
                  <tr className={cn("border-b", LINE, TINT)}>
                    {["Node", "P", "T", "I"].map((h) => <th key={h} className="px-3 py-2 text-left text-xs font-medium text-[var(--paper-muted)]">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {(page?.sheet ?? []).map((row, k) => {
                    const s = row.ref ? byRef.get(row.ref) : undefined
                    const indent = ["pl-3", "pl-8", "pl-12", "pl-16"][Math.min(row.depth, 3)]
                    if (!row.ref || !s) return <tr key={k} className={cn("border-b", LINE)}><td colSpan={4} className={cn("px-3 py-2 font-mono text-[13px]", indent)}>{row.label}</td></tr>
                    return (
                      <NodeRow key={k} indent={indent} mark={<SeriesMark s={s} />} n={s.rows ?? s.x?.length ?? 0}
                        node={<span className="font-mono text-[13px]">{row.label}</span>} on={!hidden.has(s.ref)} onToggle={(v) => show([s.ref], v)}
                        table={tables.has(s.ref)} onTable={() => flip(setTables, s.ref)}
                        info={row.toggles.includes("I") ? infos.has(s.ref) : undefined} onInfo={row.toggles.includes("I") ? () => flip(setInfos, s.ref) : undefined}
                        detail={infos.has(s.ref) || tables.has(s.ref) ? <>
                          {infos.has(s.ref) && <SetInfo s={s} />}
                          {tables.has(s.ref) && <ValueTable s={s} />}
                        </> : null} />
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Sheet>
      </section>

      <InsetPanel side="right" storageKey="elpis:book-right-w">
        <div className={cn(INSET.header, LINE)}><h3 className={INSET.title}>Plotter</h3></div>
        <InsetBody className="px-4 pt-4">
          <section aria-label="Plotter">
            <div className="grid grid-cols-2 gap-2 text-xs text-[var(--paper-muted)]">
              {(["x", "y"] as const).map((k) => (
                <div key={k} className="flex flex-col gap-1">{k.toUpperCase()}
                  <MenuSelect label={`${k.toUpperCase()} scale`} value={scales[k] === "log" ? "Log" : "Lin"} className="h-9 text-sm"
                    options={[{ value: "Lin", label: "Lin" }, { value: "Log", label: "Log" }]}
                    onChange={(v) => { setScales((s) => ({ ...s, [k]: v === "Log" ? "log" : "value" })); redraw() }} />
                </div>
              ))}
              {(["xmin", "xmax", "ymin", "ymax"] as const).map((k) => (
                <label key={k} className="flex flex-col gap-1">{`${k[0].toUpperCase()} ${k.slice(1)}`}
                  <Input value={fields[k]} onChange={(e) => setFields((f) => ({ ...f, [k]: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter") apply() }}
                    className="h-9 font-mono text-xs text-[var(--paper-text)]" inputMode="decimal" />
                </label>
              ))}
            </div>
            <Button onClick={apply} className="mt-3 h-9 w-full rounded-full">Apply</Button>
            <div className="mt-4 flex flex-col gap-1 text-xs text-[var(--paper-muted)]">X
              <MenuSelect label="X variable" value="E" className="h-9 text-sm" onChange={() => {}} options={[{ value: "E", label: "Incident energy" }]} />
            </div>
          </section>
        </InsetBody>
      </InsetPanel>
    </div>
  )
}

/** A series' mark in the legend and the sheet: its line (JANIS's colour and dash) or its symbol (JANIS's shape). */
function SeriesMark({ s }: { s: JanisSeries }) {
  const [dark, setDark] = useState(false)
  useEffect(() => setDark(document.documentElement.classList.contains("dark")), [])
  const ink = dark ? "#f0e9d8" : "#16181d"
  const c = janisColor(s.color, dark, ink)
  if (s.mark) {
    const m = markSymbol(s.mark)
    const d = m.symbol.slice("path://".length)
    return (
      <svg aria-hidden="true" width="12" height="12" viewBox="-1 -1 12 12" className="shrink-0">
        <path d={d} transform={m.rotate ? `rotate(${-m.rotate} 5 5)` : undefined} fill={m.filled ? c : "none"} stroke={m.filled ? "none" : c} strokeWidth={1.2} />
      </svg>
    )
  }
  const dash = s.stroke?.dash
  return <span aria-hidden="true" className="inline-block h-0.5 w-4 shrink-0 rounded" style={dash ? { backgroundImage: `linear-gradient(90deg, ${c} 60%, transparent 60%)`, backgroundSize: "6px 2px" } : { background: c }} />
}

type LegendRow = { key: string; text: string; mark: React.ReactNode }

const CORNERS = ["top right", "bottom right", "bottom left", "top left"] as const
const INSETS = { left: 84, right: 36, top: 40, bottom: 58 }

/** The chart's legend: an accordion with a Move button that steps it from corner to corner; a row toggles its series. */
function ChartLegend({ show = true, rows, hidden, onToggle, aside }: { show?: boolean; rows: LegendRow[]; hidden: Set<string>; onToggle: (refs: string[], on: boolean) => void; aside?: React.ReactNode }) {
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
  }, [show])
  const where = CORNERS[corner]
  const x = where.endsWith("left") ? INSETS.left : Math.max(INSETS.left, size.W - size.w - INSETS.right)
  const y = where.startsWith("top") ? INSETS.top : Math.max(INSETS.top, size.H - size.h - INSETS.bottom)
  const ax = where.endsWith("left") ? Math.max(INSETS.left, size.W - 32 - INSETS.right) : INSETS.left
  const icon = cn("inline-flex size-6 items-center justify-center rounded-md text-[var(--paper-muted)] transition-colors hover:text-[var(--paper-text)]", HOVER)
  return (
    <div ref={frame} className="pointer-events-none absolute inset-0 overflow-hidden">
      {show && <div ref={box} style={{ padding: 12, transform: `translate(${x}px, ${y}px)` }}
        className={cn("pointer-events-auto absolute left-0 top-0 max-h-[calc(100%-98px)] overflow-y-auto rounded-md border bg-[var(--paper)] shadow-sm transition-transform duration-300 ease-out", LINE)}>
        <div className="flex items-center justify-between gap-8">
          <button type="button" aria-expanded={open} title={open ? "Fold the legend" : "Unfold the legend"} onClick={() => setOpen((o) => !o)} className="flex items-center gap-1.5 text-[var(--paper-text)]">
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
              const on = !hidden.has(r.key)
              return (
                <li key={r.key}>
                  <button type="button" aria-pressed={on} onClick={() => onToggle([r.key], !on)}
                    className={cn("flex items-center gap-2 whitespace-nowrap text-[12px] leading-4", on ? "text-[var(--paper-text)]" : "text-[var(--paper-muted)] opacity-60")}>
                    <span className="inline-flex w-[18px] justify-center">{r.mark}</span>{r.text}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>}
      {aside && (
        <div style={{ transform: `translate(${ax}px, ${y + 8}px)` }} className="pointer-events-auto absolute left-0 top-0 transition-transform duration-300 ease-out">
          {aside}
        </div>
      )}
    </div>
  )
}

/** A sheet row with JANIS's toggles: P draws the series, T opens its values, I its information (EXFOR rows only). */
function NodeRow({ indent, mark, node, n, on, onToggle, table, onTable, info, onInfo, detail }: {
  indent: string; mark: React.ReactNode; node: React.ReactNode; n: number; on: boolean; onToggle: (v: boolean) => void
  table: boolean; onTable: () => void; info?: boolean; onInfo?: () => void; detail?: React.ReactNode
}) {
  const box = "accent-[var(--paper-strong)]"
  return (
    <>
      <tr className={cn("border-b last:border-b-0", LINE, HOVER)}>
        <td className={cn("px-3 py-1.5", indent)}><span className="inline-flex items-center gap-2">{mark}{node}<span className="font-mono text-xs text-[var(--paper-muted)]">{n.toLocaleString("en-US")}</span></span></td>
        <td className="px-3 py-1.5"><input type="checkbox" checked={on} onChange={(e) => onToggle(e.target.checked)} aria-label="Points: draw it" title="Points" className={box} /></td>
        <td className="px-3 py-1.5"><input type="checkbox" checked={table} onChange={onTable} aria-label="Table: its values" title="Table" className={box} /></td>
        <td className="px-3 py-1.5">{onInfo ? <input type="checkbox" checked={!!info} onChange={onInfo} aria-label="Information" title="Information" className={box} /> : null}</td>
      </tr>
      {detail ? <tr className={cn("border-b", LINE)}><td colSpan={4} className="px-3 py-2 pl-14">{detail}</td></tr> : null}
    </>
  )
}

/** A series' values as JANIS's Tabler gives them, the first 300 rows. */
function ValueTable({ s }: { s: JanisSeries }) {
  const x = s.x ?? [], y = s.y ?? []
  const k = Math.min(300, x.length)
  const dy = s.dy
  return (
    <div className="max-h-64 overflow-auto">
      <table className="font-mono text-xs text-[var(--paper-text)]">
        <thead><tr className="text-[var(--paper-muted)]"><th className="pr-6 text-left font-normal">Incident energy</th><th className="pr-6 text-left font-normal">Cross section (b)</th>{dy && <th className="text-left font-normal">Uncertainty (b)</th>}</tr></thead>
        <tbody>
          {Array.from({ length: k }, (_, i) => (
            <tr key={i}><td className="pr-6">{x[i] != null ? energyTick(x[i]!) : ""}</td><td className="pr-6">{y[i] != null ? y[i]!.toPrecision(6) : ""}</td>{dy && <td>{dy[i] != null ? dy[i]!.toPrecision(3) : ""}</td>}</tr>
          ))}
        </tbody>
      </table>
      {x.length > k && <p className="mt-1 text-xs text-[var(--paper-muted)]">The first {k} of {x.length.toLocaleString("en-US")}; the chart menu&apos;s download has every row.</p>}
    </div>
  )
}

/** An EXFOR set's information: subentry, first author and year as JANIS reads them, points and energy span. */
function SetInfo({ s }: { s: JanisSeries }) {
  const xs = (s.x ?? []).filter((v): v is number => v != null)
  return (
    <p className="mb-2 text-xs text-[var(--paper-muted)]">
      Subentry {s.exfor_id ? <Link href={`/datasets/exfor/${exforDataset(s.exfor_id)}`} className={LINK}>{s.exfor_id}</Link> : "—"}
      {s.author ? ` · ${s.author}` : ""}{s.year ? `, ${s.year}` : ""} · {(s.points ?? xs.length).toLocaleString("en-US")} points
      {xs.length ? ` from ${energyTick(Math.min(...xs))} to ${energyTick(Math.max(...xs))}` : ""}
    </p>
  )
}
