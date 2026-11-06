'use client'

// Knowledge map 2 (/viz/knowledge-3d, 2026-11-05): the knowledge map in 3D. Every nuclide the literature indexes
// stands at (N, Z) on the floor. An evaluated nuclide is a column as tall as its ENSDF adopted levels, on a log
// scale, coloured by the years since its evaluation's literature cutoff; a nuclide studied in papers but never
// evaluated is a flat grey tile. Height is the level count, not the age: evaluations are done one mass chain at a
// time, so age as height would stand in diagonal stripes with no shape, and colour already carries it; the level
// count rises as a ridge along the valley of stability. A toggle lays a grid of 10 × 10 blocks over the floor;
// clicking a block lists the nuclides inside it, with their values, beside the scene.

import * as React from 'react'
import * as THREE from 'three'
import { Canvas } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { X } from 'lucide-react'
import { SpinControls, useCrossRules } from '@/lib/viz-3d-controls'
import { AGE_MAX, AGE_STOPS, NEVER, SNAPSHOT_YEAR, knowledgeName, loadKnowledge, type KnowledgeRow } from '@/lib/viz-knowledge'

const SANS = { fontFamily: 'var(--font-sans, "DM Sans"), sans-serif' } as const
const MONO = { fontFamily: 'var(--font-mono), ui-monospace, monospace' } as const

const N0 = 100
const Z0 = 60
const N_MAX = 200
const Z_MAX = 120
/** Nucleons a block spans, in N and in Z. */
const BLOCK = 10
const BLOCKS_N = Math.floor(N_MAX / BLOCK) + 1
const BLOCKS_Z = Math.floor(Z_MAX / BLOCK) + 1

/** World units over the floor: 754 levels, the most any nuclide has, stands about 40 over a floor 200 × 120. */
const heightOf = (levels: number) => Math.max(0.3, 14 * Math.log10(1 + levels))
const age = (r: KnowledgeRow) => Math.max(0, SNAPSHOT_YEAR - r.cutoff)
const worldX = (n: number) => n - N0
const worldZ = (z: number) => -(z - Z0)

type Block = { bn: number; bz: number }
type Pick = { kind: 'block'; bn: number; bz: number } | { kind: 'one'; i: number }
const noRaycast = () => null

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

type Palette = { bg: THREE.Color; ink: THREE.Color; grid: THREE.Color; stops: THREE.Color[]; never: THREE.Color }
function palette(dark: boolean, paper: string, ink: string): Palette {
  const bg = new THREE.Color(dark ? '#15120d' : '#ffffff')
  try { bg.set(paper) } catch { /* keep the theme default */ }
  const inkC = new THREE.Color(dark ? '#f0e9d8' : '#16181d')
  try { inkC.set(ink) } catch { /* keep the theme default */ }
  const stops = (dark ? AGE_STOPS.dark : AGE_STOPS.light).map((c) => new THREE.Color(c))
  return { bg, ink: inkC, grid: inkC.clone().lerp(bg, 0.75), stops, never: new THREE.Color(dark ? NEVER.dark : NEVER.light) }
}

/** The age scale at t ∈ [0, 1]: teal → amber → rust, as on the knowledge map. */
function ageColor(stops: THREE.Color[], t: number, out: THREE.Color) {
  const u = Math.min(1, Math.max(0, t)) * (stops.length - 1)
  const i = Math.min(stops.length - 2, Math.floor(u))
  return out.copy(stops[i]).lerp(stops[i + 1], u - i)
}

/** The columns and tiles. Memoised on what they draw, so hover state above them never re-renders 7,986 instances. */
const Columns = React.memo(function Columns({
  rows, evaluated, never, pal, grid, onHover, onPick,
}: {
  rows: KnowledgeRow[]
  evaluated: number[]
  never: number[]
  pal: Palette
  grid: boolean
  onHover: (i: number | null) => void
  onPick: (p: Pick) => void
}) {
  const columns = React.useRef<THREE.InstancedMesh>(null)
  const tiles = React.useRef<THREE.InstancedMesh>(null)
  // Base at the floor, so an instance's y scale is its height.
  const box = React.useMemo(() => new THREE.BoxGeometry(0.86, 1, 0.86).translate(0, 0.5, 0), [])
  const colCol = React.useMemo(() => new Float32Array(evaluated.length * 3), [evaluated])
  const tileCol = React.useMemo(() => new Float32Array(never.length * 3), [never])

  React.useLayoutEffect(() => {
    const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(), c = new THREE.Color()
    const put = (mesh: THREE.InstancedMesh | null, list: number[], height: (r: KnowledgeRow) => number, color: (r: KnowledgeRow) => THREE.Color) => {
      if (!mesh) return
      list.forEach((ri, k) => {
        const r = rows[ri]
        mesh.setMatrixAt(k, m.compose(p.set(worldX(r.n), 0, worldZ(r.z)), q, s.set(1, height(r), 1)))
        mesh.setColorAt(k, color(r))
      })
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      mesh.computeBoundingSphere()
    }
    put(columns.current, evaluated, (r) => heightOf(r.levels), (r) => ageColor(pal.stops, age(r) / AGE_MAX, c))
    put(tiles.current, never, () => 0.2, () => pal.never)
  }, [rows, evaluated, never, pal])

  // With the grid on, a click picks a block (Floor below), so the columns stand aside from the pointer.
  const handlers = (list: number[]) => ({
    raycast: grid ? noRaycast : THREE.InstancedMesh.prototype.raycast,
    onClick: (e: { delta: number; instanceId?: number; stopPropagation: () => void }) => {
      if (e.delta > 4 || e.instanceId === undefined) return
      e.stopPropagation()
      onPick({ kind: 'one', i: list[e.instanceId] })
    },
    onPointerMove: (e: { instanceId?: number; stopPropagation: () => void }) => {
      e.stopPropagation()
      onHover(e.instanceId === undefined ? null : list[e.instanceId])
    },
    onPointerOut: () => onHover(null),
  })

  return (
    <>
      <instancedMesh ref={tiles} args={[box, undefined, never.length]} frustumCulled={false} {...handlers(never)}>
        <meshLambertMaterial />
        <instancedBufferAttribute attach="instanceColor" args={[tileCol, 3]} />
      </instancedMesh>
      <instancedMesh ref={columns} args={[box, undefined, evaluated.length]} frustumCulled={false} {...handlers(evaluated)}>
        <meshLambertMaterial />
        <instancedBufferAttribute attach="instanceColor" args={[colCol, 3]} />
      </instancedMesh>
    </>
  )
})

/** The floor: its edge, the N and Z labels, and with the grid on, the block lines and the plane a click lands on. */
function Floor({ pal, grid, picked, onBlockHover, onPick }: { pal: Palette; grid: boolean; picked: Block | null; onBlockHover: (b: Block | null) => void; onPick: (p: Pick) => void }) {
  const W = BLOCKS_N * BLOCK
  const D = BLOCKS_Z * BLOCK
  const x0 = worldX(-0.5)
  const z0 = worldZ(-0.5)
  const lines = React.useMemo(() => {
    const p: number[] = []
    const y = 0.02
    for (let i = 0; i <= BLOCKS_N; i++) p.push(x0 + i * BLOCK, y, z0, x0 + i * BLOCK, y, z0 - D)
    for (let j = 0; j <= BLOCKS_Z; j++) p.push(x0, y, z0 - j * BLOCK, x0 + W, y, z0 - j * BLOCK)
    return new Float32Array(p)
  }, [x0, z0, W, D])
  const edge = React.useMemo(() => new Float32Array([x0, 0, z0, x0 + W, 0, z0, x0 + W, 0, z0, x0 + W, 0, z0 - D, x0 + W, 0, z0 - D, x0, 0, z0 - D, x0, 0, z0 - D, x0, 0, z0]), [x0, z0, W, D])
  const hoverTile = React.useRef<THREE.Mesh>(null)
  const last = React.useRef<string>('')
  const blockAt = (point: THREE.Vector3): Block | null => {
    const bn = Math.floor((point.x - x0) / BLOCK)
    const bz = Math.floor((z0 - point.z) / BLOCK)
    return bn >= 0 && bn < BLOCKS_N && bz >= 0 && bz < BLOCKS_Z ? { bn, bz } : null
  }
  const centre = (b: Block): [number, number, number] => [x0 + (b.bn + 0.5) * BLOCK, 0.03, z0 - (b.bz + 0.5) * BLOCK]
  const hover = (b: Block | null) => {
    const k = b ? `${b.bn},${b.bz}` : ''
    if (k === last.current) return
    last.current = k
    const t = hoverTile.current
    if (t) {
      t.visible = !!b
      if (b) t.position.set(...centre(b))
    }
    onBlockHover(b)
  }

  return (
    <>
      <lineSegments frustumCulled={false} raycast={noRaycast}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[edge, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color={pal.grid} toneMapped={false} />
      </lineSegments>
      <Html position={[x0 + W + 6, 0, z0]} center style={{ ...MONO, fontSize: 11, color: 'var(--paper-faint)', pointerEvents: 'none' }}>
        N
      </Html>
      <Html position={[x0, 0, z0 - D - 6]} center style={{ ...MONO, fontSize: 11, color: 'var(--paper-faint)', pointerEvents: 'none' }}>
        Z
      </Html>
      {grid && (
        <>
          <lineSegments frustumCulled={false} raycast={noRaycast}>
            <bufferGeometry>
              <bufferAttribute attach="attributes-position" args={[lines, 3]} />
            </bufferGeometry>
            <lineBasicMaterial color={pal.ink} transparent opacity={0.45} toneMapped={false} />
          </lineSegments>
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[x0 + W / 2, 0, z0 - D / 2]}
            onPointerMove={(e) => {
              e.stopPropagation()
              hover(blockAt(e.point))
            }}
            onPointerOut={() => hover(null)}
            onClick={(e) => {
              if (e.delta > 4) return
              const b = blockAt(e.point)
              if (b) onPick({ kind: 'block', ...b })
            }}
          >
            <planeGeometry args={[W, D]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
          <mesh ref={hoverTile} visible={false} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast}>
            <planeGeometry args={[BLOCK, BLOCK]} />
            <meshBasicMaterial color={pal.ink} transparent opacity={0.1} depthWrite={false} toneMapped={false} />
          </mesh>
          {picked && (
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={centre(picked)} raycast={noRaycast}>
              <planeGeometry args={[BLOCK, BLOCK]} />
              <meshBasicMaterial color={pal.ink} transparent opacity={0.22} depthWrite={false} toneMapped={false} />
            </mesh>
          )}
        </>
      )}
    </>
  )
}

/** A thin frame around the one picked nuclide's column. */
function Frame({ r, pal }: { r: KnowledgeRow; pal: Palette }) {
  const h = r.evaluated ? heightOf(r.levels) : 0.2
  const geom = React.useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(1.3, h + 0.6, 1.3).translate(0, (h + 0.6) / 2 - 0.1, 0)), [h])
  React.useEffect(() => () => geom.dispose(), [geom])
  return (
    <lineSegments geometry={geom} position={[worldX(r.n), 0, worldZ(r.z)]} raycast={noRaycast}>
      <lineBasicMaterial color={pal.ink} toneMapped={false} />
    </lineSegments>
  )
}

const fmt = (v: number) => v.toLocaleString('en')
const blockName = (b: Block) => `N ${b.bn * BLOCK}–${b.bn * BLOCK + BLOCK - 1} · Z ${b.bz * BLOCK}–${b.bz * BLOCK + BLOCK - 1}`

export default function Knowledge3dScene() {
  const box = React.useRef<HTMLDivElement>(null)
  const theme = useTheme(box)
  const cross = useCrossRules()
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
  /** Row indices by block, for the hover count and the list. */
  const byBlock = React.useMemo(() => {
    const out = new Map<string, number[]>()
    rows?.forEach((r, i) => {
      const k = `${Math.floor(r.n / BLOCK)},${Math.floor(r.z / BLOCK)}`
      const list = out.get(k) ?? []
      list.push(i)
      out.set(k, list)
    })
    return out
  }, [rows])
  const pal = React.useMemo(() => palette(theme.dark, theme.paper, theme.ink), [theme])
  const [grid, setGrid] = React.useState(false)
  const [pick, setPick] = React.useState<Pick | null>(null)
  const [hover, setHover] = React.useState<number | null>(null)
  const [hoverBlock, setHoverBlock] = React.useState<Block | null>(null)
  const onHover = React.useCallback((i: number | null) => setHover((h) => (h === i ? h : i)), [])
  const onPick = React.useCallback((p: Pick) => setPick(p), [])

  const stops = theme.dark ? AGE_STOPS.dark : AGE_STOPS.light
  const listed = React.useMemo(() => {
    if (!rows || !pick) return []
    const idx = pick.kind === 'one' ? [pick.i] : byBlock.get(`${pick.bn},${pick.bz}`) ?? []
    return idx.map((i) => rows[i]).sort((a, b) => a.z - b.z || a.n - b.n)
  }, [rows, pick, byBlock])
  const hovered = rows && hover !== null && !grid ? rows[hover] : null
  const one = rows && pick?.kind === 'one' ? rows[pick.i] : null
  const pickedBlock = pick?.kind === 'block' ? { bn: pick.bn, bz: pick.bz } : null

  return (
    <div ref={box} className="relative min-h-0 flex-1 overflow-hidden rounded-xl" style={SANS}>
      {rows && split ? (
        <Canvas flat dpr={[1, 2]} camera={{ position: [0, 150, 150], fov: 42, near: 1, far: 3000 }} {...cross}>
          <color attach="background" args={[pal.bg]} />
          {/* Physical light units (three r155+): about π lights a face at its own colour. */}
          <ambientLight intensity={1.8} />
          <directionalLight position={[80, 160, 60]} intensity={1.6} />
          <Columns rows={rows} evaluated={split.evaluated} never={split.never} pal={pal} grid={grid} onHover={onHover} onPick={onPick} />
          <Floor pal={pal} grid={grid} picked={pickedBlock} onBlockHover={setHoverBlock} onPick={onPick} />
          {one && <Frame r={one} pal={pal} />}
          <SpinControls makeDefault target={[0, 8, 0]} enableDamping dampingFactor={0.08} minDistance={25} maxDistance={700} maxPolarAngle={Math.PI / 2 - 0.03} />
        </Canvas>
      ) : (
        <div className="flex h-full items-center justify-center text-[13px] text-[var(--paper-muted)]">
          {failed ? 'The knowledge data didn’t load.' : 'Loading 7,986 nuclides…'}
        </div>
      )}

      {/* What the axes and colours are, and the grid's switch. */}
      <div className="absolute left-4 top-4 flex w-[230px] flex-col gap-2 rounded-xl border border-[var(--paper-rule)]/15 bg-[var(--paper)]/85 px-3 py-2.5 text-[11px] text-[var(--paper-text)] backdrop-blur-sm">
        <span className="text-[10px] text-[var(--paper-faint)]" style={MONO}>
          x neutrons N · depth protons Z
          <br />
          height adopted levels, log scale
        </span>
        <span>Years since evaluation</span>
        <span className="h-2 w-full rounded-full" style={{ background: `linear-gradient(to right, ${stops.join(', ')})` }} />
        <span className="-mt-1 flex justify-between text-[10px] text-[var(--paper-faint)]" style={MONO}>
          <span>0</span>
          <span>15</span>
          <span>{AGE_MAX}+</span>
        </span>
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: theme.dark ? NEVER.dark : NEVER.light }} />
          Studied, never evaluated
        </span>
        <button
          type="button"
          aria-pressed={grid}
          onClick={() => {
            setGrid((g) => !g)
            setHoverBlock(null)
            setPick((p) => (p?.kind === 'block' ? null : p))
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

      {/* Under the pointer */}
      {(hovered || (grid && hoverBlock)) && !pick && (
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
                {blockName(hoverBlock)} · {fmt(byBlock.get(`${hoverBlock.bn},${hoverBlock.bz}`)?.length ?? 0)} nuclides
              </span>
            )
          )}
        </div>
      )}

      {/* The picked block's nuclides, or the one picked nuclide */}
      {pick && (
        <aside className="absolute bottom-4 right-4 top-16 flex w-[320px] max-w-[48%] flex-col overflow-hidden rounded-xl border border-[var(--paper-rule)]/15 bg-[var(--paper)]/95 text-[var(--paper-text)] backdrop-blur-sm">
          <div className="flex items-start justify-between gap-3 px-4 pb-2 pt-3">
            <div>
              <div className="text-[18px] leading-tight" style={{ fontFamily: 'var(--font-display), Georgia, serif' }}>
                {pick.kind === 'block' ? blockName(pick) : one ? knowledgeName(one) : ''}
              </div>
              <div className="mt-1 text-[11px] text-[var(--paper-muted)]" style={MONO}>
                {pick.kind === 'block' ? `${fmt(listed.length)} nuclides` : one ? `Z ${one.z} · N ${one.n}` : ''}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setPick(null)}
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
    </div>
  )
}
