'use client'

import * as React from 'react'
import { VizControls, VizSection } from '@/components/viz/VizControls'
import { cameraCommand, setEngaged, useEngage, type CameraCommand, type CameraMove } from '@/lib/viz-engage'

const MONO = { fontFamily: 'var(--font-mono), ui-monospace, monospace' } as const
const CAP =
  'min-w-[28px] select-none rounded-md border border-[var(--paper-rule)]/30 px-2 py-0.5 text-center text-[12px] text-[var(--paper-text)] transition-colors hover:bg-[var(--paper-quiet)] active:bg-[color-mix(in_oklab,var(--paper-text)_14%,var(--paper))]'

/** A cap held down moves the camera until it is let go, as the key does. */
function Hold({ move, label, title }: { move: CameraMove; label: string; title: string }) {
  const on = React.useRef(false)
  const end = () => {
    if (!on.current) return
    on.current = false
    cameraCommand(move, false)
  }
  // Unmounted mid-hold (the panel closed), the move ends.
  React.useEffect(() => () => {
    if (on.current) cameraCommand(move, false)
  }, [move])
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      className={CAP}
      style={MONO}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        on.current = true
        cameraCommand(move, true)
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
    >
      {label}
    </button>
  )
}

/** A cap pressed once: the rotation switch, the reset, leaving the keys. */
function Press({ label, title, onPress }: { label: string; title: string; onPress: () => void }) {
  return (
    <button type="button" title={title} aria-label={title} className={CAP} style={MONO} onClick={onPress}>
      {label}
    </button>
  )
}

const send = (name: CameraCommand) => () => cameraCommand(name)

/**
 * The 3D camera's keys in the right panel (brief 54, Part C, 2026-11-10): each cap does what its key does, held caps
 * move while held, through the camera's one command bus (lib/viz-engage.ts), so the camera works without the keyboard
 * and the keys keep working beside it. Mounted by the chart frame (components/viz/FramedBox.tsx) while a 3D chart is on
 * the page.
 */
export function CameraKeys() {
  const { engaged, space, note } = useEngage()
  const row = (name: string, caps: React.ReactNode, hint?: string) => (
    <div className="grid grid-cols-[64px_1fr] items-center gap-2">
      <span className="text-[var(--paper-muted)]">{name}</span>
      <div className="flex flex-wrap items-center gap-1">
        {caps}
        {hint && <span className="ml-1 text-[11px] text-[var(--paper-faint)]" style={MONO}>{hint}</span>}
      </div>
    </div>
  )
  return (
    <VizControls>
      <VizSection title="Camera">
        {row('Orbit', <><Hold move="orbit-left" label="←" title="Orbit left" /><Hold move="orbit-right" label="→" title="Orbit right" /></>)}
        {row('Tilt', <><Hold move="tilt-up" label="↑" title="Tilt up" /><Hold move="tilt-down" label="↓" title="Tilt down" /></>)}
        {row('Zoom', <><Hold move="zoom-in" label="+" title="Zoom in" /><Hold move="zoom-out" label="−" title="Zoom out" /></>, 'Cmd ↑ ↓')}
        {row(
          'Pan',
          <>
            <Hold move="pan-left" label="←" title="Pan left" />
            <Hold move="pan-right" label="→" title="Pan right" />
            <Hold move="pan-up" label="↑" title="Pan up" />
            <Hold move="pan-down" label="↓" title="Pan down" />
          </>,
          'Shift or Option + arrows',
        )}
        {row(space ?? 'Rotation', <Press label="Space" title={space ?? 'Start or stop the rotation'} onPress={send('spin')} />)}
        {row('Reset', <Press label="0" title="Reset the view" onPress={send('reset')} />)}
        {row(
          'Leave',
          <Press label="Esc" title="Give the arrow keys back to chart stepping" onPress={() => setEngaged(false)} />,
          engaged ? undefined : 'click the chart to use the keys',
        )}
        {note && <p className="m-0 text-[11px] text-[var(--paper-faint)]">{note}</p>}
      </VizSection>
    </VizControls>
  )
}
