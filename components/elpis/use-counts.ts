"use client"
// /elpis/browse (brief 69): the lake's figures beside each held row (scripts/elpis/browse-counts.mjs):
// public/elpis/counts/index.json for a base's libraries, public/elpis/counts/<base>/<library>.json below a library.
// Library, data type and element rows count materials (EXFOR: points); isotope rows count File 3 points for cross
// sections and sections for the other types (EXFOR: points).
import { useEffect, useState } from "react"
import type { JanisRow } from "@/lib/janis-tree"

type Index = { index: Record<string, Record<string, number>> }
type LibCounts = { unit: "materials" | "points"; lib: number; types: Record<string, number>; el: Record<string, Record<string, number>>; iso: Record<string, Record<string, number>> }
/** The browse URL's data type slug to the counts' class, for the evaluated libraries (EXFOR's classes are its slugs). */
const ENDF_CLASS: Record<string, string> = {
  "DA-DE": "DADE", "Resonance-parameters-(MF2)": "RP", "Covariances-(MF31-to-MF35)": "COV",
  "Photon-production-(MF12-to-MF15)": "PP", "Multiplicities-(MF9,-MF10)": "MULT",
}

const cache = new Map<string, Promise<unknown>>()
const getJson = <T,>(url: string): Promise<T | null> => {
  if (!cache.has(url)) cache.set(url, fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null))
  return cache.get(url) as Promise<T | null>
}
function useJson<T>(url: string | null): T | null {
  const [got, setGot] = useState<{ url: string; v: T | null } | null>(null)
  useEffect(() => {
    if (!url) return
    let live = true
    getJson<T>(url).then((v) => { if (live) setGot({ url, v }) })
    return () => { live = false }
  }, [url])
  return got && got.url === url ? got.v : null
}

export type RowCount = { n: number; unit: string }
/** A function giving each row of /elpis/browse/<path> its figure, or null where the lake has none. */
export function useBrowseCounts(path: string[]): (r: JanisRow) => RowCount | null {
  const index = useJson<Index>(path.length === 1 ? "/elpis/counts/index.json" : null)
  const lib = useJson<LibCounts>(path.length >= 2 && path.length <= 4 ? `/elpis/counts/${encodeURIComponent(path[0])}/${encodeURIComponent(path[1])}.json` : null)
  return (r) => {
    if (r.mark === "missing") return null
    const slug = decodeURIComponent(r.href.split("/").pop() ?? "")
    if (path.length === 1) {
      const n = index?.index[path[0]]?.[slug]
      return n === undefined ? null : { n, unit: slug === "EXFOR" ? "points" : "materials" }
    }
    if (!lib) return null
    const cls = (s: string) => (lib.unit === "points" ? s : ENDF_CLASS[s] ?? s)
    const n = path.length === 2 ? lib.types[cls(slug)]
      : path.length === 3 ? lib.el[cls(path[2])]?.[slug]
      : lib.iso[cls(path[2])]?.[r.name]
    const unit = lib.unit === "points" ? "points" : path.length === 4 ? (cls(path[2]) === "SIG" ? "File 3 points" : "sections") : "materials"
    return n === undefined ? null : { n, unit }
  }
}
