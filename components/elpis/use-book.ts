"use client"
// /elpis/book (brief 69): the book page's data, client-side as the Lab fetches (lib/api-url.ts, straight to the API).
//   useBookIndex(p)  public/elpis/book-<p>.json (scripts/elpis/book-index.mjs), once a session.
//   useBookData(...) /endf/xs with compare= every release the index says holds (material, sublibrary, MT), six releases a
//                    call, the calls at once (46 releases in one call outran the gateway's 30 s on a cold Lambda), and
//                    /exfor/points for the same target and reaction, quantity SIG. The points route stops at 50,000
//                    points (sorted by dataset, so the later datasets would go missing): a truncated answer is fetched
//                    again in eight energy windows, each with its own 50,000.
// The Lab's unit rule (lib/lab/canvases/compare.ts offDatasets): a dataset in other units than barns (σ√E "B*RT-EV",
// "ARB-UNITS") or a ratio of reactions is listed, not drawn. Only quantity ",SIG" is drawn: "PAR,SIG" is a partial cross
// section (one level, one outgoing particle), not the MT's.
import { useEffect, useState } from "react"
import { apiUrl } from "@/lib/api-url"
import type { BookIndex } from "@/lib/elpis"

const indexes = new Map<string, Promise<BookIndex | null>>()

/** The book index for a projectile: undefined while loading, null when the file is missing. */
export function useBookIndex(p: string): BookIndex | null | undefined {
  const [idx, setIdx] = useState<BookIndex | null | undefined>(undefined)
  useEffect(() => {
    let live = true
    if (!indexes.has(p)) indexes.set(p, fetch(`/elpis/book-${p}.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null))
    indexes.get(p)!.then((v) => { if (live) setIdx(v) })
    return () => { live = false }
  }, [p])
  return idx
}

export type BookLine = { release: string; x: number[]; y: number[]; served?: string; note?: string | null; n: number; qi?: number | null; qm?: number | null; a?: number }
export type BookSet = { id: string; entry?: string; author?: string; year?: number | string; x: number[]; y: number[]; dy: (number | null)[] }
export type BookOff = { id: string; author?: string; year?: number | string; why: string }
export type BookData = { lines: BookLine[]; sets: BookSet[]; off: BookOff[]; truncated: boolean; reaction: string | null; errors: string[] }

type XsSeries = { release: string; held: boolean; release_served?: string | null; energy_ev?: number[]; xs_barn?: number[]; note?: string | null; qi?: number | null; qm?: number | null; a?: number }
type Ds = { dataset_id: string; entry?: string; author?: string; year?: number | string; quantity?: string; units?: string | null; n?: number; excluded?: string | null }
type Pt = { dataset_id: string; e_ev: number; xs_b: number; dxs_b?: number | null }
type Points = { datasets: Ds[]; points: Pt[]; truncated?: boolean; error?: string }

const cache = new Map<string, Promise<BookData>>()

async function getJson<T>(path: string): Promise<{ ok: boolean; status: number; body: T }> {
  const r = await fetch(apiUrl(path))
  return { ok: r.ok, status: r.status, body: (await r.json().catch(() => ({}))) as T }
}

const q = (o: Record<string, string | number | undefined>) =>
  new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v)])).toString()

async function points(target: string, reaction: string): Promise<{ ds: Map<string, Ds>; pts: Pt[]; truncated: boolean; error?: string }> {
  const base = { target, reaction, quantity: "SIG", limit: 50000 }
  const first = await getJson<Points>(`/exfor/points?${q(base)}`)
  if (!first.ok || !Array.isArray(first.body.datasets)) return { ds: new Map(), pts: [], truncated: false, error: first.body.error ? `EXFOR: ${first.body.error}` : `EXFOR answered ${first.status}` }
  if (!first.body.truncated) return { ds: new Map(first.body.datasets.map((d) => [d.dataset_id, d])), pts: first.body.points ?? [], truncated: false }
  // Eight windows, 10 µeV to 1 GeV in equal log steps, each window's lower edge open so no point comes twice. The route
  // returns points in dataset order and stops at 50,000, so a window it stops in drops the later datasets whole (U-235
  // (n,f) lost 23453.016, 40070.039.1, 40156.004, 40218.002 and 40588.003 that way): such a window is asked again as
  // four, down three levels. Two requests at a time: more can meet the API's throttle.
  const span = (lo: number, hi: number, first: boolean, depth: number) => ({ lo, hi, first, depth })
  const queue = Array.from({ length: 8 }, (_, i) => span(10 ** (-5 + (14 * i) / 8), 10 ** (-5 + (14 * (i + 1)) / 8), i === 0, 0))
  const parts: { ok: boolean; status: number; body: Points }[] = []
  while (queue.length) {
    const batch = queue.splice(0, 2)
    const got = await Promise.all(batch.map((w) => getJson<Points>(`/exfor/points?${q({ ...base, emin: w.first ? 0 : w.lo * (1 + 1e-12), emax: w.hi })}`).catch(() => ({ ok: false, status: 0, body: {} as Points }))))
    got.forEach((g, i) => {
      const w = batch[i]
      if (g.ok && g.body.truncated && w.depth < 3) {
        const step = Math.log(w.hi / w.lo) / 4
        for (let k = 0; k < 4; k++) queue.push(span(w.lo * Math.exp(step * k), w.lo * Math.exp(step * (k + 1)), w.first && k === 0, w.depth + 1))
        return
      }
      parts.push(g)
    })
  }
  const ds = new Map<string, Ds>(first.body.datasets.map((d) => [d.dataset_id, { ...d, n: 0 }]))
  const pts: Pt[] = []
  let truncated = false
  for (const p of parts) {
    if (!p.ok || !Array.isArray(p.body.datasets)) { truncated = true; continue }
    truncated ||= !!p.body.truncated
    for (const d of p.body.datasets) {
      const had = ds.get(d.dataset_id)
      ds.set(d.dataset_id, { ...(had ?? d), units: had?.units ?? d.units, n: (had?.n ?? 0) + (d.n ?? 0) })
    }
    for (const pt of p.body.points ?? []) pts.push(pt)
  }
  return { ds, pts, truncated }
}

/** Every line and point set for one book page; the same arguments share one fetch for the session. */
export function loadBook(o: { name: string; sub: string; mt: number; releases: string[]; target: string; reaction: string | null; /** K; 0 is the POINT files' 0 K, the API's default */ temp?: number }): Promise<BookData> {
  const key = JSON.stringify(o)
  if (!cache.has(key)) cache.set(key, (async () => {
    const errors: string[] = []
    const chunks: string[][] = []
    for (let i = 0; i < o.releases.length; i += 6) chunks.push(o.releases.slice(i, i + 6))
    type Xs = { ok: boolean; status: number; body: { series?: XsSeries[]; error?: string } }
    const xsOnce = (c: string[]): Promise<Xs> =>
      getJson<{ series?: XsSeries[]; error?: string }>(`/endf/xs?${q({ name: o.name, mt: o.mt, sub: o.sub === "neutrons" ? undefined : o.sub, release: c[0], compare: c.slice(1).join(","), temp: o.temp ? `${o.temp}K` : undefined })}`)
        .catch((e) => ({ ok: false, status: 0, body: { error: e instanceof Error ? e.message : String(e) } }))
    // A chunk that fails (a cold Lambda loading a release's table, or an answer past Lambda's 6 MB: four dosimetry
    // libraries of 46,000 points each) is asked again one release a call.
    const xsP = Promise.all(chunks.map(async (c) => {
      const first = await xsOnce(c)
      return first.ok || first.status === 404 || (first.status >= 400 && first.status < 500) ? [first] : Promise.all(c.map((r) => xsOnce([r])))
    })).then((x) => x.flat())
    // EXFOR's trouble is reported beside the lines, never in their place.
    const exP = o.reaction ? points(o.target, o.reaction).catch((e) => ({ ds: new Map<string, Ds>(), pts: [] as Pt[], truncated: false, error: `EXFOR: ${e instanceof Error ? e.message : String(e)}` })) : Promise.resolve(null)
    const [xs, ex] = await Promise.all([xsP, exP])
    const lines: BookLine[] = []
    for (const x of xs) if (!x.ok && x.status !== 404) errors.push(x.body.error ? `ENDF: ${x.body.error}` : `ENDF answered ${x.status}`)
    for (const s of xs.flatMap((x) => x.body.series ?? [])) {
      if (!s.held || !s.energy_ev?.length || !s.xs_barn?.length) continue
      lines.push({ release: s.release, x: s.energy_ev, y: s.xs_barn, served: s.release_served ?? undefined, note: s.note, n: s.energy_ev.length, qi: s.qi, qm: s.qm, a: s.a })
    }
    const sets: BookSet[] = []
    const off: BookOff[] = []
    if (ex?.error) errors.push(ex.error)
    if (ex) {
      const byId = new Map<string, Pt[]>()
      for (const p of ex.pts) {
        if (!byId.has(p.dataset_id)) byId.set(p.dataset_id, [])
        byId.get(p.dataset_id)!.push(p)
      }
      for (const d of [...ex.ds.values()].sort((a, b) => a.dataset_id.localeCompare(b.dataset_id))) {
        const pts = byId.get(d.dataset_id) ?? []
        const why = d.excluded ? "a ratio or combination of reactions"
          : (d.quantity ?? ",SIG") !== ",SIG" ? `${d.quantity}: a partial cross section`
          : d.units && d.units !== "B" ? `in ${d.units}, not barns`
          : !pts.length ? (ex.truncated ? "past the 50,000 points a request returns" : "no points served") : ""
        if (why) { off.push({ id: d.dataset_id, author: d.author, year: d.year, why }); continue }
        sets.push({ id: d.dataset_id, entry: d.entry, author: d.author, year: d.year, x: pts.map((p) => p.e_ev), y: pts.map((p) => p.xs_b), dy: pts.map((p) => p.dxs_b ?? null) })
      }
    }
    return { lines, sets, off, truncated: !!ex?.truncated, reaction: o.reaction, errors }
  })().catch((e) => { cache.delete(key); throw e }))
  return cache.get(key)!
}

/** The page's data: undefined while it loads. */
export function useBookData(o: Parameters<typeof loadBook>[0] | null): BookData | undefined {
  const [data, setData] = useState<BookData | undefined>(undefined)
  const key = o ? JSON.stringify(o) : ""
  useEffect(() => {
    let live = true
    setData(undefined)
    if (!o) return
    loadBook(o).then((d) => { if (live) setData(d) }).catch((e) => { if (live) setData({ lines: [], sets: [], off: [], truncated: false, reaction: o.reaction, errors: [String(e?.message ?? e)] }) })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return data
}

/** Where each release's File 3 is only the background in the neutron book: { label: { release: [el_ev, eh_ev, lrf] } }
 *  (public/elpis/res-ranges-n.json, scripts/elpis/res-ranges.mjs). */
export type ResRanges = Record<string, Record<string, [number, number, number]>>
let rangesLoad: Promise<ResRanges | null> | undefined
export function useResRanges(on: boolean): ResRanges | null {
  const [r, setR] = useState<ResRanges | null>(null)
  useEffect(() => {
    if (!on) return
    rangesLoad ??= fetch("/elpis/res-ranges-n.json").then((x) => (x.ok ? x.json() : null)).then((j) => j?.ranges ?? null).catch(() => null)
    let live = true
    rangesLoad.then((v) => { if (live) setR(v) })
    return () => { live = false }
  }, [on])
  return r
}
