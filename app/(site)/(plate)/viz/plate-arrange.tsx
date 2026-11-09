'use client'

import { Children, useState, type ReactNode } from 'react'
import { PlateGrid } from '@/app/PlateGrid'
import { AnimateIcon } from '@/components/animate-ui/icons/icon'
import { useNavRows, usePlateOrder } from '@/lib/nav-rows'
import { cn } from '@/lib/utils'

// The plate honours the box menu's marks (Brendan, 2026-11-09): pinned boxes come first, row 1 column 1 onward; hidden
// and archived boxes leave the plate (the sidebar's lists still hold them, with Unhide and Unarchive in their menus).
// Within each group the boxes keep the order they were dragged into (brief 46, lib/nav-rows.ts), A to Z until then. A box
// drags as a Blocks panel tile does (components/BlocksShelf.tsx): onto another box it takes that box's place; the one
// dragged fades and the one under it takes the light blue ring. The boxes are built on the server; this orders them.
export function PlateArrange({ hrefs, children }: { hrefs: string[]; children: ReactNode }) {
  const { rows } = useNavRows()
  const { order, move } = usePlateOrder(hrefs)
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const items = new Map(Children.toArray(children).map((c, i) => [hrefs[i], c]))
  const shown = order.filter((h) => !rows[h]?.hidden && !rows[h]?.archived)
  const ordered = [...shown.filter((h) => rows[h]?.pinned), ...shown.filter((h) => !rows[h]?.pinned)]
  const end = () => (setDragging(null), setOver(null))
  return (
    <PlateGrid className="-m-px min-h-0 flex-1" minW={220} maxCols={4}>
      {ordered.map((href) => (
        // A page's icon plays on the box's hover, as its sidebar row's does.
        <AnimateIcon key={href} asChild animateOnHover>
          <div
            draggable
            onDragStart={(e) => {
              // The box itself as the drag image, held where it was picked up (a link alone drags as its address).
              const r = e.currentTarget.getBoundingClientRect()
              e.dataTransfer.setDragImage(e.currentTarget, e.clientX - r.left, e.clientY - r.top)
              e.dataTransfer.effectAllowed = 'move'
              setDragging(href)
            }}
            onDragEnd={end}
            onDragOver={(e) => {
              if (!dragging) return
              e.preventDefault()
              setOver(href)
            }}
            onDragLeave={() => setOver((o) => (o === href ? null : o))}
            onDrop={(e) => {
              e.preventDefault()
              if (dragging) move(dragging, href)
              end()
            }}
            className={cn('min-h-0 min-w-0', dragging === href && 'opacity-40', over === href && dragging !== href && 'ring-2 ring-inset ring-pax2-light-blue')}
          >
            {items.get(href)}
          </div>
        </AnimateIcon>
      ))}
    </PlateGrid>
  )
}
