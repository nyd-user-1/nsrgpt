'use client'

import * as React from 'react'
import { useEChart } from '@/components/viz/use-echart'
import { FAMILIES, FAMILY, familyColor, familyOf, halfLifeText, ink, isDark, loadDecay, modesText, nucName, type Decay, type Family } from '@/lib/viz-physics'
import { chainOf, graphModel, loadGraphLayout, type GraphModel } from './model'

// The decay network (chart batch A, 2026-11-04): every ENSDF ground state a node, coloured by its primary decay
// mode, and an edge from it to the daughter of each mode it decays by — so the β chains run down each isobar
// to its stable member, α links them four mass units apart, and the stable nuclides gather the flow. Nodes
// are in decay.json's order, so the table's rows name them.
//
// 2026-11-05: the layout is computed once (scripts/viz-graph-layout.mjs), not in every browser, and drawn on the
// 2D canvas with layout 'none', which fits the whole graph on open. The legend shows and hides each decay mode.
// A hover lights the node's decay chain, its daughters onward and its parents back, and dims the rest: drawn on a
// canvas over the chart, so the 3,420 nodes and 4,783 edges underneath are never redrawn for a hover.

const load = () => Promise.all([loadDecay(), loadGraphLayout()])
type Loaded = Awaited<ReturnType<typeof load>>

const models = new WeakMap<Decay, GraphModel>()
const modelOf = ([decay, layout]: Loaded) => {
  let m = models.get(decay)
  if (!m) models.set(decay, (m = graphModel(decay, layout)))
  return m
}

const sizeOf = (fed: number) => Math.min(9, 2 + Math.sqrt(fed) * 1.6)
/** The legend's band along the foot, which the dimming leaves alone. */
const LEGEND_BAND = 40

export function GraphChart() {
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
          data: present.map((f) => FAMILY[f].label),
          bottom: 8,
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
            bottom: LEGEND_BAND + 8,
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
  )
  const overlay = React.useRef<HTMLCanvasElement>(null)

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

      const draw = () => {
        const w = canvas.clientWidth
        const h = canvas.clientHeight
        ctx.clearRect(0, 0, w, h)
        if (shown === null) return
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
        const chain = chainOf(m, shown, chains)
        const on = (i: number) => chain.has(i) && !hidden.has(fam[i])

        ctx.save()
        ctx.beginPath()
        ctx.rect(0, 0, w, h - LEGEND_BAND)
        ctx.clip()
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
        for (const i of chain) {
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
        // The hovered node itself: a ring in the paper's ink.
        const [hx, hy] = at(shown)
        ctx.beginPath()
        ctx.arc(hx, hy, Math.max(1.5, (sizeOf(m.fed[shown]) / 2) * grow) + 3, 0, Math.PI * 2)
        ctx.strokeStyle = ink(dark)
        ctx.lineWidth = 1.5
        ctx.stroke()
        ctx.restore()
      }

      const fit = () => {
        const d = window.devicePixelRatio || 1
        canvas.width = Math.round(canvas.clientWidth * d)
        canvas.height = Math.round(canvas.clientHeight * d)
        ctx.setTransform(d, 0, 0, d, 0, 0)
        draw()
      }
      const over = (p: { dataType?: string; dataIndex?: number }) => {
        if (p.dataType !== 'node' || typeof p.dataIndex !== 'number' || p.dataIndex === shown) return
        shown = p.dataIndex
        draw()
      }
      const out = (p: { dataType?: string }) => {
        if (p.dataType && p.dataType !== 'node') return
        if (shown === null) return
        shown = null
        draw()
      }
      const legend = (e: unknown) => {
        const selected = (e as { selected: Record<string, boolean> }).selected
        hidden.clear()
        for (const f of FAMILIES) if (selected[FAMILY[f].label] === false) hidden.add(f)
        draw()
      }
      c.on('mouseover', over)
      c.on('mouseout', out)
      c.on('globalout', out)
      c.on('graphRoam', draw)
      c.on('legendselectchanged', legend)
      const ro = new ResizeObserver(fit)
      ro.observe(canvas)
      fit()
      unwire = () => {
        ro.disconnect()
        if (c.isDisposed()) return
        c.off('mouseover', over)
        c.off('mouseout', out)
        c.off('globalout', out)
        c.off('graphRoam', draw)
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
      <div ref={ref} className="min-h-0 w-full flex-1" />
      <canvas ref={overlay} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" />
    </div>
  )
}
