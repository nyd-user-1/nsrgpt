'use client'

// A row of pill buttons, one pressed (brief 35, 2026-11-09): the fission chart's segmented control (app/(site)/viz/
// fission-yields/chart.tsx), lifted out so a chart's header row can carry it. `label` sits before the pills.

import { inkOn } from "@/lib/structure"

const MONO = { fontFamily: 'var(--font-mono), ui-monospace, monospace' } as const

export function Pills<T extends string>({ label, options, value, onChange, className = '' }: {
  label?: string
  options: readonly { id: T; label: string }[]
  value: T
  onChange: (v: T) => void
  className?: string
}) {
  return (
    <div className={`flex flex-wrap items-center gap-1 text-[12px] ${className}`} role="group" aria-label={label}>
      {label && <span className="mr-1 text-[var(--paper-muted)]">{label}</span>}
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className={`rounded-full border px-2 py-0.5 transition-colors ${value === o.id ? 'border-[var(--paper-text)] bg-[var(--paper-text)] text-[var(--paper)]' : 'border-[var(--paper-rule)]/30 text-[var(--paper-muted)] hover:bg-[var(--paper-quiet)]'}`}
          style={MONO}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** The stacked legend bar (the old structure chart's, after NNDC's): equal segments, each label inside its colour,
 *  an optional "none" chip after. */
export function LegendBar({ title, segments, none, className = '' }: {
  title: string
  segments: { color: string; label: string }[]
  none?: { color: string; label: string }
  className?: string
}) {
  return (
    <div className={`w-full sm:w-[300px] md:w-[400px] ${className}`}>
      <p className="m-0 mb-1 text-[10px] text-[var(--paper-muted)]">{title}</p>
      <div className="flex items-center gap-1.5">
        <div className="flex flex-1 overflow-hidden rounded-sm">
          {segments.map((s) => (
            <span key={s.color + s.label} className="flex-1 py-0.5 text-center text-[9px] font-bold leading-none" style={{ background: s.color, color: inkOn(s.color) }}>
              {s.label}
            </span>
          ))}
        </div>
        {none && (
          <span className="shrink-0 rounded-sm px-1 py-0.5 text-[9px] font-bold leading-none" style={{ background: none.color, color: inkOn(none.color) }}>
            {none.label}
          </span>
        )}
      </div>
    </div>
  )
}
