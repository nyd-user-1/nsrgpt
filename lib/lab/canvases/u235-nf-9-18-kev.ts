import type { Block, BlockKind, Canvas, Edge, Port } from "@/lib/lab/blocks"

// The Lab's default canvas (brief 53): U-235 (n,f) between 9 and 18 keV, the EXFOR measurements against ENDF/B-VIII.1,
// JEFF-3.3 and JENDL-5, each broadened to 300 K, with the evaluations' MF33 uncertainty as the band. Data blocks in a
// column at left, Process and Compare in the middle, the Plot large at the top right and the Prompt beneath it. Blocks 1
// to 6 open done (the Lab reruns them on open from the warm results); the Prompt opens idle with Run showing. The
// unbroadened series (block 2) go to the Prompt as context: Process fetches the evaluations itself.

const RELEASES = ["B-VIII.1", "JEFF-3.3", "JENDL-5"]
const EMIN = 1e3
const EMAX = 2e5
const WINDOW: [number, number] = [9e3, 1.8e4]

export const U235_NF_PROMPT =
  "Where do the measurements and the evaluations part on U-235 (n,f) between 9 and 18 keV, by how much, and which measurements carry it? Cite the EXFOR entries and the papers."

/** Each kind's ports, by window-3's handles (lib/lab/kinds/<kind>.ts). */
const PORTS: Record<BlockKind, { inputs: Record<string, Port>; outputs: Record<string, Port> }> = {
  data: { inputs: {}, outputs: { dataset: "dataset", series: "series" } },
  process: { inputs: {}, outputs: { series: "series" } },
  compare: { inputs: { points: "dataset", data: "series", evaluations: "series", band: "dataset" }, outputs: { bins: "dataset", ratio: "series" } },
  plot: { inputs: { points: "dataset", series: "series", ratio: "series" }, outputs: {} },
  prompt: { inputs: { dataset: "dataset", series: "series", text: "text" }, outputs: { text: "text" } },
}

const block = (id: string, kind: BlockKind, title: string, x: number, y: number, params: Record<string, unknown>, done = true): Block => ({
  id,
  kind,
  title,
  params,
  position: { x, y },
  ...PORTS[kind],
  state: { status: done ? "done" : "idle" },
})

const edge = (source: string, sourceHandle: string, target: string, targetHandle: string): Edge => ({
  id: `${source}.${sourceHandle}-${target}.${targetHandle}`,
  source,
  sourceHandle,
  target,
  targetHandle,
})

export const U235_NF_CANVAS: Canvas = {
  id: "u235-nf-9-18-kev",
  name: "U-235 (n,f): measured against evaluated, 9 to 18 keV",
  blocks: [
    block("exfor", "data", "EXFOR: U-235 (n,f)", 0, 0, { source: "exfor", target: "U-235", reaction: "N,F", quantity: "SIG", emin: EMIN, emax: EMAX }),
    block("endf", "data", "ENDF: U-235 MT18", 0, 340, { source: "endf", name: "U-235", mt: 18, releases: RELEASES, emin: EMIN, emax: EMAX }),
    block("cov", "data", "Covariance: U-235 MT18", 0, 680, { source: "cov", name: "U-235", mt: 18, releases: RELEASES, emin: EMIN, emax: EMAX }),
    block("broaden", "process", "Broaden to 300 K", 360, 100, { op: "broaden", name: "U-235", mt: 18, releases: RELEASES, temperatures: [300], emin: EMIN, emax: EMAX }),
    block("compare", "compare", "Measured against evaluated", 360, 430, { binsPerDecade: 20, emin: EMIN, emax: EMAX, highlight: WINDOW }),
    block("plot", "plot", "σ against energy", 720, 0, { mode: "both", highlight: WINDOW }),
    block("prompt", "prompt", "Where they part", 720, 540, { prompt: U235_NF_PROMPT }, false),
  ],
  edges: [
    edge("exfor", "dataset", "compare", "points"),
    edge("broaden", "series", "compare", "evaluations"),
    edge("cov", "dataset", "compare", "band"),
    edge("exfor", "dataset", "plot", "points"),
    edge("broaden", "series", "plot", "series"),
    edge("compare", "ratio", "plot", "ratio"),
    edge("compare", "bins", "prompt", "dataset"),
    edge("exfor", "dataset", "prompt", "dataset"),
    edge("endf", "series", "prompt", "series"),
  ],
  created_at: "2026-11-09T00:00:00.000Z",
  updated_at: "2026-11-09T00:00:00.000Z",
}
