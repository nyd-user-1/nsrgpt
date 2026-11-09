'use client'

import { Children, type ReactNode } from 'react'
import { PlateGrid } from '@/app/PlateGrid'
import { useNavRows } from '@/lib/nav-rows'

// The plate honours the box menu's marks (Brendan, 2026-11-09): pinned boxes come first, row 1 column 1 onward, in
// their catalogue order; hidden and archived boxes leave the plate (the sidebar's Charts and Data lists still hold them,
// with Unhide and Unarchive in their menus). The Hidden box and its trailing section were removed at Brendan's ask the
// same night. The boxes are built on the server in catalogue order; this reorders them by the marks the browser holds
// (lib/nav-rows.ts).
export function PlateArrange({ hrefs, children }: { hrefs: string[]; children: ReactNode }) {
  const { rows } = useNavRows()
  const items = Children.toArray(children)
  const shown = hrefs.map((href, i) => ({ i, row: rows[href] ?? {} })).filter((x) => !x.row.hidden && !x.row.archived)
  const ordered = [...shown.filter((x) => x.row.pinned), ...shown.filter((x) => !x.row.pinned)]
  return (
    <PlateGrid className="-m-px min-h-0 flex-1" minW={220} maxCols={4}>
      {ordered.map((x) => items[x.i])}
    </PlateGrid>
  )
}
