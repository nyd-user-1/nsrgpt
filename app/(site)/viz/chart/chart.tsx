'use client'

import * as React from 'react'
import Link from 'next/link'
import { X } from 'lucide-react'
import { useSwitchboard } from '@/components/SwitchboardPanel'
import { useEChart } from '@/components/viz/use-echart'
import { ChartBox } from '@/components/viz/chart-kebab'
import { LegendBar, Pills } from '@/components/viz/Pills'
import { VizControls, VizSection } from '@/components/viz/VizControls'
import { AXIS, FAMILY, familyOf, halfLifeText, ink, isDark, loadDecay, modesText, nucName, keyOf, type Decay, type DecayNuclide } from '@/lib/viz-physics'
import { ELEMENTS, datasetsHref, inkOn, papersHref } from '@/lib/structure'
import { apiUrl } from '@/lib/api-url'
import { ELEMENT_NAMES, RADIATION_LABEL, jpi, loadGround, loadRadiation, massMicroU, type Ground, type GroundRow, type Radiation } from './data'
import { MODES, colouring, loadCounts, modeLine, type Counts, type Mode } from './colour'

// The chart of nuclides (Brendan, 2026-11-08): every ENSDF nuclide a box at (N, Z) in its decay family's colour, the
// palette every chart here uses (lib/nuclide.ts FAMILY), magic numbers ruled. Hover reads the box; a click opens the
// nuclide's card, the IAEA Live Chart's own fields: Jπ, half-life, mass excess, binding per nucleon, mass, Qα, Qβ, Qec,
// Sn, Sp, decay modes and the major radiations. Scroll to zoom, drag to pan.
// Colour modes (brief 35, Part 2, 2026-11-09): a Colour by row over the chart picks what the colour says (./colour.ts),
// its one legend beside it; a Sources line under the chart; the card links to the nuclide's datasets, its papers and
// its row in the nuclides table; ?nuclide=137Cs opens a card.
// Off the canvas (brief 54, Part A, 2026-11-10): Colour by, its legend and the card live in the right panel's chart layer
// (components/viz/VizControls.tsx); a click on a cell opens the panel with the card at the top. The cell under the
// pointer and the open card's cell are drawn again at 2× on the marks' layer (use-echart's tile mark).

const MAGIC = [2, 8, 20, 28, 50, 82, 126]
// Labels as cells grow (brief 37), as /viz/structure's chart draws them: the element symbol once a cell is about 28 px
// across, the mass number above it from 48 px, in the ink that reads on the cell's fill.
const LABEL_PX = 28, MASS_PX = 48
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'
type Data = { d: Decay; g: Ground }

export function NuclideChart() {
  const [data, setData] = React.useState<Data | null>(null)
  const [pick, setPick] = React.useState<number | null>(null)
  const [mode, setMode] = React.useState<Mode>('family')
  const [counts, setCounts] = React.useState<Counts | null>(null)
  const dark = useDark()
  const { openVizControls } = useSwitchboard()
  // A pick opens the panel on the chart's layer, where the card is.
  const open = React.useCallback((i: number) => {
    setPick(i)
    openVizControls()
  }, [openVizControls])
  // The structure index and the NSR field load when a mode first needs them.
  React.useEffect(() => {
    if (mode === 'family' || mode === 'halflife' || counts) return
    let live = true
    void loadCounts().then((c) => { if (live) setCounts(c) })
    return () => { live = false }
  }, [mode, counts])
  const load = React.useCallback(async () => {
    const [d, g] = await Promise.all([loadDecay(), loadGround()])
    const out = { d, g }
    setData(out)
    return out
  }, [])
  // ?nuclide=137Cs (the nuclides table's link) opens that nuclide's card.
  React.useEffect(() => {
    if (!data) return
    const want = new URLSearchParams(window.location.search).get('nuclide')
    const m = want ? /^(\d{1,3})\s*-?\s*([A-Za-z]{1,2})$/.exec(want.trim()) ?? /^([A-Za-z]{1,2})\s*-?\s*(\d{1,3})$/.exec(want.trim()) : null
    if (!m) return
    const numFirst = /^\d/.test(m[1])
    const a = Number(numFirst ? m[1] : m[2])
    const raw = numFirst ? m[2] : m[1]
    const z = ELEMENTS.indexOf(raw[0].toUpperCase() + raw.slice(1).toLowerCase())
    const i = data.d.nuclides.findIndex((x) => x.z === z && x.n === a - z)
    if (i >= 0) open(i)
  }, [data, open])
  const view = MODES.findIndex((m) => m.id === mode) * 2 + (counts ? 1 : 0)
  const ref = useEChart(
    load,
    ({ d, g }) => {
      const dark = isDark()
      const { colors, bucket } = colouring(mode, dark, counts)
      const rule = dark ? 'rgba(240,233,216,0.22)' : 'rgba(22,24,29,0.22)'
      return {
        backgroundColor: 'transparent',
        animation: false,
        tooltip: {
          formatter: (p: unknown) => {
            const q = p as { dataIndex: number }
            const x = d.nuclides[q.dataIndex]
            const r = g.index.get(keyOf(x.z, x.n))
            const modes = modesText(x, d.modes)
            const extra = modeLine(mode, x, counts)
            return `<b>${nucName(x)}</b> ${ELEMENT_NAMES[x.z] ?? ''} · Z ${x.z} N ${x.n}<br/>T½ ${halfLifeText(x)}${modes ? ` · ${modes}` : ''}<br/>Jπ ${jpi(r)}${r?.me != null ? ` · Δ ${r.me.toFixed(1)} keV` : ''}${extra ? `<br/>${extra}` : ''}`
          },
        },
        grid: { left: 48, right: 24, top: 24, bottom: 40 },
        xAxis: { type: 'value', name: 'N', min: 0, max: 180, ...AXIS, splitLine: { show: false } },
        yAxis: { type: 'value', name: 'Z', min: 0, max: 120, ...AXIS, splitLine: { show: false } },
        dataZoom: [
          { type: 'inside', xAxisIndex: 0, filterMode: 'none' },
          { type: 'inside', yAxisIndex: 0, filterMode: 'none' },
        ],
        series: [
          {
            id: 'boxes',
            type: 'custom',
            encode: { x: 0, y: 1 },
            data: d.nuclides.map((x) => [x.n, x.z, bucket(x)]),
            // Drawn in one pass: above ECharts' 3,000-item threshold a custom series renders progressively, and there
            // cells that return a group (a rect and its labels) vanished (brief 46, after ac72542).
            progressive: 0,
            // Zoomed in, the cells stop at the plot's edge instead of drawing over the axis labels.
            clip: true,
            renderItem: (params: { coordSys: { x: number; y: number; width: number; height: number } }, api: { value: (i: number) => number; coord: (v: number[]) => number[] }) => {
              const n = api.value(0), z = api.value(1), f = api.value(2)
              const [x0, y0] = api.coord([n - 0.5, z + 0.5])
              const [x1, y1] = api.coord([n + 0.5, z - 0.5])
              const w = x1 - x0, h = y1 - y0
              const rect = { type: 'rect', shape: { x: x0 + 0.5, y: y0 + 0.5, width: Math.max(w - 1, 0.6), height: Math.max(h - 1, 0.6) }, style: { fill: colors[f] } }
              if (w < LABEL_PX) return rect
              // Only the cells inside the plot take a label, so a close zoom draws a few hundred, not 3,386.
              const cs = params.coordSys
              const cx = x0 + w / 2, cy = y0 + h / 2
              if (cx < cs.x - w || cx > cs.x + cs.width + w || cy < cs.y - h || cy > cs.y + cs.height + h) return rect
              const fill = inkOn(colors[f])
              const mass = w >= MASS_PX
              const size = mass ? Math.min(16, w * 0.26) : Math.min(13, w * 0.4)
              const text = (t: string, y: number, px: number, weight: number) => ({
                type: 'text',
                style: { text: t, x: cx, y, textAlign: 'center', textVerticalAlign: 'middle', fill, font: `${weight} ${px.toFixed(1)}px ${MONO}` },
              })
              return {
                type: 'group',
                children: mass
                  ? [rect, text(String(n + z), cy - size * 0.6, size * 0.72, 400), text(ELEMENTS[z] ?? String(z), cy + size * 0.45, size, 600)]
                  : [rect, text(ELEMENTS[z] ?? String(z), cy, size, 600)],
              }
            },
            // The magic numbers: a dashed rule at each closed shell.
            markLine: {
              silent: true,
              symbol: 'none',
              lineStyle: { color: rule, type: 'dashed', width: 1 },
              label: { show: true, color: ink(dark), fontSize: 10, formatter: (p: { value?: number }) => String(p.value ?? '') },
              data: [...MAGIC.map((v) => ({ xAxis: v })), ...MAGIC.filter((v) => v <= 120).map((v) => ({ yAxis: v }))],
            },
          },
        ],
      }
    },
    false,
    undefined,
    { view, marks: true, picked: pick === null ? [] : [pick], onPick: (p) => { if (p.seriesIndex === 0 && typeof p.dataIndex === 'number') open(p.dataIndex) } },
  )
  const { legend } = colouring(mode, dark, counts)
  const waiting = mode !== 'family' && mode !== 'halflife' && !counts
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <ChartBox chart={ref} className="min-h-0 w-full flex-1" />
      <VizControls>
        {pick !== null && data && (
          <VizSection>
            <NuclideCard x={data.d.nuclides[pick]} d={data.d} ground={data.g.index.get(keyOf(data.d.nuclides[pick].z, data.d.nuclides[pick].n))} onClose={() => setPick(null)} />
          </VizSection>
        )}
        <VizSection title="Colour by">
          <Pills options={MODES} value={mode} onChange={setMode} />
        </VizSection>
        {/* The mode's one legend, redrawn per mode. */}
        <VizSection>
          <div className={`transition-opacity ${waiting ? 'opacity-40' : ''}`}>
            {legend.kind === 'chips' ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-[var(--paper-muted)]">
                {legend.items.map((it) => (
                  <span key={it.label} className="flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: it.color }} />
                    {it.label}
                  </span>
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <LegendBar title={legend.title} segments={legend.segments} fill />
                {legend.extras.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {legend.extras.map((e) => (
                      <span key={e.label} className="rounded-sm px-1 py-0.5 text-[9px] font-bold leading-none" style={{ background: e.color, color: inkOn(e.color) }}>
                        {e.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </VizSection>
        <VizSection>
          <p className="m-0">
            Every ENSDF nuclide is a box at its N and Z; the dashed rules are the magic numbers. Colour by its decay chain,
            its half-life, the years since its ENSDF evaluation&apos;s literature cutoff, the XUNDL sets compiled since that
            cutoff, its NSR papers or the EXFOR entries that take it as target. Scroll to zoom, drag to pan, click a box for
            its card.
          </p>
        </VizSection>
      </VizControls>
    </div>
  )
}

/** html.dark, followed as it changes, so the legend redraws with the chart. */
function useDark() {
  const [dark, setDark] = React.useState(false)
  React.useEffect(() => {
    const read = () => setDark(document.documentElement.classList.contains('dark'))
    read()
    const mo = new MutationObserver(read)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => mo.disconnect()
  }, [])
  return dark
}

/** The libraries the API holds for a nuclide (GET /nuclide/{name}: fy_releases, decay_releases, icrp; worker-1's brief 56). */
type Held = { fy: string[]; decay: string[]; icrp: boolean }
const firstOf = (list: string[]) => (list.includes('B-VIII.1') ? 'B-VIII.1' : list[0])

/** The IAEA Live Chart's nuclide card: the ground-state row and the element's decay radiation, loaded when the card opens. */
function NuclideCard({ x, d, ground: r, onClose }: { x: DecayNuclide; d: Decay; ground: GroundRow | undefined; onClose: () => void }) {
  const [rad, setRad] = React.useState<Radiation | null>(null)
  const [held, setHeld] = React.useState<Held | null>(null)
  React.useEffect(() => {
    let live = true
    setRad(null)
    loadRadiation(x.z).then((f) => { if (live) setRad(f) }).catch(() => {})
    return () => { live = false }
  }, [x.z])
  // Its fission yields, decay data and ICRP 107 record, where the lake holds them, linked from the card's row of links.
  React.useEffect(() => {
    let live = true
    setHeld(null)
    fetch(apiUrl(`/nuclide/${x.z + x.n}${x.el}?levels=0`))
      .then((res) => (res.ok ? res.json() : null))
      .then((j: { fy_releases?: string[]; decay_releases?: string[]; icrp?: unknown } | null) => {
        if (live && j) setHeld({ fy: j.fy_releases ?? [], decay: j.decay_releases ?? [], icrp: !!j.icrp })
      })
      .catch(() => {})
    return () => { live = false }
  }, [x.z, x.n, x.el])
  const a = x.z + x.n
  const dark = isDark()
  const color = dark ? FAMILY[familyOf(x)].dark : FAMILY[familyOf(x)].light
  const kev = (v: number | null | undefined, digits = 3) => (v == null ? '—' : v.toFixed(digits))
  const lines = rad?.nuclides.find((y) => y.n === x.n)?.lines ?? {}
  const rows: { type: string; kev: number; pct: number | null; note?: string }[] = []
  // β− and β+ lines are [mean keV, endpoint keV, %, ν mean keV]; the others are [keV, %] or [keV, %, note].
  const pctOf = (type: string, l: (number | string)[]) => {
    const v = l[type === 'bm' || type === 'bp' ? 2 : 1]
    return v == null ? null : Number(v)
  }
  for (const [type, list] of Object.entries(lines)) {
    const top = [...list].sort((p, q) => (pctOf(type, q) || 0) - (pctOf(type, p) || 0)).slice(0, 3)
    for (const l of top) rows.push({ type, kev: Number(l[0]), pct: pctOf(type, l), note: typeof l[2] === 'string' ? l[2] : undefined })
  }
  const field = (label: string, value: React.ReactNode) => (
    <div className="flex justify-between gap-3 border-t border-[var(--paper-rule-soft)] py-1 text-xs">
      <span className="text-[var(--paper-muted)]">{label}</span>
      <span className="text-right font-mono text-[var(--paper-text)]">{value}</span>
    </div>
  )
  return (
    <div className="flex flex-col" data-nuclide-card>
      <div className="mb-2 flex items-start justify-between">
        <div>
          <p className="font-mono text-base font-semibold text-[var(--paper-text)]"><sup>{a}</sup>{x.el} <span className="text-sm font-normal text-[var(--paper-muted)]">{ELEMENT_NAMES[x.z] ?? ''}</span></p>
          <p className="mt-0.5 text-xs text-[var(--paper-muted)]">N {x.n} · Z {x.z} · <span style={{ color }}>{FAMILY[familyOf(x)].label}</span></p>
        </div>
        <button type="button" onClick={onClose} className="text-[var(--paper-muted)] hover:text-[var(--paper-text)]" aria-label="Close"><X className="h-4 w-4" /></button>
      </div>
      <div className="mb-2 flex flex-wrap gap-1.5 text-[11px]">
        {[
          { href: datasetsHref(a, x.el), label: 'Datasets' },
          { href: papersHref(a, x.el), label: 'Papers' },
          { href: `/viz/data/nuclides?nuclide=${a}${x.el}`, label: 'Row in the table' },
        ].map((l) => (
          <Link key={l.label} href={l.href} className="rounded-full border border-[var(--paper-rule)]/30 px-2 py-0.5 text-[var(--paper-muted)] transition-colors hover:bg-[var(--paper-quiet)] hover:text-[var(--paper-text)]">
            {l.label}
          </Link>
        ))}
        {/* The API's records, as JSON in a new tab. */}
        {held &&
          [
            ...(held.fy.length ? [{ href: apiUrl(`/endf/fy?name=${x.el}-${a}&release=${firstOf(held.fy)}&mt=459`), label: `Fission yields, ${firstOf(held.fy)}` }] : []),
            ...(held.decay.length ? [{ href: apiUrl(`/endf/decay?name=${x.el}-${a}&release=${firstOf(held.decay)}`), label: `Decay data, ${firstOf(held.decay)}` }] : []),
            ...(held.icrp ? [{ href: apiUrl(`/icrp/nuclide/${x.el}-${a}`), label: 'ICRP 107' }] : []),
          ].map((l) => (
            <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" className="rounded-full border border-[var(--paper-rule)]/30 px-2 py-0.5 text-[var(--paper-muted)] transition-colors hover:bg-[var(--paper-quiet)] hover:text-[var(--paper-text)]">
              {l.label}
            </a>
          ))}
      </div>
      {field('Jπ', jpi(r))}
      {field('T½', halfLifeText(x))}
      {field('Δ (keV)', kev(r?.me))}
      {field('Bind/A (keV)', kev(r?.ba, 4))}
      {field('Mass (μu)', r?.me == null ? '—' : massMicroU(a, r.me)!.toFixed(3))}
      {field('Qα (keV)', kev(r?.qa))}
      {field('Qβ− (keV)', kev(r?.qbm))}
      {field('Qec (keV)', kev(r?.qec))}
      {field('Sn (keV)', kev(r?.sn))}
      {field('Sp (keV)', kev(r?.sp))}
      {r?.abundance != null && field('Abundance', `${r.abundance}%`)}
      {r?.radius != null && field('Radius (fm)', r.radius.toFixed(4))}
      {field('Decay', modesText(x, d.modes) || (x.t === null ? 'stable' : '—'))}
      <p className="mt-3 text-[10px] uppercase tracking-wide text-[var(--paper-muted)]">Major radiations</p>
      {rad === null && <p className="mt-1 text-xs text-[var(--paper-muted)]">Loading…</p>}
      {rad !== null && rows.length === 0 && <p className="mt-1 text-xs text-[var(--paper-muted)]">None listed.</p>}
      {rows.length > 0 && (
        <table className="mt-1 w-full text-xs">
          <thead><tr className="text-left text-[var(--paper-muted)]"><th className="font-normal">Type</th><th className="text-right font-normal">keV</th><th className="text-right font-normal">%</th></tr></thead>
          <tbody>
            {rows.map((l, i) => (
              <tr key={i} className="border-t border-[var(--paper-rule-soft)] font-mono text-[var(--paper-text)]">
                <td>{RADIATION_LABEL[l.type] ?? l.type}{l.note ? <span className="text-[var(--paper-muted)]"> {l.note}</span> : null}</td>
                <td className="text-right">{l.kev.toFixed(l.kev < 100 ? 3 : 1)}</td>
                <td className="text-right">{l.pct == null ? '—' : l.pct.toPrecision(3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="mt-3 text-[10px] leading-relaxed text-[var(--paper-muted)]">Ground state from the IAEA Live Chart (ENSDF, AME2020, NUBASE2020); radiations from ENSDF decay datasets.</p>
    </div>
  )
}
