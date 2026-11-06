'use client'

import * as React from 'react'
import { Pause, Play } from 'lucide-react'
import { useEChart } from '@/components/viz/use-echart'
import { VizControls } from '@/components/viz/VizControls'
import { NuclidePicker, type PickerOption } from '@/components/viz/NuclidePicker'
import { decayIndex, halfLifeText, isDark, keyOf, loadMassesAndDecay, nucName, type DecayNuclide, type Mass } from '@/lib/viz-physics'

// One element at a time, all of its isotopes as translucent polygons on one radar (the radar-aqi
// pattern, Brendan 2026-11-04). Spokes and scales match /viz/nuclide-card. Neutron-rich isotopes run
// warm, neutron-poor cool, so the chain's drift across the radar reads as colour. The element is picked
// the way /viz/nuclide-card picks a nuclide — a list with search and ‹ › — plus a play button that walks
// Z (2026-11-05); the polygons change in place instead of the old timeline's fade-out and zoom-in.

type Spoke = { name: string; min: number; max: number; of: (m: Mass, d?: DecayNuclide) => number | null }
const MEV = (v: number | null) => (v === null ? null : v / 1000)
const T_MAX = 33
const SPOKES: Spoke[] = [
  { name: 'T½', min: -22, max: T_MAX, of: (_, d) => (!d || d.t === -1 ? null : d.t === null ? T_MAX : Math.log10(d.t)) },
  { name: 'Qα', min: -20, max: 15, of: (m) => MEV(m.qa) },
  { name: 'Qβ−', min: -25, max: 25, of: (m) => MEV(m.qb) },
  { name: 'Sₙ', min: -5, max: 25, of: (m) => MEV(m.sn) },
  { name: 'Sₚ', min: -5, max: 25, of: (m) => MEV(m.sp) },
  { name: 'E(2⁺)', min: 0, max: 5, of: (m) => MEV(m.e2) },
]

/** Cool → warm across the isotope chain, light and dark variants. */
function ramp(i: number, count: number, dark: boolean): string {
  const t = count < 2 ? 0.5 : i / (count - 1)
  const cool = dark ? [91, 156, 255] : [47, 111, 220]
  const warm = dark ? [255, 138, 61] : [232, 115, 12]
  const c = cool.map((v, k) => Math.round(v + (warm[k] - v) * t))
  return `rgb(${c[0]},${c[1]},${c[2]})`
}

export function IsotopeRadarChart() {
  const [masses, setMasses] = React.useState<Mass[] | null>(null)
  const [z, setZ] = React.useState(50)
  const [playing, setPlaying] = React.useState(false)
  React.useEffect(() => {
    void loadMassesAndDecay().then(([ms]) => setMasses(ms))
  }, [])

  // Elements present, ascending Z, as picker rows: "Sn 50", searchable as "tin"-free "50" or "Sn".
  const elements = React.useMemo<PickerOption[]>(() => {
    const seen = new Map<number, string>()
    for (const m of masses ?? []) if (m.z > 0 && !seen.has(m.z)) seen.set(m.z, m.el)
    return [...seen.entries()].sort((a, b) => a[0] - b[0]).map(([zz, el]) => ({ key: zz, label: `${el} ${zz}`, alt: `${zz}${el}` }))
  }, [masses])
  const stepZ = React.useCallback(
    (dir: -1 | 1) =>
      setZ((cur) => {
        const i = elements.findIndex((e) => e.key === cur)
        if (i < 0 || !elements.length) return cur
        return elements[(i + dir + elements.length) % elements.length].key
      }),
    [elements],
  )

  // Play walks Z, wrapping at the end, every 1.1 s.
  React.useEffect(() => {
    if (!playing) return
    const id = window.setInterval(() => stepZ(1), 1100)
    return () => window.clearInterval(id)
  }, [playing, stepZ])

  const ref = useEChart(
    loadMassesAndDecay,
    ([ms, decay], view) => {
      const dark = isDark()
      const di = decayIndex(decay)
      const dOf = (m: Mass) => decay.nuclides[di.get(keyOf(m.z, m.n)) ?? -1]
      const clamp = (v: number | null, s: Spoke) => (v === null ? s.min : Math.min(s.max, Math.max(s.min, v)))
      const chain = ms.filter((m) => m.z === view).sort((a, b) => a.n - b.n)
      return {
        backgroundColor: 'transparent',
        // Polygons morph to the next element's rather than vanishing and growing back.
        animationDurationUpdate: 350,
        animationEasingUpdate: 'cubicOut',
        tooltip: {},
        radar: {
          center: ['50%', '52%'],
          radius: '66%',
          shape: 'circle',
          splitNumber: 5,
          indicator: SPOKES.map((s) => ({ name: s.name, min: s.min, max: s.max })),
          axisName: { color: '#475569', fontSize: 13 },
          splitLine: { lineStyle: { color: 'rgba(100,116,139,0.22)' } },
          splitArea: { areaStyle: { color: ['rgba(100,116,139,0.02)', 'rgba(100,116,139,0.06)'] } },
          axisLine: { lineStyle: { color: 'rgba(100,116,139,0.3)' } },
        },
        series: [
          {
            id: 'isotopes',
            type: 'radar',
            symbol: 'none',
            data: chain.map((m, i) => {
              const c = ramp(i, chain.length, dark)
              const d = dOf(m)
              return {
                name: nucName(m),
                value: SPOKES.map((s) => clamp(s.of(m, d), s)),
                lineStyle: { color: c, width: 1, opacity: 0.6 },
                itemStyle: { color: c },
                emphasis: { lineStyle: { width: 2.5, opacity: 1 } },
                tooltip: {
                  formatter: () =>
                    [`${nucName(m)} · Z ${m.z} · N ${m.n}`, `T½ ${halfLifeText(d)}`, ...SPOKES.slice(1).map((s) => `${s.name} ${s.of(m, d) === null ? '—' : `${(s.of(m, d) as number).toFixed(3)} MeV`}`)].join('<br/>'),
                },
              }
            }),
          },
        ],
      }
    },
    false,
    undefined,
    { view: z },
  )

  const count = (masses ?? []).filter((m) => m.z === z).length
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <VizControls>
        <NuclidePicker value={z} options={elements} onPick={(k) => k !== null && setZ(k)} onStep={stepZ} label="Element" />
        <button
          type="button"
          onClick={() => setPlaying((v) => !v)}
          aria-label={playing ? 'Pause' : 'Play through the elements'}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--paper-rule)] text-[var(--paper-muted)] transition-colors hover:bg-[var(--paper-quiet)] hover:text-[var(--paper-text)]"
        >
          {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        </button>
        <span className="text-[12px] text-[var(--paper-muted)]" style={{ fontFamily: 'var(--font-mono), ui-monospace, monospace' }}>
          {count ? `${count} isotopes` : ''}
        </span>
      </VizControls>
      <div ref={ref} className="min-h-0 w-full flex-1" />
    </div>
  )
}
