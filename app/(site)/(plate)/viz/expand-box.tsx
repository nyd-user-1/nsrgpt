'use client'

// Box 1's test flight, now every chart box's (Brendan, 2026-11-04): a press doesn't open the pane —
// the box itself grows. A paper clone lifts off the masthead's wordmark and expands to the whole
// content area below the header — the chart page's full-width frame — then the route changes and
// the chart fades in to fill it (VizShell framed's RevealFx). A press with a modifier key keeps the
// link's own behaviour (new tab, new window): this stays a real link.

import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { GROW_EASE as EASE, GROW_MS as MS, growWait, noteOrigin } from '@/lib/viz-grow'

/** The motion's two ends: the wordmark, top left, and the whole content area below the header. */
function ends(el?: Element | null) {
  const word = document.querySelector('[data-inspect="Wordmark"]')
  const col = (el?.closest('[data-viz-column]') ?? document.querySelector('[data-viz-column]')) as HTMLElement | null
  const from = (word ?? el ?? document.body).getBoundingClientRect()
  const to = (col?.parentElement ?? el ?? document.body).getBoundingClientRect()
  return { from, to }
}

/** The paper clone the motion moves, at one end or the other. */
function Clone({ box, grown }: { box: { from: DOMRect; to: DOMRect }; grown: boolean }) {
  return createPortal(
    <div
      aria-hidden
      className="nysgpt-app fixed z-[90] overflow-hidden border bg-[var(--paper)]"
      style={{
        left: grown ? box.to.left : box.from.left,
        top: grown ? box.to.top : box.from.top,
        width: grown ? box.to.width : box.from.width,
        height: grown ? box.to.height : box.from.height,
        opacity: grown ? 1 : 0.98,
        // A rounded, ruled box at the wordmark; at the full end, the borderless frame, its bottom corners on the
        // app card's curve.
        borderRadius: grown ? '0 0 15px 15px' : 16,
        borderColor: grown ? 'transparent' : 'var(--paper-rule)',
        transition: ['left', 'top', 'width', 'height', 'border-radius', 'border-color'].map((p) => `${p} ${MS}ms ${EASE}`).join(', '),
      }}
    />,
    document.body,
  )
}


export function ExpandBox({ href, className, style, children }: { href: string; className?: string; style?: React.CSSProperties; children: React.ReactNode }) {
  const router = useRouter()
  const ref = useRef<HTMLAnchorElement>(null)
  const [box, setBox] = useState<{ from: DOMRect; to: DOMRect } | null>(null)
  const [grown, setGrown] = useState(false)

  const onClick = (e: React.MouseEvent) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    const el = ref.current
    if (!el || box) return
    // The motion starts at the masthead's MAIN box, top left (Brendan, 2026-11-04 — not the
    // clicked box), and grows over the union of masthead + plate: the one combined box.
    // The clone's end rect IS the chart page's frame: the whole content area below the header, edge
    // to edge (Brendan, 2026-11-04: full width is the standard) — on /viz, the area the column sits in
    // (the column's parent, PlateFrame's root) — so the swap underneath is invisible and the chart
    // builds INSIDE the box the wipe leaves standing, never over it.
    const b = ends(el)
    setBox(b)
    // The next-chart button grows its clone from this same spot (lib/viz-grow.ts).
    noteOrigin(b.from, b.to)
    requestAnimationFrame(() => requestAnimationFrame(() => setGrown(true)))
    window.setTimeout(() => {
      router.push(href)
      growWait(href)
    }, MS)
  }

  return (
    <>
      <a ref={ref} href={href} onClick={onClick} data-nav="plate" data-motion-own className={className} style={style}>
        {children}
      </a>
      {box && <Clone box={box} grown={grown} />}
    </>
  )
}
