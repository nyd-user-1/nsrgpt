'use client'

import { Suspense, useEffect } from 'react'
import Link from 'next/link'
import { Check } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { HOVER } from '@/components/CopyTitle'
import { CameraKeys } from '@/components/viz/CameraKeys'
import { MetricView } from '@/components/viz/MetricView'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { vizNeighbours } from '@/lib/viz-charts'
import { chartTypes, metricView, type ChartTypeOption } from '@/lib/viz-metrics'
import { chartForward, markBack } from '@/lib/viz-grow'
import { isEngaged, isTyping, setEngaged, useEngage } from '@/lib/viz-engage'

// A framed chart page's frame (Brendan, 2026-11-04): edge to edge across the app's content area below the header,
// always — the full width is the standard, so there is no column state and no expand. The previous and next chart
// are circle buttons in the header (components/AppLayout.tsx ChartNav, 2026-11-06); the close button is gone. The
// clone a /viz press grows ends on this same rect (expand-box.tsx).
//
// Keys (2026-11-06): [ and ] step to the previous and next chart at any time. ← → do too, until the reader clicks into
// the chart; from then the arrows belong to the chart (lib/viz-engage.ts) and the frame wears a thin ring. Esc hands the
// arrows back. On a 3D chart the camera's keys are caps in the right panel (components/viz/CameraKeys.tsx, brief 54),
// where the hint strip over the chart used to list them.

// The chart type at the foot is a switcher (Brendan, 2026-11-06): every chart type the metric's data fits
// (lib/viz-metrics.ts). A type that's a page of its own goes to that page; the rest draw here, as ?view=<type>.
// ?view= is read inside a Suspense boundary, as a static page must; the server sends the page's own chart.
export function FramedBox({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<Frame view={null}>{children}</Frame>}>
      <WithView>{children}</WithView>
    </Suspense>
  )
}

function WithView({ children }: { children: React.ReactNode }) {
  return <Frame view={useSearchParams().get('view')}>{children}</Frame>
}

function Frame({ children, view }: { children: React.ReactNode; view: string | null }) {
  const path = usePathname()
  const near = vizNeighbours(path)
  const types = chartTypes(path, view)
  const shown = metricView(path, view)
  const router = useRouter()
  const { engaged, camera } = useEngage()

  // Each chart page starts with the arrows on chart stepping.
  useEffect(() => {
    setEngaged(false)
    return () => setEngaged(false)
  }, [path])

  useEffect(() => {
    if (!near) return
    const on = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e)) return
      if (e.key === 'Escape' && isEngaged()) {
        setEngaged(false)
        return
      }
      const step = e.key === '[' || (!isEngaged() && e.key === 'ArrowLeft') ? -1 : e.key === ']' || (!isEngaged() && e.key === 'ArrowRight') ? 1 : 0
      if (!step) return
      e.preventDefault()
      // The next chart with ChartForward, the previous with ChartBack, as the header's buttons (2026-11-06).
      if (step < 0) {
        markBack()
        router.push(near.prev.href)
      } else chartForward(() => router.push(near.next.href))
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [near, router])

  return (
    <div
      data-viz-frame
      className={`isolate relative flex h-full w-full min-h-0 flex-col overflow-hidden bg-[var(--paper)] p-2 ${engaged ? 'ring-1 ring-inset ring-[var(--paper-muted)]' : ''}`}
      // A press inside the chart gives it the arrows; the frame's own buttons don't.
      onPointerDownCapture={(e) => {
        if (!(e.target as HTMLElement).closest('[data-frame-nav]')) setEngaged(true)
      }}
    >
      {camera && <CameraKeys />}
      {shown ? <MetricView value={shown.value} view={shown.view} /> : children}
      {/* The chart type at the foot, inside the border (Brendan, 2026-11-06). */}
      {types.length > 0 && (
        <div data-frame-nav className="flex shrink-0 items-center py-1.5 pl-10 pr-3 text-[13px] text-[var(--paper-text)]">
          {types.length > 1 ? <TypeSwitcher types={types} /> : <span className="py-1">{types[0].title}</span>}
        </div>
      )}
    </div>
  )
}

function TypeSwitcher({ types }: { types: ChartTypeOption[] }) {
  const current = types.find((t) => t.on) ?? types[0]
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`${current.title}: switch chart type`}
          className={`-ml-2.5 rounded-lg px-2.5 py-1 outline-none transition-colors ${HOVER} focus-visible:ring-2 focus-visible:ring-[var(--paper-faint)] data-[state=open]:bg-[color-mix(in_oklab,var(--paper-text)_14%,var(--paper))]`}
        >
          {current.title}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="start"
        sideOffset={8}
        className="nysgpt-app max-h-[70vh] w-[220px] rounded-xl border-[var(--paper-rule)] bg-[var(--paper)] p-1 text-[var(--paper-text)]"
      >
        {types.map((t) => (
          <DropdownMenuItem
            key={t.href}
            asChild
            className={`text-[13px] focus:bg-[var(--paper-quiet)] focus:text-[var(--paper-text)] ${t.on ? 'font-medium text-[var(--paper-strong)]' : ''}`}
          >
            <Link href={t.href} aria-current={t.on ? 'page' : undefined}>
              <span className="min-w-0 flex-1 truncate">{t.title}</span>
              {t.on && <Check className="h-3.5 w-3.5 text-[var(--paper-strong)]" />}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
