'use client'

import * as React from 'react'
import { GammaLinesChart } from './chart'
import { GammaSpectrum } from './spectrum'

// /viz/gamma-lines: one nuclide's decay lines (Co-60 to start, brief 29) or the γ-line finder (2026-11-06), which
// searches every emitter by energy. The switch sits at the top of each view's controls.

const MONO = { fontFamily: 'var(--font-mono), ui-monospace, monospace' } as const
type Mode = 'nuclide' | 'find'
const MODES: { id: Mode; label: string }[] = [
  { id: 'nuclide', label: 'One nuclide' },
  { id: 'find', label: 'Find by energy' },
]

export function GammaLinesView() {
  const [mode, setMode] = React.useState<Mode>('nuclide')
  const switcher = (
    <div className="flex flex-col gap-1">
      <span className="text-[var(--paper-muted)]">View</span>
      <div className="flex flex-wrap gap-1">
        {MODES.map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={mode === o.id}
            onClick={() => setMode(o.id)}
            className={`rounded-full border px-2 py-0.5 transition-colors ${mode === o.id ? 'border-[var(--paper-text)] bg-[var(--paper-text)] text-[var(--paper)]' : 'border-[var(--paper-rule)]/30 text-[var(--paper-muted)] hover:bg-[var(--paper-quiet)]'}`}
            style={MONO}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
  return mode === 'nuclide' ? <GammaSpectrum switcher={switcher} /> : <GammaLinesChart switcher={switcher} />
}
