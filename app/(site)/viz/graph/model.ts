// The force graph's data beyond decay.json (2026-11-05): the precomputed layout (scripts/viz-graph-layout.mjs →
// public/viz-data/graph-layout.json) and the decay chains a hover lights. Both are worked out once per page.

import { decayLinks, keyOf, type Decay, type Link } from '@/lib/viz-physics'

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

export type GraphModel = {
  links: Link[]
  /** Each node's position, in decay.json's order. */
  xy: [number, number][]
  /** Daughters and parents by node. */
  down: number[][]
  up: number[][]
  /** How many links feed each node: the stable ends of long chains grow. */
  fed: number[]
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
  return { links, xy, down, up, fed }
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
