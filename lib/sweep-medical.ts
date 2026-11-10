import { apiUrl } from "@/lib/api-url"
import type { LabPair } from "@/lib/sweep"

// The medical-isotope routes (brief 57, Part D; worker-3's GET /sweep/medical and /sweep/medical/{route}), read by
// /sweep/medical and /sweep/medical/[route] (brief 58, Part D). Until a route answers, its call returns the sample below
// with `sample: true` and the page says so. The sample is invented to fill the layout, not measured.

export type Yield = { source: string; value: number | null; sd: number | null; unit: string; method: string }
export type MedRoute = {
  route: string
  product: string
  target: string
  projectile: string
  mt: number | null
  reaction: string
  label: string
  irradiation: string
  yields: Yield[]
  data_yield: number | null
  data_spread: number | null
  spread_pct: number | null
  verdict: string
  agree: boolean | null
  decay_only: boolean
  parent: string | null
  half_life: string | null
}
export type MedList = { routes: MedRoute[]; unit: string; sample?: boolean }
export type MedPoint = { e_ev: number; xs_b: number; dxs_b: number | null }
export type MedSeries = { source: string; kind: "exfor" | "evaluation" | "iaea"; label: string; points: MedPoint[] }
export type MedDetail = { route: MedRoute; series: MedSeries[]; verdict_text: string; chain: string | null; method: string | null; lab: LabPair | null; sample?: boolean }

type Obj = Record<string, unknown>
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {})
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const num = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null)
const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v))

const reactionOf = (projectile: string, mtName: string) => (projectile && mtName ? `${projectile},${mtName}` : mtName || projectile)

function route(v: unknown): MedRoute {
  const o = obj(v)
  const verdict = str(o.verdict)
  const yields = arr(o.yields ?? o.evaluations).map((y) => {
    const x = obj(y)
    return { source: str(x.source ?? x.release ?? x.evaluation), value: num(x.value ?? x.yield), sd: num(x.sd ?? x.uncertainty ?? x.unc), unit: str(x.unit ?? o.unit), method: str(x.method) }
  })
  const reaction = str(o.reaction) || reactionOf(str(o.projectile), str(o.process))
  return {
    route: str(o.route ?? o.id),
    product: str(o.product),
    target: str(o.target),
    projectile: str(o.projectile),
    mt: num(o.mt),
    reaction,
    label: str(o.label) || `${str(o.target)}${reaction ? `(${reaction.toLowerCase()})` : ""}`,
    irradiation: str(o.irradiation),
    yields,
    data_yield: num(o.data_yield),
    data_spread: num(o.data_spread),
    spread_pct: num(o.spread_pct ?? o.spread),
    verdict,
    agree: verdict ? !/disagree/i.test(verdict) : null,
    decay_only: o.decay_only === true || str(o.irradiation) === "decay",
    parent: o.parent ? str(o.parent) : null,
    half_life: o.half_life ? str(o.half_life) : o.parent_half_life ? str(o.parent_half_life) : null,
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
  const rows = Array.isArray(j) ? j : arr(o.routes ?? o.rows)
  return { routes: rows.map(route), unit: str(o.unit) }
}

export async function fetchRoute(id: string): Promise<MedDetail> {
  const j = await get(`/sweep/medical/${encodeURIComponent(id)}`)
  if (!j) return { ...SAMPLE_DETAIL, route: { ...SAMPLE_DETAIL.route, route: id }, sample: true }
  const o = obj(j)
  const r = route(o.route ? o.route : o)
  const series: MedSeries[] = []
  // Points by source: either grouped ({source, kind, points}) or flat rows ({source, e_ev, xs_b, dxs_b}).
  const pts = arr(o.points ?? o.series)
  if (pts.length && Array.isArray(obj(pts[0]).points)) {
    for (const s of pts) {
      const x = obj(s)
      const kind = str(x.kind) as MedSeries["kind"]
      series.push({ source: str(x.source), kind: kind === "evaluation" || kind === "iaea" ? kind : "exfor", label: str(x.label ?? x.source), points: arr(x.points).map(point).filter(ok) })
    }
  } else {
    const by = new Map<string, MedSeries>()
    for (const p of pts) {
      const x = obj(p)
      const source = str(x.source ?? x.dataset)
      const kind: MedSeries["kind"] = /^iaea/i.test(source) ? "iaea" : x.dataset || /^exfor/i.test(source) ? "exfor" : "evaluation"
      const s = by.get(source) ?? { source, kind, label: str(x.label ?? source), points: [] }
      const q = point(x)
      if (ok(q)) s.points.push(q)
      by.set(source, s)
    }
    series.push(...by.values())
  }
  const lab = obj(o.lab)
  return {
    route: r,
    series,
    verdict_text: str(o.verdict_text ?? o.verdict_sentence ?? r.verdict),
    chain: o.chain ? str(typeof o.chain === "object" ? obj(o.chain).text ?? JSON.stringify(o.chain) : o.chain) : null,
    method: o.method ? str(o.method) : null,
    lab: lab.target ? { target: str(lab.target), reaction: str(lab.reaction), mt: Number(lab.mt), emin: num(lab.emin) ?? undefined, emax: num(lab.emax) ?? undefined, releases: arr(lab.releases).map(str) } : null,
  }
}

const point = (v: unknown): MedPoint => {
  const x = obj(v)
  return Array.isArray(v) ? { e_ev: Number(v[0]), xs_b: Number(v[1]), dxs_b: num(v[2]) } : { e_ev: Number(x.e_ev ?? x.e), xs_b: Number(x.xs_b ?? x.xs), dxs_b: num(x.dxs_b ?? x.dxs) }
}
const ok = (p: MedPoint) => Number.isFinite(p.e_ev) && Number.isFinite(p.xs_b) && p.e_ev > 0 && p.xs_b > 0

// ── The sample ─────────────────────────────────────────────────────────────────────────────────────────────────

const yields = (base: number, spread: number): Yield[] =>
  ["B-VIII.1", "JEFF-3.3", "JENDL-5", "TENDL-2023"].map((source, i) => ({ source, value: base * (1 + spread * (i - 1.5) / 3), sd: base * 0.04, unit: "MBq/µAh", method: "thick target" }))

const sampleRoute = (id: string, product: string, target: string, projectile: string, mt: number, reaction: string, irradiation: string, base: number, spread: number, agree: boolean): MedRoute => ({
  route: id,
  product,
  target,
  projectile,
  mt,
  reaction,
  label: `${target}(${reaction.toLowerCase()})`,
  irradiation,
  yields: yields(base, spread),
  data_yield: base * 1.02,
  data_spread: 0.06,
  spread_pct: spread * 100,
  verdict: agree ? "evaluations agree within the data" : "evaluations disagree beyond the data's spread",
  agree,
  decay_only: false,
  parent: null,
  half_life: null,
})

export const SAMPLE_MED: MedList = {
  unit: "MBq/µAh",
  routes: [
    sampleRoute("ac225-ra226-p2n", "Ac-225", "Ra-226", "p", 16, "P,2N", "cyclotron 16–24 MeV", 1.8, 0.42, false),
    sampleRoute("tc99m-mo100-p2n", "Tc-99m", "Mo-100", "p", 16, "P,2N", "cyclotron 15–24 MeV", 520, 0.18, false),
    sampleRoute("cu67-zn70-pa", "Cu-67", "Zn-70", "p", 107, "P,A", "cyclotron 30–45 MeV", 3.1, 0.09, true),
    sampleRoute("ga68-zn68-pn", "Ga-68", "Zn-68", "p", 4, "P,N", "cyclotron 8–14 MeV", 2900, 0.05, true),
    { ...sampleRoute("pb212-generator", "Pb-212", "Ra-224", "", 0, "", "decay", 0, 0, true), decay_only: true, yields: [], data_yield: null, data_spread: null, spread_pct: null, verdict: "", agree: null, parent: "Ra-224", half_life: "3.63 d", label: "Ra-224 → Pb-212" },
  ],
}

const curve = (scale: number, shift: number) =>
  Array.from({ length: 30 }, (_, i) => {
    const e = 1e7 * 10 ** (i / 30)
    return { e_ev: e, xs_b: scale * Math.exp(-((Math.log10(e) - 7.3 - shift) ** 2) / 0.02), dxs_b: null }
  }).filter((p) => p.xs_b > 1e-4)

export const SAMPLE_DETAIL: MedDetail = {
  route: SAMPLE_MED.routes[0],
  series: [
    { source: "exfor:30001002", kind: "exfor", label: "Sample A 1990", points: curve(0.7, 0.01).filter((_, i) => i % 3 === 0).map((p) => ({ ...p, dxs_b: p.xs_b * 0.1 })) },
    { source: "B-VIII.1", kind: "evaluation", label: "B-VIII.1", points: curve(0.6, 0) },
    { source: "TENDL-2023", kind: "evaluation", label: "TENDL-2023", points: curve(0.75, 0.02) },
    { source: "iaea", kind: "iaea", label: "IAEA recommended", points: curve(0.68, 0.01) },
  ],
  verdict_text: "The evaluations disagree beyond the data's spread: 42% across them against 6% in the measurements.",
  chain: null,
  method: "Thick-target yield from the Bethe stopping power with ICRU 37 mean excitation energies, no shell or density corrections, at saturation.",
  lab: null,
}
