'use client'

// The /viz boxes' three-dot menu (Brendan, 2026-11-04): trinity's kebab in place of the green
// dot. Add to Blocks puts the box on the shelf the panel's Blocks view shows; Copy link takes
// the chart's address; the foot names the chart. The wrapper eats the click so the box's own
// press (the pane) never fires under the menu.

import { Archive, ArchiveRestore, Copy, EllipsisVertical, Eye, EyeOff, LayoutGrid, Pin, PinOff, Star } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { KebabMenu, MenuFoot, MenuRow, MenuSeparator } from '@/components/kebab-menu'
import { useShelf } from '@/lib/home-blocks'
import { useNavRows } from '@/lib/nav-rows'

export function VizBoxMenu({ title, anchor, href }: { title: string; anchor: string; href?: string }) {
  const path = usePathname() ?? '/'
  const shelf = useShelf()
  const key = `${path}#${anchor}`
  const on = shelf.has(key)
  // The sidebar rows' marks on a box too (Brendan, 2026-11-09): kept in the same store, keyed by the box's address.
  const { rows, patch } = useNavRows()
  const row = rows[href ?? key] ?? {}
  const mark = (p: Partial<typeof row>) => patch(href ?? key, p)
  return (
    <span className="-mr-2 -mt-1" onClick={(e) => { e.preventDefault(); e.stopPropagation() }}>
      <KebabMenu
        label={`${title} options`}
        trigger={<EllipsisVertical className="size-4" />}
        triggerClassName="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-[var(--paper-faint)] outline-none transition-colors hover:bg-[var(--paper-quiet)] hover:text-[var(--paper-text)] aria-expanded:bg-[var(--paper-quiet)]"
      >
        <MenuRow
          icon={<LayoutGrid />}
          label={on ? 'Remove from Blocks' : 'Add to Blocks'}
          checked={on}
          onClick={() => (on ? shelf.remove(key) : shelf.add({ key, title, path, anchor }))}
        />
        {href && <MenuRow icon={<Copy />} label="Copy the link" onClick={() => void navigator.clipboard.writeText(new URL(href, location.origin).toString())} />}
        <MenuSeparator />
        <MenuRow icon={<Star className={row.favorite ? 'fill-amber-400 text-amber-400' : undefined} />} label={row.favorite ? 'Unfavorite' : 'Favorite'} onClick={() => mark({ favorite: !row.favorite })} />
        <MenuRow icon={row.pinned ? <PinOff /> : <Pin />} label={row.pinned ? 'Unpin' : 'Pin to top'} onClick={() => mark({ pinned: !row.pinned })} />
        <MenuRow icon={row.hidden ? <Eye /> : <EyeOff />} label={row.hidden ? 'Unhide' : 'Hide'} onClick={() => mark({ hidden: !row.hidden })} />
        <MenuRow icon={row.archived ? <ArchiveRestore /> : <Archive />} label={row.archived ? 'Unarchive' : 'Archive'} onClick={() => mark({ archived: !row.archived })} />
        <MenuSeparator />
        <MenuFoot title={title} sub={href?.startsWith('/viz/') ? 'Chart' : undefined} />
      </KebabMenu>
    </span>
  )
}
