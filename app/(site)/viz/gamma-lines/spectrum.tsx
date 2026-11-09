'use client'

import * as React from 'react'
import { fetchData, useData } from '@/lib/use-data'
import { useEChart } from '@/components/viz/use-echart'
import { VizControls } from '@/components/viz/VizControls'
import { AXIS, formatSeconds, ink, isDark, loadDecay, type Decay } from '@/lib/viz-physics'

// One nuclide's decay γ lines as a stick spectrum (brief 29, after Brendan's Co-60 figure): energy on x, intensity per
// 100 decays on y, Co-60's 1173 and 1332 keV lines to start. The lines are ENSDF's ground-state decay data from the
// IAEA Live Chart, regrouped by the decaying nuclide (scripts/diagram/gamma-parent.mjs, public/viz-data/gamma-parent/).
// The nsr-api's /nuclide/{name}/gammas lists the transitions inside the named nucleus, not the lines its decay emits,
// so it isn't the source here.

const MONO = { fontFamily: 'var(--font-mono), ui-monospace, monospace' } as const
const fmt = new Intl.NumberFormat('en', { maximumSignificantDigits: 5 })
const Y_MIN = 1e-4
type ParentFile = { z: number; el: string; parents: Record<string, [number, number][]> }
type ParentIndex = { source: string; parents: [number, number, number][] }

const loadParent = (z: number) => fetchData<ParentFile>(`gamma-parent/${z}.json`)

/** "Co-60", "60Co", "co60", "Cs 137" → { el, a }; null when it doesn't read as a nuclide. */
function parseName(s: string): { el: string; a: number } | null {
  const t = s.trim()
  const m = /^([A-Za-z]{1,2})\s*-?\s*(\d{1,3})$/.exec(t) ?? /^(\d{1,3})\s*-?\s*([A-Za-z]{1,2})$/.exec(t)
  if (!m) return null
  const [el, a] = /^\d/.test(m[1]) ? [m[2], Number(m[1])] : [m[1], Number(m[2])]
  return { el: el.toLowerCase(), a }
}

export function GammaSpectrum({ switcher }: { switcher: React.ReactNode }) {
  const [name, setName] = React.useState('Co-60')
  const [log, setLog] = React.useState(false)
  const { data: decay = null } = useData<Decay>('decay.json')
  const { data: index = null } = useData<ParentIndex>('gamma-parent/index.json')
  const [lines, setLines] = React.useState<[number, number][] | null>(null)

  // symbol → Z from the decay file's nuclides
  const zOf = React.useMemo(() => new Map((decay?.nuclides ?? []).map((x) => [x.el.toLowerCase(), x.z])), [decay])
  const symOf = React.useMemo(() => new Map((decay?.nuclides ?? []).map((x) => [x.z, x.el])), [decay])
  const parsed = parseName(name)
  const z = parsed ? zOf.get(parsed.el) : undefined
  const n = parsed && z !== undefined ? parsed.a - z : undefined
  const label = parsed && z !== undefined ? `${symOf.get(z)}-${parsed.a}` : name.trim()
  const nuclide = z !== undefined && n !== undefined ? decay?.nuclides.find((x) => x.z === z && x.n === n) : undefined
  const options = React.useMemo(
    () => (index?.parents ?? []).map(([pz, pn]) => `${symOf.get(pz) ?? pz}-${pz + pn}`),
    [index, symOf],
  )

  React.useEffect(() => {
    if (z === undefined || n === undefined) {
      setLines(null)
      return
    }
    let live = true
    loadParent(z)
      .then((f) => live && setLines(f.parents[String(n)] ?? []))
      .catch(() => live && setLines([]))
    return () => {
      live = false
    }
  }, [z, n])

  const latest = React.useRef({ lines, log, label })
  latest.current = { lines, log, label }
  const [rev, setRev] = React.useState(0)
  React.useEffect(() => setRev((r) => r + 1), [lines, log])
  const ref = useEChart(
    loadDecay,
    () => {
      const v = latest.current
      const dark = isDark()
      const color = ink(dark)
      const ls = v.lines ?? []
      const top = Math.max(1, ...ls.map((l) => l[1]))
      const xMax = Math.max(100, ...ls.map((l) => l[0])) * 1.08
      const floor = v.log ? Y_MIN : 0
      // energy labels on the strongest lines only: at least 5% of the strongest, ten at most
      const labelled = new Set([...ls].sort((a, b) => b[1] - a[1]).filter((l) => l[1] >= top * 0.05).slice(0, 10).map((l) => l[0]))
      const data = ls.filter((l) => !v.log || l[1] >= Y_MIN).map((l) => ({ value: [l[0], l[1]], on: labelled.has(l[0]) }))
      return {
        backgroundColor: 'transparent',
        animation: false,
        grid: { left: 72, right: 32, top: 40, bottom: 56 },
        tooltip: {
          formatter: (p: unknown) => {
            const d = (p as { data: { value: [number, number] } }).data
            return `${v.label} — ${fmt.format(d.value[0])} keV · ${fmt.format(d.value[1])} per 100 decays`
          },
        },
        xAxis: { ...AXIS, type: 'value', name: 'γ energy, keV', nameLocation: 'middle', nameGap: 30, min: 0, max: Math.ceil(xMax / 100) * 100 },
        yAxis: v.log
          ? { ...AXIS, type: 'log', name: 'Intensity, per 100 decays', nameLocation: 'middle', nameGap: 52, min: Y_MIN, max: 200 }
          : { ...AXIS, type: 'value', name: 'Intensity, per 100 decays', nameLocation: 'middle', nameGap: 52, min: 0, max: Math.ceil(top * 1.15) },
        series: [
          {
            type: 'custom',
            encode: { x: 0, y: 1 },
            data,
            renderItem: (params: { dataIndex: number }, api: { value: (i: number) => number; coord: (v: number[]) => number[] }) => {
              const tip = api.coord([api.value(0), api.value(1)])
              const base = api.coord([api.value(0), floor])
              const children: unknown[] = [
                { type: 'line', shape: { x1: tip[0], y1: base[1], x2: tip[0], y2: tip[1] }, style: { stroke: color, lineWidth: 2 } },
                { type: 'circle', shape: { cx: tip[0], cy: tip[1], r: 4 }, style: { fill: color } },
              ]
              if (data[params.dataIndex]?.on)
                children.push({ type: 'text', x: tip[0], y: tip[1] - 9, style: { text: `${fmt.format(api.value(0))} keV`, fill: color, fontSize: 11, align: 'center', verticalAlign: 'bottom' } })
              return { type: 'group', children }
            },
          },
        ],
      }
    },
    false,
    undefined,
    { view: rev, replace: true, onPick: () => {} },
  )

  const sorted = [...(lines ?? [])].sort((a, b) => b[1] - a[1])
  return (
    <div className="relative flex min-h-0 w-full flex-1 flex-col">
      <p className="px-4 pt-3 text-[12px] text-[var(--paper-muted)]">
        These are the γ lines the decay emits, at their energies and intensities, not a detector&rsquo;s spectrum: a detector adds peak widths and a Compton continuum.
      </p>
      <div ref={ref} className="min-h-0 w-full flex-1" />

      <VizControls>
        {switcher}
        <label className="flex flex-col gap-1">
          <span className="text-[var(--paper-muted)]">Nuclide</span>
          <input
            value={name}
            onChange={(ev) => setName(ev.target.value)}
            list="gamma-parents"
            placeholder="Co-60"
            className="rounded-md border border-[var(--paper-rule)]/30 bg-[var(--paper)] px-2 py-1 text-[13px]"
            style={MONO}
          />
          <datalist id="gamma-parents">
            {options.map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
        </label>
        <div className="flex flex-col gap-1">
          <span className="text-[var(--paper-muted)]">Intensity axis</span>
          <div className="flex flex-wrap gap-1">
            {(['Linear', 'Log'] as const).map((o) => (
              <button
                key={o}
                type="button"
                aria-pressed={(o === 'Log') === log}
                onClick={() => setLog(o === 'Log')}
                className={`rounded-full border px-2 py-0.5 transition-colors ${(o === 'Log') === log ? 'border-[var(--paper-text)] bg-[var(--paper-text)] text-[var(--paper)]' : 'border-[var(--paper-rule)]/30 text-[var(--paper-muted)] hover:bg-[var(--paper-quiet)]'}`}
                style={MONO}
              >
                {o}
              </button>
            ))}
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col border-t border-[var(--paper-rule)]/10 pt-2.5">
          <span className="mb-1 text-[var(--paper-muted)]">
            {lines === null
              ? 'Type a nuclide, such as Co-60 or Cs-137.'
              : `${label}${nuclide?.t && nuclide.t > 0 ? `, ${formatSeconds(nuclide.t)}` : ''}: ${lines.length.toLocaleString('en')} line${lines.length === 1 ? '' : 's'}`}
          </span>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <table className="w-full border-collapse" style={MONO}>
              <thead className="sticky top-0 bg-[var(--paper)]">
                <tr className="text-left text-[10px] uppercase tracking-[0.12em] text-[var(--paper-faint)]">
                  <th className="py-1 font-normal">keV</th>
                  <th className="py-1 text-right font-normal">Per 100</th>
                </tr>
              </thead>
              <tbody>
                {sorted.slice(0, 300).map((l, j) => (
                  <tr key={j} className="border-t border-[var(--paper-rule)]/10">
                    <td className="py-1">{fmt.format(l[0])}</td>
                    <td className="py-1 text-right">{fmt.format(l[1])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </VizControls>
    </div>
  )
}

