"use client"
// /janis/book/{n|g|p|d|t|h|a}/[nuclide]/[mt] (brief 67): JANIS Web's book page. The two side columns are inset rails with
// their tabs, as /graph's panels (InsetPanel, Brendan 2026-11-11), closed on load; the Node table is a bottom sheet in the
// Lab's OutputPane shape, closed on load; the chart takes the room left. Left, "By nuclide":
// elements that open to isotopes that open to MT rows, the page's own highlighted. Centre: one row of the chart pages'
// circle steppers (Brendan, 2026-11-11 00:55), the nuclide on the left and the reaction on the right, each name between
// its circles; the chart with its zoom box (BookChart); the Node table (Node, Settings, Display). JANIS Web's nav strip
// and the tab strip are gone from this page. Right: the Plotter (scales, ranges, Apply), the
// reaction's Q value and the two links. Placeholder rows and series only.
import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-react"
import { HOVER as CIRCLE_HOVER } from "@/components/CopyTitle"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SERIF } from "@/app/(site)/(plate)/viz/box-style"
import { INSET, InsetBody, InsetPanel } from "@/components/nsr/graph/InsetPanel"
import { useRailClosed } from "@/components/rail-toggle"
import { BookChart, EXFOR_SETS, FULL, LIBRARIES, type Range, type Scales } from "@/components/janis/BookChart"
import { HOVER, LINE, LINK, TINT } from "@/components/janis/parts"
import { BOOK_MTS, bookNuclides, mtLabel, neighbours, nuclideLabel, PROJECTILES, symbolOfZ, Z_MAX } from "@/lib/janis-tree"
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

  // The title bar: nuclides skip the natural element; reactions run on into the next nuclide's first.
  const isoNeighbours = useMemo(() => {
    const masses = (zz: number) => bookNuclides(zz).filter((x) => x.a !== "Nat")
    const all = [z - 1, z, z + 1].filter((x) => x >= 0 && x <= Z_MAX).flatMap(masses)
    const i = all.findIndex((x) => x.z === z && x.a === a)
    return i < 0 ? neighbours(z, a) : { prev: all[i - 1]?.label, next: all[i + 1]?.label }
  }, [z, a])
  const mtIndex = BOOK_MTS.findIndex((m) => m.mt === mt)
  const around = neighbours(z, a)
  const prevMt = mtIndex > 0 ? { href: href(here, BOOK_MTS[mtIndex - 1].mt), text: label(BOOK_MTS[mtIndex - 1].mt) }
    : around.prev ? { href: href(around.prev, BOOK_MTS[BOOK_MTS.length - 1].mt), text: `${around.prev} ${label(BOOK_MTS[BOOK_MTS.length - 1].mt)}` } : null
  const nextMt = mtIndex >= 0 && mtIndex < BOOK_MTS.length - 1 ? { href: href(here, BOOK_MTS[mtIndex + 1].mt), text: label(BOOK_MTS[mtIndex + 1].mt) }
    : around.next ? { href: href(around.next, BOOK_MTS[0].mt), text: `${around.next} ${label(BOOK_MTS[0].mt)}` } : null
  const current = mt === 107 && proj.key === "n" && typeof a === "number" && z >= 2 ? `${label(mt)} or MT5 (${short(z - 2, a - 3)} production)` : label(mt)
  const target = typeof a === "number" ? short(z, a) : `${symbolOfZ(z)}0`

  // The Plotter and the chart share the range and the scales; the zoom box writes them back.
  const [range, setRange] = useState<Range>(FULL)
  const [scales, setScales] = useState<Scales>({ x: "log", y: "log" })
  const [fields, setFields] = useState({ xmin: exp(FULL.xmin), xmax: exp(FULL.xmax), ymin: exp(FULL.ymin), ymax: exp(FULL.ymax) })
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [version, setVersion] = useState(0)
  const redraw = () => setVersion((v) => v + 1)
  const zoomed = (r: Range) => {
    setRange(r)
    setFields({ xmin: exp(r.xmin), xmax: exp(r.xmax), ymin: exp(r.ymin), ymax: exp(r.ymax) })
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

  // The Node sheet, shut on load as the Lab's pane is; its tab opens it.
  const [sheet, setSheet] = useState(false)

  // The rail: the page's element and isotope open, its MT row scrolled into view once the rail is open.
  const leftClosed = useRailClosed("left")
  const [openZ, setOpenZ] = useState<Set<number>>(() => new Set([z]))
  const [openIso, setOpenIso] = useState<Set<string>>(() => new Set([here]))
  const picked = useRef<HTMLAnchorElement>(null)
  useEffect(() => {
    setOpenZ((s) => new Set(s).add(z))
    setOpenIso((s) => new Set(s).add(here))
    if (!leftClosed) picked.current?.scrollIntoView({ block: "center", inline: "nearest" })
  }, [z, here, leftClosed])
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
        <ul className="text-sm" aria-label="By nuclide">
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

      {/* centre: the two steppers, the chart in the room the rails and the sheet leave, the Node sheet. JANIS Web's own
          nav strip (the layout's) is hidden on this page only; the plot's series list is the sheet. */}
      <style>{'nav[aria-label="JANIS"]{display:none}'}</style>
      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className={cn("flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b px-4 py-3", LINE)}>
          <Stepper what="nuclide" current={here}
            prev={isoNeighbours.prev ? { href: href(isoNeighbours.prev, mt), text: isoNeighbours.prev } : null}
            next={isoNeighbours.next ? { href: href(isoNeighbours.next, mt), text: isoNeighbours.next } : null} />
          <Stepper what="reaction" current={current} prev={prevMt} next={nextMt} />
        </div>

        <div className="min-h-[240px] flex-1 px-2 pt-2">
          <BookChart range={range} scales={scales} hidden={hidden} version={version} onZoom={zoomed} />
        </div>

        {/* the Node sheet: the Lab's OutputPane shape, a 36 px bar at rest, 260 px open, closed on load */}
        <div className={cn("flex shrink-0 flex-col overflow-hidden border-t border-[var(--paper-rule)] bg-[var(--paper)] transition-[height] duration-[500ms] ease-in-out", sheet ? "h-[260px]" : "h-9")}>
          <div className="flex h-9 shrink-0 items-center gap-1 px-2">
            <button type="button" className={SHEET_TAB(sheet)} aria-expanded={sheet} onClick={() => setSheet(true)}>Node</button>
            <div className="ml-auto flex items-center gap-1">
              <button type="button" aria-label={sheet ? "Close the pane" : "Open the pane"} className={SHEET_TAB(false)} onClick={() => setSheet((o) => !o)}>
                {sheet ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
          {sheet && (
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
        </div>
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

/** The chart pages' back and forward circles (components/AppLayout.tsx ChartNav: 40 px, the paper border, 2 px on hover,
 *  the shadow, the hover tint, the destination as the tooltip), with the current name in the display face between them.
 *  A circle with nowhere to go is drawn faint. */
type Step = { href: string; text: string } | null
function Stepper({ what, current, prev, next }: { what: string; current: string; prev: Step; next: Step }) {
  const circle = cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--paper-rule)] bg-[var(--paper)] shadow-md transition-colors", CIRCLE_HOVER)
  const go = (s: Step, dir: "Previous" | "Next") => {
    const Icon = dir === "Previous" ? ChevronLeft : ChevronRight
    return s ? (
      <Link href={s.href} aria-label={`${dir} ${what}: ${s.text}`} title={s.text} className={cn(circle, "hover:border-2")}>
        <Icon className="h-4 w-4 text-[var(--paper-text)]" />
      </Link>
    ) : (
      <span aria-hidden="true" className={cn(circle, "pointer-events-none opacity-40 shadow-none")}><Icon className="h-4 w-4 text-[var(--paper-muted)]" /></span>
    )
  }
  return (
    <div className="flex min-w-0 items-center gap-3">
      {go(prev, "Previous")}
      <strong className="min-w-0 truncate text-xl font-normal tracking-tight text-[var(--paper-text)]" style={SERIF} title={current}>{current}</strong>
      {go(next, "Next")}
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
