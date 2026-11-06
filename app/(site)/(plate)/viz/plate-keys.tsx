'use client'

import * as React from 'react'
import { isTyping } from '@/lib/viz-engage'

// The root page's keys (Brendan, 2026-11-06). They work as soon as the page loads. ← → walk every box in order:
// the masthead's big box, its four cells (row 1 col 1, row 1 col 2, row 2 col 1, row 2 col 2), then the content
// plate's first row, on across its pages. In the plate ↑ ↓ change rows; ↑ from the plate's first row goes back to the
// masthead's last cell, ↓ from the masthead to the plate's first box. Enter opens the highlighted box, Esc clears it.
// A first click on a box highlights it and a second click opens it; a control inside a box (its menu, its panel
// button) works at once. The boxes carry data-nav (HomeMasthead.tsx, expand-box.tsx).

const ON = 'data-nav-on'

export function PlateKeys() {
  React.useEffect(() => {
    let current: HTMLElement | null = null
    // A click this controller makes itself (Enter) goes straight through.
    let pass = false
    const all = () => Array.from(document.querySelectorAll<HTMLElement>('[data-nav]'))
    const select = (el: HTMLElement | null) => {
      current?.removeAttribute(ON)
      current = el
      if (!el) return
      el.setAttribute(ON, '')
      el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
    }
    const open = (el: HTMLElement) => {
      pass = true
      el.click()
      pass = false
    }
    /** The plate's rows: its boxes grouped by their top edge, each row left to right. */
    const rows = () => {
      const by = new Map<number, HTMLElement[]>()
      for (const el of all().filter((x) => x.dataset.nav === 'plate')) {
        const top = Math.round(el.getBoundingClientRect().top)
        by.set(top, [...(by.get(top) ?? []), el])
      }
      return [...by.entries()].sort((a, b) => a[0] - b[0]).map(([, row]) => row.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left))
    }
    const key = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e)) return
      const list = all()
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault()
        const i = current ? list.indexOf(current) : -1
        if (i < 0) return select(list[0] ?? null)
        const right = e.key === 'ArrowRight'
        // In the plate, ← → stay on their row and run on across the pages (Brendan, 2026-11-06): row 1 col 5 goes on
        // to the next page's row 1, and ↑ ↓ change rows. ← from the first box of row 1 goes back to the masthead.
        if (current?.dataset.nav === 'plate') {
          const grid = rows()
          const r = grid.findIndex((row) => row.includes(current as HTMLElement))
          const c = grid[r].indexOf(current)
          if (!right && c === 0) return r === 0 ? select(list.filter((x) => x.dataset.nav === 'masthead').at(-1) ?? null) : undefined
          return select(grid[r][Math.min(grid[r].length - 1, c + (right ? 1 : -1))])
        }
        return select(list[Math.max(0, Math.min(list.length - 1, i + (right ? 1 : -1)))])
      }
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && current) {
        e.preventDefault()
        const grid = rows()
        const down = e.key === 'ArrowDown'
        const r = grid.findIndex((row) => row.includes(current as HTMLElement))
        if (r < 0) {
          if (down) select(grid[0]?.[0] ?? null)
          return
        }
        if (!down && r === 0) return select(list.filter((x) => x.dataset.nav === 'masthead').at(-1) ?? null)
        const next = grid[r + (down ? 1 : -1)]
        if (next) select(next[Math.min(grid[r].indexOf(current), next.length - 1)])
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
  return <style>{`[${ON}]{box-shadow:inset 0 0 0 2px var(--paper-text);background-color:color-mix(in oklab,var(--paper-text) 10%,var(--paper))}`}</style>
}
