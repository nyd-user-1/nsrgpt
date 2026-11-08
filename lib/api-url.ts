// The cached API (2026-11-08): Lambda nsr-api behind API Gateway and CloudFront, reading the serving tables in the lake
// (services/nsr-api/README.md lists every route). One address, the same on dev and production, so a page never
// behaves differently in a demo. Routes: /exfor/search, /exfor/subentry/{id}, /exfor/pickers/{name}, /nuclide/{name},
// /nuclide/{name}/levels, /nuclide/{name}/gammas, /endf/materials, /endf/xs, /endf/mt, /search, /suggest, /nsr/{key}.

export const API_BASE = "https://daw1qggkn69lv.cloudfront.net"

/** One API address: apiUrl('/search?q=U-235'). */
export const apiUrl = (path: string) => `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`

/** A hit from GET /search: what it is, which record, and the API path that returns it. */
export type SearchHit = { type: string; id: string; name: string; title: string; score: number; url_path: string }
export type SearchResponse = { q: string; hits: SearchHit[]; total: number; took_ms: number }

/** GET /search over every parsed dataset (lib/use-data.ts's cache is for chart files; this is a live query, so plain fetch). */
export async function searchLake(q: string, limit = 25, type?: string): Promise<SearchResponse> {
  const r = await fetch(apiUrl(`/search?q=${encodeURIComponent(q)}&limit=${limit}${type ? `&type=${encodeURIComponent(type)}` : ""}`))
  if (!r.ok) throw new Error(`search: ${r.status}`)
  return r.json()
}
