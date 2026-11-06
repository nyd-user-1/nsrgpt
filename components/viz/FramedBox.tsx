'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { HEADER_TITLES } from '@/lib/header-titles'
import { vizNeighbours } from '@/lib/viz-charts'
import { isEngaged, isTyping, setEngaged, useEngage } from '@/lib/viz-engage'

// A framed chart page's frame (Brendan, 2026-11-04): edge to edge across the app's content area below the header,
// always — the full width is the standard, so there is no column state and no expand. Three circle buttons in a
// row in the top right: previous and next chart (the /viz index's box order, wrapping at the ends —
// lib/viz-charts.ts) and close (back to /viz). The clone a /viz press grows ends on this same rect
// (expand-box.tsx).
//
// Keys (2026-11-06): [ and ] step to the previous and next chart at any time. ← → do too, until the reader clicks into
// the chart; from then the arrows belong to the chart (lib/viz-engage.ts) and the frame wears a thin ring, with the
// camera's keys listed on a 3D chart. Esc hands the arrows back.

const CIRCLE =
  'flex h-10 w-10 items-center justify-center rounded-full border border-[var(--paper-rule)] bg-[var(--paper)] shadow-md transition-colors hover:bg-[var(--paper-quiet)]'

export function FramedBox({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  const near = vizNeighbours(path)
  const router = useRouter()
  const { engaged, camera } = useEngage()
  const name = (href: string, title: string) => HEADER_TITLES[href] ?? title

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
      router.push(step < 0 ? near.prev.href : near.next.href)
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [near, router])

  return (
    <div
      className={`isolate relative flex h-full w-full min-h-0 flex-col overflow-hidden bg-[var(--paper)] p-2 ${engaged ? 'ring-1 ring-inset ring-[var(--paper-muted)]' : ''}`}
      // A press inside the chart gives it the arrows; the frame's own buttons don't.
      onPointerDownCapture={(e) => {
        if (!(e.target as HTMLElement).closest('[data-frame-nav]')) setEngaged(true)
      }}
    >
      <div data-frame-nav className="absolute right-4 top-4 z-10 flex gap-2">
        {near && (
          <>
            <Link href={near.prev.href} aria-label={`Previous chart: ${name(near.prev.href, near.prev.title)}`} title={name(near.prev.href, near.prev.title)} className={CIRCLE}>
              <ChevronLeft className="h-4 w-4 text-[var(--paper-text)]" />
            </Link>
            <Link href={near.next.href} aria-label={`Next chart: ${name(near.next.href, near.next.title)}`} title={name(near.next.href, near.next.title)} className={CIRCLE}>
              <ChevronRight className="h-4 w-4 text-[var(--paper-text)]" />
            </Link>
          </>
        )}
        {/* Close: back to /viz, reversing the box the press grew (Brendan, 2026-11-04). */}
        <Link href="/" aria-label="Close the chart" className={CIRCLE}>
          <X className="h-4 w-4 text-[var(--paper-text)]" />
        </Link>
      </div>
      {engaged && camera && (
        <p
          data-frame-nav
          className="pointer-events-none absolute bottom-4 left-1/2 z-10 m-0 -translate-x-1/2 rounded-full border border-[var(--paper-rule)]/30 bg-[var(--paper)]/90 px-3 py-1 text-[11px] text-[var(--paper-muted)] backdrop-blur-sm"
          style={{ fontFamily: 'var(--font-mono), ui-monospace, monospace' }}
        >
          ← → orbit · ↑ ↓ tilt · Cmd + ↑ ↓ or + − zoom · Shift + arrows pan · Space rotation · 0 reset · Esc leave
        </p>
      )}
      {children}
    </div>
  )
}
