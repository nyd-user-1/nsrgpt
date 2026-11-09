'use client'

import { EyeOff, Pin } from 'lucide-react'
import { useNavRows } from '@/lib/nav-rows'

// A box's marks in its foot, just before the pane button (brief 37): the pin when the box is pinned, which unpins it
// (brief 40); on a hidden or
// archived box, which shows only in the plate's Hidden section, the eye that puts it back in its place.
export function BoxMarks({ href, title }: { href: string; title: string }) {
  const { rows, patch } = useNavRows()
  const row = rows[href] ?? {}
  const off = row.hidden || row.archived
  const restore = (e: React.SyntheticEvent) => {
    e.preventDefault()
    e.stopPropagation()
    patch(href, { hidden: false, archived: false })
  }
  return (
    <>
      {row.pinned && (
        <span
          role="button"
          tabIndex={0}
          aria-label={`Unpin ${title}`}
          title="Unpin"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); patch(href, { pinned: false }) }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); patch(href, { pinned: false }) } }}
          className="-mb-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--paper-muted)] transition-colors hover:bg-[color-mix(in_oklab,var(--paper-text)_14%,var(--paper))] hover:text-[var(--paper-text)]"
        >
          <Pin className="h-3.5 w-3.5" />
        </span>
      )}
      {off && (
        <span
          role="button"
          tabIndex={0}
          aria-label={`Put ${title} back on the plate`}
          title={row.archived ? 'Unarchive' : 'Unhide'}
          onClick={restore}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') restore(e) }}
          className="-mb-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--paper-muted)] transition-colors hover:bg-[color-mix(in_oklab,var(--paper-text)_14%,var(--paper))] hover:text-[var(--paper-text)]"
        >
          <EyeOff className="h-4 w-4" />
        </span>
      )}
    </>
  )
}
