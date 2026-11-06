'use client'

// Who owns the arrow keys on a chart page (Brendan, 2026-11-06). Until the reader clicks into the chart, ← → step to the
// previous or next chart (components/viz/FramedBox.tsx). Once they click into it, the keys belong to the chart: the 3D
// camera (lib/viz-3d-controls.tsx, components/viz/use-echart.ts), the radar's isotope stepping. Esc hands them back.
// `camera` is set while a 3D chart is on the page, so the frame can list its keys.

import { useSyncExternalStore } from 'react'

type State = { engaged: boolean; camera: boolean }
let state: State = { engaged: false, camera: false }
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())

export const isEngaged = () => state.engaged
export function setEngaged(engaged: boolean) {
  if (state.engaged === engaged) return
  state = { ...state, engaged }
  emit()
}
export function setCamera(camera: boolean) {
  if (state.camera === camera) return
  state = { ...state, camera }
  emit()
}

export function useEngage(): State {
  return useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => subs.delete(f)
    },
    () => state,
    () => state,
  )
}

/** A key event typed into a field, or pressed on a button Space would also press, belongs to that element. */
export function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null
  if (!t) return false
  if (/^(input|textarea|select)$/i.test(t.tagName) || t.isContentEditable) return true
  return e.key === ' ' && /^(button|a)$/i.test(t.tagName)
}
