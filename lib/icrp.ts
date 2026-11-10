import { apiUrl } from "@/lib/api-url"
import { ICRP_DIFFER_ROWS, ICRP_METHOD } from "@/lib/icrp-rows"

// ICRP 107's half-lives against ENSDF (brief 48; brief 58, item E), read by /sweep/icrp from GET /icrp/vs-ensdf
// (worker-1, brief 56 Part C). Until the route answers, the rows that don't agree within three sigma (lib/icrp-rows.ts,
// from brief 48's table) stand in, with `partial: true`.

export type IcrpRow = {
  nuclide: string
  icrp: string
  ensdf_text: string
  level_kev: number | null
  jpi: string
  diff_pct: number | null
  sigma: number | null
  match: string | null
  note: string
}
export type IcrpTable = { rows: IcrpRow[]; method: string; partial?: boolean }

type Obj = Record<string, unknown>
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {})
const num = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null)
const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v))

export async function fetchIcrp(): Promise<IcrpTable> {
  try {
    const r = await fetch(apiUrl("/icrp/vs-ensdf"))
    if (r.ok) {
      const j = await r.json()
      const o = obj(j)
      const rows = (Array.isArray(j) ? j : Array.isArray(o.rows) ? o.rows : []).map((v: unknown) => {
        const x = obj(v)
        // The route's fields (b569999): icrp_half_life with icrp_unit, ensdf_level_kev, ensdf_jpi, ensdf_text, rel_diff, sigmas,
        // alt_text (the ENSDF level that matches ICRP's half-life where the ground states swap), note.
        const icrp = x.icrp ?? (x.icrp_half_life !== undefined && x.icrp_half_life !== null ? `${str(x.icrp_half_life)} ${str(x.icrp_unit)}`.trim() : "")
        const rel = num(x.rel_diff)
        return {
          nuclide: `${str(x.nuclide)}${x.isomer && !str(x.nuclide).endsWith("m") ? str(x.isomer) : ""}`,
          icrp: str(icrp),
          ensdf_text: str(x.ensdf_text ?? x.ensdf_half_life_text ?? x.ensdf),
          level_kev: num(x.level_kev ?? x.ensdf_level_kev ?? x.energy_kev),
          jpi: str(x.jpi ?? x.ensdf_jpi),
          diff_pct: num(x.diff_pct) ?? (rel === null ? null : rel * 100),
          sigma: num(x.sigma ?? x.sigmas),
          match: x.alt_text ? str(x.alt_text) : x.match ? str(x.match) : null,
          note: str(x.note),
        }
      })
      return { rows, method: str(o.method) || ICRP_METHOD }
    }
  } catch {}
  return { rows: ICRP_DIFFER_ROWS, method: ICRP_METHOD, partial: true }
}
