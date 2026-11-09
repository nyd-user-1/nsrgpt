import { compact } from "@/lib/compact"
import { isDataset, seriesList, type AnyValue, type Dataset, type Series } from "@/lib/lab/blocks"

/** A count in short form: 304K, 9.1M (lib/compact.ts). */
export function short(n: number): string {
  const f = compact(n)
  return `${f.count.toFixed(f.decimals)}${f.suffix}`
}

/** "1 row" / "12K rows". */
export const plural = (n: number, one: string, many = `${one}s`) => `${short(n)} ${n === 1 ? one : many}`

/** A number for a table cell or a label: four significant figures, exponent form outside 1e-3 to 1e5. */
export function num(v: number): string {
  if (!Number.isFinite(v)) return String(v)
  const a = Math.abs(v)
  if (a !== 0 && (a < 1e-3 || a >= 1e5)) {
    const [m, e] = v.toExponential(3).split("e")
    return `${m}E${Number(e)}`
  }
  return String(Number(v.toPrecision(4)))
}

/** One line for any port value, for a block's foot. */
export function describe(v: AnyValue | undefined): string {
  if (v === undefined) return ""
  if (typeof v === "string") return plural(v.split(/\s+/).filter(Boolean).length, "word")
  if (isDataset(v)) return plural(v.rows.length, "row")
  const list = seriesList(v)
  const points = list.reduce((s, x) => s + x.x.length, 0)
  return `${plural(list.length, "series", "series")} · ${plural(points, "point")}`
}

/** Points of a series inside [emin, emax], keeping one point beyond each edge so a line reaches the frame. */
export function window(s: Series, emin?: number, emax?: number): Series {
  if (emin === undefined && emax === undefined) return s
  const lo = emin ?? -Infinity, hi = emax ?? Infinity
  let a = s.x.findIndex((x) => x >= lo)
  if (a < 0) return { ...s, x: [], y: [], lo: s.lo && [], hi: s.hi && [] }
  a = Math.max(0, a - 1)
  let b = s.x.length - 1
  while (b > 0 && s.x[b] > hi) b--
  b = Math.min(s.x.length - 1, b + 1)
  const cut = <T,>(arr: T[] | undefined) => arr?.slice(a, b + 1)
  return { ...s, x: s.x.slice(a, b + 1), y: s.y.slice(a, b + 1), lo: cut(s.lo), hi: cut(s.hi) }
}

/** A dataset as CSV (RFC 4180 quoting). */
export function toCsv(d: Dataset): string {
  const q = (v: unknown) => {
    const s = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [d.columns.map(q).join(","), ...d.rows.map((r) => d.columns.map((c) => q(r[c])).join(","))].join("\n") + "\n"
}

/** Series as a long-form dataset: one row per point. */
export function seriesRows(list: Series[]): Dataset {
  const hasBand = list.some((s) => s.lo || s.hi)
  const columns = ["series", "x", "y", ...(hasBand ? ["lo", "hi"] : [])]
  const rows = list.flatMap((s) => s.x.map((x, i) => ({ series: s.name, x, y: s.y[i], ...(hasBand ? { lo: s.lo?.[i], hi: s.hi?.[i] } : {}) })))
  return { columns, rows }
}
