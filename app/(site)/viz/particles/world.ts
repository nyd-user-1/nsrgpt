// The particle scene's runtime (2026-11-06): threejs-particle-fluids' demo World (demo/runtime/world.ts, MIT License,
// Copyright (c) 2026 Daniel Greenheck), ported with its frame loop, resize, click detection and device-loss handling
// as written. Changed for NSRgpt: the paper is the background and no floor or pedestal stands in it; bloom on dark
// paper in place of the demo's ambient occlusion (the sprites are unlit); the camera turns slowly on open and takes
// the other 3D charts' keys (lib/viz-3d.ts); a click releases a puff of smoke where it lands.

import { Color, DirectionalLight, HemisphereLight, NoToneMapping, PerspectiveCamera, Plane, Raycaster, Scene, Vector2, Vector3 } from 'three'
import { RenderPipeline, type WebGPURenderer } from 'three/webgpu'
import { pass } from 'three/tsl'
import { bloom } from 'three/addons/tsl/display/BloomNode.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { FrameStepper, createParticleRenderer } from 'threejs-particle-fluids'
import { CAMERA_KEYS, CAMERA_PAN, CAMERA_ROT, CAMERA_ZOOM, SPIN_DEG_PER_S } from '@/lib/viz-3d'
import { isEngaged, isTyping } from '@/lib/viz-engage'
import type { Plume } from './plume'

export type Stats = { fps: number; time: number }

/** The little of WebGPU's device the runtime touches (the DOM typings here carry no WebGPU types). */
type Backend = { device?: { lost: Promise<{ reason: string }>; queue: { onSubmittedWorkDone(): Promise<void> } } }
export const hasWebGPU = () => typeof navigator !== 'undefined' && !!(navigator as Navigator & { gpu?: unknown }).gpu

const CAMERA = [1.9, 1.15, 2.6] as const
const TARGET = [0, 0.8, 0] as const

export class World {
  readonly canvas = document.createElement('canvas')
  readonly scene = new Scene()
  readonly camera = new PerspectiveCamera(38, 1, 0.02, 100)
  renderer!: WebGPURenderer
  controls!: OrbitControls
  plume: Plume | null = null
  playing = true
  /** Called each fixed step before the physics, with the step's length. */
  onStep: (dt: number) => void = () => {}
  private glow = false
  private stopped = false
  private frameId = 0
  private pending: Promise<void> = Promise.resolve()
  private stepper = new FrameStepper({ fixedDt: 1 / 60, maxStepsPerFrame: 2 })
  private cleanup: (() => void)[] = []
  private lastFrame = 0
  private frameMs = 16.67
  private lastReport = 0
  private width = 0
  private height = 0
  private time = 0
  private pointerStart: Vector2 | undefined
  private click: Vector2 | undefined
  private pipeline!: RenderPipeline
  private held = new Set<string>()
  private nextPlume: { make: (renderer: WebGPURenderer) => Plume; ready: (plume: Plume) => void } | null = null
  private shift = false

  constructor(
    private readonly onStats: (stats: Stats) => void,
    private readonly onError: (error: unknown) => void,
    private readonly onClick: (at: Vector3) => void,
    private readonly onSpace: () => void,
  ) {
    this.canvas.setAttribute('aria-label', 'Decay heat driving smoke through a column of air, in 3D. Drag to orbit, scroll to zoom.')
    this.canvas.tabIndex = 0
    this.canvas.style.display = 'block'
    this.canvas.style.width = '100%'
    this.canvas.style.height = '100%'
    this.canvas.style.outline = 'none'
  }

  async init(host: HTMLElement): Promise<void> {
    if (!hasWebGPU()) throw new Error('WebGPU is unavailable in this browser.')
    this.renderer = await createParticleRenderer({ canvas: this.canvas, antialias: true, alpha: false })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    // Unchanged colours, so the decay-mode theme matches the legend.
    this.renderer.toneMapping = NoToneMapping
    // The air particles are lit spheres; the smoke ignores light.
    this.scene.add(new HemisphereLight(0xd7e6ff, 0x111721, 0.9))
    const key = new DirectionalLight(0xf8f1e5, 1.6)
    key.position.set(1.5, 4, 2)
    this.scene.add(key)
    this.camera.position.fromArray(CAMERA)
    this.controls = new OrbitControls(this.camera, this.canvas)
    this.controls.target.fromArray(TARGET)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.minDistance = 0.8
    this.controls.maxDistance = 7
    // The 3D charts' turn on open (lib/viz-3d.ts): OrbitControls' 1 is 6° a second; the first press stops it.
    this.controls.autoRotate = true
    this.controls.autoRotateSpeed = SPIN_DEG_PER_S / 6
    const stopTurn = () => (this.controls.autoRotate = false)
    this.controls.addEventListener('start', stopTurn)
    this.controls.saveState()
    this.controls.update()
    host.append(this.canvas)
    this.width = host.clientWidth
    this.height = host.clientHeight
    this.resize(this.width, this.height)

    const scenePass = pass(this.scene, this.camera)
    const color = scenePass.getTextureNode('output')
    const halo = bloom(color, 0.5, 0.3, 0.15)
    this.pipeline = new RenderPipeline(this.renderer)
    this.pipeline.outputNode = color.add(halo)
    this.cleanup.push(() => {
      this.pipeline.dispose()
      halo.dispose()
      scenePass.dispose()
    })

    const down = (event: PointerEvent) => {
      if (event.button === 0) this.pointerStart = new Vector2(event.clientX, event.clientY)
    }
    const up = (event: PointerEvent) => {
      if (this.pointerStart && this.pointerStart.distanceTo(new Vector2(event.clientX, event.clientY)) < 5) {
        const rect = this.canvas.getBoundingClientRect()
        this.click = new Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
      }
      this.pointerStart = undefined
    }
    const cancel = () => {
      this.pointerStart = undefined
    }
    const wheel = () => stopTurn()
    this.canvas.addEventListener('pointerdown', down)
    this.canvas.addEventListener('pointerup', up)
    this.canvas.addEventListener('pointercancel', cancel)
    this.canvas.addEventListener('wheel', wheel, { passive: true })
    this.cleanup.push(() => {
      this.canvas.removeEventListener('pointerdown', down)
      this.canvas.removeEventListener('pointerup', up)
      this.canvas.removeEventListener('pointercancel', cancel)
      this.canvas.removeEventListener('wheel', wheel)
      this.controls.removeEventListener('start', stopTurn)
    })

    // The camera's keys, once the reader has clicked into the chart (lib/viz-engage.ts); Space plays and pauses.
    const keydown = (e: KeyboardEvent) => {
      this.shift = e.shiftKey
      if (e.metaKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && isEngaged() && !isTyping(e)) {
        // A step a press: macOS sends no key-up while Cmd is held.
        e.preventDefault()
        this.zoom(e.key === 'ArrowUp' ? 1.15 : 1 / 1.15)
        stopTurn()
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e)) return
      if (e.key === ' ') {
        e.preventDefault()
        this.onSpace()
        return
      }
      if (!isEngaged()) return
      if (e.key === '0') {
        this.controls.reset()
        return
      }
      if (!CAMERA_KEYS.has(e.key)) return
      e.preventDefault()
      this.held.add(e.key)
      stopTurn()
    }
    const keyup = (e: KeyboardEvent) => {
      this.shift = e.shiftKey
      this.held.delete(e.key)
      if (e.key === 'Meta') this.held.clear()
    }
    const blur = () => this.held.clear()
    window.addEventListener('keydown', keydown)
    window.addEventListener('keyup', keyup)
    window.addEventListener('blur', blur)
    this.cleanup.push(() => {
      window.removeEventListener('keydown', keydown)
      window.removeEventListener('keyup', keyup)
      window.removeEventListener('blur', blur)
    })

    const observer = new ResizeObserver(() => {
      this.width = host.clientWidth
      this.height = host.clientHeight
    })
    observer.observe(host)
    this.cleanup.push(() => observer.disconnect())
    const visibility = () => {
      this.stepper.reset()
      this.lastFrame = 0
    }
    document.addEventListener('visibilitychange', visibility)
    this.cleanup.push(() => document.removeEventListener('visibilitychange', visibility))
    // Device loss should surface as a recoverable UI state, never a frozen canvas.
    const backend = this.renderer.backend as unknown as Backend
    void backend.device?.lost.then((info) => {
      if (!this.stopped && info.reason !== 'destroyed') this.onError(new Error('The graphics device was interrupted. Reload the page to continue.'))
    })
  }

  /** The paper behind the smoke; glow (additive smoke and bloom) on dark paper only. */
  setPaper(paper: string, glow: boolean): void {
    this.scene.background = new Color(paper)
    this.glow = glow
    this.plume?.setGlow(glow)
  }

  /** Builds a new plume at the start of the next frame, between steps, and disposes the old one. */
  queuePlume(make: (renderer: WebGPURenderer) => Plume, ready: (plume: Plume) => void): void {
    this.nextPlume = { make, ready }
  }

  private swapPlume(): void {
    const next = this.nextPlume
    if (!next) return
    this.nextPlume = null
    const old = this.plume
    if (old) for (const o of old.objects) o.removeFromParent()
    const plume = next.make(this.renderer)
    this.plume = plume
    this.scene.add(...plume.objects)
    plume.setGlow(this.glow)
    old?.dispose()
    this.stepper.reset()
    this.time = 0
    next.ready(plume)
  }

  private zoom(f: number): void {
    // r187's dollyOut divides the distance by its argument.
    this.controls.dollyOut(f)
  }

  private keys(dt: number): void {
    const k = this.held
    if (!k.size) return
    const t = Math.min(dt, 0.05)
    const x = (k.has('ArrowRight') ? 1 : 0) - (k.has('ArrowLeft') ? 1 : 0)
    const y = (k.has('ArrowUp') ? 1 : 0) - (k.has('ArrowDown') ? 1 : 0)
    if (this.shift && (x || y)) {
      // Pan: the camera and its target slide together along the screen's right and up.
      const d = CAMERA_PAN * this.controls.getDistance() * t
      const right = new Vector3().setFromMatrixColumn(this.camera.matrix, 0).multiplyScalar(x * d)
      const upv = new Vector3().setFromMatrixColumn(this.camera.matrix, 1).multiplyScalar(y * d)
      const off = right.add(upv)
      this.camera.position.add(off)
      this.controls.target.add(off)
    } else {
      if (x) this.controls.rotateLeft(x * CAMERA_ROT * t)
      if (y) this.controls.rotateUp(y * CAMERA_ROT * t)
    }
    if (k.has('+') || k.has('=')) this.zoom(1 + CAMERA_ZOOM * t)
    if (k.has('-') || k.has('_')) this.zoom(1 / (1 + CAMERA_ZOOM * t))
  }

  private resize(width: number, height: number): void {
    this.width = Math.max(1, width)
    this.height = Math.max(1, height)
    this.renderer.setSize(this.width, this.height, false)
    this.camera.aspect = this.width / this.height
    // Preserve enough horizontal space for the whole column in portrait layouts.
    this.camera.fov = (2 * Math.atan(Math.tan((19 * Math.PI) / 180) * Math.max(1, 1.15 / this.camera.aspect)) * 180) / Math.PI
    this.camera.updateProjectionMatrix()
  }

  private async render(dt: number): Promise<void> {
    const size = this.renderer.getSize(new Vector2())
    if (size.x !== this.width || size.y !== this.height) this.resize(this.width, this.height)
    this.keys(dt)
    this.controls.update()
    if (this.click && this.plume) {
      // The click's ray meets the upright plane through the column's axis that faces the camera.
      const ray = new Raycaster()
      ray.setFromCamera(this.click, this.camera)
      const facing = new Vector3().subVectors(this.camera.position, this.controls.target).setY(0).normalize()
      const hit = ray.ray.intersectPlane(new Plane().setFromNormalAndCoplanarPoint(facing, new Vector3(0, 0, 0)), new Vector3())
      if (hit && Math.abs(hit.x) < 0.48 && Math.abs(hit.z) < 0.48 && hit.y > 0 && hit.y < 1.7) this.onClick(hit)
    }
    this.click = undefined
    if (this.glow) this.pipeline.render()
    else this.renderer.render(this.scene, this.camera)
    const backend = this.renderer.backend as unknown as Backend
    await backend.device?.queue.onSubmittedWorkDone()
  }

  start(): void {
    this.frameId = requestAnimationFrame((now) => {
      this.pending = this.frame(now).catch((error: unknown) => {
        this.stopped = true
        this.onError(error)
      })
    })
  }

  private async frame(now: number): Promise<void> {
    if (this.stopped) return
    this.swapPlume()
    const plume = this.plume
    if (document.hidden || !this.playing || !plume) this.stepper.reset()
    else {
      await this.stepper.pump(now, async (dt) => {
        this.onStep(dt)
        await plume.loop.step(dt)
        this.time += dt
      })
    }
    const dt = this.lastFrame > 0 ? Math.min(1000, now - this.lastFrame) / 1000 : 1 / 60
    if (!document.hidden) await this.render(dt)
    if (this.lastFrame > 0) this.frameMs += (Math.min(1000, now - this.lastFrame) - this.frameMs) * 0.12
    this.lastFrame = now
    if (now - this.lastReport > 200) {
      this.lastReport = now
      this.onStats({ fps: 1000 / this.frameMs, time: this.time })
    }
    if (!this.stopped) this.start()
  }

  async dispose(): Promise<void> {
    this.stopped = true
    cancelAnimationFrame(this.frameId)
    await this.pending
    this.controls?.dispose()
    this.plume?.dispose()
    this.cleanup.forEach((fn) => fn())
    this.renderer?.dispose()
    this.canvas.remove()
  }
}
