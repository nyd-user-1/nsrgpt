import { apiUrl } from "@/lib/api-url"
import { SAMPLE_FLAGS, SAMPLE_LIST, SAMPLE_PAIR, SAMPLE_RELEASES, SAMPLE_RETRO } from "@/lib/sweep-sample"

// The sweep's routes (brief 57, Parts A.5, B.4, C; worker-3's services/nsr-api/sweep.py), read by /sweep and
// /sweep/pair (brief 58, Part C). Until a route answers, its call returns the sample in lib/sweep-sample.ts with
// `sample: true`, and the page says so. The normalisers take the routes' fields as worker-3's routes answer them
// (2026-11-10: `reaction` already written "(n,α)" beside `exfor_reaction` "N,A"; the pair's datasets as summaries with
// their energy span, no points; the retrodiction's summary per ranking; a flag's datasets as one string) and coerce
// numbers, so a string or a missing field never breaks a row.

export type LabPair = { target: string; reaction: string; mt: number; emin?: number; emax?: number; releases: string[]; sub?: string }

export type SweepRow = {
  target_za: number
  target: string
  sublibrary: string
  mt: number
  reaction: string
  n_points: number
  n_datasets: number
  n_bins: number
  mean_log_ratio: number | null
  mean_ratio: number | null
  z: number | null
  max_bin_dev: number | null
  max_bin_e_ev: number | null
  rel_sd_eval: number | null
  mf33: boolean
  driver_dataset: string | null
  driver_effect: number | null
  support_points: number | null
  support_datasets: number | null
  comparator: string
  lab: LabPair | null
}
export type SweepList = { release: string; total: number; page: number; rows: SweepRow[]; sample?: boolean }

export type PairBin = { e_lo: number; e_hi: number; e_mid: number; mean_log_ratio: number | null; se: number | null; n_points: number; n_datasets: number; rel_sd_eval: number | null }
export type PairDataset = { dataset: string; author: string; year: number | null; n: number; mean_log_ratio: number | null; se: number | null; e_min: number | null; e_max: number | null; points: [number, number][] }
export type PairRelease = { release: string; bins: PairBin[]; datasets: PairDataset[] }
export type SweepPair = { target: string; mt: number; sub: string; reaction: string; releases: PairRelease[]; lab: LabPair | null; sample?: boolean }

export type ReleaseInfo = { release: string; sublibraries: string[]; pairs: number | null }
export type SweepReleases = { releases: ReleaseInfo[]; run_date: string | null; method: string | null; sample?: boolean }

export type RetroTop = { n: number; hit_rate: number | null; enrichment: number | null; toward: number | null }
export type RetroRow = { rank: number; target: string; mt: number; reaction: string; sublibrary: string; z: number | null; mean_log_ratio_v80: number | null; mean_log_ratio_v81: number | null; changed: boolean; rms_log: number | null; moved_toward_data: boolean | null }
/** One release pair's headline rates (summary.pairs on the plain route): the z ranking's top 20 and the direction over
 *  every changed pair. */
export type RetroPair = { key: string; from: string; to: string; method: string; supported: number | null; changed: number | null; base_rate: number | null; top20: RetroTop | null; all_toward: number | null }
export type SweepRetro = {
  summary: { base_rate: number | null; top: RetroTop[]; changed_median_rank: number | null; all_toward: number | null; from: string; to: string; method: string }
  pairs: RetroPair[]
  rows: RetroRow[]
  sample?: boolean
}
/** A release pair the retrodiction route takes: VIII.0 → VIII.1 on the POINT files (the default) or on MF3, and the two before. */
export type RetroQuery = { from?: string; to?: string; method?: "mf3" }

export type FlagDataset = { subentry: string; author: string; year: number | null }
export type EvalFlag = { target: string; mt: number; reaction: string; sublibrary: string; z: number | null; datasets: FlagDataset[]; max_bin_dev: number | null; max_bin_e_ev: number | null; rel_sd_eval: number | null; mf33: boolean }
export type ExforFlag = { rule: string; subentry: string; entry: string; author: string; year: number | null; target: string; mt: number | null; reaction: string; note: string; nsr_key: string | null; reference: string }
export type PublicList = { url: string; n: number | null }
export type SweepFlags = { evaluation: EvalFlag[]; exfor: ExforFlag[]; publicLists: PublicList[]; sample?: boolean }

type Obj = Record<string, unknown>
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {})
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const num = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null)
const int = (v: unknown): number => num(v) ?? 0
const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v))
const bool = (v: unknown): boolean => v === true || v === 1 || v === "true" || v === "1"

function lab(v: unknown): LabPair | null {
  const o = obj(v)
  if (!o.target || !o.reaction || !o.mt) return null
  const rel = Array.isArray(o.releases) ? o.releases.map(str) : str(o.releases).split(",").filter(Boolean)
  return { target: str(o.target), reaction: str(o.reaction), mt: int(o.mt), emin: num(o.emin) ?? undefined, emax: num(o.emax) ?? undefined, releases: rel, sub: o.sub ? str(o.sub) : undefined }
}

const row = (v: unknown): SweepRow => {
  const o = obj(v)
  const mlr = num(o.mean_log_ratio)
  return {
    target_za: int(o.target_za),
    target: str(o.target),
    sublibrary: str(o.sublibrary || o.sub || "neutrons"),
    mt: int(o.mt),
    reaction: str(o.reaction || o.exfor_reaction),
    n_points: int(o.n_points),
    n_datasets: int(o.n_datasets),
    n_bins: int(o.n_bins),
    mean_log_ratio: mlr,
    mean_ratio: num(o.mean_ratio) ?? (mlr === null ? null : Math.exp(mlr)),
    z: num(o.z),
    max_bin_dev: num(o.max_bin_dev),
    max_bin_e_ev: num(o.max_bin_e_ev),
    rel_sd_eval: num(o.rel_sd_eval),
    mf33: bool(o.mf33),
    driver_dataset: o.driver_dataset ? str(o.driver_dataset) : null,
    driver_effect: num(o.driver_effect),
    support_points: num(o.support_points),
    support_datasets: num(o.support_datasets),
    comparator: str(o.comparator),
    lab: lab(o.lab),
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

export type ListQuery = { release: string; sort: "z" | "mean" | "support"; dir: "asc" | "desc"; nuclide?: string; mt?: number; sub?: string; min_datasets?: number; single?: boolean; page: number }

export function listPath(q: ListQuery): string {
  const s = new URLSearchParams({ release: q.release, sort: q.sort, dir: q.dir, page: String(q.page) })
  if (q.nuclide) s.set("nuclide", q.nuclide)
  if (q.mt) s.set("mt", String(q.mt))
  if (q.sub) s.set("sub", q.sub)
  if (q.min_datasets) s.set("min_datasets", String(q.min_datasets))
  if (q.single) s.set("single", "1")
  return `/sweep?${s.toString()}`
}

export async function fetchList(q: ListQuery): Promise<SweepList> {
  const j = await get(listPath(q))
  if (!j) return { ...SAMPLE_LIST, release: q.release, sample: true }
  const o = obj(j)
  return { release: str(o.release || q.release), total: int(o.total), page: int(o.page) || q.page, rows: arr(o.rows).map(row) }
}

export async function fetchReleases(): Promise<SweepReleases> {
  const j = await get("/sweep/releases")
  if (!j) return { ...SAMPLE_RELEASES, sample: true }
  const o = obj(j)
  const list = arr(o.releases).map((r) => {
    const x = obj(r)
    return { release: str(x.release ?? r), sublibraries: arr(x.sublibraries).map(str), pairs: num(x.pairs ?? x.count) }
  })
  const m = o.method
  const method = typeof m === "string" ? m : m && typeof m === "object" ? str((m as Obj).A_sweep ?? Object.values(m as Obj)[0] ?? "") : ""
  return { releases: list, run_date: o.run_date ? str(o.run_date) : null, method: method || null }
}

export async function fetchPair(target: string, mt: number, sub: string, releases: string[]): Promise<SweepPair> {
  const s = new URLSearchParams({ target, mt: String(mt), sub, release: releases.join(",") })
  const j = await get(`/sweep/pair?${s.toString()}`)
  if (!j) return { ...SAMPLE_PAIR, sample: true }
  const o = obj(j)
  const rels = arr(o.releases).map((r) => {
    const x = obj(r)
    return {
      release: str(x.release),
      bins: arr(x.bins).map((b) => {
        const y = obj(b)
        const lo = num(y.e_lo ?? y.e_lo_ev) ?? 0
        const hi = num(y.e_hi ?? y.e_hi_ev) ?? 0
        return { e_lo: lo, e_hi: hi, e_mid: num(y.e_mid ?? y.e_ev) ?? Math.sqrt(lo * hi), mean_log_ratio: num(y.mean_log_ratio), se: num(y.se), n_points: int(y.n_points), n_datasets: int(y.n_datasets), rel_sd_eval: num(y.rel_sd_eval) }
      }),
      datasets: arr(x.datasets).map((d) => {
        const y = obj(d)
        return {
          dataset: str(y.dataset ?? y.subentry),
          author: str(y.author ?? y.first_author),
          year: num(y.year),
          n: int(y.n ?? y.n_points),
          mean_log_ratio: num(y.mean_log_ratio),
          se: num(y.se),
          e_min: num(y.e_min_ev),
          e_max: num(y.e_max_ev),
          points: arr(y.points).map((p) => (Array.isArray(p) ? [Number(p[0]), Number(p[1])] : [Number(obj(p).e_ev), Number(obj(p).ratio)]) as [number, number]).filter(([e, r]) => Number.isFinite(e) && Number.isFinite(r)),
        }
      }),
    }
  })
  return { target: str(o.target || target), mt: int(o.mt) || mt, sub: str(o.sublibrary || o.sub || sub), reaction: str(o.reaction || o.exfor_reaction), releases: rels.filter((r) => r.bins.length || r.datasets.length), lab: lab(o.lab) }
}

/** The z ranking's tops, keyed by N, as a list. */
function topsOf(sm: Obj): RetroTop[] {
  const z = obj(obj(sm.rankings).z)
  const tops = z.top ?? sm.top ?? sm.tops
  return (Array.isArray(tops) ? tops.map((t) => [obj(t).n, t] as const) : Object.entries(obj(tops))).map(([n, t]) => {
    const x = obj(t)
    return { n: int(n), hit_rate: num(x.hit_rate ?? x.fraction_changed), enrichment: num(x.enrichment), toward: num(x.direction_rate ?? x.toward ?? x.moved_toward_data) }
  })
}

export async function fetchRetro(q: RetroQuery = {}): Promise<SweepRetro> {
  const s = new URLSearchParams()
  if (q.from) s.set("from", q.from)
  if (q.to) s.set("to", q.to)
  if (q.method) s.set("method", q.method)
  const j = await get(`/sweep/retrodiction${s.size ? `?${s.toString()}` : ""}`)
  if (!j) return { ...SAMPLE_RETRO, sample: true }
  const o = obj(j)
  const sm = obj(o.summary)
  const z = obj(obj(sm.rankings).z)
  const top = topsOf(sm)
  const pairs: RetroPair[] = Object.entries(obj(sm.pairs)).map(([key, v]) => {
    const p = obj(v)
    return { key, from: str(p.from), to: str(p.to), method: str(p.method), supported: num(p.supported_pairs), changed: num(p.changed_pairs), base_rate: num(p.base_rate), top20: topsOf(p).find((t) => t.n === 20) ?? null, all_toward: num(p.direction_rate_all_changed) }
  })
  return {
    pairs,
    summary: { base_rate: num(sm.base_rate), top, changed_median_rank: num(z.changed_median_rank ?? sm.changed_median_rank ?? sm.median_rank), all_toward: num(sm.direction_rate_all_changed), from: str(sm.from || "B-VIII.0"), to: str(sm.to || "B-VIII.1"), method: str(sm.method) },
    rows: arr(o.rows).map((r) => {
      const x = obj(r)
      return { rank: int(x.rank), target: str(x.target), mt: int(x.mt), reaction: str(x.reaction), sublibrary: str(x.sublibrary || x.sub || "neutrons"), z: num(x.z), mean_log_ratio_v80: num(x.mean_log_ratio_v80), mean_log_ratio_v81: num(x.mean_log_ratio_v81), changed: bool(x.changed), rms_log: num(x.rms_log), moved_toward_data: x.moved_toward_data === null || x.moved_toward_data === undefined ? null : bool(x.moved_toward_data) }
    }),
  }
}

export async function fetchFlags(): Promise<SweepFlags> {
  const j = await get("/sweep/flags")
  if (!j) return { ...SAMPLE_FLAGS, sample: true }
  const o = obj(j)
  return {
    evaluation: arr(o.evaluation).map((r) => {
      const x = obj(r)
      return {
        target: str(x.target),
        mt: int(x.mt),
        reaction: str(x.reaction),
        sublibrary: str(x.sublibrary || x.sub || "neutrons"),
        z: num(x.z),
        // "41240040 A.A.Filatenkov 1999 n=8 ratio=3.5702; 22637045 C.Konno 1993 n=8 ratio=2.7969; …", or a list.
        datasets: (typeof x.datasets === "string" ? x.datasets.split(";").map((t) => t.trim()).filter(Boolean) : arr(x.datasets)).map((d) => {
          if (typeof d === "string") {
            const m = /^(\S+)\s+(.*?)\s+(\d{4})(?:\s|$)/.exec(d)
            return m ? { subentry: m[1], author: m[2], year: Number(m[3]) } : { subentry: d.split(/\s+/)[0], author: "", year: null }
          }
          const y = obj(d)
          return { subentry: str(y.subentry ?? y.dataset), author: str(y.author), year: num(y.year) }
        }),
        max_bin_dev: num(x.max_bin_dev),
        max_bin_e_ev: num(x.max_bin_e_ev),
        rel_sd_eval: num(x.rel_sd_eval),
        mf33: x.mf33 === undefined ? num(x.rel_sd_eval) !== null : bool(x.mf33),
      }
    }),
    exfor: arr(o.exfor).map((r) => {
      const x = obj(r)
      return { rule: str(x.rule), subentry: str(x.subentry ?? x.dataset), entry: str(x.entry), author: str(x.author), year: num(x.year), target: str(x.target), mt: num(x.mt), reaction: str(x.reaction), note: str(x.note ?? x.numbers ?? x.detail), nsr_key: x.nsr_key ? str(x.nsr_key) : null, reference: str(x.reference) }
    }),
    publicLists: arr(o.public_list).map((p) => ({ url: str(obj(p).source_url), n: num(obj(p).n) })).filter((p) => p.url),
  }
}

/** An energy in eV as a reader reads it. */
export function evText(e: number | null): string {
  if (e === null || !Number.isFinite(e)) return "—"
  if (e >= 1e6) return `${+(e / 1e6).toPrecision(3)} MeV`
  if (e >= 1e3) return `${+(e / 1e3).toPrecision(3)} keV`
  if (e >= 1) return `${+e.toPrecision(3)} eV`
  return `${+(e * 1e3).toPrecision(3)} meV`
}

/** A log ratio as a signed percent: 0.05 → +5.1%. */
export function pctText(logRatio: number | null): string {
  if (logRatio === null || !Number.isFinite(logRatio)) return "—"
  const p = (Math.exp(logRatio) - 1) * 100
  return `${p >= 0 ? "+" : ""}${p.toFixed(Math.abs(p) < 10 ? 1 : 0)}%`
}
