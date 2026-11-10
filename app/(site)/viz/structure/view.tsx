'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, Maximize2, Minus, Plus, X } from 'lucide-react'
import { LegendBar, Pills } from '@/components/viz/Pills'
import { VizControls, VizSection } from '@/components/viz/VizControls'
import { usePaperTheme } from '@/lib/use-paper-theme'
import { AGE_LABELS, DIVERGE7, ELEMENTS, XUNDL_LABELS, datasetsHref, parseMassQuery, useStructureIndex } from '@/lib/structure'
import { ChartOfNuclides, type ChartMode } from './chart'
import { EvaluationIndex } from './index-table'

// /viz/structure (brief 35, 2026-11-09): the old nsr app's ENSDF and XUNDL landings (src/pages/Structure.tsx's chart)
// and its evaluation index (src/pages/ensdf/Evaluation.tsx), ported whole onto one page. The old app gave each colour
// code its own page (/ensdf by evaluation age, /xundl by XUNDL sets since the cutoff); here they are two pills over
// the chart. The old chart had its expand toggle, quick search, zoom and legend over the canvas; here they, the tabs and
// the pills are in the right panel (brief 54, Part B, 2026-11-10). Typing in Nuclide zooms; Enter opens. A click on a
// cell opens the nuclide's datasets.

type Tab = 'chart' | 'index'
const TABS = [{ id: 'chart', label: 'Chart' }, { id: 'index', label: 'Evaluation index' }] as const
const MODES = [{ id: 'age', label: 'Years since cutoff' }, { id: 'xundl', label: 'XUNDL sets since cutoff' }] as const
const VIEW_BTN =
  'flex h-7 w-7 items-center justify-center rounded-md border border-[var(--paper-rule)]/30 text-[var(--paper-text)] transition-colors hover:bg-[var(--paper-quiet)]'

/** "148Gd" / "Pb-208" → {a,z} · "148" → {a} · "Gd" → {z} · anything else → null. */
function parseTarget(t: string): { a?: number; z?: number } | null {
  if (!t) return null
  const nm = /^(\d{1,3})\s*-?\s*([A-Za-z]{1,2})$/.exec(t) ?? /^([A-Za-z]{1,2})\s*-?\s*(\d{1,3})$/.exec(t)
  if (nm) {
    const numFirst = /^\d/.test(nm[1])
    const a = Number(numFirst ? nm[1] : nm[2])
    const raw = numFirst ? nm[2] : nm[1]
    const sym = raw[0].toUpperCase() + raw.slice(1).toLowerCase()
    const z = ELEMENTS.indexOf(sym)
    return z > 0 ? { a, z } : null
  }
  if (/^[A-Za-z]{1,2}$/.test(t)) {
    const sym = t[0].toUpperCase() + t.slice(1).toLowerCase()
    const z = ELEMENTS.indexOf(sym)
    return z > 0 ? { z } : null
  }
  if (/^\d{1,3}$/.test(t)) return { a: Number(t) }
  return null
}

export function StructureView() {
  const router = useRouter()
  const { data } = useStructureIndex()
  const root = useRef<HTMLDivElement>(null)
  const { dark } = usePaperTheme(root)
  const [tab, setTab] = useState<Tab>('chart')
  const [mode, setMode] = useState<ChartMode>('age')
  // ?mode=xundl and ?tab=index open the page that way (a static page reads them once it's in the browser).
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    if (p.get('mode') === 'xundl') setMode('xundl')
    if (p.get('tab') === 'index') setTab('index')
  }, [])

  // Chart quick search: the parsed target drives the zoom as you type.
  const [cq, setCq] = useState('')
  const focus = useMemo(() => parseTarget(cq.trim()), [cq])
  // Expand fills the screen (the old ExpandFrame grew over the app shell); Esc collapses, as the browser does.
  const frame = useRef<HTMLDivElement>(null)
  const zoom = useRef<((factor: number) => void) | null>(null)
  const [expanded, setExpanded] = useState(false)
  useEffect(() => {
    const on = () => setExpanded(document.fullscreenElement === frame.current && frame.current !== null)
    document.addEventListener('fullscreenchange', on)
    return () => document.removeEventListener('fullscreenchange', on)
  }, [])
  const toggleExpand = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void frame.current?.requestFullscreen?.()
  }, [])

  const open = useCallback((a: number, z: number) => router.push(datasetsHref(a, ELEMENTS[z] ?? '')), [router])
  // Enter jumps: "148Gd"/"Pb-208" → that nuclide's datasets; "148" or "Gd" frame the chain or the element.
  const goTo = (text: string) => {
    const f = parseTarget(text.trim())
    if (f?.a != null && f.z != null) open(f.a, f.z)
    else {
      const a = parseMassQuery(text)
      if (a) setCq(String(a))
    }
  }

  const allNuclides = useMemo(() => data?.nuclides ?? [], [data])
  const nuclideCombo = useMemo(
    () => [...allNuclides].sort((x, y) => x.a - y.a || x.el.localeCompare(y.el)).map((r): ComboOpt => ({
      value: r.code, search: `${r.code} ${r.el}${r.a}`.toLowerCase(), label: <span><sup>{r.a}</sup>{r.el}</span>,
    })),
    [allNuclides],
  )
  const massCombo = useMemo(
    () => [...new Set(allNuclides.map((r) => r.a))].sort((x, y) => x - y).map((a): ComboOpt => ({ value: String(a), search: String(a), label: String(a) })),
    [allNuclides],
  )
  const symbolCombo = useMemo(() => {
    const seen = new Map<number, string>()
    for (const r of allNuclides) if (!seen.has(r.z)) seen.set(r.z, r.el)
    return [...seen.entries()].sort((a, b) => a[0] - b[0]).map(([z, el]): ComboOpt => ({ value: el, search: `${el} ${z}`.toLowerCase(), label: el }))
  }, [allNuclides])

  const ramp = DIVERGE7[dark ? 'dark' : 'light']
  const legend = {
    title: mode === 'age' ? 'Years since cutoff' : 'XUNDL sets since cutoff',
    segments: ramp.map((color, i) => ({ color, label: (mode === 'age' ? AGE_LABELS : XUNDL_LABELS)[i] })),
  }

  return (
    <div ref={root} className="flex min-h-0 w-full flex-1 flex-col">
      {/* The chart stays mounted under the index, so its view is kept and the frame's skeleton stays away. */}
      <div ref={frame} className={`relative min-h-0 flex-1 bg-[var(--paper)] ${expanded ? 'p-2' : ''} ${tab === 'chart' ? '' : 'hidden'}`}>
        {data ? <ChartOfNuclides grid={data.grid} mode={mode} focus={focus} onSelect={open} zoomRef={zoom} /> : null}
      </div>

      {tab === 'index' && (data ? (
        <EvaluationIndex data={data} onShowChain={(a) => { setCq(String(a)); setTab('chart') }} />
      ) : (
        <p className="px-1 text-[13px] text-[var(--paper-muted)]">Loading the index…</p>
      ))}

      {/* Off the canvas (brief 54, Part B): the tabs, Colour by and its legend, the quick search, zoom and expand. */}
      <VizControls>
        <VizSection>
          <Pills options={TABS} value={tab} onChange={setTab} />
        </VizSection>
        {tab === 'chart' && (
          <>
            <VizSection title="Colour by">
              <Pills options={MODES} value={mode} onChange={setMode} />
              <LegendBar title={legend.title} segments={legend.segments} fill className="mt-1" />
            </VizSection>
            {/* Three boxes, one applied value: Nuclide is live (typing zooms; Enter opens), Mass and Symbol apply on pick. */}
            <VizSection title="Find">
              <ChartCombobox placeholder="Nuclide, Mass, or Symbol" options={nuclideCombo} applied={cq} onApply={setCq} live clearable onEnter={goTo} />
              <div className="grid grid-cols-2 gap-2">
                <ChartCombobox placeholder="Mass" options={massCombo} applied={cq} appliedMatches={(v) => /^\d{1,3}$/.test(v)} onApply={setCq} />
                <ChartCombobox placeholder="Symbol" options={symbolCombo} applied={cq} appliedMatches={(v) => /^[A-Za-z]{1,2}$/.test(v)} onApply={setCq} />
              </div>
            </VizSection>
            <VizSection title="View">
              <div className="flex items-center gap-1.5">
                <button type="button" className={VIEW_BTN} title="Zoom in" aria-label="Zoom in" onClick={() => zoom.current?.(1.4)}>
                  <Plus className="h-3.5 w-3.5" />
                </button>
                <button type="button" className={VIEW_BTN} title="Zoom out" aria-label="Zoom out" onClick={() => zoom.current?.(1 / 1.4)}>
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <button type="button" className={VIEW_BTN} title="Expand to fill the screen (Esc collapses)" aria-label="Expand" onClick={toggleExpand}>
                  <Maximize2 className="h-3.5 w-3.5 -scale-x-100" />
                </button>
              </div>
            </VizSection>
          </>
        )}
        <VizSection>
          <p className="m-0">
            Every nuclide with an ENSDF or XUNDL dataset, at its N and Z. Years since cutoff: how long since the literature
            cutoff of the evaluation its data follows. XUNDL sets since cutoff: measurements compiled since then, waiting for
            the next evaluation. Scroll to zoom, drag to pan, click a cell for the nuclide&apos;s datasets.
          </p>
          {data && <p className="m-0 text-[var(--paper-faint)]">{data.source}</p>}
        </VizSection>
      </VizControls>
    </div>
  )
}

/** One option in a chart combobox. `search` is the lowercase text the typed text filters against. */
interface ComboOpt { value: string; search: string; label: React.ReactNode; meta?: React.ReactNode }

/**
 * The chart's combobox, ported from the old Structure page: click it for the full list, type and the list narrows,
 * pick an item to apply it. `live` binds the text straight to the applied value (the Nuclide box: typing drives the
 * zoom); otherwise the box drafts locally and applies on pick, showing the applied value when it is of this box's kind.
 */
function ChartCombobox({
  placeholder, className, options, applied, appliedMatches, onApply, live = false, onEnter, clearable = false,
}: {
  placeholder: string
  className?: string
  options: ComboOpt[]
  applied: string
  appliedMatches?: (v: string) => boolean
  onApply: (v: string) => void
  live?: boolean
  onEnter?: (text: string) => void
  clearable?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [focused, setFocused] = useState(false)
  const [draft, setDraft] = useState('')
  const text = live ? applied : focused ? draft : appliedMatches?.(applied.trim()) ? applied.trim() : ''
  const needle = text.trim().toLowerCase().replace(/[-\s]/g, '')
  const filtered = needle ? options.filter((o) => o.search.includes(needle)) : options
  const pick = (v: string) => { onApply(v); setDraft(''); setOpen(false) }
  return (
    <div className={`relative ${className ?? ''}`}>
      <input
        value={text}
        onChange={(e) => { if (live) onApply(e.target.value); else setDraft(e.target.value); setOpen(true) }}
        onFocus={() => { setFocused(true); setDraft(''); setOpen(true) }}
        onBlur={() => { setFocused(false); setDraft(''); setOpen(false) }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            setOpen(false)
            if (onEnter) onEnter(text)
            else if (filtered.length === 1) pick(filtered[0].value)
            else { const exact = filtered.find((o) => o.search === needle); if (exact) pick(exact.value) }
          }
          if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false) }
        }}
        placeholder={placeholder}
        className="h-8 w-full rounded-md border border-[var(--paper-rule)]/30 bg-[var(--paper)]/90 pl-3 pr-7 text-xs text-[var(--paper-text)] shadow-sm outline-none backdrop-blur placeholder:text-[var(--paper-faint)] focus:border-[var(--paper-text)]"
      />
      {clearable && text ? (
        <button
          type="button"
          title="Clear"
          // mousedown so the input keeps focus and the blur doesn't race the clear
          onMouseDown={(e) => { e.preventDefault(); onApply(''); setDraft('') }}
          className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-sm text-[var(--paper-faint)] transition-colors hover:bg-[var(--paper-quiet)] hover:text-[var(--paper-text)]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : (
        <button
          type="button"
          tabIndex={-1}
          title="Open list"
          onMouseDown={(e) => { e.preventDefault(); setOpen((o) => !o); (e.currentTarget.previousElementSibling as HTMLElement | null)?.focus?.() }}
          className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-sm text-[var(--paper-faint)]"
        >
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      )}
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-[var(--paper-rule)]/30 bg-[var(--paper)] p-1 shadow-md">
          {filtered.length === 0 && <p className="m-0 px-2.5 py-2 text-xs text-[var(--paper-muted)]">No matches</p>}
          {filtered.map((o) => (
            <button
              key={o.value}
              type="button"
              // mousedown, not click: the pick must land before the input's blur closes the list
              onMouseDown={(e) => { e.preventDefault(); pick(o.value) }}
              className={`flex w-full items-center justify-between rounded-sm px-2.5 py-1 text-left text-xs text-[var(--paper-text)] transition-colors hover:bg-[var(--paper-quiet)] ${applied.trim().toLowerCase() === o.value.toLowerCase() ? 'bg-[var(--paper-quiet)] font-semibold' : ''}`}
              style={{ fontFamily: 'var(--font-mono), ui-monospace, monospace', contentVisibility: 'auto', containIntrinsicSize: '0 26px' } as React.CSSProperties}
            >
              <span>{o.label}</span>
              {o.meta && <span className="text-[10px] text-[var(--paper-muted)]">{o.meta}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
