'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { GNode } from './GraphPage'

// What the entity search offers (brief 36, Part 5, 2026-11-09), lifted out of GraphPage.tsx so the app header's search and
// /graph share it without the header loading the canvas: the baked-in most-studied entities, the corpus catalog's top
// lists (public/data/catalog.json), the node key, and where a pick goes.

export type Entity = GNode & { code?: string }

export const keyOf = (n: { type: string; id: string }) => `${n.type}:${n.id}`

export interface CatalogItem { id: string; label: string; title?: string; pub_year?: number; citation_count?: number; papers?: number; z?: number; n?: number }
export interface Catalog {
  counts: Record<string, number>
  top: Record<string, CatalogItem[]>
}

const TYPE_OF: Record<string, GNode['type']> = { papers: 'paper', authors: 'author', nuclides: 'nuclide', reactions: 'reaction', exfor: 'exfor' }

/** A catalog row as a graph node. */
export const toGNode = (typeKey: string, it: CatalogItem): GNode => {
  const t = TYPE_OF[typeKey]
  return {
    type: t, id: it.id, label: it.label,
    title: t === 'paper' ? it.title : undefined,
    sub: t === 'paper'
      ? `${it.pub_year ?? ''}${it.citation_count ? ` · ${Number(it.citation_count).toLocaleString()} cites` : ''}`
      : t === 'nuclide'
        ? `Z=${it.z} N=${it.n}`
        : t === 'reaction' ? 'reaction' : `${Number(it.papers ?? 0).toLocaleString()} papers`,
  }
}

/** The most-studied entities, baked in so the list opens at once on focus, before any network. */
export const STARTER: Entity[] = [
  { type: 'nuclide', id: '12C', label: '12C', sub: 'Z=6 N=6 · 24,646 papers' },
  { type: 'nuclide', id: '208PB', label: '208Pb', sub: 'Z=82 N=126 · 18,920 papers' },
  { type: 'nuclide', id: '1H', label: '1H', sub: 'Z=1 N=0 · 17,181 papers' },
  { type: 'nuclide', id: '16O', label: '16O', sub: 'Z=8 N=8 · 14,285 papers' },
  { type: 'nuclide', id: '40CA', label: '40Ca', sub: 'Z=20 N=20 · 13,025 papers' },
  { type: 'reaction', id: '(N,G)', label: '(N,G)', sub: '7,723 papers' },
  { type: 'reaction', id: '(P,P)', label: '(P,P)', sub: '5,861 papers' },
  { type: 'reaction', id: '(N,F)', label: '(N,F)', sub: '5,547 papers' },
  { type: 'author', id: '33137', label: 'R.V.JANSSENS', sub: '1,198 papers' },
  { type: 'author', id: '10834', label: 'M.P.CARPENTER', sub: '1,020 papers' },
  { type: 'author', id: '9239', label: 'B.A.BROWN', sub: '942 papers' },
  { type: 'paper', id: '2011CH57', label: '2011CH57', title: 'ENDF/B-VII.1 Nuclear Data for Science and Technology: Cross Sections, Covariances, Fission Product Yields and Decay Data', sub: '2011 · 2,767 cites' },
  { type: 'paper', id: '1971JA07', label: '1971JA07', title: 'Precision Measurement of Half-Lives and Specific Activities of $^{235}$U and $^{238}$U', sub: '1971 · 2,648 cites' },
  { type: 'paper', id: '2005AD25', label: '2005AD25', title: 'Formation of dense partonic matter in relativistic nucleus-nucleus collisions at RHIC', sub: '2005 · 2,622 cites' },
]

/** The corpus catalog, one fetch for the tab (react-query key "catalog", which /graph's rail shares). */
export function useCatalog(enabled = true) {
  return useQuery({
    queryKey: ['catalog'],
    queryFn: async (): Promise<Catalog> => {
      const r = await fetch('/data/catalog.json')
      if (!r.ok) throw new Error(String(r.status))
      return r.json()
    },
    staleTime: Infinity,
    enabled,
  })
}

/** The "Most studied" list: the starters, then the catalog's top lists, each entity once. */
export function useMostStudied(enabled = true): Entity[] {
  const catalog = useCatalog(enabled)
  return useMemo(() => {
    const out: Entity[] = [...STARTER]
    const seen = new Set(out.map(keyOf))
    if (catalog.data) {
      for (const key of ['nuclides', 'reactions', 'authors', 'papers', 'exfor']) {
        for (const it of catalog.data.top[key] ?? []) {
          const g = toGNode(key, it)
          if (!seen.has(keyOf(g))) { seen.add(keyOf(g)); out.push(g) }
        }
      }
    }
    return out
  }, [catalog.data])
}

/** A pick on /graph: the canvas centres on it in place (GraphPage listens). Elsewhere the search opens /graph on it. */
export const GRAPH_CENTER = 'nsrgpt:graph-center'
export const graphHref = (g: { type: string; id: string; label: string }) =>
  `/graph?center=${g.type}:${encodeURIComponent(g.id)}&label=${encodeURIComponent(g.label)}`
