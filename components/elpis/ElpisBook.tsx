"use client"
// /elpis/book/{n|g|p|d|t|h|a}/[nuclide]/[mt] (briefs 67, 69): JANIS Web's book page, reading the lake. The two side
// columns are inset rails with their tabs, as /graph's panels (InsetPanel, Brendan 2026-11-11), closed on load; the Node
// table is the Series sheet, the Lab's pane (useSheet: the whole bar toggles, the grip on its top line drags), closed on
// load; the chart takes the room left, with an undo circle for the zoom box and its own legend (an accordion that moves
// corner to corner, Brendan 01:12). The stepper row above the chart is gone (Brendan, 2026-11-11 02:24); the rail and the
// Plotter navigate.
//
// Brief 69's wiring, decided here:
// - The rail ("By nuclide") is public/elpis/book-<p>.json (scripts/elpis/book-index.mjs): every nuclide with a File 3
//   section in any held release's sublibrary, and every nuclide JANIS's own book rail lists (crawled page by page from
//   oecd-nea.org/janisweb/book, since brief 68's tree stops at the isotope). Under a nuclide, every MT either side has.
//   Marks as everywhere on Elpis: ❌ JANIS's book has it and I hold no File 3 section; ✅ I hold it and JANIS's book
//   does not; no mark, both. A ❌ row still opens its page, which shows whatever EXFOR points I hold for it.
// - The lines: one /endf/xs call with compare= every release the index lists for (nuclide, MT); a release that answers
//   without the section is not drawn and not listed. B-VIII.x come from the POINT files at 0 K, as the API serves them.
// - The points: /exfor/points, quantity SIG, drawn when in barns (components/elpis/use-book.ts says what is left out
//   and why; the sheet lists those rows under the drawn ones).
// - The range is the data's (rangeOf); the Q value is File 3's head (QI, and QM where it differs) of the release the
//   Plotter names (the newest drawn by default), with a dashed threshold line when QI < 0.
// - The follow-up (lead, 2026-11-11 05:20): ENDF/B-VIII.1 and VIII.0 are drawn from their POINT files, 0 K by default,
//   the Plotter's Temperature picking another (293.6 to 1800 K; the API serves no B-VII.1 POINT). Every other release
//   whose File 3 is only the background inside the material's resonance range (LRP 1; public/elpis/res-ranges-n.json)
//   is drawn dashed over that range, for the MTs File 2 adds to (all MTs where the range is R-matrix limited), with the
//   legend's note and a Reconstruct button: PREPRO through nsr-jobs (components/elpis/reconstruct.ts), each line
//   swapped in as its job returns.
// - Production (lead, 2026-11-11 14:30): an MT JANIS's book lists and I hold no section for, whose residual a release's
//   MT 5 produces (File 6 yields or File 10; the index's `x`), is drawn as that residual's production from MT 5
//   (/endf/section/production), labelled as JANIS labels it ("MT11 (p,2n+d) or MT5 (Fe53 production)"), with EXFOR's
//   production data for that product (reaction "P,X"), and its rail row loses the ❌.
// - Brendan's side-by-side with JANIS (2026-11-11 15:00): the header names the page ("92-U-235 · MT18 (n,fission)"); the
//   legend lists only what is drawn and "EXFOR, n sets" (the off releases and what cannot be reconstructed are in the
//   Series sheet); the sheet has JANIS's P, T and I per row: P draws the series, T opens its values as a table, I its
//   information (an EXFOR set's entry and reference; JANIS offers I on EXFOR rows only).
// - The Plotter's Release (Brendan, 2026-11-11 16:00): the releases drawn, the newest first chosen (ENDF/B-VIII.1 where
//   drawn); the Q value, its source line and the threshold read from the chosen release.
// - Lines on by default: JANIS's book libraries and the newest of mine (ON_BY_DEFAULT); every other release that answers
//   is listed in the legend and the sheet, off until switched on.
import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ChevronDown, ChevronRight, ChevronUp, Move, Undo2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CircleButton } from "@/components/ui/circle-button"
import { SHEET_BAR_HOVER, Sheet, useSheet } from "@/components/lab/OutputPane"
import { Input } from "@/components/ui/input"
import { AtomSpinner } from "@/components/AtomSpinner"
import { SERIF } from "@/app/(site)/(plate)/viz/box-style"
import { INSET, InsetBody, InsetPanel } from "@/components/nsr/graph/InsetPanel"
import { useRailClosed } from "@/components/rail-toggle"
import { PageTitle } from "@/lib/page-title"
import { BookChart, energyTick, markerOf, MANY_SETS, rangeOf, setLook, slotOf, type Range, type Scales } from "@/components/elpis/BookChart"
import { useBookData, useBookIndex, useResRanges, type BookLine, type BookSet } from "@/components/elpis/use-book"
import { JOB_RELEASES, RES_MTS, reconstruct } from "@/components/elpis/reconstruct"
import { HOVER, LINE, LINK, Mark, TINT } from "@/components/elpis/parts"
import { PROJECTILES, symbolOfZ } from "@/lib/janis-tree"
import { apiName, BASE_NAME, BOOK_SUB, EXFOR_PROJ, exforReaction, productName, productTarget, exforTarget, libraryName, mtLabel, parseBookNuclide, railElements, railMts, shortName, thresholdEv, type BookIndexNuclide } from "@/lib/elpis"
import { SLOTS } from "@/lib/lab/canvases/plot"
import { cn } from "@/lib/utils"

/** The sheet's tab, the Lab's OutputPane TAB. */
const SHEET_TAB = (on: boolean) =>
  cn("rounded-md px-2 py-1 text-xs transition-colors", on ? "bg-[var(--paper-quiet)] text-[var(--paper-text)]" : "text-[var(--paper-muted)] hover:text-[var(--paper-text)]")
const exp = (v: number) => (Number.isFinite(v) ? v.toExponential(3) : "")
const fieldsOf = (r: Range) => ({ xmin: exp(r.xmin), xmax: exp(r.xmax), ymin: exp(r.ymin), ymax: exp(r.ymax) })
/** An energy as JANIS's data card writes a Q value: six significant figures in MeV, keV or eV ("-6.63095 MeV", "0 eV"). */
const qText = (v: number) => {
  const [d, u] = Math.abs(v) >= 1e6 ? [1e6, "MeV"] : Math.abs(v) >= 1e3 ? [1e3, "keV"] : [1, "eV"]
  return `${Number((v / d).toPrecision(6))} ${u}`
}
/** Until the data answers: B-11 (n,α)'s window, so the axes have something to draw. */
const WAITING: Range = { xmin: 1e6, xmax: 1e8, ymin: 1e-4, ymax: 1 }
const ALL_SETS = "EXFOR, every set"
/** The libraries drawn on load: those JANIS's books draw, and the newest of mine. The rest are listed, off. */
const ON_BY_DEFAULT = new Set(["B-VIII.1", "B-VIII.0", "JEFF-4.0", "JEFF-3.3", "JENDL-5", "JENDL-4.0u", "JENDL-HE-2007", "TENDL-2023", "CENDL-3.2", "PADF-2007", "BROND-3.1", "EAF-2010", "IRDFF-II"])
/** The POINT files' temperatures (the API's TEMPS); 0 K is its default. */
const TEMPS = [0, 293.6, 600, 900, 1200, 1500, 1800]
type Recon = { status: string; line?: BookLine; error?: string }
/** Newest first, for the Plotter's default release: the ENDF/B, JENDL, JEFF and TENDL lines by their latest version. */
const NEWEST = ["B-VIII.1", "JENDL-5", "JEFF-4.0", "TENDL-2023", "B-VIII.0", "JEFF-3.3", "CENDL-3.2", "BROND-3.1", "JENDL-4.0u", "IRDFF-II", "B-VII.1"]
const rankOf = (r: string) => { const i = NEWEST.indexOf(r); return i < 0 ? NEWEST.length : i }

export function ElpisBook({ p, label, mt, chosen = true, mtChosen = true }: { p: string; label: string; mt: number; chosen?: boolean; mtChosen?: boolean }) {
  const proj = PROJECTILES.find((x) => x.key === p) ?? PROJECTILES[0]
  const nuc = parseBookNuclide(label) ?? { z: 5, a: 11, iso: "" }
  const href = (l: string, m: number) => `/elpis/book/${proj.key}/${l}/${m}`
  const labelOf = (m: number) => mtLabel(m, proj.symbol, proj.key)

  const idx = useBookIndex(proj.key)
  const entry = idx?.nuclides.find((n) => n.l === label)
  const mts = idx && entry ? railMts(idx, entry) : []
  const here = mts.find((r) => r.mt === mt)
  // An MT I hold no section for whose residual MT 5 produces: the page draws that production.
  const prod = here && !here.mine ? here.prod : undefined
  const reaction = prod ? `${EXFOR_PROJ[proj.key]},X` : exforReaction(proj.key, mt)
  const prodLabel = prod ? `MT5 (${productName(prod.zap)} production)` : ""
  // A book opened without a nuclide (/elpis/book/t) lands on B-11 MT107; where this book has no such page, its first held
  // nuclide and MT instead. A nuclide without an MT (/elpis/book/n/26-Fe-56, browse's rows) opens on its first MT I hold.
  const router = useRouter()
  const redirectTo = (() => {
    if (!idx) return null
    if (!chosen) {
      if (here?.mine || here?.prod) return null
      const first = idx.nuclides.find((n) => n.m)
      return first ? href(first.l, railMts(idx, first).find((r) => r.mine)?.mt ?? 1) : null
    }
    if (mtChosen || !entry) return null
    const pick = mts.find((r) => r.mine) ?? mts[0]
    return pick && pick.mt !== mt ? href(label, pick.mt) : null
  })()
  useEffect(() => {
    if (redirectTo) router.replace(redirectTo)
  }, [redirectTo, router])
  const [temp, setTemp] = useState(0)
  const [qPick, setQPick] = useState<string | null>(null)
  const request = idx === undefined || redirectTo ? null : {
    name: apiName(nuc), sub: BOOK_SUB[proj.key], mt, target: exforTarget(nuc), reaction, temp: proj.key === "n" ? temp : 0,
    ...(prod ? { zap: prod.zap, product: productTarget(prod.zap) } : {}),
    // Without an index file, ask every release the lake holds; the API drops the ones without the section.
    releases: idx ? (prod ? prod.releases : here?.releases ?? []) : ["B-VIII.1", "JEFF-3.3", "JENDL-5", "B-VIII.0", "B-VII.1", "TENDL-2023", "CENDL-3.2", "B-VII.0", "B-VI.8", "B-V", "B-IV", "B-III", "B-II"],
  }
  const data = useBookData(request)
  const sets = useMemo(() => data?.sets ?? [], [data])
  // The range from the lines drawn on load (ON_BY_DEFAULT where any is drawn), not the releases listed off.
  const full = useMemo(() => {
    if (!data) return WAITING
    const on = data.lines.filter((l) => ON_BY_DEFAULT.has(l.release))
    return rangeOf(on.length ? on : data.lines, sets) ?? WAITING
  }, [data, sets])
  // The sheet's T (a series' values as a table) and I (an EXFOR set's information), per series name.
  const [tables, setTables] = useState<Set<string>>(new Set())
  const [infos, setInfos] = useState<Set<string>>(new Set())
  // Reconstructions: per release, swapped in for the File 3 line as each job returns; forgotten when the page changes.
  const [recon, setRecon] = useState<Record<string, Recon>>({})
  const page = `${proj.key}/${label}/${mt}/${temp}`
  const pageRef = useRef(page)
  pageRef.current = page
  useEffect(() => { setRecon({}); setQPick(null) }, [page])
  const lines = useMemo(() => (data?.lines ?? []).map((l) => recon[l.release]?.line ?? l), [data, recon])
  // Where a line is File 3's background: the release's resonance range, for the MTs its resonances add to.
  const ranges = useResRanges(proj.key === "n")
  const spans = useMemo(() => {
    const out: Record<string, [number, number]> = {}
    for (const l of lines) {
      if (l.served === "PREPRO" || !/only the background/.test(l.note ?? "")) continue
      const r = ranges?.[label]?.[l.release]
      if (r && (RES_MTS.has(mt) || r[2] === 7)) out[l.release] = [r[0], r[1]]
    }
    return out
  }, [lines, ranges, label, mt])
  const background = Object.keys(spans)
  const runRecon = () => {
    const at = pageRef.current
    for (const rel of background) {
      if (!JOB_RELEASES.has(rel) || recon[rel]?.status && recon[rel].status !== "failed") continue
      const set = (v: Recon) => { if (pageRef.current === at) setRecon((r) => ({ ...r, [rel]: v })) }
      set({ status: "queued" })
      reconstruct({ release: rel, name: apiName(nuc), mt, tempK: temp }, (s) => set({ status: s }))
        .then((line) => { set({ status: "done", line }); setVersion((v) => v + 1) })
        .catch((e) => set({ status: "failed", error: e instanceof Error ? e.message : String(e) }))
    }
  }
  // Lines off by default: every release outside ON_BY_DEFAULT, unless none of the drawn ones is in it.
  const offByDefault = useMemo(() => {
    const drawn = (data?.lines ?? []).map((l) => l.release)
    return drawn.some((r) => ON_BY_DEFAULT.has(r)) ? drawn.filter((r) => !ON_BY_DEFAULT.has(r)).map(libraryName) : []
  }, [data])

  // The Plotter and the chart share the range and the scales; the zoom box writes them back.
  const [range, setRange] = useState<Range>(full)
  const [scales, setScales] = useState<Scales>({ x: "log", y: "log" })
  const [fields, setFields] = useState(fieldsOf(full))
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [version, setVersion] = useState(0)
  const redraw = () => setVersion((v) => v + 1)
  // Each box zoom stacks the range it left; the undo circle pops one step; the double click (BookChart hands back `full`)
  // goes to the whole range and empties the stack.
  const [undo, setUndo] = useState<Range[]>([])
  // New data: the whole range, the default lines on, the stack emptied.
  useEffect(() => {
    setRange(full)
    setFields(fieldsOf(full))
    setUndo([])
    setHidden(new Set(offByDefault))
    setVersion((v) => v + 1)
  }, [full, offByDefault])
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
  const show = (names: string[], on: boolean) => {
    setHidden((h) => {
      const next = new Set(h)
      for (const name of names) if (on) next.delete(name)
      else next.add(name)
      return next
    })
    redraw()
  }

  // The Series sheet: the Lab's pane (useSheet), shut on load, the bar toggling it, the grip on its top line dragging it.
  const sheet = useSheet("elpis:book-sheet-h")

  // The rail: the page's element and isotope open, its MT row scrolled into view once the rail is open.
  const leftClosed = useRailClosed("left")
  const [openZ, setOpenZ] = useState<Set<number>>(() => new Set([nuc.z]))
  const [openIso, setOpenIso] = useState<Set<string>>(() => new Set([label]))
  const picked = useRef<HTMLAnchorElement>(null)
  useEffect(() => {
    setOpenZ((s) => new Set(s).add(nuc.z))
    setOpenIso((s) => new Set(s).add(label))
    if (!leftClosed) {
      picked.current?.scrollIntoView({ block: "center", inline: "nearest" })
      picked.current?.focus({ preventScroll: true })
    }
  }, [nuc.z, label, leftClosed, idx])
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
  const elements = useMemo(() => (idx ? railElements(idx) : []), [idx])

  // The Plotter's Release: the File 3 lines drawn (not a reconstruction, which carries no head), the newest first.
  const drawnQ = (data?.lines ?? []).filter((l) => !hidden.has(libraryName(l.release)))
  const newestFirst = [...drawnQ].sort((x, y) => rankOf(x.release) - rankOf(y.release))
  const head = drawnQ.find((l) => l.release === qPick) ?? newestFirst.find((l) => l.qi != null) ?? newestFirst[0]
  const threshold = head ? thresholdEv(head.qi, proj.key, nuc.a, nuc.z) : null
  const target = shortName(nuc)
  const setIds = sets.map((s) => s.id)
  // The legend: the lines drawn and one row for every EXFOR set; what is off is in the sheet.
  const legendRows: LegendRow[] = [
    ...lines.flatMap((l, k) => (hidden.has(libraryName(l.release)) ? [] : [{ key: libraryName(l.release), names: [libraryName(l.release)], text: libraryName(l.release), mark: <Swatch slot={slotOf(l.release, k)} dashed={!!spans[l.release]} /> }])),
    ...(sets.length ? [{ key: ALL_SETS, names: setIds, text: `EXFOR, ${sets.length} ${sets.length === 1 ? "set" : "sets"}`, mark: <Marker j={0} n={sets.length} /> }] : []),
  ]
  const flip2 = (set: React.Dispatch<React.SetStateAction<Set<string>>>, k: string) => set((x) => { const n = new Set(x); if (n.has(k)) n.delete(k); else n.add(k); return n })
  const empty = data && !lines.length && !sets.length
  const why = !reaction ? "EXFOR has no cross section for this MT as one reaction" : prod ? `no EXFOR production of ${productTarget(prod.zap)} in barns` : "no EXFOR cross section in barns"

  return (
    <div className="flex h-full min-h-0 flex-1">
      <PageTitle title={`${label} · ${prod ? `${labelOf(mt)} or ${prodLabel}` : labelOf(mt)}`} />
      {/* left: by nuclide, an inset rail with its tab, closed on load (InsetPanel, as /graph's) */}
      <InsetPanel side="left" storageKey="elpis:book-left-w">
        <div className={cn(INSET.header, LINE)}><h3 className={INSET.title}>By nuclide</h3></div>
        <InsetBody>
        {idx === undefined && <div className="flex justify-center px-3 py-4 text-[var(--paper-muted)]"><AtomSpinner size={28} label={`Loading the ${proj.symbol} book`} /></div>}
        {idx === null && <p className="px-3 py-2 text-sm text-[var(--paper-muted)]">The {proj.symbol} book index is not built yet.</p>}
        <ul className="text-sm" aria-label="By nuclide" onKeyDown={railKeys}>
          {elements.map(({ z: zz, nuclides }) => (
            <li key={zz}>
              <button type="button" aria-expanded={openZ.has(zz)} onClick={() => flip(setOpenZ, zz)} className={cn("flex w-full items-center gap-1.5 px-3 py-1 text-left text-[var(--paper-text)]", HOVER)}>
                <ChevronRight className={cn("size-3.5 shrink-0 text-[var(--paper-muted)] transition-transform", openZ.has(zz) && "rotate-90")} aria-hidden="true" />
                <span className="font-mono text-[13px]">{zz}-{symbolOfZ(zz)}</span>
              </button>
              {openZ.has(zz) && (
                <ul>
                  {nuclides.map((iso) => (
                    <li key={iso.l}>
                      <button type="button" aria-expanded={openIso.has(iso.l)} onClick={() => flip(setOpenIso, iso.l)} className={cn("flex w-full items-center gap-1.5 py-1 pl-7 pr-3 text-left", iso.m ? "text-[var(--paper-text)]" : "text-[var(--paper-muted)]", HOVER)}>
                        <ChevronRight className={cn("size-3.5 shrink-0 text-[var(--paper-muted)] transition-transform", openIso.has(iso.l) && "rotate-90")} aria-hidden="true" />
                        <span className="font-mono text-[13px]">{iso.l}</span>
                        <NuclideMark n={iso} />
                      </button>
                      {openIso.has(iso.l) && idx && (
                        <ul>
                          {railMts(idx, iso).map((m) => {
                            const on = iso.l === label && m.mt === mt
                            return (
                              <li key={m.mt}>
                                <Link ref={on ? picked : undefined} href={href(iso.l, m.mt)} aria-current={on ? "page" : undefined}
                                  className={cn("flex items-center py-1 pl-14 pr-3 text-[13px]", on ? cn(TINT, "border-l-2 border-[var(--paper-strong)] pl-[54px] font-medium text-[var(--paper-text)]") : cn(m.mine ? "text-[var(--paper-strong)]" : "text-[var(--paper-muted)]", HOVER))}>
                                  {m.prod ? `${labelOf(m.mt)} or MT5 (${productName(m.prod.zap)} production)` : labelOf(m.mt)}
                                  {!m.mine && !m.prod && <Mark kind="missing" />}
                                  {m.mine && !m.janis && <Mark kind="ours" />}
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

      {/* centre: the chart in the room the rails and the sheet leave, the Node sheet */}
      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="min-h-[240px] flex-1 px-2 pt-2">
          <div className="relative h-full w-full">
            <BookChart lines={lines} sets={sets} spans={spans} range={range} full={full} scales={scales} hidden={hidden} threshold={threshold} version={version} onZoom={zoomed} />
            {(!data || empty || data.errors.length > 0) && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-8 text-center text-sm text-[var(--paper-muted)]">
                {!data ? <AtomSpinner size={40} label={`Reading ${label} ${labelOf(mt)}`} />
                  : data.errors.length ? data.errors.join(" · ")
                  : prod ? `No release draws the production of ${productTarget(prod.zap)} from MT 5 here, and ${why}.` : `No File 3 section for ${labelOf(mt)} of ${label} in any release I hold, and ${why}.`}
              </div>
            )}
            {/* the undo circle rides inside the plot across from the legend's corner (Brendan, 2026-11-11 02:33) */}
            {legendRows.length > 0 && (
              <ChartLegend rows={legendRows} hidden={hidden} onToggle={show}
                footer={prod ? (
                  <p className={cn("mt-3 max-w-[260px] border-t pt-2 text-[11px] leading-4 text-[var(--paper-muted)]", LINE)}>Production of {productTarget(prod.zap)} from MT 5</p>
                ) : background.length > 0 || Object.keys(recon).length > 0 ? (
                  <ReconNote background={background} recon={recon} onRun={runRecon} />
                ) : null}
                aside={undo.length > 0 ? (
                  <CircleButton aria-label="Undo the last zoom" title="Undo the last zoom" onClick={back} className="size-8">
                    <Undo2 className="size-4" aria-hidden="true" />
                  </CircleButton>
                ) : null} />
            )}
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
                {["Node", "P", "T", "I"].map((h) => <th key={h} className="px-3 py-2 text-left text-xs font-medium text-[var(--paper-muted)]">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              <tr className={cn("border-b", LINE)}><td colSpan={3} className="px-3 py-2 font-medium">{BASE_NAME[proj.key]}</td></tr>
              {reaction && (
                <tr className={cn("border-b", LINE)}><td colSpan={3} className="px-3 py-2 pl-6 font-mono text-[13px]">EXFOR / Cross sections / {target} / {reaction}{prod ? ` ${productTarget(prod.zap)}` : ""}</td></tr>
              )}
              {sets.map((s, j) => (
                <NodeRow key={s.id} indent="pl-10" mark={<Marker j={j} n={sets.length} />} n={s.x.length}
                  node={<SetName s={s} />} on={!hidden.has(s.id)} onToggle={(v) => show([s.id], v)}
                  table={tables.has(s.id)} onTable={() => flip2(setTables, s.id)} info={infos.has(s.id)} onInfo={() => flip2(setInfos, s.id)}
                  detail={infos.has(s.id) || tables.has(s.id) ? <>
                    {infos.has(s.id) && <SetInfo s={s} />}
                    {tables.has(s.id) && <ValueTable x={s.x} y={s.y} dy={s.dy} />}
                  </> : null} />
              ))}
              {(data?.off ?? []).map((o) => (
                <tr key={o.id} className={cn("border-b text-[var(--paper-muted)]", LINE)}>
                  <td className="px-3 py-1.5 pl-10" colSpan={3}>
                    <Link href={`/datasets/exfor/${o.id}`} className="font-mono text-[13px] underline-offset-2 hover:underline">{o.id}</Link>
                    <span className="ml-2 text-xs">{[o.author, o.year].filter(Boolean).join(", ")} · not drawn: {o.why}</span>
                  </td>
                </tr>
              ))}
              {lines.map((l, k) => (
                <NodeRow key={l.release} indent="pl-6" mark={<Swatch slot={slotOf(l.release, k)} dashed={!!spans[l.release]} />} n={l.n}
                  node={<LineName l={l} text={prod ? `${libraryName(l.release)} / Production / ${target} / ${prodLabel}` : `${libraryName(l.release)} / Cross sections / ${target} / ${labelOf(mt)}`} />}
                  on={!hidden.has(libraryName(l.release))} onToggle={(v) => show([libraryName(l.release)], v)}
                  table={tables.has(l.release)} onTable={() => flip2(setTables, l.release)}
                  detail={tables.has(l.release) ? <ValueTable x={l.x} y={l.y} /> : null} />
              ))}
            </tbody>
          </table>
          {background.some((r) => !JOB_RELEASES.has(r)) && (
            <p className="mt-2 text-xs text-[var(--paper-muted)]">No reconstruction for {background.filter((r) => !JOB_RELEASES.has(r)).map(libraryName).join(", ")}: nsr-jobs reconstructs {[...JOB_RELEASES].map(libraryName).join(", ")}.</p>
          )}
          {data?.truncated && <p className="mt-2 text-xs text-[var(--paper-muted)]">Some EXFOR points past the 50,000 a request returns are not drawn.</p>}
        </div>
          )}
        </Sheet>
      </section>

      {/* right: the plotter, an inset rail with its tab, closed on load */}
      <InsetPanel side="right" storageKey="elpis:book-right-w">
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
        {proj.key === "n" && (
          <label className="mt-4 flex flex-col gap-1 text-xs text-[var(--paper-muted)]">Temperature
            <select value={temp} onChange={(e) => setTemp(Number(e.target.value))}
              className="h-9 rounded-md border border-[var(--paper-rule)] bg-[var(--paper)] px-2 text-sm text-[var(--paper-text)]">
              {TEMPS.map((t) => <option key={t} value={t}>{t} K</option>)}
            </select>
            <span>ENDF/B-VIII.1 and VIII.0 from their POINT files; Reconstruct broadens to it.</span>
          </label>
        )}
        {newestFirst.length > 0 && (
          <label className="mt-4 flex flex-col gap-1 text-xs text-[var(--paper-muted)]">Release
            <select value={head?.release ?? ""} onChange={(e) => setQPick(e.target.value)}
              className="h-9 rounded-md border border-[var(--paper-rule)] bg-[var(--paper)] px-2 text-sm text-[var(--paper-text)]">
              {newestFirst.map((l) => <option key={l.release} value={l.release}>{libraryName(l.release)}</option>)}
            </select>
          </label>
        )}

        <dl className="mt-6 text-sm">
          <dt className="text-xs text-[var(--paper-muted)]">Reaction Q value</dt>
          <dd className="font-mono text-[var(--paper-text)]">{head?.qi != null ? qText(head.qi) : "—"}</dd>
          {head?.qi != null && head.qm != null && head.qm !== head.qi && (
            <>
              <dt className="mt-2 text-xs text-[var(--paper-muted)]">Mass-difference Q value</dt>
              <dd className="font-mono text-[var(--paper-text)]">{qText(head.qm)}</dd>
            </>
          )}
          <dd className="mt-1 text-xs text-[var(--paper-muted)]">
            {prod ? `Production from MT 5 has no Q value of its own (${labelOf(mt)} is not a section I hold)` : head ? `File 3 of ${libraryName(head.release)}` : data ? "No File 3 section in any release I hold" : <AtomSpinner size={16} label="Reading File 3" />}
          </dd>
          {threshold && (
            <>
              <dt className="mt-2 text-xs text-[var(--paper-muted)]">Threshold</dt>
              <dd className="font-mono text-[var(--paper-text)]">{qText(threshold)}</dd>
            </>
          )}
        </dl>
        <div className="mt-6 flex flex-col gap-2 text-sm">
          <Link href={`/elpis/search/exfor?${new URLSearchParams({ target: exforTarget(nuc), ...(reaction ? { reaction } : {}) })}`} className={LINK}>Additional EXFOR</Link>
          <Link href={`/elpis/search/endf?${new URLSearchParams({ target: apiName(nuc), mt: String(mt), projectile: proj.key })}`} className={LINK}>Additional ENDF</Link>
        </div>
        </section>
        </InsetBody>
      </InsetPanel>
    </div>
  )
}

function NuclideMark({ n }: { n: BookIndexNuclide }) {
  if (!n.m) return <Mark kind="missing" />
  if (!n.j) return <Mark kind="ours" />
  return null
}

function SetName({ s }: { s: BookSet }) {
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2">
      <Link href={`/datasets/exfor/${s.id}`} className="font-mono text-[13px] underline-offset-2 hover:underline">{s.id}</Link>
      <span className="text-xs text-[var(--paper-muted)]">{[s.author, s.year].filter(Boolean).join(", ")}</span>
    </span>
  )
}

function LineName({ l, text }: { l: BookLine; text: string }) {
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2">
      <span className="font-mono text-[13px]">{text}</span>
      {l.note && <span className="text-xs text-[var(--paper-muted)]">{l.note}</span>}
    </span>
  )
}

type LegendRow = { key: string; names: string[]; text: string; mark: React.ReactNode }

/** The corners the legend steps through, in order, and its insets inside the plot (BookChart's grid: 72, 24, 18, 48). */
const CORNERS = ["top left", "top right", "bottom right", "bottom left"] as const
const INSETS = { left: 84, right: 36, top: 28, bottom: 58 }

/** The chart's legend (Brendan, 2026-11-11 01:12), drawn here instead of by ECharts: 12 px padding, 6 px between rows,
 *  12 px type; an accordion, open on load, its title "Legend" in the display face with the chevron beside it as one
 *  button (Brendan, 02:20), and a Move button at the right that slides it to the next corner, top left, top right,
 *  bottom right, bottom left, 300 ms ease-out. A row toggles its series (a row for every EXFOR set past twelve toggles
 *  them all). `aside` (the undo circle) sits inside the plot at the same height, across from the legend's corner, and
 *  crosses with it. */
function ChartLegend({ rows, hidden, onToggle, aside, footer }: { rows: LegendRow[]; hidden: Set<string>; onToggle: (names: string[], on: boolean) => void; aside?: React.ReactNode; footer?: React.ReactNode }) {
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
  const icon = cn("inline-flex size-6 items-center justify-center rounded-md text-[var(--paper-muted)] transition-colors hover:text-[var(--paper-text)]", HOVER)
  return (
    <div ref={frame} className="pointer-events-none absolute inset-0 overflow-hidden">
      <div ref={box} style={{ padding: 12, transform: `translate(${x}px, ${y}px)` }}
        className={cn("pointer-events-auto absolute left-0 top-0 max-h-[calc(100%-86px)] overflow-y-auto rounded-md border bg-[var(--paper)] shadow-sm transition-transform duration-300 ease-out", LINE)}>
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
              const on = r.names.some((n) => !hidden.has(n))
              return (
                <li key={r.key}>
                  <button type="button" aria-pressed={on} onClick={() => onToggle(r.names, !on)}
                    className={cn("flex items-center gap-2 whitespace-nowrap text-[12px] leading-4", on ? "text-[var(--paper-text)]" : "text-[var(--paper-muted)] opacity-60")}>
                    <span className="inline-flex w-[18px] justify-center">{r.mark}</span>{r.text}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        {open && footer}
      </div>
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

/** A series' values, the first 300 rows. */
function ValueTable({ x, y, dy }: { x: number[]; y: number[]; dy?: (number | null)[] }) {
  const k = Math.min(300, x.length)
  return (
    <div className="max-h-64 overflow-auto">
      <table className="font-mono text-xs text-[var(--paper-text)]">
        <thead><tr className="text-[var(--paper-muted)]"><th className="pr-6 text-left font-normal">Incident energy</th><th className="pr-6 text-left font-normal">Cross section (b)</th>{dy && <th className="text-left font-normal">Uncertainty (b)</th>}</tr></thead>
        <tbody>
          {Array.from({ length: k }, (_, i) => (
            <tr key={i}><td className="pr-6">{energyTick(x[i])}</td><td className="pr-6">{y[i]?.toPrecision(5)}</td>{dy && <td>{dy[i] != null ? dy[i]!.toPrecision(3) : ""}</td>}</tr>
          ))}
        </tbody>
      </table>
      {x.length > k && <p className="mt-1 text-xs text-[var(--paper-muted)]">The first {k} of {x.length.toLocaleString("en-US")}; the subentry&apos;s page has every point.</p>}
    </div>
  )
}

/** An EXFOR set's information: entry, authors and year. */
function SetInfo({ s }: { s: BookSet }) {
  return (
    <p className="mb-2 text-xs text-[var(--paper-muted)]">
      Subentry <Link href={`/datasets/exfor/${s.id}`} className={LINK}>{s.id}</Link>{s.entry ? <> of entry {s.entry}</> : null}
      {s.author ? ` · ${s.author}` : ""}{s.year ? `, ${s.year}` : ""} · {s.x.length.toLocaleString("en-US")} points from {energyTick(Math.min(...s.x))} to {energyTick(Math.max(...s.x))}
    </p>
  )
}

function Swatch({ slot, dashed }: { slot: number; dashed?: boolean }) {
  const [dark, setDark] = useState(false)
  useEffect(() => setDark(document.documentElement.classList.contains("dark")), [])
  const c = (dark ? SLOTS.dark : SLOTS.light)[slot % 8]
  return <span aria-hidden="true" className="inline-block h-0.5 w-4 shrink-0 rounded" style={dashed ? { backgroundImage: `linear-gradient(90deg, ${c} 60%, transparent 60%)`, backgroundSize: "6px 2px" } : { background: c }} />
}

/** The legend's note under the lines when some are File 3's background (lead, 2026-11-11): the note, the Reconstruct
 *  button, and each job's state as it runs. */
function ReconNote({ background, recon, onRun }: { background: string[]; recon: Record<string, Recon>; onRun: () => void }) {
  const runnable = background.filter((r) => JOB_RELEASES.has(r))
  const busy = Object.values(recon).some((r) => r.status !== "done" && r.status !== "failed")
  const states = Object.entries(recon).filter(([, r]) => r.status !== "done" || r.error)
  const left = runnable.filter((r) => !recon[r] || recon[r].status === "failed")
  return (
    <div className={cn("mt-3 max-w-[260px] border-t pt-2 text-[11px] leading-4 text-[var(--paper-muted)]", LINE)}>
      <p className="flex items-center gap-2"><Swatch slot={7} dashed />File 3 background in the resonance range</p>
      {left.length > 0 && !busy && (
        <Button variant="outline" onClick={onRun} className="mt-2 h-7 rounded-full px-3 text-xs">Reconstruct</Button>
      )}
      {states.map(([rel, r]) => (
        <p key={rel} className="mt-1">{libraryName(rel)}: {r.error ?? r.status}</p>
      ))}
    </div>
  )
}

function Marker({ j, n = 0 }: { j: number; n?: number }) {
  const [dark, setDark] = useState(false)
  useEffect(() => setDark(document.documentElement.classList.contains("dark")), [])
  // Past MANY_SETS the points are coloured by set: a filled dot in the set's colour.
  if (n > MANY_SETS) return <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" className="shrink-0"><circle cx="6" cy="6" r="3" fill={setLook(j, n, dark).color} fillOpacity={0.8} /></svg>
  const { symbol } = markerOf(j)
  const filled = true
  const path = symbol === "circle" ? <circle cx="6" cy="6" r="4" /> : symbol === "rect" ? <rect x="2" y="2" width="8" height="8" /> : symbol === "triangle" ? <path d="M6 1.5 10.5 10h-9z" /> : <path d="M6 1 11 6 6 11 1 6z" />
  return <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" className={cn("shrink-0 stroke-[var(--paper-text)]", filled ? "fill-[var(--paper-text)]" : "fill-none")} strokeWidth="1.25">{path}</svg>
}
