'use client'

import { Children, type ReactNode } from 'react'
import { EyeOff } from 'lucide-react'
import { PlateGrid } from '@/app/PlateGrid'
import { useNavRows } from '@/lib/nav-rows'
import { BOX_CLASS, SERIF } from './box-style'

// The plate honours the box menu's marks (Brendan, 2026-11-09): pinned boxes come first, row 1 column 1 onward, in
// their catalogue order; hidden and archived boxes leave the plate for its Hidden section (brief 37), a page after the
// last that the Hidden box, the plate's last box, scrolls to. There each box shows the eye that puts it back
// (viz/box-marks.tsx). The boxes are built on the server in catalogue order; this reorders them by the marks the
// browser holds (lib/nav-rows.ts).
export function PlateArrange({ hrefs, children }: { hrefs: string[]; children: ReactNode }) {
  const { rows } = useNavRows()
  const items = Children.toArray(children)
  const all = hrefs.map((href, i) => ({ i, row: rows[href] ?? {} }))
  const shown = all.filter((x) => !x.row.hidden && !x.row.archived)
  const off = all.filter((x) => x.row.hidden || x.row.archived)
  const ordered = [...shown.filter((x) => x.row.pinned), ...shown.filter((x) => !x.row.pinned)]
  return (
    <PlateGrid className="-m-px min-h-0 flex-1" minW={220} maxCols={4} trailing={off.map((x) => items[x.i])} trailingEmpty="Nothing hidden.">
      {ordered.map((x) => items[x.i])}
      <HiddenBox key="hidden" count={off.length} />
    </PlateGrid>
  )
}

/** The plate's last box: how many boxes are hidden or archived. Opening it (as every box opens: a first click picks it,
 *  a second or Enter opens) scrolls the plate to its Hidden section. */
function HiddenBox({ count }: { count: number }) {
  const open = (el: HTMLElement) => {
    el.closest('.snap-x')?.querySelector('[data-plate-trailing]')?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' })
  }
  return (
    <div
      role="button"
      tabIndex={0}
      data-nav="plate"
      aria-label={`Hidden: ${count}`}
      onClick={(e) => open(e.currentTarget)}
      onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); open(e.currentTarget) } }}
      className={`${BOX_CLASS} cursor-pointer`}
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-start justify-between gap-3">
          <h3 className="m-0 line-clamp-2 min-h-[2.2em] text-[20px] leading-[1.1]" style={{ ...SERIF, color: 'var(--paper-text)' }}>
            Hidden
          </h3>
          <span className="flex h-[22px] shrink-0 items-center text-[var(--paper-faint)]">
            <EyeOff className="size-4" />
          </span>
        </div>
        <p className="m-0 mt-auto text-[44px] leading-none tabular-nums" style={{ ...SERIF, color: 'var(--paper-text)' }}>
          {count}
        </p>
      </div>
    </div>
  )
}
