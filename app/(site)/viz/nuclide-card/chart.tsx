'use client'

import * as React from 'react'

import { useEChart } from '@/components/viz/use-echart'
import { ChartBox } from '@/components/viz/chart-kebab'
import { VizControls } from '@/components/viz/VizControls'
import { NuclidePicker, type PickerOption } from '@/components/viz/NuclidePicker'
import { isEngaged } from '@/lib/viz-engage'
import { decayIndex, halfLifeText, isDark, keyOf, loadMassesAndDecay, nucName, parseMasses, type DecayNuclide, type Mass } from '@/lib/viz-physics'
import { useData } from '@/lib/use-data'
import { type DecayData } from '@/lib/nuclide'

// One nuclide's card as a radar (chart batch A, 2026-11-04): half-life, Qα, Qβ−, Sₙ, Sₚ and E(2⁺) on six spokes,
// a second nuclide overlaid for comparison. Masses from AME2020, half-life from the ENSDF ground state, E(2⁺)
// from the adopted levels (even-even nuclides only). A value off a spoke's scale sits at its end; one that
// doesn't exist sits at the centre. A row pressed in the data table becomes the first nuclide.

type Spoke = { name: string; min: number; max: number; of: (m: Mass, d?: DecayNuclide) => number | null; text: (m: Mass, d?: DecayNuclide) => string }
const MEV = (v: number | null) => (v === null ? null : v / 1000)
const mevText = (v: number | null) => (v === null ? '—' : `${(v / 1000).toFixed(3)} MeV`)
const T_MAX = 33
const SPOKES: Spoke[] = [
  { name: 'T½', min: -22, max: T_MAX, of: (_, d) => (!d || d.t === -1 ? null : d.t === null ? T_MAX : Math.log10(d.t)), text: (_, d) => halfLifeText(d) },
  { name: 'Qα', min: -20, max: 15, of: (m) => MEV(m.qa), text: (m) => mevText(m.qa) },
  { name: 'Qβ−', min: -25, max: 25, of: (m) => MEV(m.qb), text: (m) => mevText(m.qb) },
  { name: 'Sₙ', min: -5, max: 25, of: (m) => MEV(m.sn), text: (m) => mevText(m.sn) },
  { name: 'Sₚ', min: -5, max: 25, of: (m) => MEV(m.sp), text: (m) => mevText(m.sp) },
  { name: 'E(2⁺)', min: 0, max: 5, of: (m) => MEV(m.e2), text: (m) => (m.e2 === null ? (m.z % 2 || m.n % 2 ? 'Not even-even' : 'Not known') : mevText(m.e2)) },
]
const COLOURS = [
  { light: '#2f6fdc', dark: '#5b9cff', swatch: 'bg-[#2f6fdc] dark:bg-[#5b9cff]' },
  { light: '#e8730c', dark: '#ff8a3d', swatch: 'bg-[#e8730c] dark:bg-[#ff8a3d]' },
]
const PB208 = keyOf(82, 126)
const U238 = keyOf(92, 146)

const MONO = { fontFamily: 'var(--font-mono), ui-monospace, monospace' } as const

export function NuclideCardChart() {
  const [keys, setKeys] = React.useState<[number, number | null]>([PB208, U238])
  const { data: masses = null } = useData('masses.json', { select: parseMasses })
  const { data: decayData = null } = useData<DecayData>('decay.json')
  const rowOfKey = React.useMemo(() => new Map((masses ?? []).map((m, i) => [keyOf(m.z, m.n), i])), [masses])
  // The pickers' lists, Z then A: "208Pb", searchable as "Pb208" too.
  const options = React.useMemo<PickerOption[]>(
    () =>
      (masses ?? [])
        .slice()
        .sort((a, b) => a.z - b.z || a.n - b.n)
        .map((m) => ({ key: keyOf(m.z, m.n), label: `${m.z + m.n}${m.el}`, alt: `${m.el}${m.z + m.n}` })),
    [masses],
  )

  const ref = useEChart(
    loadMassesAndDecay,
    ([ms, decay], view) => {
      const dark = isDark()
      const di = decayIndex(decay)
      const byKey = new Map(ms.map((m) => [keyOf(m.z, m.n), m]))
      const ka = Math.floor(view / 1e6)
      const kb = (view % 1e6) - 1
      const picked = [ka, kb].map((k) => byKey.get(k)).filter((m): m is Mass => !!m)
      const dOf = (m: Mass) => decay.nuclides[di.get(keyOf(m.z, m.n)) ?? -1]
      const clamp = (v: number | null, s: Spoke) => (v === null ? s.min : Math.min(s.max, Math.max(s.min, v)))
      return {
        backgroundColor: 'transparent',
        tooltip: {
          formatter: (p: unknown) => {
            const m = picked[(p as { dataIndex: number }).dataIndex]
            if (!m) return ''
            const d = dOf(m)
            return [`${nucName(m)} · Z ${m.z} · N ${m.n}${m.est ? ' (mass extrapolated)' : ''}`, ...SPOKES.map((s) => `${s.name} ${s.text(m, d)}`)].join('<br/>')
          },
        },
        radar: {
          center: ['50%', '54%'],
          radius: '68%',
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
            type: 'radar',
            symbol: 'circle',
            symbolSize: 6,
            // The point under the pointer grows and wears an outline (2026-11-06).
            emphasis: { scale: 2, itemStyle: { borderColor: dark ? '#f0e9d8' : '#16181d', borderWidth: 2 } },
            data: picked.map((m, i) => {
              const c = dark ? COLOURS[i].dark : COLOURS[i].light
              const d = dOf(m)
              return {
                name: nucName(m),
                value: SPOKES.map((s) => clamp(s.of(m, d), s)),
                lineStyle: { color: c, width: 2 },
                itemStyle: { color: c },
                areaStyle: { color: c, opacity: 0.18 },
              }
            }),
          },
        ],
      }
    },
    false,
    (p) => {
      const k = p.seriesIndex === 0 && typeof p.dataIndex === 'number' ? keys[p.dataIndex] : null
      return k === null || k === undefined ? null : rowOfKey.get(k) ?? null
    },
    {
      view: keys[0] * 1e6 + ((keys[1] ?? -1) + 1),
      // A table row pressed: that nuclide becomes the first.
      point: (row) => {
        const m = masses?.[row]
        if (m) setKeys((k) => [keyOf(m.z, m.n), k[1]])
        return null
      },
    },
  )

  // Keyboard (Brendan, 2026-11-04): arrows step the first nuclide — left/right along the isotope
  // chain, up/down across elements (nearest N) — and Shift+arrows move the overlay the same way.
  const step = React.useCallback(
    (from: number, dz: number, dn: number): number | null => {
      if (!masses) return null
      const byKey = new Map(masses.map((m, i) => [keyOf(m.z, m.n), i]))
      const cur = masses[byKey.get(from) ?? -1]
      if (!cur) return null
      if (dn !== 0) {
        // Next existing isotope of the same element in that direction.
        const chain = masses.filter((m) => m.z === cur.z && (dn > 0 ? m.n > cur.n : m.n < cur.n))
        if (!chain.length) return null
        const next = chain.reduce((a, b) => (Math.abs(a.n - cur.n) <= Math.abs(b.n - cur.n) ? a : b))
        return keyOf(next.z, next.n)
      }
      // Same direction in Z, the isotope with the nearest N.
      const row = masses.filter((m) => m.z === cur.z + dz)
      if (!row.length) return null
      const next = row.reduce((a, b) => (Math.abs(a.n - cur.n) <= Math.abs(b.n - cur.n) ? a : b))
      return keyOf(next.z, next.n)
    },
    [masses],
  )
  React.useEffect(() => {
    if (!masses) return
    const on = (e: KeyboardEvent) => {
      // The arrows step isotopes once the reader has clicked into the chart; before that they step charts (2026-11-06).
      if (!isEngaged()) return
      const t = e.target as HTMLElement | null
      if (t && (/^(input|textarea|select)$/i.test(t.tagName) || t.isContentEditable)) return
      const dir = e.key === 'ArrowRight' ? [0, 1] : e.key === 'ArrowLeft' ? [0, -1] : e.key === 'ArrowUp' ? [1, 0] : e.key === 'ArrowDown' ? [-1, 0] : null
      if (!dir) return
      e.preventDefault()
      const i: 0 | 1 = e.shiftKey ? 1 : 0
      setKeys((ks) => {
        const from = i === 1 ? ks[1] ?? ks[0] : ks[0]
        const to = step(from, dir[0], dir[1])
        if (to === null) return ks
        return i === 0 ? [to, ks[1]] : [ks[0], to]
      })
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [masses, step])

  const choose = (i: 0 | 1, k: number | null) => {
    if (k === null && i === 0) return
    setKeys((ks) => (i === 0 ? [k as number, ks[1]] : [ks[0], k]))
  }
  // ‹ › step along the isotope chain, as ← → do.
  const stepOne = (i: 0 | 1, dir: -1 | 1) =>
    setKeys((ks) => {
      const from = ks[i]
      const to = from === null ? null : step(from, 0, dir)
      if (to === null) return ks
      return i === 0 ? [to, ks[1]] : [ks[0], to]
    })

  // What the polygons mean for THESE nuclides, computed from the displayed values (Brendan, 2026-11-04).
  const takeaways = React.useMemo(() => {
    if (!masses || !decayData) return []
    const di = decayIndex(decayData)
    const byKey = new Map(masses.map((m, i) => [keyOf(m.z, m.n), i]))
    return [keys[0], keys[1]]
      .filter((k): k is number => k !== null)
      .map((k) => masses[byKey.get(k) ?? -1])
      .filter((m): m is Mass => !!m)
      .map((m) => {
        const d = decayData.nuclides[di.get(keyOf(m.z, m.n)) ?? -1]
        const parts: string[] = []
        if (!d || d.t === -1) parts.push('half-life not measured')
        else if (d.t === null) parts.push('stable')
        else parts.push(`T½ ${halfLifeText(d)}${d.m[0] ? `, decays mainly by ${decayData.modes[d.m[0][0]]?.label ?? d.m[0][0]}` : ''}`)
        if (m.qa !== null) parts.push(m.qa > 0 ? `α emission energetically allowed (Qα ${(m.qa / 1000).toFixed(2)} MeV)` : 'α emission closed')
        if (m.qb !== null) parts.push(m.qb > 0 ? `β− allowed (Qβ− ${(m.qb / 1000).toFixed(2)} MeV)` : 'β− closed')
        if (m.sn !== null && m.sn < 2000) parts.push(`weakly bound against neutron removal (Sₙ ${(m.sn / 1000).toFixed(2)} MeV)`)
        if (m.e2 !== null) parts.push(m.e2 >= 2000 ? `high E(2⁺), ${(m.e2 / 1000).toFixed(2)} MeV — closed-shell stiffness` : m.e2 <= 200 ? `low E(2⁺), ${(m.e2 / 1000).toFixed(3)} MeV — strongly deformed` : `E(2⁺) ${(m.e2 / 1000).toFixed(3)} MeV`)
        return { name: nucName(m), text: parts.join(' · ') }
      })
  }, [masses, decayData, keys])

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <VizControls>
        {([0, 1] as const).map((i) => (
          <NuclidePicker
            key={i}
            value={keys[i]}
            options={options}
            onPick={(k) => choose(i, k)}
            onStep={(dir) => stepOne(i, dir)}
            swatch={COLOURS[i].swatch}
            label={i === 0 ? 'Nuclide' : 'Overlay nuclide'}
            noneLabel={i === 1 ? 'No overlay' : undefined}
          />
        ))}
      </VizControls>
      <ChartBox chart={ref} className="min-h-0 w-full flex-1" />
      <VizControls>
        <p className="m-0">
          Each spoke is one measured quantity on its own scale: a point at the rim is at or past the end of the scale, a point at
          the center means the value is absent. A larger polygon means larger energies overall.
        </p>
        {takeaways.map((t) => (
          <p key={t.name} className="m-0 mt-1">
            <span className="text-[var(--paper-text)]">{t.name}</span>: {t.text}
          </p>
        ))}
        <p className="m-0 mt-2 text-[11px] text-[var(--paper-faint)]" style={MONO}>
          Click the chart, then ← → isotope · ↑ ↓ element · Shift + arrows move the overlay · Esc: ← → step charts again
        </p>
      </VizControls>
    </div>
  )
}
