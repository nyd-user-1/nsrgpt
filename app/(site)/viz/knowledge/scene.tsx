'use client'

// The knowledge map (/viz/knowledge, prototype C, 2026-11-04): every nuclide the literature indexes, at (N, Z).
// Evaluated nuclides are square tiles (2026-11-06: squares sit edge to edge on the N × Z grid, one nuclide per cell;
// spheres overlapped) sized by the levels in their ENSDF Adopted Levels deck, up to just under a cell, and coloured
// by the years since the evaluation's literature cutoff; nuclides studied in papers but never evaluated are grey
// hollow squares. The tile under the pointer grows and wears an ink outline. Click one for its counts: papers,
// EXFOR entries, levels, ENSDF cards, XUNDL sets, cutoff. A switch lays 10 × 10 blocks of N and Z over the floor
// (as on Knowledge map 2); a click on a block lists its nuclides, and the picked block wears a blue outline.

import * as React from 'react'
import * as THREE from 'three'
import { Canvas } from '@react-three/fiber'
import { Html, Line } from '@react-three/drei'
import { SpinControls, useCrossRules } from '@/lib/viz-3d-controls'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import { X } from 'lucide-react'
import { AGE_MAX, AGE_STOPS, NEVER, SNAPSHOT_YEAR, knowledgeName, loadKnowledge, type KnowledgeRow } from '@/lib/viz-knowledge'

const SANS = { fontFamily: 'var(--font-sans, "DM Sans"), sans-serif' } as const
const MONO = { fontFamily: 'var(--font-mono), ui-monospace, monospace' } as const

const N0 = 95
const Z0 = 60
const N_MAX = 200
const Z_MAX = 120

/** A tile's side: 0.3 of a cell for one level, 0.95 for 754, the most any nuclide has, so tiles never touch. */
const sideOf = (levels: number) => 0.3 + 0.65 * Math.sqrt(Math.min(754, Math.max(0, levels)) / 754)
/** Nucleons a block spans, in N and in Z. */
const BLOCK = 10
const BLOCKS_N = Math.floor(N_MAX / BLOCK) + 1
const BLOCKS_Z = Math.floor(Z_MAX / BLOCK) + 1
type Block = { bn: number; bz: number }
const blockName = (b: Block) => `N ${b.bn * BLOCK}–${b.bn * BLOCK + BLOCK - 1} · Z ${b.bz * BLOCK}–${b.bz * BLOCK + BLOCK - 1}`
const noRaycast = () => null
/** A unit square's outline on the floor, for drei's Line. */
const SQUARE: [number, number, number][] = [[-0.5, 0, -0.5], [0.5, 0, -0.5], [0.5, 0, 0.5], [-0.5, 0, 0.5], [-0.5, 0, -0.5]]
const age = (r: KnowledgeRow) => Math.max(0, SNAPSHOT_YEAR - r.cutoff)

function useTheme(el: React.RefObject<HTMLDivElement | null>) {
  const [theme, setTheme] = React.useState({ dark: false, paper: '#ffffff', ink: '#16181d' })
  React.useEffect(() => {
    const read = () => {
      const cs = getComputedStyle(el.current ?? document.body)
      setTheme({
        dark: document.documentElement.classList.contains('dark'),
        paper: cs.getPropertyValue('--paper').trim() || '#ffffff',
        ink: cs.getPropertyValue('--paper-text').trim() || '#16181d',
      })
    }
    read()
    const mo = new MutationObserver(read)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] })
    return () => mo.disconnect()
  }, [el])
  return theme
}

type Palette = { bg: THREE.Color; ink: THREE.Color; grid: THREE.Color; stops: THREE.Color[]; never: THREE.Color; blue: THREE.Color }
function palette(dark: boolean, paper: string, ink: string): Palette {
  const bg = new THREE.Color(dark ? '#15120d' : '#ffffff')
  try { bg.set(paper) } catch { /* keep the theme default */ }
  const inkC = new THREE.Color(dark ? '#f0e9d8' : '#16181d')
  try { inkC.set(ink) } catch { /* keep the theme default */ }
  const stops = (dark ? AGE_STOPS.dark : AGE_STOPS.light).map((c) => new THREE.Color(c))
  return { bg, ink: inkC, grid: inkC.clone().lerp(bg, 0.88), stops, never: new THREE.Color(dark ? NEVER.dark : NEVER.light), blue: new THREE.Color(dark ? '#5b9cff' : '#2563eb') }
}

/** The age scale at t ∈ [0, 1]: teal → amber → rust. */
function ageColor(stops: THREE.Color[], t: number, out: THREE.Color) {
  const u = Math.min(1, Math.max(0, t)) * (stops.length - 1)
  const i = Math.min(stops.length - 2, Math.floor(u))
  return out.copy(stops[i]).lerp(stops[i + 1], u - i)
}

const Chart = React.memo(function Chart({
  rows, evaluated, never, pal, selected, onSelect, onHover, grid, picked, onBlockHover, onBlock,
}: {
  rows: KnowledgeRow[]
  evaluated: number[]
  never: number[]
  pal: Palette
  selected: number | null
  onSelect: (i: number | null) => void
  onHover: (i: number | null) => void
  /** The 10 × 10 blocks are on: a click picks a block, not a tile. */
  grid: boolean
  picked: Block | null
  onBlockHover: (b: Block | null) => void
  onBlock: (b: Block) => void
}) {
  const spheres = React.useRef<THREE.InstancedMesh>(null)
  const rings = React.useRef<THREE.InstancedMesh>(null)
  // A flat square tile; x and z scale with the levels, y stays.
  const tileGeom = React.useMemo(() => new THREE.BoxGeometry(1, 0.25, 1), [])
  // A hollow square for the never-evaluated: 0.62 across, its hole 0.4.
  const ringGeom = React.useMemo(() => {
    const o = 0.31, i = 0.2
    const shape = new THREE.Shape([new THREE.Vector2(-o, -o), new THREE.Vector2(o, -o), new THREE.Vector2(o, o), new THREE.Vector2(-o, o)])
    shape.holes.push(new THREE.Path([new THREE.Vector2(-i, -i), new THREE.Vector2(-i, i), new THREE.Vector2(i, i), new THREE.Vector2(i, -i)]))
    return new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2)
  }, [])
  // Created once: inline in the JSX they were new arrays on every render, so selecting a nuclide rebuilt them as
  // zeros and every marker went black.
  const sphereCol = React.useMemo(() => new Float32Array(evaluated.length * 3), [evaluated])
  const ringCol = React.useMemo(() => new Float32Array(never.length * 3), [never])
  // The hover marker (2026-11-05; square since 2026-11-06): the tile under the pointer grows 1.35× and an ink square
  // outlines it. Both change outside React: one instance's matrix rewritten and uploaded alone, and the outline moved,
  // so the 7,986 markers never re-render for a hover.
  const marker = React.useRef<THREE.Group>(null)
  const lit = React.useRef<{ mesh: THREE.InstancedMesh; k: number; size: number } | null>(null)
  const tmp = React.useMemo(() => ({ m: new THREE.Matrix4(), p: new THREE.Vector3(), q: new THREE.Quaternion(), s: new THREE.Vector3() }), [])
  const resize = (mesh: THREE.InstancedMesh, k: number, size: number) => {
    mesh.getMatrixAt(k, tmp.m)
    tmp.m.decompose(tmp.p, tmp.q, tmp.s)
    mesh.setMatrixAt(k, tmp.m.compose(tmp.p, tmp.q, tmp.s.set(size, 1, size)))
    // Just this instance's 16 floats; the renderer clears the ranges once it has uploaded them.
    mesh.instanceMatrix.addUpdateRange(k * 16, 16)
    mesh.instanceMatrix.needsUpdate = true
    return tmp.p
  }
  const light = (mesh: THREE.InstancedMesh | null, k: number | null) => {
    const was = lit.current
    if (was && was.mesh === mesh && was.k === k) return
    if (was) resize(was.mesh, was.k, was.size)
    lit.current = null
    const ring = marker.current
    if (!mesh || k === null) {
      if (ring) ring.visible = false
      return
    }
    const r = rows[(mesh === spheres.current ? evaluated : never)[k]]
    const size = mesh === spheres.current ? sideOf(r.levels) : 1
    const at = resize(mesh, k, size * 1.35)
    lit.current = { mesh, k, size }
    if (ring) {
      ring.position.set(at.x, 0.2, at.z)
      ring.scale.setScalar((mesh === spheres.current ? size : 0.62) * 1.35 + 0.18)
      ring.visible = true
    }
  }

  React.useLayoutEffect(() => {
    // Every matrix is written fresh below, so a grown marker is back to its size.
    lit.current = null
    if (marker.current) marker.current.visible = false
    const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(), c = new THREE.Color()
    const sp = spheres.current
    if (sp) {
      evaluated.forEach((ri, k) => {
        const r = rows[ri]
        p.set(r.n - N0, 0, -(r.z - Z0))
        s.set(sideOf(r.levels), 1, sideOf(r.levels))
        sp.setMatrixAt(k, m.compose(p, q, s))
        sp.setColorAt(k, ageColor(pal.stops, age(r) / AGE_MAX, c))
      })
      // A hover's pending range would make this a one-instance upload; the whole buffer goes.
      sp.instanceMatrix.clearUpdateRanges()
      sp.instanceMatrix.needsUpdate = true
      if (sp.instanceColor) sp.instanceColor.needsUpdate = true
      sp.computeBoundingSphere()
    }
    const rg = rings.current
    if (rg) {
      never.forEach((ri, k) => {
        const r = rows[ri]
        p.set(r.n - N0, 0, -(r.z - Z0))
        s.setScalar(1)
        rg.setMatrixAt(k, m.compose(p, q, s))
        rg.setColorAt(k, pal.never)
      })
      rg.instanceMatrix.clearUpdateRanges()
      rg.instanceMatrix.needsUpdate = true
      if (rg.instanceColor) rg.instanceColor.needsUpdate = true
      rg.computeBoundingSphere()
    }
  }, [rows, evaluated, never, pal])

  const floorLines = React.useMemo(() => {
    const pts: number[] = []
    for (let n = 0; n <= N_MAX; n += 10) pts.push(n - N0, -0.6, Z0, n - N0, -0.6, -(Z_MAX - Z0))
    for (let z = 0; z <= Z_MAX; z += 10) pts.push(-N0, -0.6, -(z - Z0), N_MAX - N0, -0.6, -(z - Z0))
    return new Float32Array(pts)
  }, [])

  const handlers = (list: number[], mesh: React.RefObject<THREE.InstancedMesh | null>) => ({
    // With the blocks on, a click picks a block (the floor plane below), so the tiles stand aside from the pointer.
    raycast: grid ? noRaycast : THREE.InstancedMesh.prototype.raycast,
    onClick: (e: { delta: number; instanceId?: number; stopPropagation: () => void }) => {
      if (e.delta > 4 || e.instanceId === undefined) return
      e.stopPropagation()
      onSelect(list[e.instanceId])
    },
    onPointerMove: (e: { instanceId?: number; stopPropagation: () => void }) => {
      e.stopPropagation()
      light(e.instanceId === undefined ? null : mesh.current, e.instanceId ?? null)
      onHover(e.instanceId === undefined ? null : list[e.instanceId])
    },
    onPointerOut: () => {
      // Only this mesh's own marker: the pointer may already be on the other mesh's.
      if (lit.current?.mesh === mesh.current) light(null, null)
      onHover(null)
    },
  })

  const sel = selected === null ? null : rows[selected]

  // The blocks: their lines, the plane a click lands on, the hovered block's tint and the picked block's blue.
  const bx0 = -0.5 - N0
  const bz0 = 0.5 + Z0
  const BW = BLOCKS_N * BLOCK
  const BD = BLOCKS_Z * BLOCK
  const blockLines = React.useMemo(() => {
    const p: number[] = []
    for (let i = 0; i <= BLOCKS_N; i++) p.push(bx0 + i * BLOCK, -0.5, bz0, bx0 + i * BLOCK, -0.5, bz0 - BD)
    for (let j = 0; j <= BLOCKS_Z; j++) p.push(bx0, -0.5, bz0 - j * BLOCK, bx0 + BW, -0.5, bz0 - j * BLOCK)
    return new Float32Array(p)
  }, [bx0, bz0, BW, BD])
  const hoverTile = React.useRef<THREE.Mesh>(null)
  const lastBlock = React.useRef('')
  const blockAt = (pt: THREE.Vector3): Block | null => {
    const bn = Math.floor((pt.x - bx0) / BLOCK)
    const bz = Math.floor((bz0 - pt.z) / BLOCK)
    return bn >= 0 && bn < BLOCKS_N && bz >= 0 && bz < BLOCKS_Z ? { bn, bz } : null
  }
  const centre = (b: Block): [number, number, number] => [bx0 + (b.bn + 0.5) * BLOCK, -0.45, bz0 - (b.bz + 0.5) * BLOCK]
  const hoverBlock = (b: Block | null) => {
    const k = b ? `${b.bn},${b.bz}` : ''
    if (k === lastBlock.current) return
    lastBlock.current = k
    const t = hoverTile.current
    if (t) {
      t.visible = !!b
      if (b) t.position.set(...centre(b))
    }
    onBlockHover(b)
  }

  return (
    <>
      <color attach="background" args={[pal.bg]} />
      <lineSegments frustumCulled={false} raycast={() => null}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[floorLines, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color={pal.grid} toneMapped={false} />
      </lineSegments>
      <Html position={[N_MAX - N0 + 6, -0.6, Z0]} center style={{ ...MONO, fontSize: 11, color: 'var(--paper-faint)', pointerEvents: 'none' }}>
        N
      </Html>
      <Html position={[-N0, -0.6, -(Z_MAX - Z0) - 6]} center style={{ ...MONO, fontSize: 11, color: 'var(--paper-faint)', pointerEvents: 'none' }}>
        Z
      </Html>

      <instancedMesh ref={rings} args={[ringGeom, undefined, never.length]} frustumCulled={false} {...handlers(never, rings)}>
        <meshBasicMaterial toneMapped={false} side={THREE.DoubleSide} />
        <instancedBufferAttribute attach="instanceColor" args={[ringCol, 3]} />
      </instancedMesh>

      <instancedMesh ref={spheres} args={[tileGeom, undefined, evaluated.length]} frustumCulled={false} {...handlers(evaluated, spheres)}>
        <meshBasicMaterial toneMapped={false} />
        <instancedBufferAttribute attach="instanceColor" args={[sphereCol, 3]} />
      </instancedMesh>

      <group ref={marker} visible={false}>
        <Line points={SQUARE} color={pal.ink} lineWidth={2} raycast={noRaycast} />
      </group>

      {sel && (
        <group position={[sel.n - N0, 0.22, -(sel.z - Z0)]} scale={(sel.evaluated ? sideOf(sel.levels) : 0.62) + 0.45}>
          <Line points={SQUARE} color={pal.ink} lineWidth={3} raycast={noRaycast} />
        </group>
      )}

      {grid && (
        <>
          <lineSegments frustumCulled={false} raycast={noRaycast}>
            <bufferGeometry>
              <bufferAttribute attach="attributes-position" args={[blockLines, 3]} />
            </bufferGeometry>
            <lineBasicMaterial color={pal.ink} transparent opacity={0.45} toneMapped={false} />
          </lineSegments>
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[bx0 + BW / 2, -0.5, bz0 - BD / 2]}
            onPointerMove={(e) => {
              e.stopPropagation()
              hoverBlock(blockAt(e.point))
            }}
            onPointerOut={() => hoverBlock(null)}
            onClick={(e) => {
              if (e.delta > 4) return
              const b = blockAt(e.point)
              if (b) onBlock(b)
            }}
          >
            <planeGeometry args={[BW, BD]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
          <mesh ref={hoverTile} visible={false} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast}>
            <planeGeometry args={[BLOCK, BLOCK]} />
            <meshBasicMaterial color={pal.ink} transparent opacity={0.08} depthWrite={false} toneMapped={false} />
          </mesh>
          {/* The picked block: a blue outline over a light blue fill (Brendan, 2026-11-06). */}
          {picked && (
            <>
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={centre(picked)} raycast={noRaycast}>
                <planeGeometry args={[BLOCK, BLOCK]} />
                <meshBasicMaterial color={pal.blue} transparent opacity={0.14} depthWrite={false} toneMapped={false} />
              </mesh>
              <Line
                points={[
                  [bx0 + picked.bn * BLOCK, -0.4, bz0 - picked.bz * BLOCK],
                  [bx0 + (picked.bn + 1) * BLOCK, -0.4, bz0 - picked.bz * BLOCK],
                  [bx0 + (picked.bn + 1) * BLOCK, -0.4, bz0 - (picked.bz + 1) * BLOCK],
                  [bx0 + picked.bn * BLOCK, -0.4, bz0 - (picked.bz + 1) * BLOCK],
                  [bx0 + picked.bn * BLOCK, -0.4, bz0 - picked.bz * BLOCK],
                ]}
                color={pal.blue}
                lineWidth={3}
                raycast={noRaycast}
              />
            </>
          )}
        </>
      )}
    </>
  )
})

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-t border-[var(--paper-rule)]/10 py-1.5 text-[12px]">
      <span className="text-[var(--paper-muted)]">{label}</span>
      <span className="tabular-nums" style={MONO}>
        {value}
      </span>
    </div>
  )
}

export default function KnowledgeScene() {
  const box = React.useRef<HTMLDivElement>(null)
  const theme = useTheme(box)
  const [rows, setRows] = React.useState<KnowledgeRow[] | null>(null)
  const [failed, setFailed] = React.useState(false)
  React.useEffect(() => {
    loadKnowledge().then(setRows, () => setFailed(true))
  }, [])
  const split = React.useMemo(() => {
    if (!rows) return null
    const evaluated: number[] = []
    const never: number[] = []
    rows.forEach((r, i) => (r.evaluated ? evaluated : never).push(i))
    return { evaluated, never }
  }, [rows])
  const pal = React.useMemo(() => palette(theme.dark, theme.paper, theme.ink), [theme])
  const [selected, setSelected] = React.useState<number | null>(null)
  const [hover, setHover] = React.useState<number | null>(null)
  const onHover = React.useCallback((i: number | null) => setHover((h) => (h === i ? h : i)), [])
  const cross = useCrossRules()
  // The 10 × 10 blocks (2026-11-06), as on Knowledge map 2.
  const [grid, setGrid] = React.useState(false)
  const [hoverBlock, setHoverBlock] = React.useState<Block | null>(null)
  const [block, setBlock] = React.useState<Block | null>(null)
  const onBlock = React.useCallback((b: Block) => {
    setBlock(b)
    setSelected(null)
  }, [])
  const byBlock = React.useMemo(() => {
    const m = new Map<string, number[]>()
    rows?.forEach((r, i) => {
      const k = `${Math.floor(r.n / BLOCK)},${Math.floor(r.z / BLOCK)}`
      const list = m.get(k) ?? []
      list.push(i)
      m.set(k, list)
    })
    return m
  }, [rows])
  const listed = React.useMemo(
    () => (rows && block ? (byBlock.get(`${block.bn},${block.bz}`) ?? []).map((i) => rows[i]).sort((a, b) => a.z - b.z || a.n - b.n) : []),
    [rows, block, byBlock],
  )

  const stops = theme.dark ? AGE_STOPS.dark : AGE_STOPS.light
  const hovered = rows && hover !== null ? rows[hover] : null
  const sel = rows && selected !== null ? rows[selected] : null
  const fmt = (v: number) => v.toLocaleString('en')

  return (
    <div ref={box} className="relative min-h-0 flex-1 overflow-hidden rounded-xl" style={SANS}>
      {rows && split ? (
        <Canvas flat dpr={[1, 2]} camera={{ position: [0, 170, 120], fov: 42, near: 1, far: 3000 }} {...cross}>
          <Chart
            rows={rows}
            evaluated={split.evaluated}
            never={split.never}
            pal={pal}
            selected={selected}
            onSelect={setSelected}
            onHover={onHover}
            grid={grid}
            picked={block}
            onBlockHover={setHoverBlock}
            onBlock={onBlock}
          />
          <SpinControls makeDefault target={[0, 0, 0]} enableDamping dampingFactor={0.08} minDistance={25} maxDistance={700} />
          {theme.dark && (
            <EffectComposer multisampling={0}>
              <Bloom mipmapBlur intensity={0.35} luminanceThreshold={0.6} luminanceSmoothing={0.25} />
            </EffectComposer>
          )}
        </Canvas>
      ) : (
        <div className="flex h-full items-center justify-center text-[13px] text-[var(--paper-muted)]">
          {failed ? 'The knowledge data didn’t load.' : 'Loading 7,986 nuclides…'}
        </div>
      )}

      {/* Legend */}
      <div className="absolute left-4 top-4 flex w-[210px] flex-col gap-2 rounded-xl border border-[var(--paper-rule)]/15 bg-[var(--paper)]/85 px-3 py-2.5 text-[11px] text-[var(--paper-text)] backdrop-blur-sm">
        <span>Years since evaluation</span>
        <span className="h-2 w-full rounded-full" style={{ background: `linear-gradient(to right, ${stops.join(', ')})` }} />
        <span className="-mt-1 flex justify-between text-[10px] text-[var(--paper-faint)]" style={MONO}>
          <span>0</span>
          <span>15</span>
          <span>{AGE_MAX}+</span>
        </span>
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-[2px] border-2" style={{ borderColor: theme.dark ? NEVER.dark : NEVER.light }} />
          Studied, never evaluated
        </span>
        <span className="text-[10px] text-[var(--paper-faint)]" style={MONO}>
          size: adopted levels
        </span>
        <button
          type="button"
          aria-pressed={grid}
          onClick={() => {
            setGrid((g) => !g)
            setHoverBlock(null)
            setBlock(null)
          }}
          className="mt-1 flex items-center justify-between gap-2 rounded-md border border-[var(--paper-rule)]/25 px-2 py-1 text-left transition-colors hover:bg-[var(--paper-quiet)]"
        >
          <span>10 × 10 blocks</span>
          <span className={`relative h-3.5 w-6 rounded-full transition-colors ${grid ? 'bg-[var(--paper-text)]' : 'bg-[var(--paper-rule)]/40'}`}>
            <span className={`absolute top-0.5 h-2.5 w-2.5 rounded-full bg-[var(--paper)] transition-[left] ${grid ? 'left-3' : 'left-0.5'}`} />
          </span>
        </button>
        {grid && <span className="text-[10px] text-[var(--paper-faint)]">Click a block to list its nuclides.</span>}
      </div>

      {/* Hovered nuclide */}
      {grid && hoverBlock && !block && (
        <div className="pointer-events-none absolute bottom-4 right-4 rounded-xl border border-[var(--paper-rule)]/15 bg-[var(--paper)]/90 px-3 py-2 text-[12px] text-[var(--paper-text)] backdrop-blur-sm" style={MONO}>
          {blockName(hoverBlock)} · {fmt(byBlock.get(`${hoverBlock.bn},${hoverBlock.bz}`)?.length ?? 0)} nuclides
        </div>
      )}

      {/* The picked block's nuclides */}
      {block && (
        <aside className="absolute bottom-4 right-4 top-16 flex w-[320px] max-w-[48%] flex-col overflow-hidden rounded-xl border border-[var(--paper-rule)]/15 bg-[var(--paper)]/95 text-[var(--paper-text)] backdrop-blur-sm">
          <div className="flex items-start justify-between gap-3 px-4 pb-2 pt-3">
            <div>
              <div className="text-[18px] leading-tight" style={{ fontFamily: 'var(--font-display), Georgia, serif' }}>
                {blockName(block)}
              </div>
              <div className="mt-1 text-[11px] text-[var(--paper-muted)]" style={MONO}>
                {fmt(listed.length)} nuclides
              </div>
            </div>
            <button
              type="button"
              onClick={() => setBlock(null)}
              aria-label="Close"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--paper-rule)]/25 transition-colors hover:bg-[var(--paper-quiet)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3">
            {listed.length === 0 ? (
              <p className="text-[12px] text-[var(--paper-muted)]">No nuclides in this block.</p>
            ) : (
              <table className="w-full border-collapse text-[12px]">
                <thead className="sticky top-0 bg-[var(--paper)]">
                  <tr className="text-[10px] uppercase tracking-[0.12em] text-[var(--paper-faint)]" style={MONO}>
                    <th className="py-1.5 text-left font-normal">Nuclide</th>
                    <th className="py-1.5 text-right font-normal">Levels</th>
                    <th className="py-1.5 text-right font-normal">Years</th>
                    <th className="py-1.5 text-right font-normal">Papers</th>
                  </tr>
                </thead>
                <tbody>
                  {listed.map((r) => (
                    <tr key={`${r.z},${r.n}`} className="border-t border-[var(--paper-rule)]/10">
                      <td className="py-1">{knowledgeName(r)}</td>
                      <td className="py-1 text-right tabular-nums" style={MONO}>{r.evaluated ? fmt(r.levels) : '—'}</td>
                      <td className="py-1 text-right tabular-nums" style={MONO}>{r.evaluated && r.cutoff ? age(r) : '—'}</td>
                      <td className="py-1 text-right tabular-nums" style={MONO}>{fmt(r.papers)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <p className="border-t border-[var(--paper-rule)]/10 px-4 py-2 text-[10px] text-[var(--paper-faint)]">
            Years since the evaluation’s literature cutoff; — where never evaluated.
          </p>
        </aside>
      )}

      {hovered && !sel && !grid && (
        <div className="pointer-events-none absolute bottom-4 right-4 rounded-xl border border-[var(--paper-rule)]/15 bg-[var(--paper)]/90 px-3 py-2 text-[12px] text-[var(--paper-text)] backdrop-blur-sm">
          <span className="font-medium">{knowledgeName(hovered)}</span>
          <span className="ml-2 text-[var(--paper-muted)]" style={MONO}>
            {fmt(hovered.papers)} papers · {hovered.evaluated ? `cutoff ${hovered.cutoff || '—'}` : 'never evaluated'}
          </span>
        </div>
      )}

      {/* Counts */}
      {sel && !block && (
        <div className="absolute right-4 top-16 w-[280px] rounded-xl border border-[var(--paper-rule)]/15 bg-[var(--paper)]/95 px-4 pb-3 pt-4 text-[var(--paper-text)] backdrop-blur-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[22px] leading-none" style={{ fontFamily: 'var(--font-display), Georgia, serif' }}>
                {knowledgeName(sel)}
              </div>
              <div className="mt-1.5 text-[11px] text-[var(--paper-muted)]" style={MONO}>
                Z {sel.z} · N {sel.n}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelected(null)}
              aria-label="Close"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--paper-rule)]/25 transition-colors hover:bg-[var(--paper-quiet)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mt-3">
            <Row label="Papers" value={fmt(sel.papers)} />
            <Row label="EXFOR entries" value={fmt(sel.exfor)} />
            <Row label="XUNDL datasets" value={fmt(sel.xundl)} />
            {sel.evaluated ? (
              <>
                <Row label="Adopted levels" value={fmt(sel.levels)} />
                <Row label="ENSDF cards" value={fmt(sel.cards)} />
                <Row label="Evaluation cutoff" value={sel.cutoff ? `${sel.cutoff} (${age(sel)} y ago)` : '—'} />
              </>
            ) : (
              <Row label="ENSDF evaluation" value="None" />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
