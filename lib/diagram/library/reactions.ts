// Reaction networks (brief 28): the s-process charts (Ag to Sb; mass 201 to 210) as squares on the N-Z chart with
// capture and β− arrows and the legend box, and the rp-process path. From parsing-1's diagram files (brief 29); if a
// file is missing, the s-process walk over the Live Chart ground states (lib/diagram/data.ts sProcessWalk).
import { codeOf, decayChainsFrom, halfLifeOf, loadDiagramFile, loadGround, sProcessWalk } from "../data"
import { keyOf } from "@/lib/nuclide"
import { DEFAULTS_BY_KIND, type DiagramEdge, type DiagramNode, type DiagramSpec, type EdgeKind } from "../spec"

const LEGEND = [
  { label: "s-process path", color: "#f5d90a" },
  { label: "Neutron capture", color: "#d1242f" },
  { label: "β− decay", color: "#2f6fdc" },
  { label: "Stable, off the path", color: "#fbf3c4" },
]
const base = (id: string, title: string, subtype: string, source: string): DiagramSpec => ({
  id, title, kind: "reaction-network", subtype, source,
  defaults: { ...DEFAULTS_BY_KIND["reaction-network"], subtype },
  nodes: [], edges: [], legend: LEGEND,
})

export const REACTION_SPECS: DiagramSpec[] = [
  base("s-process-ag-sb", "s-process, Ag to Sb", "s-process", "https://en.wikipedia.org/wiki/S-process"),
  base("mass-201-210", "Mass 201 to 210, s and r", "s-process", "https://en.wikipedia.org/wiki/S-process"),
  { ...base("rp-process", "rp-process path", "rp-process", "https://en.wikipedia.org/wiki/Rp-process"), legend: [
    { label: "rp-process path", color: "#f5d90a" }, { label: "Proton capture", color: "#d1242f" }, { label: "β+ decay", color: "#1b8c3a" }] },
  // r-process: the N = 82 waiting points (Pd-128 to Sn-132) and their β− chains down to the stable isobars of the A ≈ 130 peak
  { ...base("r-process-n82", "r-process, N = 82 waiting points", "r-process", "https://en.wikipedia.org/wiki/R-process"), legend: [
    { label: "N = 82 waiting point, stable end", color: "#f5d90a" }, { label: "β− decay chain", color: "#fbf3c4" },
    { label: "β− decay, r-process feeding", color: "#2f6fdc" }] },
  // capture chain: cobalt activation in a reactor, Fe-58 (n,γ) Fe-59 β− Co-59 (n,γ) Co-60 β− Ni-60
  { ...base("cobalt-activation", "Activation of cobalt", "capture-chain", "https://en.wikipedia.org/wiki/Cobalt-60"),
    legend: [{ label: "Neutron capture", color: "#d1242f" }, { label: "β− decay", color: "#2f6fdc" }],
    nodes: [
      { id: "58FE", z: 26, a: 58, n: 32, symbol: "Fe" }, { id: "59FE", z: 26, a: 59, n: 33, symbol: "Fe" },
      { id: "59CO", z: 27, a: 59, n: 32, symbol: "Co" }, { id: "60CO", z: 27, a: 60, n: 33, symbol: "Co" },
      { id: "60NI", z: 28, a: 60, n: 32, symbol: "Ni" },
    ],
    edges: [
      { s: "58FE", t: "59FE", kind: "capture" }, { s: "59FE", t: "59CO", kind: "beta-" },
      { s: "59CO", t: "60CO", kind: "capture" }, { s: "60CO", t: "60NI", kind: "beta-" },
    ] },
]

// parsing-1's files (brief 29): nodes { id "Ag-107", z, n, a, symbol, halfLifeS, onPath, faint }, edges { from, to,
// kind: capture, p-capture, beta-, beta+, alpha; process "s" or "r" }. Shown: the path, the stable isotopes off it
// and anything an arrow touches; only the path is solid yellow, the rest pale (stable off the path, the r-process
// nuclides feeding it); a proton capture is a capture labelled (p,γ), r-process feeding is labelled r.
type FileNode = { id: string; z: number; n?: number; a: number; symbol: string; halfLifeS?: number | null; onPath?: boolean; faint?: boolean }
type FileEdge = { from: string; to: string; kind: string; process?: string }
type FileShape = { nodes?: FileNode[]; edges?: FileEdge[] }
const KINDS: Record<string, EdgeKind> = { capture: "capture", "p-capture": "capture", "beta-": "beta-", "beta+": "beta+", ec: "ec", alpha: "alpha" }

function fromFile(f: FileShape): { nodes: DiagramNode[]; edges: DiagramEdge[] } | null {
  if (!Array.isArray(f.nodes) || !Array.isArray(f.edges) || !f.nodes.length) return null
  const ids = new Map(f.nodes.map((x) => [x.id, codeOf(x.a, x.symbol)]))
  const touched = new Set(f.edges.flatMap((e) => [e.from, e.to]))
  const nodes = f.nodes
    .filter((x) => x.onPath || x.faint || touched.has(x.id) || x.onPath === undefined)
    .map((x): DiagramNode => ({
      id: ids.get(x.id) as string, z: x.z, a: x.a, n: x.n ?? x.a - x.z, symbol: x.symbol,
      halfLife: halfLifeOf(x.halfLifeS), faint: x.onPath === undefined ? !!x.faint : !x.onPath,
    }))
  const edges = f.edges
    .filter((e) => KINDS[e.kind] && ids.has(e.from) && ids.has(e.to))
    .map((e): DiagramEdge => {
      const label = e.kind === "p-capture" ? "(p,γ)" : e.process === "r" ? (e.kind === "beta-" ? "r β−" : `r ${e.kind}`) : undefined
      return { s: ids.get(e.from) as string, t: ids.get(e.to) as string, kind: KINDS[e.kind], label }
    })
  return { nodes, edges }
}

export async function loadReaction(spec: DiagramSpec): Promise<DiagramSpec> {
  if (spec.id === "r-process-n82") return { ...spec, ...(await decayChainsFrom([[46, 82], [47, 82], [48, 82], [49, 82], [50, 82]])) }
  if (spec.id === "cobalt-activation") {
    // half-lives from the Live Chart
    const ground = await loadGround()
    return { ...spec, nodes: spec.nodes.map((x) => ({ ...x, halfLife: halfLifeOf(ground.t.get(keyOf(x.z, x.a - x.z))) })) }
  }
  const file = await loadDiagramFile<FileShape>(`${spec.id}.json`)
  const drawn = file ? fromFile(file) : null
  if (drawn) return { ...spec, ...drawn }
  if (spec.id === "s-process-ag-sb") return { ...spec, ...(await sProcessWalk([47, 60], (z) => z >= 47 && z <= 51)) }
  if (spec.id === "mass-201-210") return { ...spec, ...(await sProcessWalk([80, 121], (z, n) => z + n >= 201 && z + n <= 210 && z >= 80 && z <= 84)) }
  throw new Error("the rp-process path is not published yet (parsing-1, brief 29)")
}
