// The seeds of the Views and Recipes lists (Brendan, 2026-11-08, brief 30), moved here from /api/community (brief 34):
// three views and three recipes. scripts/community/seed.mjs writes them once into the store (DynamoDB nsrgpt-views)
// under these ids; /api/community answers with them only when the store isn't reachable. A seed's state is what the Save
// button stores (nodes and edges), or a library diagram to open (`diagram`), or a node to centre and expand once
// (`center`). Plain TypeScript with no imports, so the seed script runs it with `node --experimental-strip-types`.

export type SeedNode = { type: string; id: string; label: string; sub?: string; title?: string; prompt?: string; x: number; y: number }
export type SeedState = { nodes: SeedNode[]; edges: { s: string; t: string }[]; diagram?: string; center?: { type: string; id: string; label: string; sub?: string } }
export type Seed = { id: string; name: string; saved_by: string; created_at: string; state: SeedState }

const key = (n: { type: string; id: string }) => `${n.type}:${n.id}`

/** A recipe: its context nodes in a column on the left, wired into one prompt step on the right. */
function recipe(id: string, name: string, prompt: string, context: Omit<SeedNode, "x" | "y">[]): Seed {
  const nodes: SeedNode[] = context.map((n, i) => ({ ...n, x: 0, y: i * 120 }))
  const step: SeedNode = { type: "prompt", id: `seed${id}`, label: "Prompt step", prompt, x: 420, y: ((context.length - 1) * 120) / 2 }
  return { id, name, saved_by: "NSRgpt", created_at: "2026-11-08", state: { nodes: [...nodes, step], edges: nodes.map((n) => ({ s: key(n), t: key(step) })) } }
}

export const SEEDS: Seed[] = [
  { id: "1", name: "Thorium series, discs", saved_by: "NSRgpt", created_at: "2026-11-08", state: { nodes: [], edges: [], diagram: "thorium-series" } },
  { id: "2", name: "s-process, Ag to Sb", saved_by: "NSRgpt", created_at: "2026-11-08", state: { nodes: [], edges: [], diagram: "s-process-ag-sb" } },
  { id: "3", name: "137Cs neighbourhood", saved_by: "NSRgpt", created_at: "2026-11-08", state: { nodes: [], edges: [], center: { type: "nuclide", id: "137CS", label: "137Cs", sub: "Z=55 N=82" } } },
  recipe("4", "Summarise the papers on this canvas", "Summarise the papers on this canvas: for each, what was measured, by what method, and the result with its uncertainty; then say where they agree and where they differ.", [
    { type: "paper", id: "1965GI06", label: "1965GI06", title: "Half-Life of Cesium-137", sub: "1965" },
    { type: "paper", id: "1973CO39", label: "1973CO39", title: "Radiometric Measurement of the Half-Life of Caesium-137", sub: "1973" },
    { type: "paper", id: "1978GR08", label: "1978GR08", title: "Determination of the Half-Life of 137Cs by a New Method", sub: "1978" },
  ]),
  recipe("5", "Measured against evaluated for the selected reaction", "For this reaction on this target, compare the measured cross sections (EXFOR) with the evaluated ones (ENDF/B-VIII.1): where they agree, where they differ and by how much, and which measurements the evaluation leans on.", [
    { type: "nuclide", id: "235U", label: "235U", sub: "Z=92 N=143" },
    { type: "reaction", id: "(N,F)", label: "(N,F)", sub: "neutron-induced fission" },
  ]),
  recipe("6", "Trace this decay chain and list the half-lives", "Trace the decay chain from this nuclide to its stable end. List every member in order with its half-life and the decay mode that leads to the next, and give the branching where the chain splits.", [
    { type: "nuclide", id: "232TH", label: "232Th", sub: "Z=90 N=142" },
  ]),
]

/** The files the Library listed before the store (brief 30): they stay where they are, under their display names. */
export const SEED_FILES = [
  { key: "files/pdfs/arxiv/1311.7043.pdf", name: "2014BE25, decay rates of 40K and 232Th.pdf", size: 269659, modified: "2026-11-06" },
  { key: "files/pdfs/workspace/exfor-10001.x4", name: "EXFOR 10001.x4", size: 614466, modified: "2026-11-08" },
  { key: "files/pdfs/workspace/ensdf-60CO.ens", name: "ENSDF 60Co adopted levels.ens", size: 92826, modified: "2026-11-08" },
]
