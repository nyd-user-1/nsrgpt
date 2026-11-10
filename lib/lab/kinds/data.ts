import type { Dataset, KindDef, RunContext, Series } from "@/lib/lab/blocks"
import { describe, plural, window } from "@/lib/lab/format"

// Data (brief 52): one source with its own params, out as a `dataset` (rows) and a `series` (curves).
//   exfor    GET /exfor/points: every point of every EXFOR dataset matching target, reaction, quantity, emin to emax;
//            rows { dataset_id, e_ev, de_ev, xs_b, dxs_b }, meta.datasets [{ dataset_id, entry, subentry, author, year,
//            institute, n }]; one series per dataset.
//   endf     GET /endf/xs, one series per release (cut to emin to emax by the route); rows { release, e_ev, xs_b }.
//   cov      GET /endf/cov: MF33 relative sd per group; rows { release, e_lo, e_hi, rel_sd }; one step series per release.
//   nuclide  GET /nuclide/{name}: its decays as parent and as daughter.
//   view     a saved canvas or view's rows (/api/community).

export type DataSource = "exfor" | "endf" | "cov" | "nuclide" | "view"

export type DataParams = {
  source: DataSource
  target?: string
  reaction?: string
  quantity?: string
  name?: string
  mt?: number
  releases?: string[]
  /** ENDF and covariance: the projectile's sublibrary, as the API's `sub` takes it (brief 58 follow-up); neutrons when unset. */
  sub?: string
  /** ENDF: a POINT temperature in kelvin (293.6, 600, 900, 1200, 1800; B-VIII.1 and B-VIII.0 only); 0 K MF3 when unset. */
  temp?: number
  emin?: number
  emax?: number
  id?: string
  /** EXFOR: the most points the route returns; it says truncated past it. */
  limit?: number
}

/** The sublibraries a projectile picks, as /endf/materials, /endf/xs and /endf/cov name them. */
export const PROJECTILES: { key: string; label: string }[] = [
  { key: "neutrons", label: "Neutrons" },
  { key: "protons", label: "Protons" },
  { key: "deuterons", label: "Deuterons" },
  { key: "tritons", label: "Tritons" },
  { key: "helium3s", label: "Helium-3" },
  { key: "alphas", label: "Alphas" },
  { key: "gammas", label: "Photons" },
]
/** The POINT temperatures /endf/xs serves (B-VIII.1 and B-VIII.0 only, worker-1's brief 56). */
export const TEMPERATURES = [293.6, 600, 900, 1200, 1800]

/** A covariance band's method, as a reader reads it. */
export const bandMethodText = (m: string | undefined) =>
  !m || m === "MF33" ? "MF33 covariances" : m === "mf32-diagonal-first-order" ? "File 32 resonance parameters, first order, diagonal only" : m

/** The API's sub for a block: left out for neutrons, the API's default. */
const subOf = (p: DataParams) => (p.sub && p.sub !== "neutrons" ? p.sub : undefined)

export const DATA_SOURCES: { key: DataSource; label: string }[] = [
  { key: "exfor", label: "EXFOR points" },
  { key: "endf", label: "ENDF cross section" },
  { key: "cov", label: "ENDF covariance" },
  { key: "nuclide", label: "Nuclide decays" },
  { key: "view", label: "Saved view" },
]

/** GET a JSON route; a refusal throws with the route's own error text. */
export async function getJson<T>(ctx: RunContext, path: string): Promise<T> {
  const r = await ctx.api(path)
  const j = (await r.json().catch(() => ({}))) as T & { error?: string }
  if (!r.ok) throw new Error(`${path.split("?")[0]} answered ${r.status}${j.error ? `: ${j.error}` : ""}`)
  return j
}

const query = (o: Record<string, unknown>) =>
  new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => [k, String(v)])).toString()

type ExforDataset = { dataset_id: string; subentry?: string; entry?: string; author?: string; year?: number | string; institute?: string; n?: number; excluded?: string; units?: string | null }
type ExforPoint = { dataset_id: string; e_ev: number; de_ev?: number | null; xs_b: number; dxs_b?: number | null }

/** EXFOR points per query unless a block sets its own limit: the route's most (50K). U-235 (n,f) from 1 to 200 keV is 38.8K
 *  points in 116 datasets. */
export const EXFOR_LIMIT = 50_000

async function exfor(p: DataParams, ctx: RunContext) {
  const q = query({ target: p.target, reaction: p.reaction, quantity: p.quantity, emin: p.emin, emax: p.emax, limit: p.limit ?? EXFOR_LIMIT })
  const j = await getJson<{ datasets: ExforDataset[]; points: ExforPoint[]; truncated?: boolean }>(ctx, `/exfor/points?${q}`)
  // The route lists datasets it serves no points for (ratios and combinations of reactions) with `excluded`: kept apart, so
  // nothing plots or cites them, and named in the block's note.
  const served = j.datasets.filter((d) => !d.excluded)
  const excluded = j.datasets.filter((d) => d.excluded).map((d) => ({ dataset_id: d.dataset_id, entry: d.entry, author: d.author, year: d.year, why: d.excluded as string }))
  const info = new Map(served.map((d) => [d.dataset_id, d]))
  const dataset: Dataset = { columns: ["dataset_id", "e_ev", "de_ev", "xs_b", "dxs_b"], rows: j.points.filter((pt) => info.has(pt.dataset_id)), meta: { datasets: served, excluded, truncated: !!j.truncated } }
  const byId = new Map<string, ExforPoint[]>()
  for (const pt of dataset.rows as ExforPoint[]) byId.set(pt.dataset_id, [...(byId.get(pt.dataset_id) ?? []), pt])
  const series: Series[] = [...byId].map(([id, pts]) => {
    const d = info.get(id)
    const hasErr = pts.some((x) => x.dxs_b != null)
    return {
      name: d?.author ? `${d.author}${d.year ? ` (${d.year})` : ""}` : id,
      x: pts.map((x) => x.e_ev),
      y: pts.map((x) => x.xs_b),
      ...(hasErr ? { lo: pts.map((x) => x.xs_b - (x.dxs_b ?? 0)), hi: pts.map((x) => x.xs_b + (x.dxs_b ?? 0)) } : {}),
      unit_x: "eV",
      unit_y: d?.units && d.units !== "B" ? d.units : "b",
      meta: { dataset_id: id, entry: d?.entry, subentry: d?.subentry, author: d?.author, year: d?.year },
    }
  })
  return { dataset, series }
}

type XsSeries = { release: string; held: boolean; release_served?: string; mat?: number; n_points?: number; energy_ev?: number[]; xs_barn?: number[]; note?: string }

async function endf(p: DataParams, ctx: RunContext) {
  const rel = p.releases?.length ? p.releases : ["B-VIII.1"]
  const q = query({ name: p.name, mt: p.mt, release: rel[0], compare: rel.slice(1).join(","), sub: subOf(p), temp: p.temp ? `${p.temp}K` : undefined, emin: p.emin, emax: p.emax })
  const j = await getJson<{ series: XsSeries[] }>(ctx, `/endf/xs?${q}`)
  const held = j.series.filter((s) => s.held && s.energy_ev?.length)
  const series: Series[] = held.map((s) =>
    window(
      { name: s.release, x: s.energy_ev ?? [], y: s.xs_barn ?? [], unit_x: "eV", unit_y: "b", meta: { release: s.release, release_served: s.release_served, mat: s.mat, n_points: s.n_points, note: s.note } },
      p.emin,
      p.emax,
    ),
  )
  const rows = series.flatMap((s) => s.x.map((x, i) => ({ release: s.name, e_ev: x, xs_b: s.y[i] })))
  const missing = j.series.filter((s) => !s.held).map((s) => s.release)
  return { dataset: { columns: ["release", "e_ev", "xs_b"], rows, meta: { missing } } as Dataset, series }
}

type CovGroupRow = { e_lo_ev: number; e_hi_ev: number; rel_sd: number }
/** `resolved` (MT 2, 18, 102; worker-1's brief 56): File 32's band inside the resolved ranges, where MF33 is often empty. */
type CovSeries = { release: string; held: boolean; mat?: number; lb?: number[]; groups: CovGroupRow[]; note?: string; resolved?: { method?: string; groups?: CovGroupRow[]; note?: string } | null }

async function cov(p: DataParams, ctx: RunContext) {
  const rel = p.releases?.length ? p.releases : ["B-VIII.1"]
  const q = query({ name: p.name, mt: p.mt, release: rel.join(","), sub: subOf(p), emin: p.emin, emax: p.emax })
  const j = await getJson<{ series: CovSeries[] }>(ctx, `/endf/cov?${q}`)
  // Where a release's MF33 is empty, its File 32 band stands in (resolved.groups), the method carried with every row.
  const used = j.series.map((s) => {
    const fallback = !s.groups.length && (s.resolved?.groups?.length ?? 0) > 0
    return { s, groups: fallback ? s.resolved!.groups! : s.groups, method: fallback ? (s.resolved!.method ?? "File 32") : "MF33" }
  })
  const rows = used.flatMap(({ s, groups, method }) => groups.map((g) => ({ release: s.release, e_lo: g.e_lo_ev, e_hi: g.e_hi_ev, rel_sd: g.rel_sd, method })))
  // A step line: each group's value held from its lower to its upper edge.
  const series: Series[] = used
    .filter((u) => u.groups.length)
    .map(({ s, groups, method }) => ({
      name: s.release,
      x: groups.flatMap((g) => [g.e_lo_ev, g.e_hi_ev]),
      y: groups.flatMap((g) => [g.rel_sd, g.rel_sd]),
      unit_x: "eV",
      unit_y: "relative sd",
      meta: { release: s.release, mat: s.mat, lb: s.lb, method: bandMethodText(method) },
    }))
  const notes = used.flatMap(({ s, groups, method }) =>
    !groups.length ? [`${s.release}: ${s.note ?? "no MF33"}`] : method !== "MF33" ? [`${s.release}: no MF33 here; the band is ${bandMethodText(method)}${s.resolved?.note ? ` (${s.resolved.note})` : ""}`] : [],
  )
  return { dataset: { columns: ["release", "e_lo", "e_hi", "rel_sd", "method"], rows, meta: { notes } } as Dataset, series }
}

type Decay = { parent: string; daughter: string; mode: string; branching_pct: number | null; half_life_s: number | null; q_kev: number | null; dsid: string }

async function nuclide(p: DataParams, ctx: RunContext) {
  const j = await getJson<{ nuclide: Record<string, unknown>; decays: { as_parent: Decay[]; as_daughter: Decay[] } }>(ctx, `/nuclide/${encodeURIComponent(p.name ?? "")}`)
  const row = (role: string) => (d: Decay) => ({ role, parent: d.parent, daughter: d.daughter, mode: d.mode, branching_pct: d.branching_pct, half_life_s: d.half_life_s, q_kev: d.q_kev, dsid: d.dsid })
  const rows = [...j.decays.as_parent.map(row("parent")), ...j.decays.as_daughter.map(row("daughter"))]
  const columns = ["role", "parent", "daughter", "mode", "branching_pct", "half_life_s", "q_kev", "dsid"]
  return { dataset: { columns, rows, meta: { nuclide: j.nuclide } } as Dataset, series: [] as Series[] }
}

async function view(p: DataParams, ctx: RunContext) {
  const r = await fetch(`/api/community?tab=view&id=${encodeURIComponent(p.id ?? "")}`, { signal: ctx.signal })
  const j = (await r.json().catch(() => ({}))) as { view?: { name: string; state: Record<string, unknown> }; error?: string }
  if (!r.ok || !j.view) throw new Error(j.error ?? `the saved view answered ${r.status}`)
  const s = j.view.state
  if (Array.isArray(s.columns) && Array.isArray(s.rows)) return { dataset: { columns: s.columns as string[], rows: s.rows as Record<string, unknown>[] }, series: [] as Series[] }
  const canvas = s.canvas as { blocks?: { id: string; kind: string; title: string }[] } | undefined
  const nodes = (canvas?.blocks ?? (s.nodes as Record<string, unknown>[] | undefined) ?? []) as Record<string, unknown>[]
  const rows = nodes.map((n) => ({ id: n.id, type: n.kind ?? n.type, label: n.title ?? n.label ?? n.name }))
  return { dataset: { columns: ["id", "type", "label"], rows, meta: { view: j.view.name } }, series: [] as Series[] }
}

const SOURCES = { exfor, endf, cov, nuclide, view }

export const data: KindDef<DataParams> = {
  kind: "data",
  title: "Data",
  inputs: {},
  outputs: { dataset: "dataset", series: "series" },
  defaults: { source: "endf", name: "U-235", mt: 18, releases: ["B-VIII.1"], emin: 1e3, emax: 2e5 },
  run(p, _inputs, ctx) {
    const f = SOURCES[p.source]
    if (!f) throw new Error(`unknown source ${p.source}`)
    return f(p, ctx)
  },
  note: (o) => {
    const ex = ((o.dataset as Dataset | undefined)?.meta?.excluded ?? []) as { why: string }[]
    if (!ex.length) return undefined
    const why = [...new Set(ex.map((e) => e.why.split(":")[0].trim()))].join("; ")
    return `${plural(ex.length, "dataset")} left out: ${why}.`
  },
  summary(o) {
    const d = o.dataset as Dataset | undefined
    return [d ? plural(d.rows.length, "row") : "", describe(o.series), d?.meta?.truncated ? "truncated: raise the limit" : ""].filter(Boolean).join(" · ")
  },
}
