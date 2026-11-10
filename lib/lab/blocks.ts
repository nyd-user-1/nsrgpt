// The Lab's block contract (brief 52, 2026-11-09). /lab is a canvas of blocks that run: each block has typed ports, its
// kind's params, and a run state; values flow along edges by port type. A kind lives in lib/lab/kinds/<kind>.ts as a
// KindDef (its ports, default params, run and summary); lib/lab/kinds/index.ts lists them. The whole Lab is removed by
// deleting app/(site)/lab, components/lab, lib/lab and app/api/jobs.

/** What a port carries. */
export type Port = "dataset" | "series" | "text"

export type BlockKind = "data" | "process" | "compare" | "plot" | "prompt"

export type BlockStatus = "idle" | "running" | "done" | "failed"

/** A block's run state. `detail` is the live line a running block shows (a job's "queued", "running 12 s"). */
export type BlockState = { status: BlockStatus; startedAt?: string; ms?: number; error?: string; detail?: string }

export type Block = {
  id: string
  kind: BlockKind
  title: string
  params: Record<string, unknown>
  position: { x: number; y: number }
  inputs: Record<string, Port>
  outputs: Record<string, Port>
  state: BlockState
}

export type Edge = { id: string; source: string; sourceHandle: string; target: string; targetHandle: string }

export type Canvas = { id: string; name: string; blocks: Block[]; edges: Edge[]; created_at: string; updated_at: string }

/** A table of rows. */
export type Dataset = { columns: string[]; rows: Record<string, unknown>[]; meta?: Record<string, unknown> }

/** One curve: y against x, with an optional band (lo, hi). */
export type Series = {
  name: string
  x: number[]
  y: number[]
  lo?: number[]
  hi?: number[]
  unit_x: string
  unit_y: string
  meta?: Record<string, unknown>
}

/** The value each port type carries. A series port may carry several curves. */
export type PortValue = { dataset: Dataset; series: Series | Series[]; text: string }
export type AnyValue = PortValue[Port]

/** A block's outputs by handle. */
export type Outputs = Record<string, AnyValue | undefined>

/** A block's inputs by handle: one value per connected edge, in edge order, so a handle can take several. */
export type Inputs = Record<string, AnyValue[]>

/** What a kind's run gets besides its params and inputs. */
export type RunContext = {
  /** GET or POST to the API (lib/api-url.ts): ctx.api("/endf/xs?…"). */
  api: (path: string, init?: RequestInit) => Promise<Response>
  /** The job proxy (app/api/jobs/route.ts): ctx.jobs("", { method: "POST", body }) or ctx.jobs(`/${id}`). Cancelled with the
   *  block unless the call passes its own `signal` (null: never, for a POST that must reach the runner once sent). */
  jobs: (path: string, init?: RequestInit) => Promise<Response>
  /** Cancelled when the block is stopped, rerun or deleted. */
  signal: AbortSignal
  /** The live line on the block while it runs. */
  progress: (detail: string) => void
  /** Outputs so far, for a kind that streams (Prompt). */
  partial: (outputs: Outputs) => void
}

/** One kind of block. */
export type KindDef<P extends Record<string, unknown> = Record<string, unknown>> = {
  kind: BlockKind
  title: string
  inputs: Record<string, Port>
  outputs: Record<string, Port>
  defaults: P
  run: (params: P, inputs: Inputs, ctx: RunContext) => Promise<Outputs>
  /** The block foot's one line for its outputs, e.g. "1.2K rows · 3 series". */
  summary?: (outputs: Outputs) => string
  /** One plain sentence the block shows above its foot when its output needs it, e.g. what a job did not do. */
  note?: (outputs: Outputs) => string | undefined
}

export const isSeries = (v: unknown): v is Series =>
  !!v && typeof v === "object" && Array.isArray((v as Series).x) && Array.isArray((v as Series).y)
export const isDataset = (v: unknown): v is Dataset =>
  !!v && typeof v === "object" && Array.isArray((v as Dataset).columns) && Array.isArray((v as Dataset).rows)

/** Every curve in a series value (one or several). */
export const seriesList = (v: AnyValue | undefined): Series[] => (Array.isArray(v) ? v : isSeries(v) ? [v] : [])

/** A block's inputs from its connected edges and the outputs computed so far. */
export function inputsFor(block: Block, edges: Edge[], outputs: Record<string, Outputs>): Inputs {
  const out: Inputs = {}
  for (const e of edges) {
    if (e.target !== block.id) continue
    const v = outputs[e.source]?.[e.sourceHandle]
    if (v !== undefined) (out[e.targetHandle] ??= []).push(v)
  }
  return out
}

/** The blocks a run of `id` needs, upstream first and `id` last (topological; a cycle throws). */
export function upstreamOrder(blocks: Block[], edges: Edge[], id: string): string[] {
  const order: string[] = []
  const state = new Map<string, 1 | 2>()
  const visit = (b: string) => {
    if (state.get(b) === 2) return
    if (state.get(b) === 1) throw new Error("The blocks form a loop.")
    state.set(b, 1)
    for (const e of edges) if (e.target === b) visit(e.source)
    state.set(b, 2)
    order.push(b)
  }
  if (blocks.some((b) => b.id === id)) visit(id)
  return order
}

/** Every block in an order that runs each after its inputs (Run all). */
export function runAllOrder(blocks: Block[], edges: Edge[]): string[] {
  const seen = new Set<string>()
  const order: string[] = []
  for (const b of blocks) for (const id of upstreamOrder(blocks, edges, b.id)) if (!seen.has(id)) { seen.add(id); order.push(id) }
  return order
}

/** Whether an edge joins ports of the same type. */
export function portsMatch(from: Port | undefined, to: Port | undefined): boolean {
  return !!from && !!to && from === to
}

export const newId = (prefix = "b") => `${prefix}-${Math.random().toString(36).slice(2, 10)}`

export const idleState = (): BlockState => ({ status: "idle" })
