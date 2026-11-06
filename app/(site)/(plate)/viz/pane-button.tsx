'use client'

import { PanelRight } from 'lucide-react'
import { useShellPanel } from '@/components/shell'

// A box's corner button (Brendan, 2026-11-06): lucide's panel-right, which opens the chart in the second panel at
// the half. It eats the click, as the box menu does, so the box's own press (growing into the page) never fires.
export function PaneButton({ href, title }: { href: string; title: string }) {
  const { openPane } = useShellPanel()
  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={`Open ${title} in the second panel`}
      title="Open in the second panel"
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        openPane(href)
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return
        e.preventDefault()
        e.stopPropagation()
        openPane(href)
      }}
      className="-mr-1.5 -mb-1 flex h-7 w-7 items-center justify-center rounded-md text-[var(--paper-faint)] transition-colors hover:bg-[color-mix(in_oklab,var(--paper-text)_14%,var(--paper))] hover:text-[var(--paper-text)]"
    >
      <PanelRight className="h-4 w-4" />
    </span>
  )
}
