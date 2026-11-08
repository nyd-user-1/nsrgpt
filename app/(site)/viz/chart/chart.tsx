'use client'

import * as React from 'react'
import { X } from 'lucide-react'
import { useEChart } from '@/components/viz/use-echart'
import { VizControls } from '@/components/viz/VizControls'
import { AXIS, FAMILY, familyOf, halfLifeText, ink, isDark, loadDecay, modesText, nucName, keyOf, type Decay, type DecayNuclide } from '@/lib/viz-physics'
import { FAMILIES, type Family } from '@/lib/nuclide'
import { ELEMENT_NAMES, RADIATION_LABEL, jpi, loadGround, loadRadiation, massMicroU, type Ground, type GroundRow, type Radiation } from './data'

// The chart of nuclides (Brendan, 2026-11-08): every ENSDF nuclide a box at (N, Z) in its decay family's colour, the
// palette every chart here uses (lib/nuclide.ts FAMILY), magic numbers ruled. Hover reads the box; a click opens the
// nuclide's card, the IAEA Live Chart's own fields: Jπ, half-life, mass excess, binding per nucleon, mass, Qα, Qβ, Qec,
// Sn, Sp, decay modes and the major radiations. Scroll to zoom, drag to pan.

const MAGIC = [2, 8, 20, 28, 50, 82, 126]
type Data = { d: Decay; g: Ground }

export function NuclideChart() {
  const [data, setData] = React.useState<Data | null>(null)
  const [pick, setPick] = React.useState<number | null>(null)
  const load = React.useCallback(async () => {
    const [d, g] = await Promise.all([loadDecay(), loadGround()])
    const out = { d, g }
    setData(out)
    return out
  }, [])
  const ref = useEChart(
    load,
    ({ d, g }) => {
      const dark = isDark()
      const colors = FAMILIES.map((f) => (dark ? FAMILY[f].dark : FAMILY[f].light))
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
            return `<b>${nucName(x)}</b> ${ELEMENT_NAMES[x.z] ?? ''} · Z ${x.z} N ${x.n}<br/>T½ ${halfLifeText(x)}${modes ? ` · ${modes}` : ''}<br/>Jπ ${jpi(r)}${r?.me != null ? ` · Δ ${r.me.toFixed(1)} keV` : ''}`
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
            data: d.nuclides.map((x) => [x.n, x.z, FAMILIES.indexOf(familyOf(x))]),
            renderItem: (_: unknown, api: { value: (i: number) => number; coord: (v: number[]) => number[] }) => {
              const n = api.value(0), z = api.value(1), f = api.value(2)
              const [x0, y0] = api.coord([n - 0.5, z + 0.5])
              const [x1, y1] = api.coord([n + 0.5, z - 0.5])
              const w = x1 - x0, h = y1 - y0
              return { type: 'rect', shape: { x: x0 + 0.5, y: y0 + 0.5, width: Math.max(w - 1, 0.6), height: Math.max(h - 1, 0.6) }, style: { fill: colors[f] } }
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
    { onPick: (p) => { if (p.seriesIndex === 0 && typeof p.dataIndex === 'number') setPick(p.dataIndex) } },
  )
  const dark = isDark()
  return (
    <>
      <div className="flex min-h-0 w-full flex-1">
        <div ref={ref} className="min-h-0 min-w-0 flex-1" />
        {pick !== null && data && (
          <NuclideCard x={data.d.nuclides[pick]} d={data.d} ground={data.g.index.get(keyOf(data.d.nuclides[pick].z, data.d.nuclides[pick].n))} onClose={() => setPick(null)} />
        )}
      </div>
      <VizControls>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {FAMILIES.map((f: Family) => (
            <span key={f} className="flex items-center gap-1.5 text-[var(--paper-muted)]">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: dark ? FAMILY[f].dark : FAMILY[f].light }} />
              {FAMILY[f].label}
            </span>
          ))}
        </div>
        <p className="m-0 mt-1">
          Every ENSDF nuclide is a box at its N and Z, coloured by the family of its main decay mode; the dashed rules are the magic
          numbers. Scroll to zoom, drag to pan, click a box for its card.
        </p>
      </VizControls>
    </>
  )
}

/** The IAEA Live Chart's nuclide card: the ground-state row and the element's decay radiation, loaded when the card opens. */
function NuclideCard({ x, d, ground: r, onClose }: { x: DecayNuclide; d: Decay; ground: GroundRow | undefined; onClose: () => void }) {
  const [rad, setRad] = React.useState<Radiation | null>(null)
  React.useEffect(() => {
    let live = true
    setRad(null)
    loadRadiation(x.z).then((f) => { if (live) setRad(f) }).catch(() => {})
    return () => { live = false }
  }, [x.z])
  const a = x.z + x.n
  const dark = isDark()
  const color = dark ? FAMILY[familyOf(x)].dark : FAMILY[familyOf(x)].light
  const kev = (v: number | null | undefined, digits = 3) => (v == null ? '—' : v.toFixed(digits))
  const lines = rad?.nuclides.find((y) => y.n === x.n)?.lines ?? {}
  const rows: { type: string; kev: number; pct: number | null; note?: string }[] = []
  for (const [type, list] of Object.entries(lines)) {
    const top = [...list].sort((p, q) => (Number(q[1]) || 0) - (Number(p[1]) || 0)).slice(0, 3)
    for (const l of top) rows.push({ type, kev: Number(l[0]), pct: l[1] == null ? null : Number(l[1]), note: typeof l[2] === 'string' ? l[2] : undefined })
  }
  const field = (label: string, value: React.ReactNode) => (
    <div className="flex justify-between gap-3 border-t border-[var(--paper-rule-soft)] py-1 text-xs">
      <span className="text-[var(--paper-muted)]">{label}</span>
      <span className="text-right font-mono text-[var(--paper-text)]">{value}</span>
    </div>
  )
  return (
    <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-l border-[var(--paper-rule)] bg-[var(--paper)] p-4">
      <div className="mb-2 flex items-start justify-between">
        <div>
          <p className="font-mono text-base font-semibold text-[var(--paper-text)]"><sup>{a}</sup>{x.el} <span className="text-sm font-normal text-[var(--paper-muted)]">{ELEMENT_NAMES[x.z] ?? ''}</span></p>
          <p className="mt-0.5 text-xs text-[var(--paper-muted)]">N {x.n} · Z {x.z} · <span style={{ color }}>{FAMILY[familyOf(x)].label}</span></p>
        </div>
        <button type="button" onClick={onClose} className="text-[var(--paper-muted)] hover:text-[var(--paper-text)]" aria-label="Close"><X className="h-4 w-4" /></button>
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
    </aside>
  )
}
