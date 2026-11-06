'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { HEADER_TITLES } from '@/lib/header-titles'
import { vizNeighbours } from '@/lib/viz-charts'

// A framed chart page's frame (Brendan, 2026-11-04): edge to edge across the app's content area below the header,
// always — the full width is the standard, so there is no column state and no expand. Three circle buttons in a
// row in the top right: previous and next chart (the /viz index's box order, wrapping at the ends —
// lib/viz-charts.ts) and close (back to /viz). The clone a /viz press grows ends on this same rect
// (expand-box.tsx). [ and ] step to the previous and next chart from the keyboard (2026-11-05); the arrow keys stay
// with the charts that use them.

const CIRCLE =
  'flex h-10 w-10 items-center justify-center rounded-full border border-[var(--paper-rule)] bg-[var(--paper)] shadow-md transition-colors hover:bg-[var(--paper-quiet)]'

export function FramedBox({ children }: { children: React.ReactNode }) {
  const near = vizNeighbours(usePathname())
  const router = useRouter()
  const name = (href: string, title: string) => HEADER_TITLES[href] ?? title
  useEffect(() => {
    if (!near) return
    const on = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.key !== '[' && e.key !== ']')) return
      const t = e.target as HTMLElement | null
      if (t && (/^(input|textarea|select)$/i.test(t.tagName) || t.isContentEditable)) return
      e.preventDefault()
      router.push(e.key === '[' ? near.prev.href : near.next.href)
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [near, router])
  return (
    <div className="isolate relative flex h-full w-full min-h-0 flex-col overflow-hidden bg-[var(--paper)] p-2">
      <div className="absolute right-4 top-4 z-10 flex gap-2">
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
      {children}
    </div>
  )
}
