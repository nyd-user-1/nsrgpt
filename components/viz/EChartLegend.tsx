'use client'

import * as React from 'react'

const MONO = { fontFamily: 'var(--font-mono), ui-monospace, monospace' } as const

type Item = { name: string; color: string }
type Chart = {
  dispatchAction: (a: unknown) => void
  getOption: () => unknown
  getVisual: (finder: { seriesIndex: number }, key: string) => unknown
  on: (e: string, f: (p: unknown) => void) => void
  off: (e: string, f: (p: unknown) => void) => void
  isDisposed: () => boolean
}
type Opt = { legend?: { data?: (string | { name: string })[]; selected?: Record<string, boolean> }[]; series?: { name?: string }[] }

/**
 * An ECharts chart's legend, in the right panel with its controls (components/viz/VizControls.tsx) rather than on
 * the canvas (Brendan, 2026-11-06). The chart keeps its legend component, hidden (`legend.show: false`), so a click
 * here toggles the series through ECharts' own legend action, and whatever else listens for a legend change (the
 * force graph's overlay) hears it as before. Without `items`, the names and colours are read from the chart after
 * each draw: the legend's own list where the option gives one, else the series, each in its drawn colour.
 */
/** `visualMap`: the items are a piecewise visualMap's pieces, in its order (the heatmap's half-life bands; Brendan, 2026-11-10);
 *  a click toggles the piece through ECharts' selectDataRange action and the chart's own event keeps the list in step. */
export function EChartLegend({ chart, items, visualMap }: { chart: React.RefObject<HTMLDivElement | null>; items?: Item[]; visualMap?: number }) {
  const [off, setOff] = React.useState<Set<string>>(new Set())
  const [read, setRead] = React.useState<Item[]>([])
  const instance = React.useRef<Chart | null>(null)
  // 'finished' fires after every draw; the list only changes when the series do.
  const last = React.useRef('')
  React.useEffect(() => {
    let live = true
    let unhook = () => {}
    void import('echarts').then(async (echarts) => {
      // The chart is made once its data is in; wait for it.
      for (let i = 0; i < 600 && live; i++) {
        const c = (chart.current ? echarts.getInstanceByDom(chart.current) : undefined) as unknown as Chart | undefined
        if (c) {
          instance.current = c
          const sync = () => {
            const opt = c.getOption() as Opt
            const series = opt.series ?? []
            const names = opt.legend?.[0]?.data?.map((d) => (typeof d === 'string' ? d : d.name)) ?? series.map((s) => s.name ?? '').filter(Boolean)
            const color = (name: string) => {
              const k = series.findIndex((s) => s.name === name)
              const v = k >= 0 ? c.getVisual({ seriesIndex: k }, 'color') : null
              return typeof v === 'string' ? v : 'var(--paper-muted)'
            }
            const next = [...new Set(names)].map((name) => ({ name, color: color(name) }))
            const sel = opt.legend?.[0]?.selected ?? {}
            const key = JSON.stringify([next, sel])
            if (key === last.current) return
            last.current = key
            setRead(next)
            setOff(new Set(Object.keys(sel).filter((k) => sel[k] === false)))
          }
          const changed = (e: unknown) => {
            const sel = (e as { selected: Record<string, boolean> }).selected
            setOff(new Set(Object.keys(sel).filter((k) => sel[k] === false)))
          }
          // A visualMap's pieces are keyed by index in its event; the names come from the items given.
          const pieces = (e: unknown) => {
            const sel = (e as { selected: Record<string, boolean> }).selected
            setOff(new Set(Object.keys(sel).filter((k) => sel[k] === false).map((k) => itemsRef.current?.[Number(k)]?.name ?? k)))
          }
          if (visualMap === undefined) {
            sync()
            c.on('finished', sync)
            c.on('legendselectchanged', changed)
          } else c.on('datarangeselected', pieces)
          unhook = () => {
            if (c.isDisposed()) return
            c.off('finished', sync)
            c.off('legendselectchanged', changed)
            c.off('datarangeselected', pieces)
          }
          return
        }
        await new Promise((r) => requestAnimationFrame(r))
      }
    })
    return () => {
      live = false
      unhook()
    }
  }, [chart, visualMap])
  const itemsRef = React.useRef(items)
  itemsRef.current = items
  const list = items ?? read
  const toggle = (name: string) => {
    if (visualMap === undefined) return instance.current?.dispatchAction({ type: 'legendToggleSelect', name })
    const selected: Record<string, boolean> = {}
    list.forEach((it, i) => { selected[String(i)] = it.name === name ? off.has(name) : !off.has(it.name) })
    instance.current?.dispatchAction({ type: 'selectDataRange', visualMapIndex: visualMap, selected })
  }
  if (!list.length) return null
  return (
    <div className="flex flex-wrap gap-1">
      {list.map((it) => (
        <button
          key={it.name}
          type="button"
          aria-pressed={!off.has(it.name)}
          onClick={() => toggle(it.name)}
          className={`flex items-center gap-1.5 rounded-full border border-[var(--paper-rule)]/30 px-2 py-0.5 transition-opacity hover:bg-[var(--paper-quiet)] ${off.has(it.name) ? 'opacity-35' : ''}`}
          style={MONO}
        >
          <span className="h-2 w-2 rounded-full" style={{ background: it.color }} />
          {it.name}
        </button>
      ))}
    </div>
  )
}
