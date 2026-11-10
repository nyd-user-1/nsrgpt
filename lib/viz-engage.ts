'use client'

// Who owns the arrow keys on a chart page (Brendan, 2026-11-06). Until the reader clicks into the chart, ← → step to the
// previous or next chart (components/viz/FramedBox.tsx). Once they click into it, the keys belong to the chart: the 3D
// camera (lib/viz-3d-controls.tsx, components/viz/use-echart.ts), the radar's isotope stepping. Esc hands them back.
// `camera` is set while a 3D chart is on the page, so the right panel shows its Camera keys (components/viz/
// CameraKeys.tsx); `space` and `note` change them where a chart's keys differ (the particle scene's Space pauses).
//
// The camera's one command bus (brief 54, Part C, 2026-11-10): the panel's key caps send the keys' actions here, and
// every 3D camera reads keys and caps through listenCamera, so the panel works without the keyboard and the keys keep
// working with it.

import { useSyncExternalStore } from 'react'
import { CAMERA_KEYS } from '@/lib/viz-3d'

type State = { engaged: boolean; camera: boolean; space: string | null; note: string | null }
let state: State = { engaged: false, camera: false, space: null, note: null }
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())

export const isEngaged = () => state.engaged
export function setEngaged(engaged: boolean) {
  if (state.engaged === engaged) return
  state = { ...state, engaged }
  emit()
}
/** `space`: what Space does where it isn't rotation ("Pause"); `note`: a line under the keys ("Click releases smoke"). */
export function setCamera(camera: boolean, extra: { space?: string; note?: string } = {}) {
  const space = extra.space ?? null
  const note = extra.note ?? null
  if (state.camera === camera && state.space === space && state.note === note) return
  state = { ...state, camera, space, note }
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

/** A held move, as a key cap sends it: down on press, up on release. */
export type CameraMove = 'orbit-left' | 'orbit-right' | 'tilt-up' | 'tilt-down' | 'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right' | 'pan-up' | 'pan-down'
/** Every command: the held moves, and the one-shot rotation switch and reset. */
export type CameraCommand = CameraMove | 'spin' | 'reset'

type CommandListener = (name: CameraCommand, down: boolean) => void
const commandSubs = new Set<CommandListener>()

/** Sends a command to the 3D camera on the page: a move with `down` true starts it, false ends it. */
export function cameraCommand(name: CameraCommand, down = true) {
  commandSubs.forEach((f) => f(name, down))
}
/** Hears every command; returns the unsubscribe. */
export function onCameraCommand(f: CommandListener): () => void {
  commandSubs.add(f)
  return () => {
    commandSubs.delete(f)
  }
}

/** What the camera should do this frame: orbit and tilt (x, y in −1…1), or pan along the screen when `pan`, and zoom
 *  (1 in, −1 out). */
export type CameraInput = { x: number; y: number; pan: boolean; zoom: number }

const ARROWS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'])

/**
 * The camera's keys and the panel's caps, as one input a 3D camera reads every frame. Once the reader has clicked into
 * the chart: ← → orbit, ↑ ↓ tilt, Shift or Option + arrows pan, + − zoom, Cmd + ↑ ↓ zoom a step a press (macOS sends no
 * key-up while Cmd is held), 0 resets; Space starts or stops the rotation at any time. The caps work without the click.
 * `moved` runs as a move starts, so the camera can stop its slow turn.
 */
export function listenCamera(on: { spin: () => void; reset: () => void; zoomStep: (inward: boolean) => void; moved: () => void }) {
  const held = new Set<string>()
  const caps = new Set<CameraMove>()
  let mod = false
  const down = (e: KeyboardEvent) => {
    mod = e.shiftKey || e.altKey
    if (e.metaKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && isEngaged() && !isTyping(e)) {
      e.preventDefault()
      on.zoomStep(e.key === 'ArrowUp')
      on.moved()
      return
    }
    if (e.metaKey || e.ctrlKey || isTyping(e)) return
    // Option pans with the arrows; Option with any other key is the browser's.
    if (e.altKey && !ARROWS.has(e.key)) return
    if (e.key === ' ') {
      e.preventDefault()
      on.spin()
      return
    }
    if (!isEngaged()) return
    if (e.key === '0') {
      on.reset()
      return
    }
    if (!CAMERA_KEYS.has(e.key)) return
    e.preventDefault()
    held.add(e.key)
    on.moved()
  }
  const up = (e: KeyboardEvent) => {
    mod = e.shiftKey || e.altKey
    held.delete(e.key)
    if (e.key === 'Meta') held.clear()
  }
  const clear = () => {
    held.clear()
    caps.clear()
  }
  const command = (name: CameraCommand, isDown: boolean) => {
    if (name === 'spin' || name === 'reset') {
      if (isDown) (name === 'spin' ? on.spin : on.reset)()
      return
    }
    if (isDown) {
      caps.add(name)
      on.moved()
    } else caps.delete(name)
  }
  window.addEventListener('keydown', down)
  window.addEventListener('keyup', up)
  window.addEventListener('blur', clear)
  const unsub = onCameraCommand(command)
  const axis = (plus: boolean, minus: boolean) => (plus ? 1 : 0) - (minus ? 1 : 0)
  return {
    /** This frame's input, or null when nothing is held. */
    read(): CameraInput | null {
      if (!held.size && !caps.size) return null
      const zoom = axis(held.has('+') || held.has('=') || caps.has('zoom-in'), held.has('-') || held.has('_') || caps.has('zoom-out'))
      const px = axis(caps.has('pan-right'), caps.has('pan-left'))
      const py = axis(caps.has('pan-up'), caps.has('pan-down'))
      if (px || py) return { x: px, y: py, pan: true, zoom }
      const ox = axis(caps.has('orbit-right'), caps.has('orbit-left'))
      const oy = axis(caps.has('tilt-up'), caps.has('tilt-down'))
      if (ox || oy) return { x: ox, y: oy, pan: false, zoom }
      return { x: axis(held.has('ArrowRight'), held.has('ArrowLeft')), y: axis(held.has('ArrowUp'), held.has('ArrowDown')), pan: mod, zoom }
    },
    stop() {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', clear)
      unsub()
    },
  }
}
