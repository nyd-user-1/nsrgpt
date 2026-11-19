import { apiUrl } from "@/lib/api-url"
import { fmt } from "@/video/scale"
import type { QueryId } from "@/video/queries"

// The page side of brief 78: a chart block names its data (video/queries.ts) and these fetch the rows from the cached
// API, thin them to the frame and build the template's props, before the Player mounts. The fetch stays out of the
// composition, so the template stays a function of its frame and props.

type Props = Record<string, unknown>

const get = async <T,>(path: string): Promise<T> => {
  const r = await fetch(apiUrl(path))
  if (!r.ok) throw new Error(`${path}: ${r.status}`)
  return r.json() as Promise<T>
}

/** A library's name as a reader knows it: "ENDF/B-VIII.1", "JEFF-3.3". */
const libName = (release: string) => (release.startsWith("B-") ? `ENDF/${release}` : release)

/** A curve thinned to `buckets` steps of log energy, each keeping its lowest and highest point, so resonances survive. */
function thin(e: number[], y: number[], buckets: number, emin?: number, emax?: number): [number, number][] {
  const keep = e.map((x, i) => [x, y[i]] as [number, number]).filter(([x, v]) => x > 0 && v > 0 && (!emin || x >= emin) && (!emax || x <= emax))
  if (keep.length <= buckets * 2) return keep
  const lo = Math.log10(keep[0][0])
  const hi = Math.log10(keep[keep.length - 1][0])
  const out: [number, number][] = []
  let b = -1
  let min: [number, number] | null = null
  let max: [number, number] | null = null
  const flush = () => {
    if (!min || !max) return
    if (min[0] <= max[0]) out.push(min, ...(min === max ? [] : [max]))
    else out.push(max, min)
  }
  for (const p of keep) {
    const k = Math.floor(((Math.log10(p[0]) - lo) / (hi - lo || 1)) * buckets)
    if (k !== b) {
      flush()
      b = k
      min = max = p
    } else {
      if (p[1] < min![1]) min = p
      if (p[1] > max![1]) max = p
    }
  }
  flush()
  return out.map(([x, v]) => [Number(x.toPrecision(5)), Number(v.toPrecision(5))])
}

/** EXFOR's reaction code for an ENDF reaction number. */
const EXFOR_REACTION: Record<number, string> = { 1: "N,TOT", 2: "N,EL", 16: "N,2N", 18: "N,F", 102: "N,G", 103: "N,P", 107: "N,A" }

type XsResponse = { name: string; mt: number; mt_name?: string; reaction?: string; temp?: string; series: { release: string; energy_ev?: number[]; xs_barn?: number[] }[] }
type ExforResponse = { datasets: { dataset_id: string; author?: string; year?: number }[]; points: { dataset_id: string; e_ev: number; xs_b: number; dxs_b?: number | null }[]; source?: string }

async function xsCurve(q: { nuclide: string; mt: number; releases: string[]; exfor: boolean; exforReaction?: string; emin?: number; emax?: number; annotation?: { x: number; text: string } }): Promise<Props> {
  const [first, ...rest] = q.releases
  const xs = await get<XsResponse>(`/endf/xs?name=${encodeURIComponent(q.nuclide)}&mt=${q.mt}&release=${encodeURIComponent(first)}${rest.length ? `&compare=${encodeURIComponent(rest.join(","))}` : ""}`)
  const series = xs.series
    .filter((s) => s.energy_ev?.length && s.xs_barn?.length)
    .map((s) => ({ name: libName(s.release), points: thin(s.energy_ev!, s.xs_barn!, 520, q.emin, q.emax) }))
    .filter((s) => s.points.length >= 2)
  if (!series.length) throw new Error(`No evaluated curve for ${q.nuclide} MT ${q.mt} in ${q.releases.join(", ")}.`)
  const reaction = q.exforReaction ?? EXFOR_REACTION[q.mt]
  let measured: { name: string; points: ([number, number] | [number, number, number])[] }[] = []
  let exforSource = ""
  if (q.exfor && reaction) {
    const lo = q.emin ?? Math.min(...series.map((s) => s.points[0][0]))
    const hi = q.emax ?? Math.max(...series.map((s) => s.points[s.points.length - 1][0]))
    const ex = await get<ExforResponse>(`/exfor/points?target=${encodeURIComponent(q.nuclide)}&reaction=${encodeURIComponent(reaction)}&quantity=SIG&emin=${lo}&emax=${hi}&limit=20000`).catch(() => null)
    if (ex?.points?.length) {
      exforSource = "EXFOR"
      const by = new Map<string, typeof ex.points>()
      for (const p of ex.points) if (p.e_ev > 0 && p.xs_b > 0) by.set(p.dataset_id, [...(by.get(p.dataset_id) ?? []), p])
      const meta = new Map(ex.datasets.map((d) => [d.dataset_id, d]))
      // The six measurements with the most points, each thinned to sixty, in energy order.
      measured = [...by.entries()]
        .sort((a, b) => b[1].length - a[1].length)
        .slice(0, 6)
        .map(([id, pts]) => {
          const d = meta.get(id)
          const sorted = [...pts].sort((a, b) => a.e_ev - b.e_ev)
          const every = Math.max(1, Math.ceil(sorted.length / 60))
          return {
            name: `${(d?.author ?? id).replace(/\b(\w)(\w*)/g, (_, a: string, b: string) => a + b.toLowerCase())}${d?.year ? ` ${d.year}` : ""}`.slice(0, 48),
            points: sorted.filter((_, i) => i % every === 0).map((p) => (p.dxs_b ? [p.e_ev, p.xs_b, p.dxs_b] : [p.e_ev, p.xs_b]) as [number, number] | [number, number, number]),
          }
        })
    }
  }
  const what = xs.mt_name ?? `MT ${q.mt}`
  return {
    title: `${q.nuclide} ${what} cross section`,
    subtitle: `${q.nuclide}${xs.reaction ? xs.reaction.replace("z", "n") : ""}, MT ${q.mt}${xs.temp ? `, ${xs.temp}` : ""}`,
    series,
    measured,
    xLabel: "Incident neutron energy (eV)",
    yLabel: "Cross section (b)",
    ...(q.annotation ? { annotation: q.annotation } : {}),
    source: `${series.map((s) => s.name).join(", ")}, point-wise${xs.temp ? ` at ${xs.temp}` : ""}${exforSource ? `; ${exforSource}` : ""}`,
  }
}

type ChainResponse = { head: string; members: { nuclide: string; probability: number; stable: boolean; half_life?: number; half_life_unit?: string; decay_modes?: string }[] }
const UNIT: Record<string, string> = { y: "y", d: "d", h: "h", m: "min", s: "s", ms: "ms", us: "µs", ns: "ns" }
/** "4468000000 y" as "4.468×10⁹ y"; "245500 y" as "245,500 y". */
const span = (v: number, unit: string) => `${v >= 1e6 ? fmt(v) : v >= 1000 ? Math.round(v).toLocaleString("en-US") : String(v)} ${UNIT[unit] ?? unit}`
/** The mode a member leaves by, from ICRP's list ("A SF", "B-IT", "B-A"): the first. */
const modeOf = (modes?: string) => {
  const m = (modes ?? "").trim().split(/\s+/)[0] ?? ""
  if (m.startsWith("B-")) return "B-"
  if (m.startsWith("B+")) return "B+"
  if (m.startsWith("EC")) return "EC"
  if (m.startsWith("IT")) return "IT"
  if (m.startsWith("SF")) return "SF"
  if (m.startsWith("A")) return "A"
  return undefined
}

async function decayChain(q: { nuclide: string }): Promise<Props> {
  const chain = await get<ChainResponse>(`/icrp/chain/${encodeURIComponent(q.nuclide)}`)
  // The main path: the members reached more than half the time, in order (ICRP lists the branches beside them).
  let main = chain.members.filter((m) => m.nuclide !== "SF" && m.probability >= 0.5)
  if (main.length > 15) main = [...main.slice(0, 14), main[main.length - 1]]
  if (main.length < 2) throw new Error(`${q.nuclide} has no chain to draw.`)
  return {
    title: `The ${chain.head} decay chain`,
    steps: main.map((m, i) => ({
      nuclide: m.nuclide,
      ...(m.stable ? { stable: true } : { halfLife: m.half_life != null && m.half_life_unit ? span(m.half_life, m.half_life_unit) : undefined, mode: i < main.length - 1 ? modeOf(m.decay_modes) : undefined }),
    })),
    source: "ICRP Publication 107, main branch",
  }
}

type NuclideResponse = { nuclide: { half_life_s: number | null; half_life_text?: string | null }; source?: string }
const ENSDF_UNIT: Record<string, string> = { Y: "y", D: "d", H: "h", M: "min", S: "s", MS: "ms", US: "µs", NS: "ns", PS: "ps" }
/** ENSDF's "1925.28 D 14" as "1,925.28 d": the value and its unit, the uncertainty digits dropped. */
const ensdfText = (t: string) => {
  const [v, u] = t.trim().split(/\s+/)
  const n = Number(v)
  return `${Number.isFinite(n) && n >= 1000 ? n.toLocaleString("en-US", { maximumFractionDigits: 3 }) : v} ${ENSDF_UNIT[u?.toUpperCase()] ?? u ?? ""}`.trim()
}

async function halfLifeBars(q: { nuclides: string[] }): Promise<Props> {
  const got = await Promise.all(q.nuclides.map((n) => get<NuclideResponse>(`/nuclide/${encodeURIComponent(n)}`).then((r) => ({ n, r })).catch(() => null)))
  const rows = got
    .filter((g): g is { n: string; r: NuclideResponse } => !!g && !!g.r.nuclide?.half_life_s && g.r.nuclide.half_life_s > 0)
    .map(({ n, r }) => ({ label: n, seconds: r.nuclide.half_life_s!, text: r.nuclide.half_life_text ? ensdfText(r.nuclide.half_life_text) : fmt(r.nuclide.half_life_s!) + " s" }))
  if (rows.length < 2) throw new Error("Fewer than two of those nuclides have a half-life in ENSDF.")
  const source = got.find((g) => g?.r.source)?.r.source
  return {
    title: rows.length <= 4 ? `Half-lives of ${rows.map((r) => r.label).join(", ")}` : `Half-lives of ${rows.length} nuclides`,
    rows,
    source: source ? `${source.replace(/^ENSDF\s*/, "ENSDF, ")}` : "ENSDF",
  }
}

/** The template's props from the block's data. */
export function loadProps(templateId: QueryId, data: unknown): Promise<Props> {
  if (templateId === "xs-curve") return xsCurve(data as Parameters<typeof xsCurve>[0])
  if (templateId === "decay-chain") return decayChain(data as { nuclide: string })
  return halfLifeBars(data as { nuclides: string[] })
}
