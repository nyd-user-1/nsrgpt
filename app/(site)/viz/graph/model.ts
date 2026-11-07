// The force graph's data beyond decay.json (2026-11-05): the precomputed layout (scripts/viz-graph-layout.mjs →
// public/viz-data/graph-layout.json) and the decay chains a hover lights. Both are worked out once per page.
// 2026-11-06: the 3D layout (scripts/viz-graph-layout-3d.mjs → graph-layout-3d.json), the chains of several pinned
// nuclides at once, and each edge's flow timing.

import { decayLinks, keyOf, stepPeriod, type Decay, type Link } from '@/lib/viz-physics'

type LayoutFile = { source: string; k: number[]; x: number[]; y: number[] }

let layoutPromise: Promise<LayoutFile> | null = null
/** One request per page; a failed fetch is dropped so the next mount retries. */
export function loadGraphLayout(): Promise<LayoutFile> {
  if (!layoutPromise) {
    layoutPromise = fetch('/viz-data/graph-layout.json').then((r) => {
      if (!r.ok) throw new Error(`/viz-data/graph-layout.json: ${r.status}`)
      return r.json() as Promise<LayoutFile>
    })
    layoutPromise.catch(() => (layoutPromise = null))
  }
  return layoutPromise
}

type Layout3dFile = { source: string; k: number[]; x: number[]; y: number[]; z: number[] }

let layout3dPromise: Promise<Layout3dFile> | null = null
/** The 3D layout, fetched when the 3D switch first turns on. */
export function loadGraphLayout3d(): Promise<Layout3dFile> {
  if (!layout3dPromise) {
    layout3dPromise = fetch('/viz-data/graph-layout-3d.json').then((r) => {
      if (!r.ok) throw new Error(`/viz-data/graph-layout-3d.json: ${r.status}`)
      return r.json() as Promise<Layout3dFile>
    })
    layout3dPromise.catch(() => (layout3dPromise = null))
  }
  return layout3dPromise
}

/** Each node's 3D position, in decay.json's order; a nuclide the 3D layout hasn't placed stays at its 2D place. */
export function positions3d(decay: Decay, m: GraphModel, layout: Layout3dFile): [number, number, number][] {
  const at = new Map(layout.k.map((k, i) => [k, i]))
  return decay.nuclides.map((x, i): [number, number, number] => {
    const j = at.get(keyOf(x.z, x.n))
    return j === undefined ? [m.xy[i][0], m.xy[i][1], 0] : [layout.x[j], layout.y[j], layout.z[j]]
  })
}

/** Pins a node's chain; `add` keeps the others (every click, 2026-11-06), a null node clears them. */
export type Pin = (node: number | null, add: boolean) => void


/** A node's mark size, px at the graph's own zoom: the stable ends of long chains grow. */
export const sizeOf = (fed: number) => Math.min(9, 2 + Math.sqrt(fed) * 1.6)

export type GraphModel = {
  links: Link[]
  /** Each node's position, in decay.json's order. */
  xy: [number, number][]
  /** Daughters and parents by node. */
  down: number[][]
  up: number[][]
  /** How many links feed each node: the stable ends of long chains grow. */
  fed: number[]
  /** Each link's flow: seconds a light takes to cross it (its parent's half-life, as the flow lines time it), and
   *  where in that crossing it starts, so the lights don't move in step. */
  period: number[]
  phase: number[]
}

export function graphModel(decay: Decay, layout: LayoutFile): GraphModel {
  const at = new Map(layout.k.map((k, i) => [k, i]))
  // A nuclide the layout hasn't placed yet sits where the layout began: its place on the chart of nuclides.
  const xy = decay.nuclides.map((x): [number, number] => {
    const i = at.get(keyOf(x.z, x.n))
    return i === undefined ? [(x.n - 90) * 4, (59 - x.z) * 4] : [layout.x[i], layout.y[i]]
  })
  const links = decayLinks(decay)
  const down: number[][] = decay.nuclides.map(() => [])
  const up: number[][] = decay.nuclides.map(() => [])
  const fed = decay.nuclides.map(() => 0)
  for (const l of links) {
    down[l.from].push(l.to)
    up[l.to].push(l.from)
    fed[l.to]++
  }
  const period = links.map((l) => stepPeriod(decay.nuclides[l.from].t))
  const phase = links.map((_, i) => {
    const t = Math.sin(i * 12.9898 + 78.233) * 43758.5453
    return t - Math.floor(t)
  })
  return { links, xy, down, up, fed, period, phase }
}

/** The chains of several nodes together: the hovered one and the pinned ones. */
export function chainsOf(m: GraphModel, nodes: Iterable<number>, cache: Map<number, Set<number>>): Set<number> {
  const out = new Set<number>()
  for (const n of nodes) for (const j of chainOf(m, n, cache)) out.add(j)
  return out
}

/** A node's decay chain: every nuclide it decays into, onward, and every one that decays into it, back. */
export function chainOf(m: GraphModel, node: number, cache: Map<number, Set<number>>): Set<number> {
  const hit = cache.get(node)
  if (hit) return hit
  const out = new Set<number>([node])
  // Each direction walks on its own, so a nuclide reached going down doesn't stop the walk going up.
  for (const next of [m.down, m.up]) {
    const seen = new Set<number>([node])
    const queue = [node]
    while (queue.length) {
      for (const j of next[queue.pop() as number]) {
        if (!seen.has(j)) {
          seen.add(j)
          out.add(j)
          queue.push(j)
        }
      }
    }
  }
  cache.set(node, out)
  return out
}
