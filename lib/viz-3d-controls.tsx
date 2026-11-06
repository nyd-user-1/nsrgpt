'use client'

import * as React from 'react'
import { OrbitControls } from '@react-three/drei'
import { SPIN_DEG_PER_S } from '@/lib/viz-3d'
import { inspectorOn } from '@/components/dev/inspector-state'

/** OrbitControls that turn slowly until the first press, drag or scroll (lib/viz-3d.ts), then stay where they're
 *  left; the wheel zooms. `stopped` ends the turn from outside, for a scene that flies its own camera to a selection. */
export function SpinControls({ stopped = false, onStart, ...props }: React.ComponentProps<typeof OrbitControls> & { stopped?: boolean }) {
  const [touched, setTouched] = React.useState(false)
  return (
    <OrbitControls
      {...props}
      enableZoom
      // OrbitControls' 1 is 6° a second at 60 frames a second.
      autoRotate={!touched && !stopped}
      autoRotateSpeed={SPIN_DEG_PER_S / 6}
      onStart={(e) => {
        setTouched(true)
        onStart?.(e)
      }}
    />
  )
}

/** The inspector's rule colour, as components/viz/use-echart.ts draws it over the 2D charts. */
const RULE = 'rgba(59,130,246,0.5)'

/** The 2D charts' cursor for a three.js scene (2026-11-05): the plus, and the inspector's two blue rules crossing the
 *  window at the pointer, gone for touch, while the inspector itself is on, off the scene and on scroll. Spread the
 *  result on the <Canvas>: its wrapper div takes the events, and the panels over the scene sit outside it. */
export function useCrossRules() {
  const lines = React.useRef<{ v: HTMLDivElement; h: HTMLDivElement } | null>(null)
  const hide = React.useCallback(() => {
    if (!lines.current) return
    lines.current.v.style.display = 'none'
    lines.current.h.style.display = 'none'
  }, [])
  React.useEffect(() => {
    const line = () => {
      const d = document.createElement('div')
      d.setAttribute('aria-hidden', 'true')
      Object.assign(d.style, { position: 'fixed', left: '0', top: '0', pointerEvents: 'none', zIndex: '2147483644', background: RULE, display: 'none' })
      document.body.append(d)
      return d
    }
    const made = { v: line(), h: line() }
    lines.current = made
    window.addEventListener('scroll', hide, true)
    return () => {
      window.removeEventListener('scroll', hide, true)
      made.v.remove()
      made.h.remove()
      lines.current = null
    }
  }, [hide])
  const onPointerMove = React.useCallback(
    (e: React.PointerEvent) => {
      const l = lines.current
      if (!l || e.pointerType === 'touch' || inspectorOn()) return hide()
      Object.assign(l.v.style, { display: '', left: `${e.clientX}px`, top: '0', width: '1px', height: '100dvh' })
      Object.assign(l.h.style, { display: '', top: `${e.clientY}px`, left: '0', height: '1px', width: '100dvw' })
    },
    [hide],
  )
  return { onPointerMove, onPointerLeave: hide, style: { cursor: 'crosshair' } as React.CSSProperties }
}
