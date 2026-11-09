'use client'

import { Children, useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * The contents plate's grid (2026-11-04, Brendan: the plate measures itself, so an open second panel
 * counts). The plate is a fixed height; this fills it with an even rows × columns grid chosen from its
 * own measured size — boxes resize, the plate doesn't grow — and deals the boxes into whole pages that
 * snap sideways, never a half-visible column. A last page with fewer boxes takes the grid that fills
 * the plate best (two large tools sit side by side, not stacked).
 *
 * `minW`/`minH`: the smallest a box may be. `maxCols`: the most columns a page takes, however wide the plate
 * (the index holds 4, so its 32 boxes deal into four even pages of 8; Brendan, 2026-11-07). Before the plate is
 * measured (the server render) it lays out for a desktop plate.
 *
 * `trailing`: pages after the last one, dealt the same way, the first marked data-plate-trailing so a box can scroll
 * to it (the plate's Hidden section, brief 37); `trailingEmpty` fills one page when there is nothing to deal.
 */

type Fit = { rows: number; cols: number }

function grid(w: number, h: number, minW: number, minH: number, maxCols = Infinity): Fit {
  const rows = h >= 2 * minH ? 2 : 1
  let cols = Math.max(1, Math.min(maxCols, Math.floor(w / minW)))
  // A single row stays even too.
  if (rows === 1 && cols > 1 && cols % 2) cols -= 1
  return { rows, cols }
}

/** The grid for a page of n boxes: least empty cells, then boxes nearest the natural shape. */
function pageFit(n: number, { rows, cols }: Fit, w: number, h: number, aspect: number): Fit {
  let best: (Fit & { waste: number; off: number }) | null = null
  for (let r = 1; r <= rows; r++) {
    const c = Math.ceil(n / r)
    if (c > cols) continue
    const waste = r * c - n
    const off = Math.abs(Math.log(w / c / (h / r) / aspect))
    if (!best || waste < best.waste || (waste === best.waste && off < best.off)) best = { rows: r, cols: c, waste, off }
  }
  return best ? { rows: best.rows, cols: best.cols } : { rows, cols }
}

export function PlateGrid({ children, trailing, trailingEmpty, minW = 220, minH = 200, maxCols, className = '' }: { children: ReactNode; trailing?: ReactNode[]; trailingEmpty?: ReactNode; minW?: number; minH?: number; maxCols?: number; className?: string }) {
  const items = Children.toArray(children)
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 1250, h: 420 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const read = () => setSize(s => (s.w === el.clientWidth && s.h === el.clientHeight ? s : { w: el.clientWidth, h: el.clientHeight }))
    read()
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const fit = grid(size.w, size.h, minW, minH, maxCols)
  const cap = fit.rows * fit.cols
  const deal = (list: ReactNode[]) => {
    const out: ReactNode[][] = []
    for (let i = 0; i < list.length; i += cap) out.push(list.slice(i, i + cap))
    return out
  }
  const PAGE = 'grid h-full w-full shrink-0 snap-start snap-always border-t border-l border-[var(--paper-rule)]'
  const page = (boxes: ReactNode[], key: string, mark?: boolean) => {
    const f = pageFit(boxes.length, fit, size.w, size.h, minW / minH)
    return (
      <div
        key={key}
        data-plate-trailing={mark ? '' : undefined}
        className={PAGE}
        style={{ gridTemplateColumns: `repeat(${f.cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${f.rows}, minmax(0, 1fr))` }}
      >
        {boxes}
        {/* An odd last page keeps its rules: the empty cell is drawn, not left as a hole. */}
        {Array.from({ length: f.rows * f.cols - boxes.length }, (_, k) => (
          <div key={`empty-${k}`} aria-hidden className="border-b border-r border-[var(--paper-rule)]" />
        ))}
      </div>
    )
  }

  return (
    <div ref={ref} className={`no-scrollbar flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain ${className}`}>
      {deal(items).map((boxes, p) => page(boxes, String(p)))}
      {trailing && (trailing.length
        ? deal(trailing).map((boxes, p) => page(boxes, `trailing-${p}`, p === 0))
        : (
          <div key="trailing-empty" data-plate-trailing="" className={`${PAGE} grid-cols-1 grid-rows-1`}>
            <div className="flex items-center justify-center border-b border-r border-[var(--paper-rule)] text-sm text-[var(--paper-muted)]">{trailingEmpty}</div>
          </div>
        ))}
    </div>
  )
}
