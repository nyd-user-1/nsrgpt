'use client'

import { useEffect, useLayoutEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { isEmbedded } from '@/lib/pane'
import { chartBack, chartForward, chartForwardFirst, chartRoot, markBack, removeGrow, takeBack } from '@/lib/viz-grow'

// Panel 1's page transitions (Brendan, 2026-11-06; lib/viz-grow.ts): ChartRoot whenever / arrives or first loads,
// ChartForward on every other page's first load and on every link to another page, ChartBack after the
// previous-chart button and on the browser's back (2026-11-07). A link that runs its own (the index's boxes, the chart
// buttons) carries data-motion-own.

export function PageMotion() {
  const path = usePathname()
  const router = useRouter()
  const was = useRef<string | null>(null)

  // Before the first paint of each arrival, so the page never shows uncovered. React runs this twice in
  // development; the second run finds the path already seen.
  useLayoutEffect(() => {
    if (isEmbedded() || was.current === path) return
    const first = was.current === null
    was.current = path
    if (path === '/') chartRoot(first)
    else if (first) chartForwardFirst()
    else if (takeBack()) chartBack()
  }, [path])

  // ChartForward's clone goes once the next page is up.
  useEffect(() => removeGrow, [path])

  // The browser's back (and forward) arrives as ChartBack (Brendan, 2026-11-07): /search back to /chat, any page back.
  useEffect(() => {
    if (isEmbedded()) return
    const back = () => markBack()
    window.addEventListener('popstate', back)
    return () => window.removeEventListener('popstate', back)
  }, [])

  useEffect(() => {
    if (isEmbedded()) return
    const on = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a || a.target || a.hasAttribute('download') || a.closest('[data-motion-own], [role=menu], [role=menuitem]')) return
      const url = new URL(a.href, window.location.href)
      // Another page of this app's; / runs ChartRoot as it arrives instead.
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname || url.pathname === '/' || url.pathname.startsWith('/api')) return
      // Links between Elpis's own pages, /elpis and every route under it (Brendan, 2026-11-11): no clone, no
      // grow, the next page lands at once.
      const elpis = (p: string) => p === '/elpis' || p.startsWith('/elpis/')
      if (elpis(url.pathname) && elpis(window.location.pathname)) return
      e.preventDefault()
      e.stopPropagation()
      chartForward(() => router.push(url.pathname + url.search + url.hash))
    }
    document.addEventListener('click', on, true)
    return () => document.removeEventListener('click', on, true)
  }, [router])

  return null
}
