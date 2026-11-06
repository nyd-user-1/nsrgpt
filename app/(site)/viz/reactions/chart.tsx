'use client'

import * as React from 'react'
import { useEChart } from '@/components/viz/use-echart'
import { NuclidePicker, type PickerOption } from '@/components/viz/NuclidePicker'
import { AXIS, FAMILY, decayIndex, decayLinks, familyOf, halfLifeText, ink, isDark, keyOf, loadDecay, modesText, nucName, type Decay, type Link } from '@/lib/viz-physics'
import { FAMILIES, familyOfMode, type Family } from '@/lib/nuclide'

// The decay network as a route map (Brendan, 2026-11-05: "like a subway map or a traffic map"). Every decay
// step ENSDF records, 4,800 of them, is a faint line on the N–Z chart in its decay mode's colour, over a ground
// of every nuclide in its decay family's colour. One route is lit: everything a chosen nuclide decays into
// (downstream) or everything that decays into it (upstream), every branch of at least 0.001%. The four
// natural-series heads are one click away — ²³⁸U, ²³²Th, ²³⁵U, and ²³⁷Np, whose series is extinct in nature
// but made in reactors. A light crosses each step at a speed set by its parent's half-life: 0.3 s for the
// shortest, 14 s for the longest, on a log scale. Scroll zooms, dragging pans, a click on any nuclide routes
// from it, and a new route zooms the map to fit it.

const PRESETS = [
  { label: 'Uranium series', z: 92, n: 146 },
  { label: 'Thorium series', z: 90, n: 142 },
  { label: 'Actinium series', z: 92, n: 143 },
  { label: 'Neptunium series', z: 93, n: 144 },
]
const MIN_PCT = 0.001
const MAX_ROUTE = 1500

/** Seconds a light takes to cross its step: 0.3 s for the shortest half-lives, 14 s for the longest. */
const period = (t: number | null) => {
  if (t === null || t <= 0) return 14
  const k = (Math.log10(t) + 7) / 25
  return 0.3 + 13.7 * Math.min(1, Math.max(0, k))
}

const linksOf = new WeakMap<Decay, Link[]>()
const allLinks = (d: Decay) => {
  let l = linksOf.get(d)
  if (!l) linksOf.set(d, (l = decayLinks(d)))
  return l
}

/** The lit route: every step reachable from `start` along (or against) the decay links, branches ≥ MIN_PCT. */
function route(d: Decay, start: number, up: boolean): { steps: Link[]; nodes: number[] } {
  const by = new Map<number, Link[]>()
  for (const l of allLinks(d)) {
    if (l.pct !== null && l.pct < MIN_PCT) continue
    const k = up ? l.to : l.from
    const list = by.get(k) ?? []
    list.push(l)
    by.set(k, list)
  }
  const seen = new Set([start])
  const queue = [start]
  const steps: Link[] = []
  while (queue.length && seen.size < MAX_ROUTE) {
    const at = queue.shift() as number
    for (const l of by.get(at) ?? []) {
      steps.push(l)
      const next = up ? l.from : l.to
      if (!seen.has(next)) {
        seen.add(next)
        queue.push(next)
      }
    }
  }
  return { steps, nodes: [...seen] }
}

// The route's nuclides, in the order the chart's labelled series draws them — a click there names one.
let drawnNodes: number[] = []

export function ReactionsChart() {
  const [decay, setDecay] = React.useState<Decay | null>(null)
  const [start, setStart] = React.useState(keyOf(92, 146))
  const [up, setUp] = React.useState(false)
  React.useEffect(() => {
    void loadDecay().then(setDecay)
  }, [])

  const options = React.useMemo<PickerOption[]>(
    () =>
      (decay?.nuclides ?? [])
        .slice()
        .sort((a, b) => a.z - b.z || a.n - b.n)
        .map((x) => ({ key: keyOf(x.z, x.n), label: `${x.z + x.n}${x.el}`, alt: `${x.el}${x.z + x.n}` })),
    [decay],
  )
  const stepStart = (dir: -1 | 1) => {
    const i = options.findIndex((o) => o.key === start)
    if (i >= 0) setStart(options[(i + dir + options.length) % options.length].key)
  }

  // What the lit route is, in words.
  const summary = React.useMemo(() => {
    if (!decay) return ''
    const s = decayIndex(decay).get(start)
    if (s === undefined) return ''
    const r = route(decay, s, up)
    const head = nucName(decay.nuclides[s])
    if (!r.steps.length) return up ? `Nothing in ENSDF decays into ${head}.` : `${head} has no recorded decay step${decay.nuclides[s].t === null ? ': it is stable' : ''}.`
    const ends = r.nodes.filter((i) => decay.nuclides[i].t === null).map((i) => nucName(decay.nuclides[i]))
    return up
      ? `${r.nodes.length - 1} nuclides decay into ${head}, over ${r.steps.length} steps.`
      : `${head} decays through ${r.nodes.length - 1} nuclides in ${r.steps.length} steps${ends.length ? `, ending at ${ends.join(', ')}` : ''}.`
  }, [decay, start, up])

  const ref = useEChart(
    loadDecay,
    (d, view) => {
      const dark = isDark()
      const index = decayIndex(d)
      const s = index.get(Math.floor(view / 2))
      const r = s === undefined ? { steps: [], nodes: [] } : route(d, s, view % 2 === 1)
      drawnNodes = r.nodes
      const lit = r.steps.length > 0
      const fam = (f: Family) => (dark ? FAMILY[f].dark : FAMILY[f].light)
      const at = (i: number) => [d.nuclides[i].n, d.nuclides[i].z]

      // The map fits the route, with a margin; with no route, the whole chart.
      const ns = r.nodes.map((i) => d.nuclides[i].n)
      const zs = r.nodes.map((i) => d.nuclides[i].z)
      const box = lit
        ? { n0: Math.min(...ns) - 4, n1: Math.max(...ns) + 4, z0: Math.min(...zs) - 3, z1: Math.max(...zs) + 3 }
        : { n0: 0, n1: 180, z0: 0, z1: 120 }

      const byFamily = new Map<Family, Link[]>()
      for (const l of allLinks(d)) {
        const f = familyOfMode(l.mode)
        const list = byFamily.get(f) ?? []
        list.push(l)
        byFamily.set(f, list)
      }
      const nodeTip = (i: number) => {
        const x = d.nuclides[i]
        const modes = modesText(x, d.modes)
        return `${nucName(x)} · Z ${x.z} · N ${x.n} — ${halfLifeText(x)}${modes ? ` · ${modes}` : ''}`
      }

      return {
        backgroundColor: 'transparent',
        animation: false,
        tooltip: {
          formatter: (p: unknown) => {
            const q = p as { seriesId?: string; dataIndex: number }
            if (q.seriesId === 'ground') return nodeTip(q.dataIndex)
            if (q.seriesId === 'route-nodes') return nodeTip(r.nodes[q.dataIndex])
            if (q.seriesId === 'route') {
              const l = r.steps[q.dataIndex]
              const x = d.nuclides[l.from]
              return `${nucName(x)} → ${nucName(d.nuclides[l.to])} · ${d.modes[l.mode]?.label ?? l.mode}${l.pct === null ? '' : ` ${l.pct}%`} · T½ ${halfLifeText(x)}`
            }
            return ''
          },
        },
        legend: { top: 0, textStyle: { color: dark ? '#cbd5e1' : '#334155' }, data: FAMILIES.filter((f) => byFamily.has(f)).map((f) => FAMILY[f].label) },
        grid: { left: 48, right: 24, top: 36, bottom: 40 },
        xAxis: { type: 'value', name: 'N', min: 0, max: 180, ...AXIS, splitLine: { lineStyle: { color: 'rgba(100,116,139,0.08)' } } },
        yAxis: { type: 'value', name: 'Z', min: 0, max: 120, ...AXIS, splitLine: { lineStyle: { color: 'rgba(100,116,139,0.08)' } } },
        dataZoom: [
          { type: 'inside', xAxisIndex: 0, filterMode: 'none', startValue: box.n0, endValue: box.n1 },
          { type: 'inside', yAxisIndex: 0, filterMode: 'none', startValue: box.z0, endValue: box.z1 },
        ],
        series: [
          // The ground: every nuclide in its decay family's colour. A click routes from it.
          {
            id: 'ground',
            type: 'scatter',
            data: d.nuclides.map((x) => ({ value: [x.n, x.z], itemStyle: { color: fam(familyOf(x)), opacity: lit ? 0.22 : 0.45 } })),
            symbolSize: 4,
            emphasis: { scale: 2.2, itemStyle: { opacity: 1, borderColor: ink(dark), borderWidth: 1 } },
          },
          // Every decay step, faint, one series per decay mode so the legend can switch each off.
          ...FAMILIES.filter((f) => byFamily.has(f)).map((f) => ({
            name: FAMILY[f].label,
            type: 'lines',
            coordinateSystem: 'cartesian2d',
            large: true,
            silent: true,
            lineStyle: { color: fam(f), width: 1, opacity: lit ? 0.1 : 0.3 },
            data: byFamily.get(f)!.map((l) => ({ coords: [at(l.from), at(l.to)] })),
          })),
          // The lit route: lights move at the parent's half-life; hovering a step dims the rest of the route.
          {
            id: 'route',
            type: 'lines',
            coordinateSystem: 'cartesian2d',
            zlevel: 1,
            data: r.steps.map((l) => ({
              coords: [at(l.from), at(l.to)],
              lineStyle: { color: fam(familyOfMode(l.mode)), opacity: l.pct !== null && l.pct < 1 ? 0.5 : 0.95, width: l.pct !== null && l.pct < 1 ? 1.2 : 2.4 },
              effect: { period: period(d.nuclides[l.from].t) },
            })),
            effect: { show: r.steps.length <= 600, symbol: 'circle', symbolSize: 5, trailLength: 0.35, loop: true },
            emphasis: { focus: 'self', blurScope: 'series', lineStyle: { width: 4 } },
            blur: { lineStyle: { opacity: 0.12 } },
          },
          // The route's nuclides, named when there are few enough to read; stable ends in ink.
          {
            id: 'route-nodes',
            type: 'scatter',
            zlevel: 2,
            data: r.nodes.map((i) => {
              const x = d.nuclides[i]
              return {
                value: at(i),
                symbolSize: x.t === null ? 10 : i === s ? 11 : 7,
                itemStyle: { color: x.t === null ? ink(dark) : fam(familyOf(x)), borderColor: i === s ? ink(dark) : undefined, borderWidth: i === s ? 2 : 0 },
                label: { show: r.nodes.length <= 70, formatter: nucName(x), position: 'right', distance: 4, fontSize: 10, color: ink(dark) },
              }
            }),
            emphasis: { scale: 1.6, itemStyle: { borderColor: ink(dark), borderWidth: 1.5 } },
          },
        ],
      }
    },
    false,
    undefined,
    {
      view: start * 2 + (up ? 1 : 0),
      // A click on any nuclide routes from it.
      onPick: (p) => {
        if (!decay || typeof p.dataIndex !== 'number') return
        const idx = p.seriesIndex === 0 ? p.dataIndex : p.seriesType === 'scatter' ? drawnNodes[p.dataIndex] : undefined
        const x = idx === undefined ? undefined : decay.nuclides[idx]
        if (x) setStart(keyOf(x.z, x.n))
      },
    },
  )

  const CHIP = 'rounded-full border px-3 py-1 text-[12px] transition-colors'
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 px-3 pt-2">
        <NuclidePicker value={start} options={options} onPick={(k) => k !== null && setStart(k)} onStep={stepStart} label="Start nuclide" />
        <div className="ml-1 flex overflow-hidden rounded-full border border-[var(--paper-rule)] text-[12px]">
          {[false, true].map((u) => (
            <button
              key={String(u)}
              type="button"
              onClick={() => setUp(u)}
              aria-pressed={up === u}
              className={`px-3 py-1 transition-colors ${up === u ? 'bg-[var(--paper-text)] text-[var(--paper)]' : 'text-[var(--paper-muted)] hover:bg-[var(--paper-quiet)]'}`}
            >
              {u ? 'What decays into it' : 'What it decays into'}
            </button>
          ))}
        </div>
        {PRESETS.map((p) => {
          const k = keyOf(p.z, p.n)
          const on = start === k && !up
          return (
            <button
              key={p.label}
              type="button"
              onClick={() => {
                setStart(k)
                setUp(false)
              }}
              className={`${CHIP} ${on ? 'border-[var(--paper-text)] text-[var(--paper-text)]' : 'border-[var(--paper-rule)] text-[var(--paper-muted)] hover:bg-[var(--paper-quiet)]'}`}
            >
              {p.label}
            </button>
          )
        })}
      </div>
      <div ref={ref} className="min-h-0 w-full flex-1" />
      <div className="shrink-0 border-t border-[var(--paper-rule)] px-4 py-3 text-[12px] leading-relaxed text-[var(--paper-muted)]">
        <p className="m-0 text-[var(--paper-text)]">{summary}</p>
        <p className="m-0 mt-1">
          Every decay step in ENSDF is a faint line on the chart of nuclides, coloured by decay mode; each dot behind is a nuclide in
          its decay family&apos;s colour. The lit route follows every branch of at least 0.001%. A light&apos;s speed follows its
          parent&apos;s half-life: the fast lights are the short-lived steps. Scroll to zoom, drag to pan, click any nuclide to route
          from it; the legend switches each decay mode&apos;s lines off and on.
        </p>
      </div>
    </div>
  )
}
