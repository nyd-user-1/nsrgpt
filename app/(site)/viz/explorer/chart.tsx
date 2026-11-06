'use client'

import * as React from 'react'
import { useEChart } from '@/components/viz/use-echart'
import { MenuSelect, type MenuOption } from '@/components/viz/MenuSelect'
import { GL_VIEW } from '@/lib/viz-3d'
import { FAMILY, familyOfMode, isDark } from '@/lib/viz-physics'
import type { FissionFile } from '../fission-yields/data'
import { fissionOf, loadFor, loadGround, valuesOf, variables, type Ground } from './data'

// The 3D explorer (Brendan, 2026-11-06): Live Chart 3D's choice of axes (nds.iaea.org/relnsd/vcharthtml/lc3d.html) on
// the site's 3D camera. Any ground-state property — or any of the 46 fission-yield series — goes on X, Y and Z, each
// with a log switch and limits (left blank, they show the range found); colour follows the Z value, as a value or a
// percentile, or the decay mode; a size; a Z and N filter. The presets are views worth starting from, the first of
// them Live Chart 3D's own example. Data: the IAEA Live Chart API's ground states (ENSDF, AME2020, NUBASE2020, the
// IAEA moments tables, Angeli–Marinova radii) and JEFF-3.1.1 fission yields.

const MONO = { fontFamily: 'var(--font-mono), ui-monospace, monospace' } as const
const fmt = new Intl.NumberFormat('en', { maximumSignificantDigits: 4 })
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹'
const sup = (v: number) => String(v).replace(/\d/g, (d) => SUP[Number(d)])
const RAMP = ['#313695', '#4575b4', '#74add1', '#abd9e9', '#fee090', '#fdae61', '#f46d43', '#d73027']

type Axis = { v: string; log: boolean; lo: string; hi: string }
type Settings = { x: Axis; y: Axis; z: Axis; color: 'value' | 'percentile' | 'mode'; size: number; zmin: string; zmax: string; nmin: string; nmax: string }
const axis = (v: string, log = false): Axis => ({ v, log, lo: '', hi: '' })
const BASE = { color: 'percentile' as const, size: 4, zmin: '', zmax: '', nmin: '', nmax: '' }

const PRESETS: { label: string; s: Settings }[] = [
  { label: '²³⁹Pu fission yields', s: { ...BASE, x: axis('n'), y: axis('z'), z: axis('fy:cum:239pu:thermal') } },
  { label: 'Half-lives', s: { ...BASE, color: 'value', x: axis('n'), y: axis('z'), z: axis('t', true) } },
  { label: 'Binding energy', s: { ...BASE, color: 'value', x: axis('n'), y: axis('z'), z: axis('ba') } },
  { label: 'Nuclear shapes', s: { ...BASE, color: 'value', size: 6, x: axis('n'), y: axis('z'), z: axis('q') } },
  { label: 'Charge radii', s: { ...BASE, color: 'value', size: 6, x: axis('n'), y: axis('z'), z: axis('radius') } },
  { label: 'Q-values', s: { ...BASE, color: 'mode', x: axis('qbm'), y: axis('qec'), z: axis('qa') } },
]

const SUPS: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' }
/** A log axis's tick: 10 to the power, "10⁻⁶", where the power is whole. */
const tick = (v: number) => (Number.isInteger(v) ? `10${String(v).replace(/[-\d]/g, (c) => SUPS[c])}` : fmt.format(10 ** v))
/** A value for a limit field's hint: plain when it reads easily, else in powers of ten. */
const hint = (v: number) => (v !== 0 && (Math.abs(v) >= 1e6 || Math.abs(v) < 1e-3) ? v.toExponential(2).replace('e+', 'e') : fmt.format(v))

const num = (s: string) => (s.trim() === '' || !Number.isFinite(Number(s)) ? null : Number(s))

/** The rows the settings keep: all three values present (positive on a log axis), inside the limits and the filter. */
function plotted(g: Ground, s: Settings, fy: Map<string, FissionFile>) {
  const zi = g.cols.indexOf('z')
  const ni = g.cols.indexOf('n')
  const vals = (['x', 'y', 'z'] as const).map((k) => valuesOf(g, s[k].v, fy))
  const keep: number[] = []
  const zmin = num(s.zmin), zmax = num(s.zmax), nmin = num(s.nmin), nmax = num(s.nmax)
  g.rows.forEach((r, i) => {
    const z = r[zi] as number
    const n = r[ni] as number
    if ((zmin !== null && z < zmin) || (zmax !== null && z > zmax) || (nmin !== null && n < nmin) || (nmax !== null && n > nmax)) return
    for (const [k, key] of (['x', 'y', 'z'] as const).entries()) {
      const v = vals[k][i]
      if (v === null || (s[key].log && v <= 0)) return
      const lo = num(s[key].lo)
      const hi = num(s[key].hi)
      if ((lo !== null && v < lo) || (hi !== null && v > hi)) return
    }
    keep.push(i)
  })
  return { vals, keep }
}

export function ExplorerChart() {
  const [g, setG] = React.useState<Ground | null>(null)
  const [s, setS] = React.useState<Settings>(PRESETS[0].s)
  const [fy, setFy] = React.useState<Map<string, FissionFile>>(new Map())
  React.useEffect(() => {
    void loadGround().then(setG)
  }, [])
  // Fetch the fission file an axis asks for, once.
  React.useEffect(() => {
    for (const k of ['x', 'y', 'z'] as const) {
      const id = fissionOf(s[k].v)
      if (!id || fy.has(id)) continue
      void loadFor(s[k].v)?.then((f) => setFy((cur) => (cur.has(id) ? cur : new Map(cur).set(id, f))))
    }
  }, [s, fy])
  const vars = React.useMemo(() => (g ? variables(g) : []), [g])
  const byId = React.useMemo(() => new Map(vars.map((v) => [v.id, v])), [vars])
  const shown = React.useMemo(() => (g ? plotted(g, s, fy) : null), [g, s, fy])
  // The range each axis's values span among the plotted rows, shown in its empty limit fields.
  const ranges = React.useMemo(() => {
    if (!shown) return null
    return shown.vals.map((vs) => {
      let lo = Infinity
      let hi = -Infinity
      for (const i of shown.keep) {
        const v = vs[i] as number
        if (v < lo) lo = v
        if (v > hi) hi = v
      }
      return shown.keep.length ? [lo, hi] : null
    })
  }, [shown])

  const latest = React.useRef({ s, fy, byId })
  latest.current = { s, fy, byId }
  const [rev, setRev] = React.useState(0)
  React.useEffect(() => setRev((r) => r + 1), [s, fy])

  const set = (patch: Partial<Settings>) => setS((cur) => ({ ...cur, ...patch }))
  const setAxis = (k: 'x' | 'y' | 'z', patch: Partial<Axis>) => setS((cur) => ({ ...cur, [k]: { ...cur[k], ...patch } }))

  const ref = useEChart(
    loadGround,
    (ground) => {
      const { s: cur, fy: files, byId: vmap } = latest.current
      const { vals, keep } = plotted(ground, cur, files)
      const t = (k: 0 | 1 | 2, v: number) => ((['x', 'y', 'z'] as const).map((a) => cur[a].log)[k] ? Math.log10(v) : v)
      const zi = ground.cols.indexOf('z')
      const ni = ground.cols.indexOf('n')
      const mi = ground.cols.indexOf('mode')
      const ti = ground.cols.indexOf('t')
      const dark = isDark()
      // Colour: the Z value, or its rank among the plotted rows.
      const cz = keep.map((i) => t(2, vals[2][i] as number))
      const rank = new Map<number, number>()
      if (cur.color === 'percentile') {
        const order = keep.map((_, j) => j).sort((a, b) => cz[a] - cz[b])
        order.forEach((j, r) => rank.set(j, keep.length > 1 ? r / (keep.length - 1) : 0.5))
      }
      const cmin = Math.min(...cz)
      const cmax = Math.max(...cz)
      const name = (i: number) => {
        const r = ground.rows[i]
        return `${sup((r[zi] as number) + (r[ni] as number))}${ground.els[r[zi] as number]}`
      }
      const label = (k: 'x' | 'y' | 'z') => {
        const v = vmap.get(cur[k].v)
        return v ? `${cur[k].log ? 'log₁₀ ' : ''}${v.label}${v.unit ? `, ${v.unit}` : ''}` : ''
      }
      const ax = (k: 'x' | 'y' | 'z') => ({
        type: 'value',
        name: label(k),
        nameTextStyle: { color: '#64748b' },
        axisLabel: { color: '#475569', ...(cur[k].log ? { formatter: tick } : {}) },
        axisLine: { lineStyle: { color: '#1e293b' } },
      })
      const unitOf = (k: 'x' | 'y' | 'z') => vmap.get(cur[k].v)?.unit ?? ''
      return {
        backgroundColor: 'transparent',
        tooltip: {
          formatter: (p: unknown) => {
            const i = (p as { value: number[] }).value[4]
            return `${name(i)} — ${(['x', 'y', 'z'] as const)
              .map((k, j) => `${vmap.get(cur[k].v)?.label ?? ''} ${fmt.format(vals[j][i] as number)}${unitOf(k) ? ` ${unitOf(k)}` : ''}`)
              .join(' · ')}`
          },
        },
        ...(cur.color === 'mode'
          ? {}
          : { visualMap: { show: false, dimension: 3, min: cur.color === 'percentile' ? 0 : cmin, max: cur.color === 'percentile' ? 1 : cmax === cmin ? cmin + 1 : cmax, inRange: { color: RAMP } } }),
        xAxis3D: ax('x'),
        yAxis3D: ax('y'),
        zAxis3D: ax('z'),
        grid3D: { boxWidth: 130, boxDepth: 100, boxHeight: 80, viewControl: { ...GL_VIEW, distance: 240, alpha: 22, beta: 32 }, environment: 'none' },
        series: [
          {
            type: 'scatter3D',
            symbolSize: cur.size,
            itemStyle: { opacity: 0.9 },
            data: keep.map((i, j) => {
              const value = [t(0, vals[0][i] as number), t(1, vals[1][i] as number), cz[j], cur.color === 'percentile' ? (rank.get(j) ?? 0) : cz[j], i]
              if (cur.color !== 'mode') return { value }
              const r = ground.rows[i]
              const f = r[ti] === null && r[mi] === null ? 'stable' : familyOfMode((r[mi] as string) ?? undefined)
              return { value, itemStyle: { color: dark ? FAMILY[f].dark : FAMILY[f].light } }
            }),
          },
        ],
      }
    },
    true,
    undefined,
    { view: rev, replace: true, onPick: () => {} },
  )

  // The axis menus' options, under their group headings.
  const menu = React.useMemo<MenuOption<string>[]>(() => vars.map((v) => ({ value: v.id, label: `${v.label}${v.unit ? `, ${v.unit}` : ''}`, group: v.group })), [vars])

  return (
    <div className="relative flex min-h-0 w-full flex-1 flex-col">
      <div ref={ref} className="min-h-0 w-full flex-1" />

      <div className="z-10 absolute bottom-4 left-4 top-4 flex w-[290px] flex-col gap-3 overflow-y-auto rounded-xl border border-[var(--paper-rule)]/15 bg-[var(--paper)]/90 px-3 py-3 text-[11px] text-[var(--paper-text)] backdrop-blur-sm">
        <div className="flex flex-wrap gap-1">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => setS(p.s)}
              className="rounded-full border border-[var(--paper-rule)]/30 px-2 py-0.5 text-[var(--paper-muted)] transition-colors hover:bg-[var(--paper-quiet)]"
            >
              {p.label}
            </button>
          ))}
        </div>

        {(['x', 'y', 'z'] as const).map((k, j) => (
          <div key={k} className="flex flex-col gap-1.5 border-t border-[var(--paper-rule)]/10 pt-2.5">
            <div className="flex items-center gap-2">
              <span className="w-3 font-medium uppercase" style={MONO}>
                {k}
              </span>
              <MenuSelect
                label={`${k.toUpperCase()} axis`}
                value={s[k].v}
                options={menu}
                onChange={(v) => setAxis(k, { v, log: !!byId.get(v)?.log, lo: '', hi: '' })}
                className="flex-1"
              />
              <label className="flex items-center gap-1 text-[var(--paper-muted)]">
                <input type="checkbox" checked={s[k].log} onChange={(e) => setAxis(k, { log: e.target.checked })} className="accent-[var(--paper-text)]" />
                log
              </label>
            </div>
            <div className="flex items-center gap-1.5 pl-5">
              <Limit label={`${k.toUpperCase()} lower limit`} value={s[k].lo} placeholder={ranges?.[j] ? hint(ranges[j]![0]) : ''} onChange={(lo) => setAxis(k, { lo })} />
              <span className="text-[var(--paper-faint)]">to</span>
              <Limit label={`${k.toUpperCase()} upper limit`} value={s[k].hi} placeholder={ranges?.[j] ? hint(ranges[j]![1]) : ''} onChange={(hi) => setAxis(k, { hi })} />
            </div>
          </div>
        ))}

        <div className="flex flex-col gap-1.5 border-t border-[var(--paper-rule)]/10 pt-2.5">
          <span className="text-[var(--paper-muted)]">Colour</span>
          <div className="flex flex-wrap gap-1">
            {(
              [
                ['value', 'Z value'],
                ['percentile', 'Z percentile'],
                ['mode', 'Decay mode'],
              ] as const
            ).map(([id, text]) => (
              <button
                key={id}
                type="button"
                aria-pressed={s.color === id}
                onClick={() => set({ color: id })}
                className={`rounded-full border px-2 py-0.5 transition-colors ${s.color === id ? 'border-[var(--paper-text)] bg-[var(--paper-text)] text-[var(--paper)]' : 'border-[var(--paper-rule)]/30 text-[var(--paper-muted)] hover:bg-[var(--paper-quiet)]'}`}
                style={MONO}
              >
                {text}
              </button>
            ))}
          </div>
          <label className="mt-1 flex flex-col gap-1">
            <span className="flex justify-between text-[var(--paper-muted)]">
              Size <span style={MONO}>{s.size}</span>
            </span>
            <input type="range" min={1} max={14} step={1} value={s.size} onChange={(e) => set({ size: Number(e.target.value) })} className="w-full accent-[var(--paper-text)]" />
          </label>
        </div>

        <div className="flex flex-col gap-1.5 border-t border-[var(--paper-rule)]/10 pt-2.5">
          <span className="text-[var(--paper-muted)]">Filter</span>
          {(
            [
              ['Z', 'zmin', 'zmax'],
              ['N', 'nmin', 'nmax'],
            ] as const
          ).map(([name, lo, hi]) => (
            <div key={name} className="flex items-center gap-1.5">
              <Limit label={`${name} from`} value={s[lo]} placeholder="0" onChange={(v) => set({ [lo]: v } as Partial<Settings>)} />
              <span className="w-8 text-center" style={MONO}>
                ≤ {name} ≤
              </span>
              <Limit label={`${name} to`} value={s[hi]} placeholder={name === 'Z' ? '118' : '177'} onChange={(v) => set({ [hi]: v } as Partial<Settings>)} />
            </div>
          ))}
        </div>

        <span className="text-[var(--paper-faint)] tabular-nums" style={MONO}>
          {shown ? `${shown.keep.length.toLocaleString('en')} nuclides` : 'Loading…'}
        </span>
      </div>
    </div>
  )
}

function Limit({ label, value, placeholder, onChange }: { label: string; value: string; placeholder: string; onChange: (v: string) => void }) {
  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={label}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full min-w-0 rounded-md border border-[var(--paper-rule)]/30 bg-[var(--paper)] px-1.5 py-1 text-[11px] text-[var(--paper-text)] placeholder:text-[var(--paper-faint)]"
      style={MONO}
    />
  )
}
