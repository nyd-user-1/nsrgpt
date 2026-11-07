'use client'

import * as React from 'react'
import dynamic from 'next/dynamic'
import { X } from 'lucide-react'
import { useEChart, type ChartClick } from '@/components/viz/use-echart'
import { EChartLegend } from '@/components/viz/EChartLegend'
import { VizControls } from '@/components/viz/VizControls'
import { NuclidePicker, type PickerOption } from '@/components/viz/NuclidePicker'
import { FAMILIES, FAMILY, familyColor, familyOf, halfLifeText, ink, isDark, loadDecay, modesText, nucName, type Decay, type Family } from '@/lib/viz-physics'
import { chainsOf, graphModel, loadGraphLayout, sizeOf, type GraphModel, type Pin } from './model'

// The decay network (chart batch A, 2026-11-04): every ENSDF ground state a node, coloured by its primary decay
// mode, and an edge from it to the daughter of each mode it decays by — so the β chains run down each isobar
// to its stable member, α links them four mass units apart, and the stable nuclides gather the flow. Nodes
// are in decay.json's order, so the table's rows name them.
//
// 2026-11-05: the layout is computed once (scripts/viz-graph-layout.mjs), not in every browser, and drawn on the
// 2D canvas with layout 'none', which fits the whole graph on open. The legend shows and hides each decay mode.
// A hover lights the node's decay chain, its daughters onward and its parents back, and dims the rest: drawn on a
// canvas over the chart, so the 3,420 nodes and 4,783 edges underneath are never redrawn for a hover.
//
// 2026-11-06 (Brendan): the decays flow. A light runs along every edge from parent to daughter, crossing it at the
// flow lines' speed for the parent's half-life (0.3 s for the shortest, 14 s for the longest). A click pins a
// nuclide's chain or unpins it (2026-11-06: no Shift), and the picker pins by name; with chains lit, only their
// edges flow. The 3D switch opens the graph into a precomputed 3D layout (graph3d.tsx).

const Graph3D = dynamic(() => import('./graph3d'), { ssr: false, loading: () => <div className="min-h-0 flex-1" /> })

const load = () => Promise.all([loadDecay(), loadGraphLayout()])
type Loaded = Awaited<ReturnType<typeof load>>

const models = new WeakMap<Decay, GraphModel>()
const modelOf = ([decay, layout]: Loaded) => {
  let m = models.get(decay)
  if (!m) models.set(decay, (m = graphModel(decay, layout)))
  return m
}

/** The foot the dimming leaves alone: none, now the legend is in the right panel (2026-11-06). */
const LEGEND_BAND = 0
/** The 3D switch's morph, ms (graph3d.tsx MORPH). */
const MORPH_MS = 600
const MONO = { fontFamily: 'var(--font-mono), ui-monospace, monospace' } as const

export function GraphChart() {
  const [decay, setDecay] = React.useState<Decay | null>(null)
  React.useEffect(() => {
    void loadDecay().then(setDecay)
  }, [])
  const [pinned, setPinned] = React.useState<number[]>([])
  const [flow, setFlow] = React.useState(true)
  // The flow starts off for a reader who asks the system for less motion.
  React.useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) setFlow(false)
  }, [])
  const [three, setThree] = React.useState(false)
  // Which view is up: the 3D one mounts at once and opens out of the flat graph; switching back, it folds flat first.
  const [shown3d, setShown3d] = React.useState(false)
  React.useEffect(() => {
    if (three) {
      setShown3d(true)
      return
    }
    const id = window.setTimeout(() => setShown3d(false), MORPH_MS)
    return () => window.clearTimeout(id)
  }, [three])

  const onPin = React.useCallback<Pin>(
    (i, add) => setPinned((cur) => (i === null ? (add ? cur : []) : add ? (cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i]) : [i])),
    [],
  )
  const options = React.useMemo<PickerOption[]>(
    () =>
      (decay?.nuclides ?? [])
        .map((x, i) => ({ x, i }))
        .sort((a, b) => a.x.z - b.x.z || a.x.n - b.x.n)
        .map(({ x, i }) => ({ key: i, label: `${x.z + x.n}${x.el}`, alt: `${x.el}${x.z + x.n}` })),
    [decay],
  )
  const last = pinned.length ? pinned[pinned.length - 1] : null
  const stepPin = (dir: -1 | 1) => {
    const i = options.findIndex((o) => o.key === last)
    if (options.length) onPin(options[i < 0 ? 0 : (i + dir + options.length) % options.length].key, false)
  }

  return (
    <div className="relative flex min-h-0 w-full flex-1 flex-col">
      {shown3d && decay ? <Graph3D decay={decay} pinned={pinned} onPin={onPin} flow={flow} open={three} /> : <Graph2D pinned={pinned} onPin={onPin} flow={flow} />}

      <VizControls>
        <NuclidePicker value={last} options={options} onPick={(k) => onPin(k, false)} onStep={stepPin} label="Pin nuclide" noneLabel="None" />
        {pinned.length > 0 && decay && (
          <div className="flex flex-wrap gap-1">
            {pinned.map((i) => (
              <span key={i} className="flex items-center gap-1 rounded-full border border-[var(--paper-rule)]/30 px-2 py-0.5" style={MONO}>
                {nucName(decay.nuclides[i])}
                <button type="button" aria-label={`Unpin ${nucName(decay.nuclides[i])}`} onClick={() => setPinned((cur) => cur.filter((x) => x !== i))}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {pinned.length > 1 && (
              <button type="button" onClick={() => setPinned([])} className="rounded-full px-2 py-0.5 text-[var(--paper-muted)] hover:bg-[var(--paper-quiet)]">
                Clear
              </button>
            )}
          </div>
        )}
        <div className="flex flex-col gap-1">
          <Switch label="Flow" on={flow} onToggle={() => setFlow((f) => !f)} />
          <Switch label="3D" on={three} onToggle={() => setThree((t) => !t)} />
        </div>
        <span className="leading-snug text-[var(--paper-faint)]">
          Click a nuclide to pin or unpin its chain.
        </span>
      </VizControls>
    </div>
  )
}

function Graph2D({ pinned, onPin, flow }: { pinned: number[]; onPin: Pin; flow: boolean }) {
  const pin = React.useRef(onPin)
  pin.current = onPin
  const ref = useEChart(
    load,
    (loaded) => {
      const [decay] = loaded
      const m = modelOf(loaded)
      const present = FAMILIES.filter((f) => decay.nuclides.some((x) => familyOf(x) === f))
      return {
        backgroundColor: 'transparent',
        animation: false,
        tooltip: {
          formatter: (p: unknown) => {
            const d = p as { dataType: string; dataIndex: number }
            if (d.dataType !== 'node') return ''
            const x = decay.nuclides[d.dataIndex]
            const modes = modesText(x, decay.modes)
            return `${nucName(x)} — ${halfLifeText(x)}${modes ? ` · ${modes}` : ''}`
          },
        },
        legend: {
          show: false,
          data: present.map((f) => FAMILY[f].label),
          icon: 'circle',
          itemWidth: 10,
          itemHeight: 10,
          itemGap: 14,
          textStyle: { color: '#475569', fontSize: 12 },
        },
        series: [
          {
            type: 'graph',
            layout: 'none',
            // Top and bottom only, centred: ECharts then keeps the layout's own proportions instead of stretching
            // it to the box, and the whole graph fits the height on open.
            top: 16,
            bottom: 16,
            left: 'center',
            roam: true,
            scaleLimit: { min: 0.4, max: 24 },
            // The chain overlay is the hover; ECharts' own emphasis would redraw every node and edge.
            emphasis: { disabled: true },
            categories: FAMILIES.map((f) => ({ name: FAMILY[f].label, itemStyle: { color: familyColor(f) } })),
            itemStyle: { opacity: 0.9 },
            lineStyle: { color: 'source', opacity: 0.35, width: 0.8 },
            data: decay.nuclides.map((x, i) => ({
              id: String(i),
              name: nucName(x),
              x: m.xy[i][0],
              y: m.xy[i][1],
              symbolSize: sizeOf(m.fed[i]),
              category: FAMILIES.indexOf(familyOf(x)),
            })),
            links: m.links.map((l) => ({
              source: String(l.from),
              target: String(l.to),
              ...(l.pct === null || l.pct >= 50 ? {} : { lineStyle: { width: 0.4 } }),
            })),
          },
        ],
      }
    },
    false,
    (p) => (p.dataType === 'node' && typeof p.dataIndex === 'number' ? p.dataIndex : null),
    {
      // A click on a nuclide pins its chain rather than opening the table.
      onPick: (p: ChartClick) => {
        if (p.dataType !== 'node' || typeof p.dataIndex !== 'number') return
        pin.current(p.dataIndex, true)
      },
    },
  )
  const overlay = React.useRef<HTMLCanvasElement>(null)
  const pinnedRef = React.useRef(pinned)
  pinnedRef.current = pinned
  const flowRef = React.useRef(flow)
  flowRef.current = flow
  // The overlay's redraw, for the pins and the flow switch.
  const redraw = React.useRef<() => void>(() => {})
  React.useEffect(() => redraw.current(), [pinned, flow])

  React.useEffect(() => {
    let live = true
    let unwire = () => {}
    ;(async () => {
      const [echarts, loaded] = await Promise.all([import('echarts'), load()])
      // useEChart makes the chart once its data and libraries are in; wait for it (a few frames at most).
      let chart: ReturnType<typeof echarts.getInstanceByDom> = undefined
      for (let i = 0; i < 600 && live && !(chart = ref.current ? echarts.getInstanceByDom(ref.current) : undefined); i++)
        await new Promise((r) => requestAnimationFrame(r))
      const canvas = overlay.current
      const ctx = canvas?.getContext('2d')
      if (!live || !chart || !canvas || !ctx) return
      const c = chart
      const [decay] = loaded
      const m = modelOf(loaded)
      const fam = decay.nuclides.map((x) => familyOf(x))
      const chains = new Map<number, Set<number>>()
      const hidden = new Set<Family>()
      let shown: number | null = null
      let raf = 0

      const draw = (now = performance.now()) => {
        const w = canvas.clientWidth
        const h = canvas.clientHeight
        ctx.clearRect(0, 0, w, h)
        const pins = pinnedRef.current
        const flowing = flowRef.current
        const lit = shown !== null || pins.length ? chainsOf(m, shown === null ? pins : [...pins, shown], chains) : null
        if (!lit && !flowing) return
        const p0 = c.convertToPixel({ seriesIndex: 0 }, [0, 0]) as unknown as number[] | undefined
        const p1 = c.convertToPixel({ seriesIndex: 0 }, [1, 1]) as unknown as number[] | undefined
        if (!p0 || !p1) return
        const sx = p1[0] - p0[0]
        const sy = p1[1] - p0[1]
        const at = (i: number) => [p0[0] + m.xy[i][0] * sx, p0[1] + m.xy[i][1] * sy] as const
        // ECharts grows a node by 0.6 of the roam zoom (its nodeScaleRatio); the overlay matches.
        const model = (c as unknown as { getModel(): { getSeriesByIndex(i: number): { get(k: string): unknown } | undefined } }).getModel()
        const zoom = Number(model.getSeriesByIndex(0)?.get('zoom') ?? 1) || 1
        const grow = (zoom - 1) * 0.6 + 1
        const dark = isDark()
        const on = (i: number) => !hidden.has(fam[i]) && (!lit || lit.has(i))

        ctx.save()
        ctx.beginPath()
        ctx.rect(0, 0, w, h - LEGEND_BAND)
        ctx.clip()
        if (lit) {
          ctx.globalAlpha = 0.8
          ctx.fillStyle = getComputedStyle(canvas).getPropertyValue('--paper').trim() || (dark ? '#15120d' : '#ffffff')
          ctx.fillRect(0, 0, w, h)
          ctx.globalAlpha = 1
          // One path per colour: edges, then nodes over them.
          const edges = new Map<Family, Path2D>()
          for (const l of m.links) {
            if (!on(l.from) || !on(l.to)) continue
            const path = edges.get(fam[l.from]) ?? new Path2D()
            edges.set(fam[l.from], path)
            const [ax, ay] = at(l.from)
            const [bx, by] = at(l.to)
            path.moveTo(ax, ay)
            path.lineTo(bx, by)
          }
          ctx.lineWidth = 1.2
          for (const [f, path] of edges) {
            ctx.strokeStyle = familyColor(f, dark)
            ctx.stroke(path)
          }
          const nodes = new Map<Family, Path2D>()
          for (const i of lit) {
            if (!on(i)) continue
            const path = nodes.get(fam[i]) ?? new Path2D()
            nodes.set(fam[i], path)
            const [x, y] = at(i)
            const r = Math.max(1.5, (sizeOf(m.fed[i]) / 2) * grow)
            path.moveTo(x + r, y)
            path.arc(x, y, r, 0, Math.PI * 2)
          }
          for (const [f, path] of nodes) {
            ctx.fillStyle = familyColor(f, dark)
            ctx.fill(path)
          }
          // The hovered and pinned nodes themselves: a ring in the paper's ink.
          ctx.strokeStyle = ink(dark)
          ctx.lineWidth = 1.5
          for (const i of shown === null ? pins : [...pins, shown]) {
            const [hx, hy] = at(i)
            ctx.beginPath()
            ctx.arc(hx, hy, Math.max(1.5, (sizeOf(m.fed[i]) / 2) * grow) + 3, 0, Math.PI * 2)
            ctx.stroke()
          }
        }
        if (flowing) {
          // A light per edge, parent to daughter; with chains lit, only theirs.
          const t = now / 1000
          const r = Math.max(1.2, 1.4 * Math.sqrt(grow))
          const lights = new Map<Family, Path2D>()
          m.links.forEach((l, i) => {
            if (!on(l.from) || !on(l.to)) return
            const f = (t / m.period[i] + m.phase[i]) % 1
            const [ax, ay] = at(l.from)
            const [bx, by] = at(l.to)
            const x = ax + (bx - ax) * f
            const y = ay + (by - ay) * f
            if (x < -4 || y < -4 || x > w + 4 || y > h + 4) return
            const path = lights.get(fam[l.from]) ?? new Path2D()
            lights.set(fam[l.from], path)
            path.moveTo(x + r, y)
            path.arc(x, y, r, 0, Math.PI * 2)
          })
          for (const [f, path] of lights) {
            ctx.fillStyle = familyColor(f, dark)
            ctx.fill(path)
          }
        }
        ctx.restore()
      }

      // While the flow runs, every frame redraws; otherwise each change does.
      const loop = (now: number) => {
        draw(now)
        raf = live && flowRef.current ? requestAnimationFrame(loop) : 0
      }
      const kick = () => {
        if (flowRef.current) {
          if (!raf) raf = requestAnimationFrame(loop)
        } else draw()
      }
      redraw.current = kick

      const fit = () => {
        const d = window.devicePixelRatio || 1
        canvas.width = Math.round(canvas.clientWidth * d)
        canvas.height = Math.round(canvas.clientHeight * d)
        ctx.setTransform(d, 0, 0, d, 0, 0)
        kick()
      }
      const over = (p: { dataType?: string; dataIndex?: number }) => {
        if (p.dataType !== 'node' || typeof p.dataIndex !== 'number' || p.dataIndex === shown) return
        shown = p.dataIndex
        kick()
      }
      const out = (p: { dataType?: string }) => {
        if (p.dataType && p.dataType !== 'node') return
        if (shown === null) return
        shown = null
        kick()
      }
      const legend = (e: unknown) => {
        const selected = (e as { selected: Record<string, boolean> }).selected
        hidden.clear()
        for (const f of FAMILIES) if (selected[FAMILY[f].label] === false) hidden.add(f)
        kick()
      }
      c.on('mouseover', over)
      c.on('mouseout', out)
      c.on('globalout', out)
      c.on('graphRoam', kick)
      c.on('legendselectchanged', legend)
      const ro = new ResizeObserver(fit)
      ro.observe(canvas)
      fit()
      unwire = () => {
        ro.disconnect()
        if (raf) cancelAnimationFrame(raf)
        redraw.current = () => {}
        if (c.isDisposed()) return
        c.off('mouseover', over)
        c.off('mouseout', out)
        c.off('globalout', out)
        c.off('graphRoam', kick)
        c.off('legendselectchanged', legend)
      }
    })()
    return () => {
      live = false
      unwire()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="relative flex min-h-0 w-full flex-1 flex-col">
      <VizControls>
        <EChartLegend chart={ref} items={FAMILIES.map((f) => ({ name: FAMILY[f].label, color: familyColor(f) }))} />
      </VizControls>
      <div ref={ref} className="min-h-0 w-full flex-1" />
      <canvas ref={overlay} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" />
    </div>
  )
}

/** The knowledge map's switch (app/(site)/viz/knowledge/scene.tsx). */
export function Switch({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      className="flex items-center justify-between gap-2 rounded-md border border-[var(--paper-rule)]/25 px-2 py-1 text-left transition-colors hover:bg-[var(--paper-quiet)]"
    >
      <span>{label}</span>
      <span className={`relative h-3.5 w-6 rounded-full transition-colors ${on ? 'bg-[var(--paper-text)]' : 'bg-[var(--paper-rule)]/40'}`}>
        <span className={`absolute top-0.5 h-2.5 w-2.5 rounded-full bg-[var(--paper)] transition-[left] ${on ? 'left-3' : 'left-0.5'}`} />
      </span>
    </button>
  )
}
