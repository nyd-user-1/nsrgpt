import { apiUrl } from "@/lib/api-url"
import type { LabPair } from "@/lib/sweep"

// The medical-isotope routes (brief 57, Part D; worker-3's GET /sweep/medical and /sweep/medical/{route}), read by
// /sweep/medical and /sweep/medical/[route] (brief 58, Part D). The normalisers take the routes as they answer
// (2026-11-10): a row per route with yield_<release> and sd_<release> (MF33 relative sd, a fraction), the data's yield
// and spread, the spread across evaluations, the verdict and its detail; a route's yields per source (the six releases,
// IAEA, EXFOR), its bins, and its series (EXFOR points with a dataset per point, the IAEA curve, each evaluation). The
// Lab pair is built from the target, the projectile and process, the MT and the sublibrary. Until a route answers, the
// sample below stands in with `sample: true` and the page says so; it is invented to fill the layout, not measured.

export const RELEASES = ["B-VIII.1", "B-VIII.0", "JEFF-3.3", "JENDL-5", "TENDL-2023", "CENDL-3.2"]
const KEY = (r: string) => r.toLowerCase().replace(/[^a-z0-9]+/g, "_")

export type Yield = { source: string; held: boolean; value: number | null; rel_sd: number | null; unit: string; from: string; note: string }
export type MedRoute = {
  route: string
  product: string
  target: string
  projectile: string
  process: string
  mt: number | null
  sublibrary: string
  label: string
  irradiation: string
  chain: string
  assumptions: string
  note: string
  unit: string
  yields: Yield[]
  iaea_yield: number | null
  iaea: string
  data_yield: number | null
  data_spread_pct: number | null
  spread_pct: number | null
  verdict: string
  verdict_detail: string
  agree: boolean | null
  decay_only: boolean
  product_half_life_s: number | null
  parent_half_life_s: number | null
  stopping_check: number | null
}
export type MedList = { routes: MedRoute[]; sample?: boolean }
export type MedPoint = { e_ev: number; xs_b: number; dataset?: string }
export type MedSeries = { source: string; kind: "exfor" | "evaluation" | "iaea"; label: string; points: MedPoint[] }
export type MedDetail = { route: MedRoute; yields: Yield[]; series: MedSeries[]; lab: LabPair | null; sample?: boolean }

type Obj = Record<string, unknown>
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {})
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const num = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null)
const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v))

const AGREE = "evaluations agree within the data"
const DISAGREE = "evaluations disagree beyond the data's spread"

function route(v: unknown): MedRoute {
  const o = obj(v)
  const verdict = str(o.verdict)
  const projectile = str(o.projectile)
  const process = str(o.process)
  const target = str(o.target)
  const unit = str(o.yield_unit)
  const decay = str(o.irradiation) === "generator" || /^decay only/.test(verdict)
  return {
    route: str(o.route ?? o.id),
    product: str(o.product),
    target,
    projectile,
    process,
    mt: num(o.mt),
    sublibrary: str(o.sublibrary),
    label: decay ? `${str(o.product)} generator` : `${target}(${projectile.toLowerCase()},${process.toLowerCase()})`,
    irradiation: str(o.irradiation),
    chain: str(o.chain),
    assumptions: str(o.assumptions),
    note: str(o.note),
    unit,
    // The row's yields, one per release, from yield_<release> and sd_<release>.
    yields: RELEASES.map((source) => {
      const value = num(o[`yield_${KEY(source)}`])
      return { source, held: value !== null, value, rel_sd: num(o[`sd_${KEY(source)}`]), unit, from: "", note: "" }
    }),
    iaea_yield: num(o.iaea_yield),
    iaea: str(o.iaea),
    data_yield: num(o.data_yield),
    data_spread_pct: num(o.data_spread_pct),
    spread_pct: num(o.eval_spread_pct ?? o.spread_pct),
    verdict,
    verdict_detail: str(o.verdict_detail),
    agree: verdict === AGREE ? true : verdict === DISAGREE ? false : null,
    decay_only: decay,
    product_half_life_s: num(o.product_half_life_s),
    parent_half_life_s: num(o.parent_half_life_s),
    stopping_check: num(o.stopping_check),
  }
}

async function get(path: string): Promise<unknown | null> {
  try {
    const r = await fetch(apiUrl(path))
    if (!r.ok) return null
    return await r.json()
  } catch {
    return null
  }
}

export async function fetchMedical(): Promise<MedList> {
  const j = await get("/sweep/medical")
  if (!j) return { ...SAMPLE_MED, sample: true }
  const o = obj(j)
  return { routes: (Array.isArray(j) ? j : arr(o.rows ?? o.routes)).map(route) }
}

export async function fetchRoute(id: string): Promise<MedDetail> {
  const j = await get(`/sweep/medical/${encodeURIComponent(id)}`)
  if (!j) return { ...SAMPLE_DETAIL, route: { ...SAMPLE_DETAIL.route, route: id }, sample: true }
  const o = obj(j)
  const r = route(o.route ?? o)
  const yields: Yield[] = arr(o.yields).map((y) => {
    const x = obj(y)
    return { source: str(x.source), held: x.held !== false && num(x.yield) !== null, value: num(x.yield), rel_sd: num(x.rel_sd_mf33), unit: str(x.unit), from: str(x.from), note: str(x.note) }
  })
  // EXFOR comes as one series with a dataset per point; the chart keeps it one series, each point naming its dataset.
  const series: MedSeries[] = arr(o.series).map((s) => {
    const x = obj(s)
    const source = str(x.source)
    const kind: MedSeries["kind"] = /^EXFOR/i.test(source) ? "exfor" : /^IAEA/i.test(source) ? "iaea" : "evaluation"
    const e = arr(x.e_ev)
    const xs = arr(x.xs_b)
    const ds = arr(x.dataset)
    const points = e.map((v, i) => ({ e_ev: Number(v), xs_b: Number(xs[i]), ...(ds[i] !== undefined ? { dataset: str(ds[i]) } : {}) })).filter((p) => Number.isFinite(p.e_ev) && Number.isFinite(p.xs_b) && p.e_ev > 0 && p.xs_b > 0)
    return { source, kind, label: kind === "iaea" ? "IAEA recommended" : source, points }
  }).filter((s) => s.points.length)
  // The Lab pair: the route's reaction as EXFOR writes it, its MT and sublibrary, over the EXFOR points' span.
  const ex = series.filter((s) => s.kind === "exfor").flatMap((s) => s.points.map((p) => p.e_ev))
  const held = yields.filter((y) => y.held && RELEASES.includes(y.source)).map((y) => y.source)
  const lab: LabPair | null =
    r.target && r.projectile && r.process && r.mt
      ? { target: r.target, reaction: `${r.projectile.toUpperCase()},${r.process.toUpperCase()}`, mt: r.mt, emin: ex.length ? Math.min(...ex) : undefined, emax: ex.length ? Math.max(...ex) : undefined, releases: held.length ? held : ["B-VIII.1"] }
      : null
  return { route: r, yields, series, lab }
}

/** A half-life in seconds as a reader reads it. */
export function halfLifeText(s: number | null): string {
  if (s === null || !Number.isFinite(s)) return "—"
  const units: [number, string][] = [[3.15576e7, "y"], [86400, "d"], [3600, "h"], [60, "min"], [1, "s"]]
  for (const [k, u] of units) if (s >= k) return `${+(s / k).toPrecision(3)} ${u}`
  return `${+s.toPrecision(3)} s`
}

// ── The sample ─────────────────────────────────────────────────────────────────────────────────────────────────

const sampleRoute = (id: string, product: string, target: string, projectile: string, process: string, mt: number, irradiation: string, base: number, spread: number, agree: boolean): MedRoute => ({
  route: id,
  product,
  target,
  projectile,
  process,
  mt,
  sublibrary: "protons",
  label: `${target}(${projectile},${process})`,
  irradiation,
  chain: "",
  assumptions: "",
  note: "",
  unit: "MBq/µAh",
  yields: RELEASES.map((source, i) => ({ source, held: i % 2 === 0, value: i % 2 === 0 ? base * (1 + (spread * (i - 2)) / 4) : null, rel_sd: 0.1, unit: "MBq/µAh", from: "", note: "" })),
  iaea_yield: base,
  iaea: "held",
  data_yield: base * 1.02,
  data_spread_pct: 6,
  spread_pct: spread * 100,
  verdict: agree ? AGREE : DISAGREE,
  verdict_detail: "",
  agree,
  decay_only: false,
  product_half_life_s: null,
  parent_half_life_s: null,
  stopping_check: null,
})

export const SAMPLE_MED: MedList = {
  routes: [
    sampleRoute("ac225-ra226-p2n", "Ac-225", "Ra-226", "p", "2n", 16, "cyclotron", 1.8, 0.42, false),
    sampleRoute("cu67-zn70-pa", "Cu-67", "Zn-70", "p", "a", 107, "cyclotron", 3.1, 0.09, true),
  ],
}

export const SAMPLE_DETAIL: MedDetail = {
  route: SAMPLE_MED.routes[0],
  yields: SAMPLE_MED.routes[0].yields,
  series: [],
  lab: null,
}
