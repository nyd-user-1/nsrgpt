'use client'

import { createPortal } from 'react-dom'
import { useSwitchboard } from '@/components/SwitchboardPanel'

/**
 * A chart's controls and legend (Brendan, 2026-11-06): they live in the right panel, Viz › the chart, never over
 * the chart, so every chart keeps the main container's whole area. Rendered through a portal into that layer
 * (components/SwitchboardPanel.tsx), so they stay part of the chart's own React tree and its state; while the layer
 * is closed they aren't drawn at all.
 */
export function VizControls({ children }: { children: React.ReactNode }) {
  const { vizSlot } = useSwitchboard()
  if (!vizSlot) return null
  return createPortal(<div className="flex flex-col gap-4 px-5 py-5 text-[12px] text-[var(--paper-text)]">{children}</div>, vizSlot)
}

/** A section of a chart's controls under a small heading, as the panel's rows are ruled. */
export function VizSection({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-b border-[var(--paper-rule-soft)] pb-4 last:border-b-0 last:pb-0">
      {title && <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--paper-faint)]">{title}</span>}
      {children}
    </div>
  )
}
