// Reaction networks (brief 28): the s-process charts (Ag to Sb; mass 201 to 210) as squares on the N-Z chart with
// capture and β− arrows and the legend box, and the rp-process path. parsing-1's diagram files (brief 29) when they
// are published, in spec.ts's node and edge shape; until then the s-process walk over the Live Chart ground states
// (lib/diagram/data.ts sProcessWalk).
import { loadDiagramFile, sProcessWalk } from "../data"
import { DEFAULTS_BY_KIND, type DiagramEdge, type DiagramNode, type DiagramSpec } from "../spec"

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
    { label: "Proton capture", color: "#d1242f" }, { label: "β+ decay", color: "#1b8c3a" }] },
]

type FileShape = { nodes?: DiagramNode[]; edges?: DiagramEdge[] }
const usable = (f: FileShape | null): f is Required<FileShape> =>
  !!f && Array.isArray(f.nodes) && Array.isArray(f.edges) && f.nodes.every((x) => typeof x.z === "number" && typeof x.a === "number")

export async function loadReaction(spec: DiagramSpec): Promise<DiagramSpec> {
  const file = await loadDiagramFile<FileShape>(`${spec.id}.json`)
  if (usable(file)) return { ...spec, nodes: file.nodes, edges: file.edges }
  if (spec.id === "s-process-ag-sb") return { ...spec, ...(await sProcessWalk([47, 60], (z) => z >= 47 && z <= 51)) }
  if (spec.id === "mass-201-210") return { ...spec, ...(await sProcessWalk([80, 121], (z, n) => z + n >= 201 && z + n <= 210 && z >= 80 && z <= 84)) }
  throw new Error("the rp-process path is not published yet (parsing-1, brief 29)")
}
