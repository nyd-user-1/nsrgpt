'use client'

import * as React from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { SPIN_DEG_PER_S } from '@/lib/viz-3d'
import { inspectorOn } from '@/components/dev/inspector-state'
import { isEngaged, isTyping, setCamera } from '@/lib/viz-engage'

/** Radians a second the arrows orbit and tilt at, the fraction of the distance a second + − zoom and Shift pans by. */
const ROT = 1.2
const ZOOM = 1.6
const PAN = 0.6
const CAMERA_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', '_'])

/** OrbitControls that turn slowly on open (lib/viz-3d.ts). The turn stops at the first press, drag or scroll, and
 *  Space starts or stops it at any time (Brendan, 2026-11-06). Once the reader has clicked into the chart
 *  (lib/viz-engage.ts), the keys drive the camera: ← → orbit, ↑ ↓ tilt, + − zoom, Shift + arrows pan, 0 resets
 *  the view; a held key moves smoothly, frame by frame. `stopped` ends the turn from outside, for a scene that flies
 *  its own camera to a selection. */
export function SpinControls({ stopped = false, onStart, ...props }: React.ComponentProps<typeof OrbitControls> & { stopped?: boolean }) {
  const ref = React.useRef<OrbitControlsImpl>(null)
  const camera = useThree((s) => s.camera)
  const [spinning, setSpinning] = React.useState(true)
  const held = React.useRef(new Set<string>())
  const shift = React.useRef(false)

  // The frame lists the camera's keys while a 3D chart is on the page.
  React.useEffect(() => {
    setCamera(true)
    return () => setCamera(false)
  }, [])

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      shift.current = e.shiftKey
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e)) return
      if (e.key === ' ') {
        e.preventDefault()
        setSpinning((s) => !s)
        return
      }
      if (!isEngaged()) return
      if (e.key === '0') {
        ref.current?.reset()
        return
      }
      if (!CAMERA_KEYS.has(e.key)) return
      e.preventDefault()
      held.current.add(e.key)
      setSpinning(false)
    }
    const up = (e: KeyboardEvent) => {
      shift.current = e.shiftKey
      held.current.delete(e.key)
    }
    const clear = () => held.current.clear()
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', clear)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', clear)
    }
  }, [])

  useFrame((_, dt) => {
    const c = ref.current
    const k = held.current
    if (!c || !k.size) return
    const t = Math.min(dt, 0.05)
    const x = (k.has('ArrowRight') ? 1 : 0) - (k.has('ArrowLeft') ? 1 : 0)
    const y = (k.has('ArrowUp') ? 1 : 0) - (k.has('ArrowDown') ? 1 : 0)
    if (shift.current && (x || y)) {
      // Pan: the camera and its target slide together along the screen's right and up.
      const d = PAN * c.getDistance() * t
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0).multiplyScalar(x * d)
      const upv = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1).multiplyScalar(y * d)
      const off = right.add(upv)
      camera.position.add(off)
      c.target.add(off)
    } else {
      if (x) c.setAzimuthalAngle(c.getAzimuthalAngle() - x * ROT * t)
      if (y) c.setPolarAngle(c.getPolarAngle() - y * ROT * t)
    }
    if (k.has('+') || k.has('=')) c.dollyIn(1 + ZOOM * t)
    if (k.has('-') || k.has('_')) c.dollyOut(1 + ZOOM * t)
    c.update()
  })

  return (
    <OrbitControls
      ref={ref}
      {...props}
      enableZoom
      // OrbitControls' 1 is 6° a second at 60 frames a second.
      autoRotate={spinning && !stopped}
      autoRotateSpeed={SPIN_DEG_PER_S / 6}
      onStart={(e) => {
        setSpinning(false)
        onStart?.(e)
      }}
    />
  )
}

/** Whether the pointer is over the scene's floor (CrossFloor), when a scene declares one. */
let floorDeclared = false
let overFloor = true

/** The scene's floor for the crosshair (Brendan, 2026-11-06): the cursor is the + and the rules show only while the
 *  pointer is over this rectangle at height y; off it, the ordinary arrow. Pure ray maths on the camera, so the data
 *  standing on the floor never hides it. Mount it inside the <Canvas>. */
export function CrossFloor({ x0, x1, z0, z1, y = 0 }: { x0: number; x1: number; z0: number; z1: number; y?: number }) {
  const { camera, gl } = useThree()
  React.useEffect(() => {
    floorDeclared = true
    const el = gl.domElement
    const ray = new THREE.Raycaster()
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -y)
    const hit = new THREE.Vector3()
    const ndc = new THREE.Vector2()
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      ray.setFromCamera(ndc, camera)
      const p = ray.ray.intersectPlane(plane, hit)
      overFloor = !!p && p.x >= Math.min(x0, x1) && p.x <= Math.max(x0, x1) && p.z >= Math.min(z0, z1) && p.z <= Math.max(z0, z1)
    }
    el.addEventListener('pointermove', move)
    return () => {
      el.removeEventListener('pointermove', move)
      floorDeclared = false
      overFloor = true
    }
  }, [camera, gl, x0, x1, z0, z1, y])
  return null
}

/** The inspector's rule colour, as components/viz/use-echart.ts draws it over the 2D charts. */
const RULE = 'rgba(59,130,246,0.5)'

/** The 2D charts' cursor for a three.js scene (2026-11-05): the plus, and the inspector's two blue rules crossing the
 *  window at the pointer, gone for touch, while the inspector itself is on, off the scene and on scroll. With a
 *  CrossFloor in the scene, only over the floor (2026-11-06). Spread the result on the <Canvas>: its wrapper div takes
 *  the events, and the panels over the scene sit outside it. */
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
      const onFloor = !floorDeclared || overFloor
      ;(e.currentTarget as HTMLElement).style.cursor = onFloor ? 'crosshair' : 'default'
      if (!l || !onFloor || e.pointerType === 'touch' || inspectorOn()) return hide()
      Object.assign(l.v.style, { display: '', left: `${e.clientX}px`, top: '0', width: '1px', height: '100dvh' })
      Object.assign(l.h.style, { display: '', top: `${e.clientY}px`, left: '0', height: '1px', width: '100dvw' })
    },
    [hide],
  )
  return { onPointerMove, onPointerLeave: hide, style: { cursor: 'crosshair' } as React.CSSProperties }
}
