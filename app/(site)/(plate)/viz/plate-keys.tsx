'use client'

import * as React from 'react'
import { isTyping } from '@/lib/viz-engage'

// The root page's keys (Brendan, 2026-11-06; grid rules 2026-11-07). They work as soon as the page loads: the
// first arrow (↓ included) highlights the masthead's big box. The masthead and the contents plate are one grid,
// crossed with ↑ ↓ only — ← → stay inside the masthead or inside the plate:
//   masthead  big box ↓ → the plate's row 1 col 1 · ledger row 1 ↓ → ledger row 2 · ledger row 2 col 1 ↓ → plate
//             row 1 col 2 · ledger row 2 col 2 ↓ → plate row 1 col 4
//   plate     row 1 ↑: col 1 → the big box, cols 2–3 → ledger row 2 col 1, cols 4–5 → ledger row 2 col 2
// In the plate ← → run along the row and on across its pages; a box on another page brings that whole page into
// view at once (a page is a snap point, so scrolling to the box alone left the old page showing). Enter opens the
// highlighted box, Esc clears it. A first click on a box highlights it and a second click opens it; a control
// inside a box (its menu, its panel button) works at once. The boxes carry data-nav (HomeMasthead.tsx: the big
// box, then the ledger's four cells row by row; expand-box.tsx: the plate).

const ON = 'data-nav-on'

// The masthead's cells by position: 0 the big box, 1 ledger row 1 col 1, 2 row 1 col 2, 3 row 2 col 1, 4 row 2 col 2.
const M_RIGHT = [1, 2, 2, 4, 4]
const M_LEFT = [0, 0, 1, 0, 3]
const M_UP = [0, 1, 2, 1, 2]
const M_DOWN: (number | { plateCol: number })[] = [{ plateCol: 0 }, 3, 4, { plateCol: 1 }, { plateCol: 3 }]

export function PlateKeys() {
  React.useEffect(() => {
    let current: HTMLElement | null = null
    // A click this controller makes itself (Enter) goes straight through.
    let pass = false
    const all = () => Array.from(document.querySelectorAll<HTMLElement>('[data-nav]'))
    const masthead = () => all().filter((x) => x.dataset.nav === 'masthead')
    const plate = () => all().filter((x) => x.dataset.nav === 'plate')
    const top = (el: Element) => Math.round(el.getBoundingClientRect().top)
    const left = (el: Element) => el.getBoundingClientRect().left
    const select = (el: HTMLElement | null) => {
      current?.removeAttribute(ON)
      current = el
      if (!el) return
      el.setAttribute(ON, '')
      // A plate box brings its whole page into view; the masthead scrolls only as far as it needs.
      const page = el.dataset.nav === 'plate' ? el.parentElement : null
      ;(page ?? el).scrollIntoView({ block: 'nearest', inline: page ? 'start' : 'nearest', behavior: 'smooth' })
    }
    const open = (el: HTMLElement) => {
      pass = true
      el.click()
      pass = false
    }
    /** The plate's rows across all its pages: boxes grouped by their top edge, each row left to right. */
    const rows = () => {
      const by = new Map<number, HTMLElement[]>()
      for (const el of plate()) by.set(top(el), [...(by.get(top(el)) ?? []), el])
      return [...by.entries()].sort((a, b) => a[0] - b[0]).map(([, row]) => row.sort((a, b) => left(a) - left(b)))
    }
    /** A box's column within its own page's row. */
    const pageCol = (el: HTMLElement) => {
      const same = Array.from(el.parentElement?.querySelectorAll<HTMLElement>('[data-nav="plate"]') ?? []).filter((x) => top(x) === top(el))
      return same.sort((a, b) => left(a) - left(b)).indexOf(el)
    }
    /** The page showing now: the one whose left edge sits nearest the plate's. */
    const visiblePage = () => {
      const pages = Array.from(new Set(plate().map((el) => el.parentElement).filter(Boolean))) as HTMLElement[]
      const edge = pages[0]?.parentElement ? left(pages[0].parentElement) : 0
      return pages.sort((a, b) => Math.abs(left(a) - edge) - Math.abs(left(b) - edge))[0] ?? null
    }
    /** Row 1, column `col` of the page showing now (or its last box if the row is shorter). */
    const plateRow1 = (col: number) => {
      const page = visiblePage()
      if (!page) return null
      const boxes = Array.from(page.querySelectorAll<HTMLElement>('[data-nav="plate"]'))
      const first = Math.min(...boxes.map(top))
      const row = boxes.filter((x) => top(x) === first).sort((a, b) => left(a) - left(b))
      return row[Math.min(col, row.length - 1)] ?? null
    }

    const key = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e)) return
      const arrow = e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'ArrowDown'
      if (arrow) {
        e.preventDefault()
        // The first arrow starts on the masthead's big box.
        if (!current || !current.isConnected) return select(masthead()[0] ?? null)
        if (current.dataset.nav === 'masthead') {
          const m = masthead()
          const i = m.indexOf(current)
          if (i < 0) return select(m[0] ?? null)
          const to = e.key === 'ArrowRight' ? M_RIGHT[i] : e.key === 'ArrowLeft' ? M_LEFT[i] : e.key === 'ArrowUp' ? M_UP[i] : M_DOWN[i]
          return typeof to === 'number' ? select(m[to] ?? current) : select(plateRow1(to.plateCol) ?? current)
        }
        // The plate.
        const grid = rows()
        const r = grid.findIndex((row) => row.includes(current as HTMLElement))
        if (r < 0) return select(plateRow1(0))
        const c = grid[r].indexOf(current)
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          const next = grid[r][c + (e.key === 'ArrowRight' ? 1 : -1)]
          return next ? select(next) : undefined
        }
        if (e.key === 'ArrowUp' && r === 0) {
          const pc = pageCol(current)
          const m = masthead()
          return select(m[pc === 0 ? 0 : pc <= 2 ? 3 : 4] ?? m[0] ?? null)
        }
        const next = grid[r + (e.key === 'ArrowDown' ? 1 : -1)]
        if (next) select(next[Math.min(c, next.length - 1)])
        return
      }
      if (e.key === 'Enter' && current) {
        e.preventDefault()
        open(current)
      }
      if (e.key === 'Escape' && current) select(null)
    }
    const click = (e: MouseEvent) => {
      if (pass) return
      const target = e.target as Element | null
      const box = target?.closest?.('[data-nav]') as HTMLElement | null
      if (!box) return
      const control = target?.closest('a, button, [role=button], [role=menuitem], input')
      if (control && control !== box) return
      if (box === current) return
      e.preventDefault()
      e.stopPropagation()
      select(box)
    }
    window.addEventListener('keydown', key)
    document.addEventListener('click', click, true)
    return () => {
      window.removeEventListener('keydown', key)
      document.removeEventListener('click', click, true)
      current?.removeAttribute(ON)
    }
  }, [])
  return <style>{`[${ON}]{box-shadow:inset 0 0 0 2px var(--paper-strong);background-color:color-mix(in oklab,var(--paper-strong) 14%,var(--paper))}`}</style>
}
