'use client'

// The knowledge map (/viz/knowledge): every nuclide the literature indexes, at (N, Z). Evaluated nuclides are coloured
// by the years since their ENSDF evaluation's literature cutoff; nuclides studied in papers but never evaluated are grey
// hollow squares. Two switches (Brendan, 2026-11-06, Knowledge map 2 folded in so the two can't drift):
//   3D — off: square tiles sized by adopted levels, up to just under a cell, so they sit one per cell without
//        overlapping. On: columns as tall as their adopted levels on a log scale.
//   Select grid — off: a click picks a nuclide. On: a click picks a 10 × 10 block of N and Z, and the floor's own grid
//        lines (every 10, between nuclides) are its edges; there is one grid, not two.
// Shift-, Cmd- or Ctrl-click adds to the selection (or takes out) in either mode. The nuclide under the pointer wears
// an ink outline; picked nuclides a heavier one; picked blocks a blue outline over a light blue fill.

import * as React from 'react'
import * as THREE from 'three'
import { Canvas, useFrame } from '@react-three/fiber'
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
/** Nucleons a block spans, in N and in Z. */
const BLOCK = 10
const BLOCKS_N = Math.floor(N_MAX / BLOCK) + 1
const BLOCKS_Z = Math.floor(Z_MAX / BLOCK) + 1

/** A 2D tile's side: 0.3 of a cell for one level, 0.95 for 754, the most any nuclide has. */
const sideOf = (levels: number) => 0.3 + 0.65 * Math.sqrt(Math.min(754, Math.max(0, levels)) / 754)
/** A 3D column's height: 754 levels stands about 40 units over the 200 × 120 floor. */
const heightOf = (levels: number) => Math.max(0.3, 14 * Math.log10(1 + levels))
const COLUMN = 0.86
const TILE_H = 0.25
const NEVER_SIDE = 0.62
/** Seconds the 3D switch takes to grow tiles into columns, or back. */
const MORPH = 0.6
const age = (r: KnowledgeRow) => Math.max(0, SNAPSHOT_YEAR - r.cutoff)
const wx = (n: number) => n - N0
const wz = (z: number) => -(z - Z0)
/** The grid's corner: the outer corner of cell (N 0, Z 0), so every line falls between nuclides. */
const GX0 = wx(-0.5)
const GZ0 = wz(-0.5)
const GW = BLOCKS_N * BLOCK
const GD = BLOCKS_Z * BLOCK

type Block = { bn: number; bz: number }
const blockKey = (b: Block) => `${b.bn},${b.bz}`
const blockName = (b: Block) => `N ${b.bn * BLOCK}–${b.bn * BLOCK + BLOCK - 1} · Z ${b.bz * BLOCK}–${b.bz * BLOCK + BLOCK - 1}`
const noRaycast = () => null
const SQUARE: [number, number, number][] = [[-0.5, 0, -0.5], [0.5, 0, -0.5], [0.5, 0, 0.5], [-0.5, 0, 0.5], [-0.5, 0, -0.5]]

/** A nuclide's footprint and height in the current view. */
const shapeOf = (r: KnowledgeRow, three: boolean) =>
  r.evaluated ? (three ? { side: COLUMN, h: heightOf(r.levels) } : { side: sideOf(r.levels), h: TILE_H }) : { side: NEVER_SIDE, h: 0.02 }

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
  return {
    bg,
    ink: inkC,
    grid: inkC.clone().lerp(bg, 0.82),
    stops,
    never: new THREE.Color(dark ? NEVER.dark : NEVER.light),
    blue: new THREE.Color(dark ? '#5b9cff' : '#2563eb'),
  }
}

/** The age scale at t ∈ [0, 1]: teal → amber → rust. */
function ageColor(stops: THREE.Color[], t: number, out: THREE.Color) {
  const u = Math.min(1, Math.max(0, t)) * (stops.length - 1)
  const i = Math.min(stops.length - 2, Math.floor(u))
  return out.copy(stops[i]).lerp(stops[i + 1], u - i)
}

const additive = (e: { nativeEvent: Event }) => {
  const ne = e.nativeEvent as MouseEvent
  return ne.shiftKey || ne.metaKey || ne.ctrlKey
}

/** The tiles or columns, and the never-evaluated squares. Memoised on what they draw, so hover and selection above
 *  them never re-render 7,986 instances. */
const Nuclides = React.memo(function Nuclides({
  rows, evaluated, never, pal, three, grid, onHover, onPick,
}: {
  rows: KnowledgeRow[]
  evaluated: number[]
  never: number[]
  pal: Palette
  three: boolean
  grid: boolean
  onHover: (i: number | null) => void
  onPick: (i: number, add: boolean) => void
}) {
  const solids = React.useRef<THREE.InstancedMesh>(null)
  const hollows = React.useRef<THREE.InstancedMesh>(null)
  // Base at the floor, so an instance's y scale is its height.
  const box = React.useMemo(() => new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), [])
  const hollow = React.useMemo(() => {
    const o = NEVER_SIDE / 2, i = 0.2
    const shape = new THREE.Shape([new THREE.Vector2(-o, -o), new THREE.Vector2(o, -o), new THREE.Vector2(o, o), new THREE.Vector2(-o, o)])
    shape.holes.push(new THREE.Path([new THREE.Vector2(-i, -i), new THREE.Vector2(-i, i), new THREE.Vector2(i, i), new THREE.Vector2(i, -i)]))
    return new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2).translate(0, 0.02, 0)
  }, [])
  // Created once: inline in the JSX they were new arrays on every render, and a re-render turned every marker black.
  const solidCol = React.useMemo(() => new Float32Array(evaluated.length * 3), [evaluated])
  const hollowCol = React.useMemo(() => new Float32Array(never.length * 3), [never])

  // Each tile's 2D and 3D footprint and height, so the 3D switch can morph between them (2026-11-06): tiles grow into
  // columns, and back, over MORPH seconds, eased, one matrix write per instance per frame while it runs.
  const shapes = React.useMemo(() => {
    const a = { s2: new Float32Array(evaluated.length), h2: new Float32Array(evaluated.length), s3: new Float32Array(evaluated.length), h3: new Float32Array(evaluated.length) }
    evaluated.forEach((ri, k) => {
      const r = rows[ri]
      const flat = shapeOf(r, false)
      const tall = shapeOf(r, true)
      a.s2[k] = flat.side
      a.h2[k] = flat.h
      a.s3[k] = tall.side
      a.h3[k] = tall.h
    })
    return a
  }, [rows, evaluated])
  const mix = React.useRef<number | null>(null)
  const place = React.useCallback(
    (t: number) => {
      const sm = solids.current
      if (!sm) return
      const e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
      const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3()
      evaluated.forEach((ri, k) => {
        const r = rows[ri]
        const side = shapes.s2[k] + (shapes.s3[k] - shapes.s2[k]) * e
        const h = shapes.h2[k] + (shapes.h3[k] - shapes.h2[k]) * e
        sm.setMatrixAt(k, m.compose(p.set(wx(r.n), 0, wz(r.z)), q, s.set(side, h, side)))
      })
      sm.instanceMatrix.needsUpdate = true
    },
    [rows, evaluated, shapes],
  )
  useFrame((_, dt) => {
    const target = three ? 1 : 0
    if (mix.current === null || mix.current === target) return
    const step = Math.min(dt, 0.05) / MORPH
    mix.current = target > mix.current ? Math.min(target, mix.current + step) : Math.max(target, mix.current - step)
    place(mix.current)
    if (mix.current === target) solids.current?.computeBoundingSphere()
  })

  React.useLayoutEffect(() => {
    const c = new THREE.Color()
    const sm = solids.current
    if (sm) {
      // The first draw lands at the current view; later switches animate (useFrame above).
      if (mix.current === null) mix.current = three ? 1 : 0
      place(mix.current)
      evaluated.forEach((ri, k) => sm.setColorAt(k, ageColor(pal.stops, age(rows[ri]) / AGE_MAX, c)))
      if (sm.instanceColor) sm.instanceColor.needsUpdate = true
      sm.computeBoundingSphere()
    }
    const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3()
    const hm = hollows.current
    if (hm) {
      never.forEach((ri, k) => {
        const r = rows[ri]
        hm.setMatrixAt(k, m.compose(p.set(wx(r.n), 0, wz(r.z)), q, s.set(1, 1, 1)))
        hm.setColorAt(k, pal.never)
      })
      hm.instanceMatrix.needsUpdate = true
      if (hm.instanceColor) hm.instanceColor.needsUpdate = true
      hm.computeBoundingSphere()
    }
    // `three` is left out on purpose: a switch animates in useFrame rather than snapping here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, evaluated, never, pal, place])

  // With Select grid on, a click picks a block (the floor below), so the nuclides stand aside from the pointer.
  const handlers = (list: number[]) => ({
    raycast: grid ? noRaycast : THREE.InstancedMesh.prototype.raycast,
    onClick: (e: { delta: number; instanceId?: number; stopPropagation: () => void; nativeEvent: Event }) => {
      if (e.delta > 4 || e.instanceId === undefined) return
      e.stopPropagation()
      onPick(list[e.instanceId], additive(e))
    },
    onPointerMove: (e: { instanceId?: number; stopPropagation: () => void }) => {
      e.stopPropagation()
      onHover(e.instanceId === undefined ? null : list[e.instanceId])
    },
    onPointerOut: () => onHover(null),
  })

  return (
    <>
      <instancedMesh ref={hollows} args={[hollow, undefined, never.length]} frustumCulled={false} {...handlers(never)}>
        <meshBasicMaterial toneMapped={false} side={THREE.DoubleSide} />
        <instancedBufferAttribute attach="instanceColor" args={[hollowCol, 3]} />
      </instancedMesh>
      <instancedMesh ref={solids} args={[box, undefined, evaluated.length]} frustumCulled={false} {...handlers(evaluated)}>
        <meshLambertMaterial />
        <instancedBufferAttribute attach="instanceColor" args={[solidCol, 3]} />
      </instancedMesh>
    </>
  )
})

/** An outline around one nuclide: a square on the floor in 2D, a frame round its column in 3D. */
function Outline({ r, three, pal, heavy }: { r: KnowledgeRow; three: boolean; pal: Palette; heavy: boolean }) {
  const { side, h } = shapeOf(r, three)
  const pad = heavy ? 0.45 : 0.3
  const frame = React.useMemo(
    () => (three ? new THREE.EdgesGeometry(new THREE.BoxGeometry(side + pad, h + 0.5, side + pad).translate(0, (h + 0.5) / 2 - 0.1, 0)) : null),
    [three, side, h, pad],
  )
  React.useEffect(() => () => frame?.dispose(), [frame])
  return (
    <group position={[wx(r.n), 0, wz(r.z)]}>
      {frame && (
        <lineSegments geometry={frame} raycast={noRaycast}>
          <lineBasicMaterial color={pal.ink} toneMapped={false} />
        </lineSegments>
      )}
      <group position={[0, h + 0.06, 0]} scale={side + pad}>
        <Line points={SQUARE} color={pal.ink} lineWidth={heavy ? 3 : 2} raycast={noRaycast} />
      </group>
    </group>
  )
}

/** The floor: the one grid (every 10, between nuclides), the N and Z labels, and with Select grid on, the plane a
 *  click lands on, the hovered block's tint and the picked blocks' blue. */
function Floor({
  pal, grid, blocks, onBlockHover, onBlock,
}: {
  pal: Palette
  grid: boolean
  blocks: Block[]
  onBlockHover: (b: Block | null) => void
  onBlock: (b: Block, add: boolean) => void
}) {
  const lines = React.useMemo(() => {
    const p: number[] = []
    const y = -0.02
    for (let i = 0; i <= BLOCKS_N; i++) p.push(GX0 + i * BLOCK, y, GZ0, GX0 + i * BLOCK, y, GZ0 - GD)
    for (let j = 0; j <= BLOCKS_Z; j++) p.push(GX0, y, GZ0 - j * BLOCK, GX0 + GW, y, GZ0 - j * BLOCK)
    return new Float32Array(p)
  }, [])
  const hoverTile = React.useRef<THREE.Mesh>(null)
  const last = React.useRef('')
  const blockAt = (pt: THREE.Vector3): Block | null => {
    const bn = Math.floor((pt.x - GX0) / BLOCK)
    const bz = Math.floor((GZ0 - pt.z) / BLOCK)
    return bn >= 0 && bn < BLOCKS_N && bz >= 0 && bz < BLOCKS_Z ? { bn, bz } : null
  }
  const centre = (b: Block, y: number): [number, number, number] => [GX0 + (b.bn + 0.5) * BLOCK, y, GZ0 - (b.bz + 0.5) * BLOCK]
  const hover = (b: Block | null) => {
    const k = b ? blockKey(b) : ''
    if (k === last.current) return
    last.current = k
    const t = hoverTile.current
    if (t) {
      t.visible = !!b
      if (b) t.position.set(...centre(b, 0.01))
    }
    onBlockHover(b)
  }

  return (
    <>
      <lineSegments frustumCulled={false} raycast={noRaycast}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[lines, 3]} />
        </bufferGeometry>
        {/* Darker while Select grid is on: the lines are the blocks' edges then. */}
        <lineBasicMaterial color={grid ? pal.ink : pal.grid} transparent opacity={grid ? 0.5 : 1} toneMapped={false} />
      </lineSegments>
      <Html position={[GX0 + GW + 6, 0, GZ0]} center style={{ ...MONO, fontSize: 11, color: 'var(--paper-faint)', pointerEvents: 'none' }}>
        N
      </Html>
      <Html position={[GX0, 0, GZ0 - GD - 6]} center style={{ ...MONO, fontSize: 11, color: 'var(--paper-faint)', pointerEvents: 'none' }}>
        Z
      </Html>
      {grid && (
        <>
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[GX0 + GW / 2, 0, GZ0 - GD / 2]}
            onPointerMove={(e) => {
              e.stopPropagation()
              hover(blockAt(e.point))
            }}
            onPointerOut={() => hover(null)}
            onClick={(e) => {
              if (e.delta > 4) return
              const b = blockAt(e.point)
              if (b) onBlock(b, additive(e))
            }}
          >
            <planeGeometry args={[GW, GD]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
          <mesh ref={hoverTile} visible={false} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast}>
            <planeGeometry args={[BLOCK, BLOCK]} />
            <meshBasicMaterial color={pal.ink} transparent opacity={0.08} depthWrite={false} toneMapped={false} />
          </mesh>
          {blocks.map((b) => (
            <group key={blockKey(b)}>
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={centre(b, 0.015)} raycast={noRaycast}>
                <planeGeometry args={[BLOCK, BLOCK]} />
                <meshBasicMaterial color={pal.blue} transparent opacity={0.14} depthWrite={false} toneMapped={false} />
              </mesh>
              <group position={centre(b, 0.05)} scale={BLOCK}>
                <Line points={SQUARE} color={pal.blue} lineWidth={3} raycast={noRaycast} />
              </group>
            </group>
          ))}
        </>
      )}
    </>
  )
}

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

function Switch({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      className="flex items-center justify-between gap-2 rounded-md border border-[var(--paper-rule)]/25 px-2 py-1 text-left transition-colors hover:bg-[var(--paper-quiet)]"
    >
      <span>{label}</span>
      <span className={`relative h-3.5 w-6 rounded-full transition-colors ${on ? 'bg-[var(--paper-text)]' : 'bg-[var(--paper-rule)]/40'}`}>
        <span className={`absolute top-0.5 h-2.5 w-2.5 rounded-full bg-[var(--paper)] transition-[left] ${on ? 'left-3' : 'left-0.5'}`} />
      </span>
    </button>
  )
}

/** The listed nuclides: a picked block's (or several), or several picked nuclides. */
function NuclideTable({ list, fmt }: { list: KnowledgeRow[]; fmt: (v: number) => string }) {
  if (!list.length) return <p className="text-[12px] text-[var(--paper-muted)]">No nuclides here.</p>
  return (
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
        {list.map((r) => (
          <tr key={`${r.z},${r.n}`} className="border-t border-[var(--paper-rule)]/10">
            <td className="py-1">{knowledgeName(r)}</td>
            <td className="py-1 text-right tabular-nums" style={MONO}>{r.evaluated ? fmt(r.levels) : '—'}</td>
            <td className="py-1 text-right tabular-nums" style={MONO}>{r.evaluated && r.cutoff ? age(r) : '—'}</td>
            <td className="py-1 text-right tabular-nums" style={MONO}>{fmt(r.papers)}</td>
          </tr>
        ))}
      </tbody>
    </table>
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
  const cross = useCrossRules()

  const [three, setThree] = React.useState(false)
  const [grid, setGrid] = React.useState(false)
  const [picks, setPicks] = React.useState<number[]>([])
  const [blocks, setBlocks] = React.useState<Block[]>([])
  const [hover, setHover] = React.useState<number | null>(null)
  const [hoverBlock, setHoverBlock] = React.useState<Block | null>(null)
  const onHover = React.useCallback((i: number | null) => setHover((h) => (h === i ? h : i)), [])
  const onPick = React.useCallback(
    (i: number, add: boolean) => setPicks((cur) => (add ? (cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i]) : [i])),
    [],
  )
  const onBlock = React.useCallback(
    (b: Block, add: boolean) =>
      setBlocks((cur) => {
        const k = blockKey(b)
        if (!add) return [b]
        return cur.some((x) => blockKey(x) === k) ? cur.filter((x) => blockKey(x) !== k) : [...cur, b]
      }),
    [],
  )

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
  const blockList = React.useMemo(
    () => (rows ? blocks.flatMap((b) => byBlock.get(blockKey(b)) ?? []).map((i) => rows[i]).sort((a, b) => a.z - b.z || a.n - b.n) : []),
    [rows, blocks, byBlock],
  )
  const pickList = React.useMemo(() => (rows ? picks.map((i) => rows[i]).sort((a, b) => a.z - b.z || a.n - b.n) : []), [rows, picks])

  const stops = theme.dark ? AGE_STOPS.dark : AGE_STOPS.light
  const hovered = rows && hover !== null && !grid ? rows[hover] : null
  const one = !grid && pickList.length === 1 ? pickList[0] : null
  const panel = grid ? blocks.length > 0 : picks.length > 0
  const fmt = (v: number) => v.toLocaleString('en')

  return (
    <div ref={box} className="relative min-h-0 flex-1 overflow-hidden rounded-xl" style={SANS}>
      {rows && split ? (
        <Canvas flat dpr={[1, 2]} camera={{ position: [0, 170, 120], fov: 42, near: 1, far: 3000 }} {...cross}>
          <color attach="background" args={[pal.bg]} />
          {/* Physical light units (three r155+): about π lights a face at its own colour. */}
          <ambientLight intensity={2.2} />
          <directionalLight position={[80, 160, 60]} intensity={1.2} />
          <Nuclides rows={rows} evaluated={split.evaluated} never={split.never} pal={pal} three={three} grid={grid} onHover={onHover} onPick={onPick} />
          <Floor pal={pal} grid={grid} blocks={blocks} onBlockHover={setHoverBlock} onBlock={onBlock} />
          {!grid && picks.map((i) => <Outline key={i} r={rows[i]} three={three} pal={pal} heavy />)}
          {hovered && hover !== null && !picks.includes(hover) && <Outline r={hovered} three={three} pal={pal} heavy={false} />}
          <SpinControls makeDefault target={[0, 0, 0]} enableDamping dampingFactor={0.08} minDistance={25} maxDistance={700} maxPolarAngle={Math.PI / 2 - 0.03} />
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

      {/* What the axes and colours are, and the two switches. */}
      <div className="absolute left-4 top-4 flex w-[220px] flex-col gap-2 rounded-xl border border-[var(--paper-rule)]/15 bg-[var(--paper)]/85 px-3 py-2.5 text-[11px] text-[var(--paper-text)] backdrop-blur-sm">
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
          {three ? 'adopted levels, log scale' : 'size: adopted levels'}
        </span>
        <div className="mt-1 flex flex-col gap-1">
          <Switch
            label="Select grid"
            on={grid}
            onToggle={() => {
              setGrid((g) => !g)
              setHover(null)
              setHoverBlock(null)
            }}
          />
          <Switch label="3D" on={three} onToggle={() => setThree((v) => !v)} />
        </div>
        <span className="text-[10px] text-[var(--paper-faint)]">
          {grid ? 'Click a block to list its nuclides; Shift-click adds more.' : 'Click a nuclide; Shift-click adds more.'}
        </span>
      </div>

      {/* Under the pointer */}
      {!panel && (hovered || (grid && hoverBlock)) && (
        <div className="pointer-events-none absolute bottom-4 right-4 rounded-xl border border-[var(--paper-rule)]/15 bg-[var(--paper)]/90 px-3 py-2 text-[12px] text-[var(--paper-text)] backdrop-blur-sm">
          {hovered ? (
            <>
              <span className="font-medium">{knowledgeName(hovered)}</span>
              <span className="ml-2 text-[var(--paper-muted)]" style={MONO}>
                {hovered.evaluated ? `${fmt(hovered.levels)} levels · cutoff ${hovered.cutoff || '—'}` : 'never evaluated'} · {fmt(hovered.papers)} papers
              </span>
            </>
          ) : (
            hoverBlock && (
              <span style={MONO}>
                {blockName(hoverBlock)} · {fmt(byBlock.get(blockKey(hoverBlock))?.length ?? 0)} nuclides
              </span>
            )
          )}
        </div>
      )}

      {/* One picked nuclide: its counts */}
      {one && (
        <div className="absolute right-4 top-16 w-[280px] rounded-xl border border-[var(--paper-rule)]/15 bg-[var(--paper)]/95 px-4 pb-3 pt-4 text-[var(--paper-text)] backdrop-blur-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[22px] leading-none" style={{ fontFamily: 'var(--font-display), Georgia, serif' }}>
                {knowledgeName(one)}
              </div>
              <div className="mt-1.5 text-[11px] text-[var(--paper-muted)]" style={MONO}>
                Z {one.z} · N {one.n}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setPicks([])}
              aria-label="Close"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--paper-rule)]/25 transition-colors hover:bg-[var(--paper-quiet)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mt-3">
            <Row label="Papers" value={fmt(one.papers)} />
            <Row label="EXFOR entries" value={fmt(one.exfor)} />
            <Row label="XUNDL datasets" value={fmt(one.xundl)} />
            {one.evaluated ? (
              <>
                <Row label="Adopted levels" value={fmt(one.levels)} />
                <Row label="ENSDF cards" value={fmt(one.cards)} />
                <Row label="Evaluation cutoff" value={one.cutoff ? `${one.cutoff} (${age(one)} y ago)` : '—'} />
              </>
            ) : (
              <Row label="ENSDF evaluation" value="None" />
            )}
          </div>
        </div>
      )}

      {/* Picked blocks, or several picked nuclides: one list */}
      {panel && !one && (
        <aside className="absolute bottom-4 right-4 top-16 flex w-[320px] max-w-[48%] flex-col overflow-hidden rounded-xl border border-[var(--paper-rule)]/15 bg-[var(--paper)]/95 text-[var(--paper-text)] backdrop-blur-sm">
          <div className="flex items-start justify-between gap-3 px-4 pb-2 pt-3">
            <div>
              <div className="text-[18px] leading-tight" style={{ fontFamily: 'var(--font-display), Georgia, serif' }}>
                {grid ? (blocks.length === 1 ? blockName(blocks[0]) : `${blocks.length} blocks`) : `${picks.length} nuclides`}
              </div>
              <div className="mt-1 text-[11px] text-[var(--paper-muted)]" style={MONO}>
                {grid ? `${fmt(blockList.length)} nuclides` : 'picked'}
              </div>
            </div>
            <button
              type="button"
              onClick={() => (grid ? setBlocks([]) : setPicks([]))}
              aria-label="Close"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--paper-rule)]/25 transition-colors hover:bg-[var(--paper-quiet)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3">
            <NuclideTable list={grid ? blockList : pickList} fmt={fmt} />
          </div>
          <p className="border-t border-[var(--paper-rule)]/10 px-4 py-2 text-[10px] text-[var(--paper-faint)]">
            Years since the evaluation’s literature cutoff; — where never evaluated.
          </p>
        </aside>
      )}
    </div>
  )
}
