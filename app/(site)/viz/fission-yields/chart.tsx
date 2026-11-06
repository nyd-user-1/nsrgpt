'use client'

import * as React from 'react'
import { useEChart } from '@/components/viz/use-echart'
import { GL_VIEW } from '@/lib/viz-3d'
import { AXIS, isDark, sup } from '@/lib/viz-physics'
import { ENERGIES, PARENTS, loadAllFission, massCurve, nzYields, type Energy, type FissionFile } from './data'

// Fission yields (Brendan, 2026-11-06), from the IAEA Live Chart API's JEFF-3.1.1 evaluation: what a fission leaves
// behind. The mass curve sums each mass number's independent yields, so every parent shows its two humps — a light
// fragment near A = 95 and a heavy one near A = 140, the heavy hump pinned by the doubly magic ¹³²Sn while the light
// one moves with the parent's mass — and the valley between them filling in as the incident neutron gets faster.
// The 3D view puts one parent's products on the N–Z plane, height the yield, as Live Chart 3D's own example does.

const MONO = { fontFamily: 'var(--font-mono), ui-monospace, monospace' } as const
const pct = new Intl.NumberFormat('en', { maximumSignificantDigits: 3 })
const label = (f: FissionFile) => `${sup(f.parent.a)}${f.parent.el}`

type View = { picked: number[]; energy: Energy; three: boolean; kind: 'ind' | 'cum'; log: boolean }
/** The view as a number, so the chart redraws when it changes (useEChart's `view`). */
const code = (v: View) => v.picked.reduce((s, i) => s | (1 << i), 0) | (ENERGIES.findIndex((e) => e.id === v.energy) << 8) | ((v.kind === 'cum' ? 1 : 0) << 10) | ((v.log ? 1 : 0) << 11)

export function FissionChart() {
  const [picked, setPicked] = React.useState<number[]>([2, 5])
  const [energy, setEnergy] = React.useState<Energy>('thermal')
  const [three, setThree] = React.useState(false)
  const [kind, setKind] = React.useState<'ind' | 'cum'>('ind')
  const [log, setLog] = React.useState(false)
  const [files, setFiles] = React.useState<FissionFile[] | null>(null)
  React.useEffect(() => {
    void loadAllFission().then(setFiles)
  }, [])
  const view: View = { picked, energy, three, kind, log }
  const latest = React.useRef(view)
  latest.current = view
  // In 3D, the parent is the last one picked.
  const shown = picked.length ? picked[picked.length - 1] : 2

  const toggle = (i: number) =>
    setPicked((cur) => (three ? [i] : cur.includes(i) ? (cur.length > 1 ? cur.filter((x) => x !== i) : cur) : [...cur, i]))
  const has = (i: number, e: Energy) => !files || files[i].energies.includes(e)

  return (
    <div className="relative flex min-h-0 w-full flex-1 flex-col">
      {three ? <Yields3D view={latest} code={code(view)} /> : <MassCurve view={latest} code={code(view)} />}

      <div className="z-10 absolute left-4 top-4 flex w-[250px] flex-col gap-2.5 rounded-xl border border-[var(--paper-rule)]/15 bg-[var(--paper)]/85 px-3 py-2.5 text-[11px] text-[var(--paper-text)] backdrop-blur-sm">
        <div className="flex flex-col gap-1">
          <span className="text-[var(--paper-muted)]">{three ? 'Parent' : 'Parents'}</span>
          <div className="flex flex-wrap gap-1">
            {PARENTS.map((p, i) => {
              const on = three ? i === shown : picked.includes(i)
              const off = !has(i, energy)
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={on}
                  disabled={off}
                  onClick={() => toggle(i)}
                  title={off ? `No ${ENERGIES.find((e) => e.id === energy)?.label.toLowerCase()} yields for this parent` : undefined}
                  className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 transition-colors disabled:opacity-35 ${on ? 'border-[var(--paper-text)]' : 'border-[var(--paper-rule)]/30 text-[var(--paper-muted)] hover:bg-[var(--paper-quiet)]'}`}
                  style={MONO}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: isDark() ? p.dark : p.light }} />
                  {files ? label(files[i]) : p.id}
                </button>
              )
            })}
          </div>
        </div>
        <Segmented label="Neutron energy" options={ENERGIES} value={energy} onChange={setEnergy} />
        <Segmented
          label="View"
          options={[
            { id: 'curve', label: 'Mass curve' },
            { id: '3d', label: 'N–Z in 3D' },
          ]}
          value={three ? '3d' : 'curve'}
          onChange={(v) => {
            setThree(v === '3d')
            if (v === '3d') setPicked([shown])
          }}
        />
        {three && (
          <>
            <Segmented
              label="Yield"
              options={[
                { id: 'ind', label: 'Independent' },
                { id: 'cum', label: 'Cumulative' },
              ]}
              value={kind}
              onChange={(v) => setKind(v as 'ind' | 'cum')}
            />
            <Segmented
              label="Height"
              options={[
                { id: 'lin', label: 'Linear' },
                { id: 'log', label: 'Log' },
              ]}
              value={log ? 'log' : 'lin'}
              onChange={(v) => setLog(v === 'log')}
            />
          </>
        )}
      </div>
    </div>
  )
}

function MassCurve({ view, code }: { view: React.RefObject<View>; code: number }) {
  const ref = useEChart(
    loadAllFission,
    (files) => {
      const v = view.current
      const dark = isDark()
      return {
        backgroundColor: 'transparent',
        animation: false,
        grid: { left: 72, right: 32, top: 24, bottom: 56 },
        tooltip: {
          trigger: 'axis',
          formatter: (ps: unknown) => {
            const list = ps as { seriesName: string; value: [number, number]; color: string }[]
            if (!list.length) return ''
            return [`A = ${list[0].value[0]}`, ...list.map((p) => `<span style="color:${p.color}">●</span> ${p.seriesName} ${pct.format(p.value[1])}%`)].join('<br/>')
          },
        },
        xAxis: { ...AXIS, type: 'value', name: 'Mass number A', nameLocation: 'middle', nameGap: 30, min: 60, max: 180 },
        yAxis: { ...AXIS, type: 'log', name: 'Yield, % per fission', nameLocation: 'middle', nameGap: 52, min: 1e-6, max: 20 },
        series: v.picked
          .filter((i) => files[i].energies.includes(v.energy))
          .map((i) => ({
            type: 'line',
            name: label(files[i]),
            showSymbol: false,
            lineStyle: { width: 1.8 },
            color: dark ? PARENTS[i].dark : PARENTS[i].light,
            // From A = 60: below it are only ternary fission's light particles (¹H to ¹⁰Be), off this axis.
            data: massCurve(files[i], v.energy).filter(([a, y]) => a >= 60 && y >= 1e-6),
          })),
      }
    },
    false,
    undefined,
    { view: code, replace: true, onPick: () => {} },
  )
  return <div ref={ref} className="min-h-0 w-full flex-1" />
}

function Yields3D({ view, code }: { view: React.RefObject<View>; code: number }) {
  const ref = useEChart(
    loadAllFission,
    (files) => {
      const v = view.current
      const f = files[v.picked[v.picked.length - 1] ?? 2]
      const pts = nzYields(f, v.energy, v.kind)
      const h = (y: number) => (v.log ? Math.max(0, Math.log10(y) + 6) : y)
      const max = Math.max(1e-9, ...pts.map((p) => h(p.y)))
      const axis = (name: string) => ({ type: 'value', name, nameTextStyle: { color: '#64748b' }, axisLabel: { color: '#475569' }, axisLine: { lineStyle: { color: '#1e293b' } } })
      return {
        backgroundColor: 'transparent',
        tooltip: {
          formatter: (p: unknown) => {
            const d = (p as { data: { name: string; y: number } }).data
            return `${d.name} — ${pct.format(d.y)}% per fission`
          },
        },
        visualMap: { show: false, dimension: 2, min: 0, max, inRange: { color: ['#313695', '#4575b4', '#74add1', '#fee090', '#fdae61', '#f46d43', '#d73027'] } },
        xAxis3D: axis('N'),
        yAxis3D: axis('Z'),
        zAxis3D: { ...axis(v.log ? 'log₁₀ yield, % + 6' : 'Yield, %'), min: 0 },
        grid3D: { boxWidth: 140, boxDepth: 80, boxHeight: 70, viewControl: { ...GL_VIEW, distance: 230, alpha: 24, beta: 30 }, environment: 'none' },
        series: [
          {
            type: 'bar3D',
            shading: 'color',
            barSize: 0.9,
            data: pts.map((p) => ({ name: `${sup(p.z + p.n)}${elOf(p.z)}`, y: p.y, value: [p.n, p.z, h(p.y)] })),
          },
        ],
      }
    },
    true,
    undefined,
    { view: code, replace: true, onPick: () => {} },
  )
  return <div ref={ref} className="min-h-0 w-full flex-1" />
}

/** Element symbols by Z, as far as fission products and parents reach. */
const SYMBOLS = ['n', 'H', 'He', 'Li', 'Be', 'B', 'C', 'N', 'O', 'F', 'Ne', 'Na', 'Mg', 'Al', 'Si', 'P', 'S', 'Cl', 'Ar', 'K', 'Ca', 'Sc', 'Ti', 'V', 'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Cu', 'Zn', 'Ga', 'Ge', 'As', 'Se', 'Br', 'Kr', 'Rb', 'Sr', 'Y', 'Zr', 'Nb', 'Mo', 'Tc', 'Ru', 'Rh', 'Pd', 'Ag', 'Cd', 'In', 'Sn', 'Sb', 'Te', 'I', 'Xe', 'Cs', 'Ba', 'La', 'Ce', 'Pr', 'Nd', 'Pm', 'Sm', 'Eu', 'Gd', 'Tb', 'Dy', 'Ho', 'Er', 'Tm', 'Yb', 'Lu', 'Hf', 'Ta', 'W', 'Re', 'Os', 'Ir', 'Pt', 'Au', 'Hg', 'Tl', 'Pb', 'Bi', 'Po', 'At', 'Rn', 'Fr', 'Ra', 'Ac', 'Th', 'Pa', 'U', 'Np', 'Pu', 'Am']
const elOf = (z: number) => SYMBOLS[z] ?? `Z${z}`

function Segmented<T extends string>({ label, options, value, onChange }: { label: string; options: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[var(--paper-muted)]">{label}</span>
      <div className="flex flex-wrap gap-1">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={value === o.id}
            onClick={() => onChange(o.id)}
            className={`rounded-full border px-2 py-0.5 transition-colors ${value === o.id ? 'border-[var(--paper-text)] bg-[var(--paper-text)] text-[var(--paper)]' : 'border-[var(--paper-rule)]/30 text-[var(--paper-muted)] hover:bg-[var(--paper-quiet)]'}`}
            style={MONO}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}
