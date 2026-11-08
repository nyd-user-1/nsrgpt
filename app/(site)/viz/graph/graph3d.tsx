'use client'

// The force graph in 3D (Brendan, 2026-11-06): the same nodes and edges on a layout computed once in three dimensions
// (scripts/viz-graph-layout-3d.mjs). The switch opens the flat graph out into it over MORPH seconds, eased, as the
// knowledge map's tiles grow into columns, and folds it flat again on the way back. Everything the 2D graph does
// carries over: the lights flow parent to daughter, a hover lights a chain, a click pins a chain or unpins it,
// and the legend hides decay modes. The camera is the 3D charts' (SpinControls): it turns on open, and once the
// reader clicks into the chart the keys orbit, tilt, zoom and pan.

import * as React from 'react'
import * as THREE from 'three'
import { Canvas, useFrame } from '@react-three/fiber'
import { SpinControls, useCrossRules } from '@/lib/viz-3d-controls'
import { FAMILIES, FAMILY, familyOf, halfLifeText, modesText, nucName, type Decay, type Family } from '@/lib/viz-physics'
import { usePaperTheme } from '@/lib/use-paper-theme'
import { VizControls } from '@/components/viz/VizControls'
import { chainsOf, graphModel, positions3d, sizeOf, type GraphModel, type LayoutFile, type Layout3dFile, type Pin } from './model'
import { useData } from '@/lib/use-data'

const MORPH = 0.6
const MONO = { fontFamily: 'var(--font-mono), ui-monospace, monospace' } as const
/** World units a node's 2D mark size (px) comes to: the camera shows the graph about as large as the 2D chart. */
const UNIT = 0.45
/** Where a light that isn't showing waits. */
const AWAY = 1e6

type Pal = { paper: THREE.Color; fam: Record<Family, THREE.Color> }
type Layouts = { m: GraphModel; flat: Float32Array; deep: Float32Array }

export default function Graph3D({ decay, pinned, onPin, flow, open }: { decay: Decay; pinned: number[]; onPin: Pin; flow: boolean; open: boolean }) {
  const box = React.useRef<HTMLDivElement>(null)
  const theme = usePaperTheme(box)
  const cross = useCrossRules()
  const l2 = useData<LayoutFile>('graph-layout.json')
  const l3 = useData<Layout3dFile>('graph-layout-3d.json')
  const failed = l2.error !== null || l3.error !== null
  const layouts = React.useMemo<Layouts | null>(() => {
    if (!l2.data || !l3.data) return null
    const m = graphModel(decay, l2.data)
    const xyz = positions3d(decay, m, l3.data)
    const flat = new Float32Array(m.xy.length * 3)
    const deep = new Float32Array(m.xy.length * 3)
    m.xy.forEach(([x, y], i) => flat.set([x, -y, 0], i * 3))
    xyz.forEach(([x, y, z], i) => deep.set([x, -y, z], i * 3))
    return { m, flat, deep }
  }, [decay, l2.data, l3.data])

  const pal = React.useMemo<Pal>(
    () => ({
      paper: new THREE.Color(theme.paper),
      fam: Object.fromEntries(FAMILIES.map((f) => [f, new THREE.Color(theme.dark ? FAMILY[f].dark : FAMILY[f].light)])) as Record<Family, THREE.Color>,
    }),
    [theme],
  )
  const [hidden, setHidden] = React.useState<Set<Family>>(new Set())
  const [hover, setHover] = React.useState<number | null>(null)
  const chains = React.useMemo(() => new Map<number, Set<number>>(), [layouts])
  const lit = React.useMemo(
    () => (layouts && (hover !== null || pinned.length) ? chainsOf(layouts.m, hover === null ? pinned : [...pinned, hover], chains) : null),
    [layouts, hover, pinned, chains],
  )
  const present = React.useMemo(() => FAMILIES.filter((f) => decay.nuclides.some((x) => familyOf(x) === f)), [decay])
  const hovered = hover !== null ? decay.nuclides[hover] : null

  return (
    <div ref={box} className="relative min-h-0 flex-1 overflow-hidden">
      {layouts ? (
        <Canvas flat dpr={[1, 2]} camera={{ position: [0, 0, 720], fov: 42, near: 1, far: 6000 }} {...cross}>
          <Scene decay={decay} layouts={layouts} open={open} lit={lit} emph={hover === null ? pinned : [...pinned, hover]} hidden={hidden} flow={flow} pal={pal} onHover={setHover} onPin={onPin} />
          <SpinControls makeDefault enableDamping dampingFactor={0.08} minDistance={60} maxDistance={2400} />
        </Canvas>
      ) : (
        <div className="flex h-full items-center justify-center text-[13px] text-[var(--paper-muted)]">{failed ? 'The 3D layout didn’t load.' : 'Loading the 3D layout…'}</div>
      )}

      {/* The legend, as the 2D graph's: a click hides or shows a decay mode. */}
      <VizControls>
        {present.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={!hidden.has(f)}
            onClick={() => setHidden((cur) => { const n = new Set(cur); if (n.has(f)) n.delete(f); else n.add(f); return n })}
            className={`flex items-center gap-1.5 rounded-md px-1 py-0.5 transition-opacity hover:bg-[var(--paper-quiet)] ${hidden.has(f) ? 'opacity-35' : ''}`}
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: theme.dark ? FAMILY[f].dark : FAMILY[f].light }} />
            {FAMILY[f].label}
          </button>
        ))}
      </VizControls>

      {hovered && (
        <div className="z-10 pointer-events-none absolute bottom-12 right-4 rounded-xl border border-[var(--paper-rule)]/15 bg-[var(--paper)]/90 px-3 py-2 text-[12px] text-[var(--paper-text)] backdrop-blur-sm">
          <span className="font-medium">{nucName(hovered)}</span>
          <span className="ml-2 text-[var(--paper-muted)]" style={MONO}>
            {halfLifeText(hovered)}
            {hovered.m.length ? ` · ${modesText(hovered, decay.modes)}` : ''}
          </span>
        </div>
      )}
    </div>
  )
}

const Scene = React.memo(function Scene({
  decay, layouts, open, lit, emph, hidden, flow, pal, onHover, onPin,
}: {
  decay: Decay
  layouts: Layouts
  open: boolean
  lit: Set<number> | null
  /** The hovered and pinned nodes, drawn larger. */
  emph: number[]
  hidden: Set<Family>
  flow: boolean
  pal: Pal
  onHover: (i: number | null) => void
  onPin: Pin
}) {
  const { m, flat, deep } = layouts
  const n = m.xy.length
  const fam = React.useMemo(() => decay.nuclides.map((x) => familyOf(x)), [decay])
  const nodes = React.useRef<THREE.InstancedMesh>(null)
  // Where each node is now, between its flat and its 3D place.
  const cur = React.useMemo(() => new Float32Array(n * 3), [n])
  const edges = React.useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(m.links.length * 6), 3))
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(m.links.length * 6), 3))
    return g
  }, [m])
  const edgeMat = React.useMemo(() => new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.45 }), [])
  const lights = React.useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(m.links.length * 3), 3))
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(m.links.length * 3), 3))
    return g
  }, [m])
  const lightMat = React.useMemo(() => new THREE.PointsMaterial({ size: 3, sizeAttenuation: false, vertexColors: true }), [])
  React.useEffect(
    () => () => {
      edges.dispose()
      lights.dispose()
    },
    [edges, lights],
  )
  React.useEffect(
    () => () => {
      edgeMat.dispose()
      lightMat.dispose()
    },
    [edgeMat, lightMat],
  )

  const emphSet = React.useMemo(() => new Set(emph), [emph])
  const shows = React.useCallback((i: number) => !hidden.has(fam[i]), [hidden, fam])
  const flows = React.useCallback((l: { from: number; to: number }) => shows(l.from) && shows(l.to) && (!lit || (lit.has(l.from) && lit.has(l.to))), [shows, lit])

  const mix = React.useRef<number | null>(null)
  const place = React.useCallback(
    (t: number) => {
      const e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
      for (let k = 0; k < n * 3; k++) cur[k] = flat[k] + (deep[k] - flat[k]) * e
      const nm = nodes.current
      if (nm) {
        const mat = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3()
        for (let i = 0; i < n; i++) {
          const r = shows(i) ? sizeOf(m.fed[i]) * UNIT * (emphSet.has(i) ? 1.8 : 1) : 0
          nm.setMatrixAt(i, mat.compose(p.set(cur[i * 3], cur[i * 3 + 1], cur[i * 3 + 2]), q, s.set(r, r, r)))
        }
        nm.instanceMatrix.needsUpdate = true
      }
      const pos = edges.getAttribute('position') as THREE.BufferAttribute
      const a = pos.array as Float32Array
      m.links.forEach((l, j) => {
        a.set(cur.subarray(l.from * 3, l.from * 3 + 3), j * 6)
        a.set(cur.subarray(l.to * 3, l.to * 3 + 3), j * 6 + 3)
      })
      pos.needsUpdate = true
    },
    [n, cur, flat, deep, m, edges, shows, emphSet],
  )

  // Colours: each node and edge its decay mode's, faded into the paper when a lit chain or a hidden mode leaves it out.
  React.useLayoutEffect(() => {
    const nm = nodes.current
    const c = new THREE.Color()
    if (nm) {
      for (let i = 0; i < n; i++) nm.setColorAt(i, c.copy(pal.fam[fam[i]]).lerp(pal.paper, lit && !lit.has(i) ? 0.85 : 0))
      if (nm.instanceColor) nm.instanceColor.needsUpdate = true
    }
    const col = edges.getAttribute('color') as THREE.BufferAttribute
    const lc = lights.getAttribute('color') as THREE.BufferAttribute
    m.links.forEach((l, j) => {
      const on = flows(l)
      c.copy(pal.fam[fam[l.from]]).lerp(pal.paper, on ? 0 : shows(l.from) && shows(l.to) ? 0.92 : 1)
      col.setXYZ(j * 2, c.r, c.g, c.b)
      col.setXYZ(j * 2 + 1, c.r, c.g, c.b)
      c.copy(pal.fam[fam[l.from]])
      lc.setXYZ(j, c.r, c.g, c.b)
    })
    col.needsUpdate = true
    lc.needsUpdate = true
  }, [n, fam, pal, lit, edges, lights, m, flows, shows])

  // Positions and sizes: the first draw lands flat (or open, if already open); later switches animate.
  React.useLayoutEffect(() => {
    if (mix.current === null) mix.current = 0
    place(mix.current)
    nodes.current?.computeBoundingSphere()
  }, [place])

  useFrame(({ clock }, dt) => {
    const target = open ? 1 : 0
    if (mix.current !== null && mix.current !== target) {
      const step = Math.min(dt, 0.05) / MORPH
      mix.current = target > mix.current ? Math.min(target, mix.current + step) : Math.max(target, mix.current - step)
      place(mix.current)
      if (mix.current === target) nodes.current?.computeBoundingSphere()
    }
    if (!flow) return
    // A light per edge, parent to daughter, at the flow lines' speed for the parent's half-life.
    const t = clock.elapsedTime
    const pos = lights.getAttribute('position') as THREE.BufferAttribute
    m.links.forEach((l, j) => {
      if (!flows(l)) {
        pos.setXYZ(j, AWAY, AWAY, AWAY)
        return
      }
      const f = (t / m.period[j] + m.phase[j]) % 1
      const a = l.from * 3
      const b = l.to * 3
      pos.setXYZ(j, cur[a] + (cur[b] - cur[a]) * f, cur[a + 1] + (cur[b + 1] - cur[a + 1]) * f, cur[a + 2] + (cur[b + 2] - cur[a + 2]) * f)
    })
    pos.needsUpdate = true
  })

  return (
    <>
      <instancedMesh
        ref={nodes}
        args={[undefined, undefined, n]}
        onPointerMove={(e) => {
          e.stopPropagation()
          if (e.instanceId !== undefined) onHover(e.instanceId)
        }}
        onPointerOut={() => onHover(null)}
        onClick={(e) => {
          if (e.delta > 4 || e.instanceId === undefined) return
          e.stopPropagation()
          onPin(e.instanceId, true)
        }}
      >
        <sphereGeometry args={[1, 10, 8]} />
        <meshBasicMaterial />
      </instancedMesh>
      <lineSegments geometry={edges} material={edgeMat} frustumCulled={false} />
      <points geometry={lights} material={lightMat} frustumCulled={false} visible={flow} />
    </>
  )
})
