// Scales and number formats every NSRgpt template shares. Pure functions, no imports.

/** About `count` round ticks from lo to hi, on 1, 2 or 5 times a power of ten. */
export function niceTicks(lo: number, hi: number, count = 5): number[] {
  if (!(hi > lo)) return [lo]
  const raw = (hi - lo) / count
  const p = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = [1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw) ?? 10 * p
  const out: number[] = []
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Number(v.toPrecision(12)))
  return out
}

/** The decades a log axis spans, as powers of ten. */
export function decades(lo: number, hi: number): number[] {
  const out: number[] = []
  for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) out.push(Math.pow(10, e))
  return out
}

/** A figure for a label: grouped thousands, a few significant digits, powers of ten in short form. */
export function fmt(v: number): string {
  const a = Math.abs(v)
  if (a !== 0 && (a >= 1e6 || a < 1e-3)) {
    const e = Math.floor(Math.log10(a))
    const m = v / Math.pow(10, e)
    return `${Math.abs(m - 1) < 1e-9 ? "" : `${Number(m.toPrecision(3))}×`}10${sup(e)}`
  }
  if (a >= 100) return Math.round(v).toLocaleString("en-US")
  return String(Number(v.toPrecision(3)))
}

const SUP: Record<string, string> = { "-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" }
/** An exponent in superscript digits. */
export const sup = (e: number) => String(e).split("").map((c) => SUP[c] ?? c).join("")
