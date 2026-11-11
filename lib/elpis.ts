// Elpis (brief 69, elpis-wire, 2026-11-11): what the /elpis pages need beside lib/janis-tree.ts, which describes JANIS's
// tree. The books' projectiles and sublibraries, the MT names as JANIS writes them, the EXFOR reaction of an MT, the API's
// and EXFOR's names for a nuclide, and the book index files (public/elpis/book-<p>.json, scripts/elpis/book-index.mjs).
// No "use client": server pages read it too.
import { symbolOfZ, Z_MAX } from "@/lib/janis-tree"

/** A book's projectile key to the API's sublibrary. */
export const BOOK_SUB: Record<string, string> = { n: "neutrons", g: "gammas", p: "protons", d: "deuterons", t: "tritons", h: "helium3s", a: "alphas" }
/** A book's projectile key to EXFOR's projectile code. */
export const EXFOR_PROJ: Record<string, string> = { n: "N", g: "G", p: "P", d: "D", t: "T", h: "HE3", a: "A" }
/** The projectile's mass number, for the threshold energy in the laboratory. */
const PROJ_A: Record<string, number> = { n: 1, g: 0, p: 1, d: 2, t: 3, h: 3, a: 4 }
/** JANIS's word for each book's base, the Series sheet's first row. */
export const BASE_NAME: Record<string, string> = { n: "Incident neutron data", g: "Incident gamma data", p: "Incident proton data", d: "Incident deuteron data", t: "Incident triton data", h: "Incident He3 data", a: "Incident alpha data" }

// ENDF-6 MTs by their outgoing particles (ENDF-102 appendix B), as scripts/sweep/reactions.py reads them.
const MT_PARTICLES: Record<number, string> = {
  11: "2N+D", 16: "2N", 17: "3N", 22: "N+A", 23: "N+3A", 24: "2N+A", 25: "3N+A", 28: "N+P", 29: "N+2A", 30: "2N+2A",
  32: "N+D", 33: "N+T", 34: "N+HE3", 35: "N+D+2A", 36: "N+T+2A", 37: "4N", 41: "2N+P", 42: "3N+P", 44: "N+2P",
  45: "N+P+A", 102: "G", 103: "P", 104: "D", 105: "T", 106: "HE3", 107: "A", 108: "2A", 109: "3A", 111: "2P",
  112: "P+A", 113: "T+2A", 114: "D+2A", 115: "P+D", 116: "P+T", 117: "D+A", 152: "5N", 153: "6N", 154: "2N+T",
  155: "T+A", 156: "4N+P", 157: "3N+D", 158: "N+D+A", 159: "2N+P+A", 160: "7N", 161: "8N", 162: "5N+P", 163: "6N+P",
  164: "7N+P", 165: "4N+A", 166: "5N+A", 167: "6N+A", 168: "7N+A", 169: "4N+D", 170: "5N+D", 171: "6N+D",
  172: "3N+T", 173: "4N+T", 174: "5N+T", 175: "6N+T", 176: "2N+HE3", 177: "3N+HE3", 178: "4N+HE3", 179: "3N+2P",
  180: "3N+2A", 181: "3N+P+A", 182: "D+T", 183: "N+P+D", 184: "N+P+T", 185: "N+D+T", 186: "N+P+HE3",
  187: "N+D+HE3", 188: "N+T+HE3", 189: "N+T+A", 190: "2N+2P", 191: "P+HE3", 192: "D+HE3", 193: "HE3+A",
  194: "4N+2P", 195: "4N+2A", 196: "4N+P+A", 197: "3P", 198: "N+3P", 199: "3N+2P+A", 200: "5N+2P",
}
const SHOW: Record<string, string> = { N: "n", P: "p", D: "d", T: "t", HE3: "³He", A: "α", G: "γ" }
const NAMED: Record<number, string> = { 1: "total", 2: "elastic", 3: "nonelastic", 5: "anything", 18: "fission", 19: "f", 20: "nf", 21: "2nf", 38: "3nf", 27: "absorption", 101: "disappearance", 91: "n'c" }
/** EXFOR's process for the named MTs. */
const EXFOR_NAMED: Record<number, string> = { 1: "TOT", 2: "EL", 3: "NON", 18: "F", 27: "ABS" }

const particles = (s: string) => s.split("+").map((t) => { const m = /^(\d*)(HE3|[A-Z])$/.exec(t); return m ? `${m[1]}${SHOW[m[2]]}` : t }).join("+")

/** "MT107 (n,α)", "MT4 (n,n')", "MT4 (p,n)", "MT18 (α,fission)", as JANIS's book rails write them. */
export function mtLabel(mt: number, symbol: string, key = "n"): string {
  let out: string | undefined
  if (mt === 4) out = key === "n" ? "n'" : "n"
  else if (NAMED[mt]) out = NAMED[mt]
  else if (MT_PARTICLES[mt]) out = particles(MT_PARTICLES[mt])
  else if (mt >= 51 && mt <= 90) out = `n'${mt - 50}`
  return out ? `MT${mt} (${symbol},${out})` : `MT${mt}`
}

/** The EXFOR reaction for a book page ("N,A", "P,2N", "G,N"), or null where EXFOR has no cross section for the MT as one
 *  reaction (levels, lumped and production MTs). */
export function exforReaction(key: string, mt: number): string | null {
  const proj = EXFOR_PROJ[key]
  if (!proj) return null
  if (EXFOR_NAMED[mt]) return mt === 27 && key !== "n" ? null : `${proj},${EXFOR_NAMED[mt]}`
  if (mt === 4) return key === "n" ? "N,INL" : `${proj},N`
  return MT_PARTICLES[mt] ? `${proj},${MT_PARTICLES[mt]}` : null
}

export type BookNuclide = { z: number; a: number | "Nat"; iso: string }
/** "5-B-11", "6-C-Nat", "27-Co-58m" -> its parts; null for anything else. */
export function parseBookNuclide(s: string): BookNuclide | null {
  const m = /^(\d{1,3})-([A-Za-z]{1,3})-(\d{1,3}|Nat)(m\d?)?$/.exec(s)
  if (!m) return null
  const z = parseInt(m[1], 10)
  return z <= Z_MAX ? { z, a: m[3] === "Nat" ? "Nat" : parseInt(m[3], 10), iso: m[4] ?? "" } : null
}
export const bookLabel = (n: BookNuclide) => `${n.z}-${symbolOfZ(n.z)}-${n.a}${n.iso}`
/** The API's material name: "B-11", "C-nat", "Am-242m". */
export const apiName = (n: BookNuclide) => `${symbolOfZ(n.z)}-${n.a === "Nat" ? "nat" : n.a}${n.iso}`
/** EXFOR's target: "B-11", "C-0", "Am-242-M". */
export const exforTarget = (n: BookNuclide) => `${symbolOfZ(n.z)}-${n.a === "Nat" ? 0 : n.a}${n.iso ? "-M" : ""}`
/** JANIS's short name in its node paths: "B11", "C0". */
export const shortName = (n: BookNuclide) => `${symbolOfZ(n.z)}${n.a === "Nat" ? 0 : n.a}${n.iso}`

/** A release as JANIS names the library: "B-VIII.1" -> "ENDF/B-VIII.1", "JENDL-4.0-HE" -> "JENDL-4.0/HE",
 *  "JENDL-HE-2007" -> "JENDL/HE-2007", "IAEA-PD-2019" -> "IAEA/PD-2019", "IRDF-2002-MG" -> "IRDF-2002 MG" (the lake's
 *  keys drop JANIS's slashes and spaces, elpis-fill's rule). */
export const libraryName = (r: string) =>
  r.startsWith("B-") ? `ENDF/${r}`
    : r.replace(/^(JENDL-\d+\.\d+)-(HE)$/, "$1/$2").replace(/^(JENDL|IAEA)-([A-Z]+)-(\d{4}(?:\.\d)?)$/, "$1/$2-$3").replace(/^(IRDF-2002)-MG$/, "$1 MG")

/** The threshold energy in the laboratory, eV, for a reaction Q value (eV) below zero; null otherwise. */
export function thresholdEv(qi: number | null | undefined, key: string, a: number | "Nat", z: number): number | null {
  if (qi == null || !(qi < 0)) return null
  const target = a === "Nat" ? Math.max(1, Math.round(2.5 * z)) : a
  return -qi * (target + PROJ_A[key]) / target
}

// ---------- the book index: public/elpis/book-<p>.json ----------
export type BookIndexNuclide = { l: string; n: string; m?: string; j?: string }
export type BookIndex = {
  projectile: string
  sub: string
  built: string
  releases: string[]
  janis_book: string
  counts: { nuclides: number; held_nuclides: number; janis_nuclides: number; missing_nuclides: number; ours_nuclides: number; mts_both: number; mts_missing: number; mts_ours: number }
  nuclides: BookIndexNuclide[]
}
export type RailMt = { mt: number; mine: boolean; janis: boolean; releases: string[] }

/** One nuclide's MT rows: every MT I hold a File 3 section for and every MT JANIS's book lists, in MT order. */
export function railMts(idx: BookIndex, n: BookIndexNuclide): RailMt[] {
  const mine = new Map((n.m ? n.m.split(" ") : []).map((x) => { const [mt, mask] = x.split(":").map(Number); return [mt, mask] as const }))
  const janis = new Set(n.j ? n.j.split(" ").map(Number) : [])
  return [...new Set([...mine.keys(), ...janis])].sort((x, y) => x - y).map((mt) => ({
    mt, mine: mine.has(mt), janis: janis.has(mt),
    releases: idx.releases.filter((_, i) => ((mine.get(mt) ?? 0) / 2 ** i) % 2 >= 1),
  }))
}

/** The index's elements in order, each with its nuclides. */
export function railElements(idx: BookIndex): { z: number; nuclides: BookIndexNuclide[] }[] {
  const by = new Map<number, BookIndexNuclide[]>()
  for (const n of idx.nuclides) {
    const z = parseInt(n.l, 10)
    if (!by.has(z)) by.set(z, [])
    by.get(z)!.push(n)
  }
  return [...by].sort((a, b) => a[0] - b[0]).map(([z, nuclides]) => ({ z, nuclides }))
}
