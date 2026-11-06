// The particle scene's physics (2026-11-06): threejs-particle-fluids' Vortex Plume preset (demo/presets/vortex.ts,
// MIT License, Copyright (c) 2026 Daniel Greenheck), ported as written, with its one vent made five — one per chain
// member the reader's sample heats with. Still air fills a 1 m column; the vents heat it, hot air rises (Boussinesq
// buoyancy against the column's mean temperature), and each vent's smoke tracers ride the moving air. Vanes along
// the walls turn the air the plumes draw in, so the column spins.
//
// What the data drives (scene.tsx feeds it each step, from lib/viz-decay-heat.ts):
//   buoyancy       the Heat setting × the sample's decay heat now, as a share of its peak over the chain's window.
//   each vent      on for a share of steps equal to its member's heat over the hottest member's, so a member with
//                  no atoms yet heats nothing (the library's heat sources heat to one temperature, so a share of
//                  the steps is how a vent gives less); and it releases tracers at a rate in proportion to its heat.
// The tracers' colours are uniforms, so the colour themes change without a rebuild.

import { AdditiveBlending, Box3, Color, NormalBlending, Vector3, type InstancedMesh, type Material as ThreeMaterial, type Object3D } from 'three'
import { Fn, color, hash, instanceIndex, mix, uniform, vec2, vec3, vec4 } from 'three/tsl'
import type { WebGPURenderer } from 'three/webgpu'
import { FluidSystem, GasSpriteRenderer, GasSystem, ParticleSystem, SimLoop, type HeatSource, type Material } from 'threejs-particle-fluids'
import { fitRadius, lattice, particleView, scaledSubsteps, tank } from './shared'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any

const HALF = 0.5,
  TOP = 1.9,
  SMOKE_TOP = 1.7
/** Vents on the floor: at most this many, each this wide, on a ring this far out. A vent has to hold a few dozen
 *  air particles at the smallest budget to drive a plume (the demo's one vent is 0.17 m). */
export const VENTS = 5
const VENT = 0.14
const RING = 0.28
/** A vent's centre, just above the floor. */
const VENT_Y = 0.04
/** Where an unused vent waits: below the floor, out of the air. */
const PARKED = -50
/** Tracers each vent can have alive, per second of lifetime. */
const SLOTS_PER_S = 2500

export type PlumeValues = {
  /** Buoyancy at the sample's peak decay heat, m/s². */
  heat: number
  cooling: number
  vorticity: number
  viscosity: number
  /** The vanes' spin, m/s. */
  swirl: number
  gravity: number
  /** Tracers a second, all vents together, at the sample's peak decay heat. */
  emission: number
  /** Seconds a tracer lasts (fixed at build). */
  lifetime: number
}

export type Plume = {
  loop: SimLoop
  objects: Object3D[]
  airCount: number
  /** Puts `n` vents in use, spread on the ring; the rest are parked. */
  setVents(n: number): void
  /** One step's inputs: each vent's heat and the total, both as shares of the sample's peak. */
  update(dt: number, heat: readonly number[], total: number): void
  setParameter(key: keyof PlumeValues, value: number): void
  setColors(pairs: readonly (readonly [Color, Color])[]): void
  /** Additive blending, for dark paper; normal for light. */
  setGlow(on: boolean): void
  setAirVisible(on: boolean): void
  /** A burst of a vent's tracers at a point. */
  puff(at: Vector3, vent: number): void
  dispose(): void
}

export function buildPlume(renderer: WebGPURenderer, budget: number, values: PlumeValues): Plume {
  // Still air fills the column. The vents heat it, and the hot air rises and carries the smoke.
  const fill = (r: number) => lattice([-HALF, r, -HALF], [HALF, TOP, HALF], r * 2)
  const radius = fitRadius(fill, budget, 0.035)
  const initial = fill(radius)
  const count = initial.length
  const particles = new ParticleSystem(renderer, count, radius)
  particles.uploadParticles(initial)
  const air = new FluidSystem(particles, { viscosity: values.viscosity, vorticity: values.vorticity })

  const heatSources: HeatSource[] = Array.from({ length: VENTS }, () => ({ position: new Vector3(0, PARKED, 0), radius: VENT }))
  const centres = Array.from({ length: VENTS }, () => new Vector3(0, PARKED, 0))
  const capacity = Math.ceil(SLOTS_PER_S * values.lifetime)
  const bounds = new Box3(new Vector3(-1, -1, -1), new Vector3(1, SMOKE_TOP, 1))
  // The first vent's tracer set carries the heat for all five; the others only carry tracers.
  const smoke = Array.from(
    { length: VENTS },
    (_, k) =>
      new GasSystem(
        air,
        k === 0
          ? { capacity, lifetime: values.lifetime, bounds, heatSources, buoyancy: 0, cooling: values.cooling }
          : { capacity, lifetime: values.lifetime, bounds },
      ),
  )
  const heated = smoke[0]

  // Vanes along the walls turn the air the plume draws in, so the column spins.
  const swirl = uniform(values.swirl)
  const vanes: Material = {
    build: ({ dt }) => ({
      postSolve: [
        Fn(() => {
          const p: Any = particles.positions.element(instanceIndex).xyz
          const velocity: Any = particles.velocities.element(instanceIndex)
          const v: Any = velocity.xyz.toVar()
          const r: Any = vec2(p.x, p.z).length().toVar()
          const tangent: Any = vec3(p.z.negate(), 0, p.x).div(r.max(1e-4))
          const turn: Any = swirl.sub(v.dot(tangent)).mul(r.smoothstep(0.3, 0.45)).mul(dt.mul(4))
          velocity.assign(vec4(v.add(tangent.mul(turn)), velocity.w))
        })().compute(count),
      ],
    }),
  }

  // A lid keeps hot air from leaving through the top.
  const walls = tank(particles, HALF + 0.02, HALF + 0.02)
  walls.addPlane(new Vector3(0, -1, 0), new Vector3(0, TOP + 0.02, 0))
  const substeps = scaledSubsteps(2, budget),
    iterations = 2
  const loop = new SimLoop(particles, {
    substeps,
    iterations,
    // Light gravity keeps the air settled, so gaps the plume leaves refill.
    gravity: new Vector3(0, -values.gravity, 0),
    colliders: [walls],
    materials: [...smoke, air, vanes],
  })

  // Each vent's tracers: Spline's sprites, a random mix of two colours per tracer.
  const tints = smoke.map(() => [uniform(new Color(0xffffff)), uniform(new Color(0xffffff))] as const)
  const sprites = smoke.map(
    (gas, k) =>
      new GasSpriteRenderer(gas, {
        size: 0.016,
        initialOpacity: 0.4,
        opacityTau: values.lifetime / 3,
        colorNode: () => mix(tints[k][0] as Any, tints[k][1] as Any, hash(instanceIndex as Any) as Any),
      }),
  )
  const spriteMaterials = sprites.map((s) => s.object.material as ThreeMaterial)

  // Air particles glow with their temperature.
  const temperature = heated.temperature!
  const dots: InstancedMesh = particleView(particles, {
    radius: radius * 0.22,
    colorNode: () => mix(color(0x6d8a9c), color(0xff8a3d), temperature.element(instanceIndex).clamp(0, 1).pow(0.4)),
  })

  let used = 0
  const carry = smoke.map(() => 0)
  let rng = 0x2f6e2b1
  const random = () => {
    rng = (rng + 0x6d2b79f5) | 0
    let t = Math.imul(rng ^ (rng >>> 15), 1 | rng)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  return {
    loop,
    objects: [...sprites.map((s) => s.object), dots],
    airCount: count,
    setVents(n) {
      used = Math.max(0, Math.min(VENTS, n))
      for (let k = 0; k < VENTS; k++) {
        if (k >= used) centres[k].set(0, PARKED, 0)
        else if (used === 1) centres[k].set(0, 0, 0)
        else {
          const a = (2 * Math.PI * k) / used - Math.PI / 2
          centres[k].set(Math.cos(a) * RING, 0, Math.sin(a) * RING)
        }
        heatSources[k].position.copy(centres[k])
        carry[k] = 0
      }
    },
    update(dt, heat, total) {
      heated.buoyancy = Number.isFinite(total) ? values.heat * Math.max(0, total) : 0
      const hottest = Math.max(0, ...heat.slice(0, used))
      for (let k = 0; k < VENTS; k++) {
        const h = k < used ? Math.max(0, heat[k] ?? 0) : 0
        // A vent heats on a share of steps equal to its heat over the hottest vent's.
        const on = h > 0 && hottest > 0 && random() < h / hottest
        heatSources[k].position.set(centres[k].x, on ? VENT_Y : PARKED, centres[k].z)
        carry[k] += values.emission * h * dt
        const n = Math.floor(carry[k])
        carry[k] -= n
        for (let i = 0; i < n; i++) {
          const angle = random() * Math.PI * 2
          const r = (VENT - 0.01) * Math.sqrt(random())
          smoke[k].emit([centres[k].x + Math.cos(angle) * r, 0.03 + random() * 0.05, centres[k].z + Math.sin(angle) * r])
        }
      }
    },
    setParameter(key, value) {
      values[key] = value
      if (key === 'swirl') swirl.value = value
      if (key === 'cooling') heated.cooling = value
      if (key === 'viscosity') air.viscosity = value
      if (key === 'vorticity') air.vorticity = value
      if (key === 'gravity') loop.gravity.set(0, -value, 0)
    },
    setColors(pairs) {
      pairs.forEach(([a, b], k) => {
        if (!tints[k]) return
        ;(tints[k][0].value as Color).copy(a)
        ;(tints[k][1].value as Color).copy(b)
      })
    },
    setGlow(on) {
      for (const m of spriteMaterials) {
        m.blending = on ? AdditiveBlending : NormalBlending
        m.needsUpdate = true
      }
    },
    setAirVisible(on) {
      dots.visible = on
    },
    puff(at, vent) {
      const gas = smoke[Math.max(0, Math.min(VENTS - 1, vent))]
      for (let i = 0; i < 400; i++) {
        const u = random() * 2 - 1
        const a = random() * Math.PI * 2
        const r = 0.06 * Math.cbrt(random())
        const s = Math.sqrt(1 - u * u)
        gas.emit([at.x + r * s * Math.cos(a), Math.max(0.03, at.y + r * u), at.z + r * s * Math.sin(a)])
      }
    },
    dispose() {
      for (const s of sprites) s.dispose()
      particles.dispose()
      loop.dispose()
    },
  }
}
