import type { Block, BlockKind, Canvas, Edge, Port } from "@/lib/lab/blocks"

// A Lab canvas for one sweep pair (brief 58, Part C.2, 2026-11-10): u235-nf-9-18-kev.ts generalised to any target,
// reaction, MT, window and releases, as a sweep row's `lab` names them (/lab?target=U-235&reaction=N,F&mt=18&emin=&
// emax=&releases=B-VIII.1,JEFF-3.3). Six blocks: the EXFOR points, the evaluations, their MF33 bands, the comparison,
// the plot and the Prompt. The evaluations feed the comparison as served (the sweep compares against them as served);
// there is no Broaden block, so opening a pair never starts a job on the job box: add a Process block to broaden.
// The data, comparison and plot open done, so the Lab runs them on open; the Prompt opens idle.

export type PairQuery = { target: string; reaction: string; mt: number; emin?: number; emax?: number; releases: string[] }

/** The pair a /lab URL names, or null when it names none (no target, reaction or MT). */
export function pairFromParams(p: URLSearchParams): PairQuery | null {
  const target = p.get("target")?.trim()
  const reaction = p.get("reaction")?.trim()
  const mt = Number(p.get("mt"))
  if (!target || !reaction || !Number.isFinite(mt) || mt <= 0) return null
  const num = (k: string) => {
    const v = Number(p.get(k))
    return p.get(k) && Number.isFinite(v) && v > 0 ? v : undefined
  }
  const releases = (p.get("releases") ?? "").split(",").map((s) => s.trim()).filter(Boolean)
  return { target, reaction, mt, emin: num("emin"), emax: num("emax"), releases: releases.length ? releases : ["B-VIII.1"] }
}

/** The /lab address that opens a pair. */
export function labHref(q: PairQuery): string {
  const s = new URLSearchParams({ target: q.target, reaction: q.reaction, mt: String(q.mt), releases: q.releases.join(",") })
  if (q.emin) s.set("emin", String(q.emin))
  if (q.emax) s.set("emax", String(q.emax))
  return `/lab?${s.toString()}`
}

/** Each kind's ports, as u235-nf-9-18-kev.ts has them (lib/lab/kinds/<kind>.ts). */
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

const ev = (e: number) => (e >= 1e6 ? `${+(e / 1e6).toPrecision(3)} MeV` : e >= 1e3 ? `${+(e / 1e3).toPrecision(3)} keV` : `${+e.toPrecision(3)} eV`)

/** "(n,f)" from "N,F": the reaction as the Lab's titles write it. */
const reactionText = (r: string) => `(${r.toLowerCase()})`

export function canvasFromPair(q: PairQuery): Canvas {
  // The window the sweep's bins span, with a decade's margin either side for the plot and the bands.
  const lo = q.emin ? q.emin / 10 : 1e-5
  const hi = q.emax ? q.emax * 10 : 2e7
  const window: [number, number] | undefined = q.emin && q.emax ? [q.emin, q.emax] : undefined
  const span = window ? ` between ${ev(window[0])} and ${ev(window[1])}` : ""
  const r = reactionText(q.reaction)
  const prompt = `Where do the measurements and the evaluations part on ${q.target} ${r}${span}, by how much, and which measurements carry it? Cite the EXFOR entries and the papers.`
  const now = new Date().toISOString()
  return {
    id: `pair-${q.target}-${q.mt}`.toLowerCase().replace(/[^a-z0-9-]+/g, "-"),
    name: `${q.target} ${r}: measured against evaluated${span}`,
    blocks: [
      block("exfor", "data", `EXFOR: ${q.target} ${r}`, 0, 0, { source: "exfor", target: q.target, reaction: q.reaction, quantity: "SIG", emin: lo, emax: hi }),
      block("endf", "data", `ENDF: ${q.target} MT${q.mt}`, 0, 340, { source: "endf", name: q.target, mt: q.mt, releases: q.releases, emin: lo, emax: hi }),
      block("cov", "data", `Covariance: ${q.target} MT${q.mt}`, 0, 680, { source: "cov", name: q.target, mt: q.mt, releases: q.releases, emin: lo, emax: hi }),
      block("compare", "compare", "Measured against evaluated", 360, 300, { binsPerDecade: 20, emin: lo, emax: hi, ...(window ? { highlight: window } : {}) }),
      block("plot", "plot", "σ against energy", 720, 0, { mode: "both", ...(window ? { highlight: window } : {}) }),
      block("prompt", "prompt", "Where they part", 720, 580, { prompt }, false),
    ],
    edges: [
      edge("exfor", "dataset", "compare", "points"),
      edge("endf", "series", "compare", "evaluations"),
      edge("cov", "dataset", "compare", "band"),
      edge("exfor", "dataset", "plot", "points"),
      edge("endf", "series", "plot", "series"),
      edge("compare", "ratio", "plot", "ratio"),
      edge("compare", "bins", "prompt", "dataset"),
      edge("exfor", "dataset", "prompt", "dataset"),
      edge("endf", "series", "prompt", "series"),
    ],
    created_at: now,
    updated_at: now,
  }
}
