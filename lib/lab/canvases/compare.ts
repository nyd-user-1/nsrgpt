import type { Dataset, Series } from "@/lib/lab/blocks"

// The Lab's comparison of measurement with evaluation (brief 53): pure functions, no fetching, no React, so the Compare
// block, the Plot and the Prompt's context share one calculation and it can be checked on its own.
//
// Each measured point is divided by the evaluation at its energy (linear interpolation on the evaluation's grid, which
// is how PREPRO's linearized and broadened tapes are meant to be read). Ratios are grouped into log-energy bins,
// `perDecade` to a decade, edges on round powers of ten. The evaluation's relative standard deviation per bin comes from
// its MF33 groups, and makes the band around a ratio of 1. The highlight window gets its own summary: the mean ratio per
// evaluation, inverse-variance weighted where the points carry uncertainties, and per dataset, which shows which
// measurements carry the difference.

/** One measured point: its EXFOR dataset (subentry), energy in eV, cross section in barns and its uncertainty. */
export type MeasuredPoint = { dataset_id: string; e_ev: number; xs_b: number; dxs_b?: number | null }
/** An evaluation's cross section on its own energy grid (eV, barns), ascending in energy. */
export type EvalCurve = { name: string; x: number[]; y: number[] }
/** An MF33 group: the evaluation's relative standard deviation between two energies. */
export type CovGroup = { e_lo_ev: number; e_hi_ev: number; rel_sd: number }

/** `note`: one plain sentence the Compare carries with its table, e.g. where a broadened curve was copied, not broadened. */
export type CompareOptions = { perDecade?: number; emin: number; emax: number; highlight?: readonly [number, number]; note?: string }

export type CompareBin = {
  evaluation: string
  e_lo: number
  e_hi: number
  n_points: number
  mean_ratio: number
  sd: number | null
  rel_sd_eval: number | null
}
export type RatioSeries = { name: string; x: number[]; y: number[]; lo?: number[]; hi?: number[]; unit_x: "eV"; unit_y: "ratio" }
export type DatasetRatio = { dataset_id: string; n: number; mean_ratio: number }
export type WindowSummary = {
  evaluation: string
  e_lo: number
  e_hi: number
  n_points: number
  n_datasets: number
  mean_ratio: number | null
  /** Weighted by 1/σ² of each ratio, from the points' dxs; null when no point in the window carries one. */
  weighted_ratio: number | null
  sd: number | null
  /** The evaluation's MF33 relative sd averaged over the window (log-energy weighted). */
  rel_sd_eval: number | null
  per_dataset: DatasetRatio[]
}
export type CompareResult = { bins: CompareBin[]; ratios: RatioSeries[]; window: WindowSummary[] }

/** The evaluation at energy `e` by linear interpolation; null outside its grid. */
export function interpAt(c: EvalCurve, e: number): number | null {
  const { x, y } = c
  const n = x.length
  if (!n || e < x[0] || e > x[n - 1]) return null
  let lo = 0, hi = n - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (x[mid] <= e) lo = mid
    else hi = mid
  }
  if (x[hi] === x[lo]) return y[lo]
  return y[lo] + ((y[hi] - y[lo]) * (e - x[lo])) / (x[hi] - x[lo])
}

/** Log-energy bins over [emin, emax], `perDecade` to a decade, edges on 10^(k/perDecade); the first and last clipped. */
export function logBins(emin: number, emax: number, perDecade = 20): [number, number][] {
  const out: [number, number][] = []
  const k0 = Math.floor(Math.log10(emin) * perDecade + 1e-9)
  const k1 = Math.ceil(Math.log10(emax) * perDecade - 1e-9)
  for (let k = k0; k < k1; k++) {
    const lo = Math.max(emin, 10 ** (k / perDecade))
    const hi = Math.min(emax, 10 ** ((k + 1) / perDecade))
    if (hi > lo) out.push([lo, hi])
  }
  return out
}

/** The groups' relative sd averaged over [lo, hi], each weighted by its share of the log-energy span; null where none reach. */
export function relSdOver(groups: CovGroup[] | undefined, lo: number, hi: number): number | null {
  if (!groups?.length || !(hi > lo)) return null
  let sum = 0, span = 0
  for (const g of groups) {
    const a = Math.max(lo, g.e_lo_ev), b = Math.min(hi, g.e_hi_ev)
    if (b <= a) continue
    const w = Math.log(b / a)
    sum += g.rel_sd * w
    span += w
  }
  return span > 0 ? sum / span : null
}

const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length
const sampleSd = (v: number[]) => {
  if (v.length < 2) return null
  const m = mean(v)
  return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1))
}

type Ratio = { dataset_id: string; e: number; r: number; dr: number | null }

/** Every usable point divided by the evaluation at its energy, inside [emin, emax]. */
export function ratiosFor(points: MeasuredPoint[], c: EvalCurve, emin: number, emax: number): Ratio[] {
  const out: Ratio[] = []
  for (const p of points) {
    if (!(p.e_ev >= emin && p.e_ev <= emax) || !(p.xs_b > 0) || !Number.isFinite(p.xs_b)) continue
    const ev = interpAt(c, p.e_ev)
    if (ev === null || !(ev > 0)) continue
    const r = p.xs_b / ev
    const dr = p.dxs_b != null && p.dxs_b > 0 ? (r * p.dxs_b) / p.xs_b : null
    out.push({ dataset_id: p.dataset_id, e: p.e_ev, r, dr })
  }
  return out
}

/** The window's summary for one evaluation. */
function windowFor(name: string, rs: Ratio[], lo: number, hi: number, groups: CovGroup[] | undefined): WindowSummary {
  const inside = rs.filter((x) => x.e >= lo && x.e <= hi)
  const rv = inside.map((x) => x.r)
  const weighted = inside.filter((x) => x.dr !== null && x.dr > 0)
  const wsum = weighted.reduce((a, x) => a + 1 / x.dr! ** 2, 0)
  const byDs = new Map<string, number[]>()
  for (const x of inside) byDs.set(x.dataset_id, [...(byDs.get(x.dataset_id) ?? []), x.r])
  const per_dataset = [...byDs].map(([dataset_id, v]) => ({ dataset_id, n: v.length, mean_ratio: mean(v) })).sort((a, b) => b.n - a.n)
  return {
    evaluation: name,
    e_lo: lo,
    e_hi: hi,
    n_points: inside.length,
    n_datasets: byDs.size,
    mean_ratio: rv.length ? mean(rv) : null,
    weighted_ratio: wsum > 0 ? weighted.reduce((a, x) => a + x.r / x.dr! ** 2, 0) / wsum : null,
    sd: sampleSd(rv),
    rel_sd_eval: relSdOver(groups, lo, hi),
    per_dataset,
  }
}

/** The comparison: the bin table, a ratio series per evaluation (its band 1 ± the evaluation's relative sd), and the
 *  highlight window's summary. `bandFor` gives an evaluation's MF33 groups by its name. */
export function compare(
  points: MeasuredPoint[],
  curves: EvalCurve[],
  opts: CompareOptions,
  bandFor: (evaluation: string) => CovGroup[] | undefined = () => undefined,
): CompareResult {
  const perDecade = opts.perDecade ?? 20
  const edges = logBins(opts.emin, opts.emax, perDecade)
  const bins: CompareBin[] = []
  const ratios: RatioSeries[] = []
  const window: WindowSummary[] = []
  for (const c of curves) {
    const rs = ratiosFor(points, c, opts.emin, opts.emax)
    const groups = bandFor(c.name)
    const s: RatioSeries = { name: c.name, x: [], y: [], lo: [], hi: [], unit_x: "eV", unit_y: "ratio" }
    let b = 0
    const sorted = [...rs].sort((p, q) => p.e - q.e)
    for (const [lo, hi] of edges) {
      const inBin: number[] = []
      while (b < sorted.length && sorted[b].e < lo) b++
      let j = b
      while (j < sorted.length && (sorted[j].e < hi || (hi === opts.emax && sorted[j].e === hi))) inBin.push(sorted[j++].r)
      if (!inBin.length) continue
      const mid = Math.sqrt(lo * hi)
      const relSd = relSdOver(groups, lo, hi)
      const m = mean(inBin)
      bins.push({ evaluation: c.name, e_lo: lo, e_hi: hi, n_points: inBin.length, mean_ratio: m, sd: sampleSd(inBin), rel_sd_eval: relSd })
      s.x.push(mid)
      s.y.push(m)
      s.lo!.push(relSd === null ? 1 : 1 - relSd)
      s.hi!.push(relSd === null ? 1 : 1 + relSd)
    }
    if (!groups?.length) {
      delete s.lo
      delete s.hi
    }
    ratios.push(s)
    if (opts.highlight) window.push(windowFor(c.name, rs, opts.highlight[0], opts.highlight[1], groups))
  }
  return { bins, ratios, window }
}

// ── The Compare block's adapters (brief 52's port values) ─────────────────────────────────────────────────────────────

/** Measured points from the EXFOR Data block's rows (dataset_id, e_ev, xs_b, dxs_b). */
export function pointsFrom(ds: Dataset | undefined): MeasuredPoint[] {
  const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN)
  return (ds?.rows ?? [])
    .map((r) => ({ dataset_id: String(r.dataset_id ?? r.dataset ?? ""), e_ev: num(r.e_ev), xs_b: num(r.xs_b), dxs_b: r.dxs_b == null ? null : num(r.dxs_b) }))
    .filter((p) => Number.isFinite(p.e_ev) && Number.isFinite(p.xs_b))
}

/** The release a curve belongs to: its meta's, else the start of its name ("B-VIII.1 300 K"). */
export const releaseOf = (s: { name: string; meta?: Record<string, unknown> }) =>
  typeof s.meta?.release === "string" ? s.meta.release : s.name.split(" ")[0]

/** MF33 groups by release from the covariance Data block's rows (e_lo, e_hi, rel_sd, release), looked up by curve name. */
export function bandsFrom(ds: Dataset | undefined, curves: Series[]): (evaluation: string) => CovGroup[] | undefined {
  const byRelease = new Map<string, CovGroup[]>()
  for (const r of ds?.rows ?? []) {
    const rel = String(r.release ?? "")
    const g = { e_lo_ev: Number(r.e_lo ?? r.e_lo_ev), e_hi_ev: Number(r.e_hi ?? r.e_hi_ev), rel_sd: Number(r.rel_sd) }
    if (Number.isFinite(g.e_lo_ev) && Number.isFinite(g.e_hi_ev) && Number.isFinite(g.rel_sd)) byRelease.set(rel, [...(byRelease.get(rel) ?? []), g])
  }
  for (const v of byRelease.values()) v.sort((a, b) => a.e_lo_ev - b.e_lo_ev)
  const release = new Map(curves.map((c) => [c.name, releaseOf(c)]))
  return (name) => byRelease.get(release.get(name) ?? name.split(" ")[0])
}

/** The Compare block's outputs: `bins` (the table, with the window's summary in its meta) and `ratio` (one series per
 *  evaluation, band 1 ± the evaluation's relative sd). */
export function compareOutputs(points: Dataset | undefined, evaluations: Series[], band: Dataset | undefined, opts: CompareOptions): { bins: Dataset; ratio: Series[] } {
  const curves = evaluations.map((s) => ({ name: s.name, x: s.x, y: s.y }))
  const res = compare(pointsFrom(points), curves, opts, bandsFrom(band, evaluations))
  const meta = new Map(evaluations.map((s) => [s.name, s.meta]))
  // PREPRO copies the unresolved resonance range without broadening (window-1's `method`): say so with the table, so a
  // broadened curve isn't taken for one where it equals 0 K. The canvas's own sentence, when it gives one, says where.
  const copied = evaluations.some((s) => typeof s.meta?.method === "string" && /not broadened/i.test(s.meta.method))
  const note = opts.note ?? (copied ? "The broadened curves come from PREPRO, which copies the unresolved resonance range without broadening, so inside that range they equal 0 K." : undefined)
  return {
    bins: {
      columns: ["evaluation", "e_lo", "e_hi", "n_points", "mean_ratio", "sd", "rel_sd_eval"],
      rows: res.bins,
      meta: { window: res.window, highlight: opts.highlight ?? null, binsPerDecade: opts.perDecade ?? 20, ...(note ? { note } : {}) },
    },
    ratio: res.ratios.map((r) => ({ ...r, meta: { ...meta.get(r.name), ratio_of: r.name } })),
  }
}

/** The Prompt's context from the Compare table (brief 53): the highlight window's ratio per evaluation, the datasets
 *  inside it with their authors, years and EXFOR entries, then the bins. `points` is the EXFOR Data block's dataset,
 *  whose meta lists the datasets (dataset_id, entry, author, year, institute). */
export function compareContext(bins: Dataset, points?: Dataset): string {
  const window = (bins.meta?.window ?? []) as WindowSummary[]
  const info = new Map(
    ((points?.meta?.datasets ?? []) as { dataset_id?: string; entry?: string; author?: string; year?: number | string; institute?: string }[])
      .filter((d) => d.dataset_id)
      .map((d) => [String(d.dataset_id), d]),
  )
  const f = (v: number | null, d = 3) => (v === null || !Number.isFinite(v) ? "—" : v.toFixed(d))
  const lines: string[] = []
  if (typeof bins.meta?.note === "string") lines.push(bins.meta.note, "")
  for (const w of window) {
    lines.push(
      `${w.evaluation}, ${w.e_lo} to ${w.e_hi} eV: mean measured/evaluated ${f(w.mean_ratio)} (weighted ${f(w.weighted_ratio)}, sd ${f(w.sd)}) over ${w.n_points} points from ${w.n_datasets} datasets; the evaluation's own relative sd there ${f(w.rel_sd_eval)}.`,
    )
  }
  const first = window[0]
  if (first?.per_dataset.length) {
    lines.push("", `Datasets inside the window (against ${first.evaluation}): dataset, entry, author, year, institute, points, mean ratio.`)
    for (const d of first.per_dataset) {
      const i = info.get(d.dataset_id)
      lines.push(`${d.dataset_id}, ${i?.entry ?? d.dataset_id.slice(0, 5)}, ${i?.author ?? "?"}, ${i?.year ?? "?"}, ${i?.institute ?? "?"}, ${d.n}, ${f(d.mean_ratio)}`)
    }
  }
  lines.push("", "Bins: evaluation, e_lo (eV), e_hi (eV), points, mean ratio, sd, evaluation rel sd.")
  for (const r of bins.rows as CompareBin[]) lines.push(`${r.evaluation}, ${r.e_lo.toPrecision(4)}, ${r.e_hi.toPrecision(4)}, ${r.n_points}, ${f(r.mean_ratio)}, ${f(r.sd)}, ${f(r.rel_sd_eval)}`)
  return lines.join("\n")
}
