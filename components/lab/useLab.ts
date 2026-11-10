"use client"

import { useCallback, useRef, useState } from "react"

import { apiUrl } from "@/lib/api-url"
import {
  inputsFor,
  newId,
  runAllOrder,
  upstreamOrder,
  type Block,
  type BlockKind,
  type BlockState,
  type BlockStatus,
  type Canvas,
  type Edge,
  type Outputs,
  type RunContext,
} from "@/lib/lab/blocks"
import { KINDS, newBlock } from "@/lib/lab/kinds"

// The Lab's state and run engine (brief 52): the canvas, each block's outputs (kept in memory, never saved), and the run
// log. Run on a block runs its upstream blocks first when they aren't done, in topological order; Run all runs every
// block; a canvas opening reruns the blocks it was saved with done, so its outputs come back.

export type RunLog = { id: string; blockId: string; title: string; kind: BlockKind; status: "done" | "failed" | "stopped"; at: string; ms: number; error?: string }

export type Lab = ReturnType<typeof useLab>

export function useLab(initial: Canvas) {
  const [canvas, setCanvasState] = useState<Canvas>(initial)
  const canvasRef = useRef(canvas)
  const setCanvas = useCallback((f: (c: Canvas) => Canvas) => {
    canvasRef.current = f(canvasRef.current)
    setCanvasState(canvasRef.current)
  }, [])
  const [outputs, setOutputs] = useState<Record<string, Outputs>>({})
  const outRef = useRef(outputs)
  const [logs, setLogs] = useState<RunLog[]>([])
  const ctrls = useRef(new Map<string, AbortController>())
  const inflight = useRef(new Map<string, Promise<boolean>>())
  // Each open starts a new generation; a run left over from an earlier one ends without touching the new state.
  const gen = useRef(0)

  const block =(id: string) => canvasRef.current.blocks.find((b) => b.id === id)
  const patch = useCallback((id: string, f: (b: Block) => Block) => setCanvas((c) => ({ ...c, blocks: c.blocks.map((b) => (b.id === id ? f(b) : b)) })), [setCanvas])
  const setState = useCallback((id: string, state: BlockState) => patch(id, (b) => ({ ...b, state })), [patch])
  const setOut = useCallback((id: string, o: Outputs | undefined) => {
    const next = { ...outRef.current }
    if (o) next[id] = o
    else delete next[id]
    outRef.current = next
    setOutputs(next)
  }, [])
  const log = (b: Block, status: RunLog["status"], ms: number, error?: string) =>
    setLogs((l) => [{ id: newId("run"), blockId: b.id, title: b.title, kind: b.kind, status, at: new Date().toISOString(), ms, error }, ...l].slice(0, 200))

  const doRun = async (id: string): Promise<boolean> => {
    const b = block(id)
    if (!b) return false
    ctrls.current.get(id)?.abort()
    const ctrl = new AbortController()
    const mine = gen.current
    ctrls.current.set(id, ctrl)
    const startedAt = new Date().toISOString()
    const t0 = performance.now()
    const ms = () => Math.round(performance.now() - t0)
    setState(id, { status: "running", startedAt })
    const ctx: RunContext = {
      api: (path, init) => fetch(apiUrl(path), { ...init, signal: ctrl.signal }),
      jobs: (path, init) => fetch(path.length > 1 ? `/api/jobs?id=${encodeURIComponent(path.replace(/^\//, ""))}` : "/api/jobs", { ...init, signal: init && "signal" in init ? init.signal : ctrl.signal }),
      signal: ctrl.signal,
      progress: (detail) => { if (!ctrl.signal.aborted) setState(id, { status: "running", startedAt, detail }) },
      partial: (o) => { if (!ctrl.signal.aborted) setOut(id, o) },
    }
    try {
      const o = await KINDS[b.kind].run(b.params, inputsFor(b, canvasRef.current.edges, outRef.current), ctx)
      if (ctrl.signal.aborted) return false
      setOut(id, o)
      setState(id, { status: "done", startedAt, ms: ms() })
      log(b, "done", ms())
      return true
    } catch (e) {
      const stopped = (e as Error).name === "AbortError"
      if (mine !== gen.current) return false
      if (stopped) {
        setState(id, { status: "idle" })
        log(b, "stopped", ms())
      } else {
        const error = (e as Error).message || "The block failed."
        setState(id, { status: "failed", startedAt, ms: ms(), error })
        log(b, "failed", ms(), error)
      }
      return false
    } finally {
      if (ctrls.current.get(id) === ctrl) ctrls.current.delete(id)
    }
  }

  /** One block, once at a time: a second call while it runs waits for the first. */
  const runOne = (id: string): Promise<boolean> => {
    const cur = inflight.current.get(id)
    if (cur) return cur
    const p: Promise<boolean> = doRun(id).finally(() => { if (inflight.current.get(id) === p) inflight.current.delete(id) })
    inflight.current.set(id, p)
    return p
  }

  const done = (id: string): boolean => block(id)?.state.status === "done" && !!outRef.current[id]

  /** Run `ids` (in topological order): each starts once those of its inputs in the set are done, so blocks that don't
   *  feed each other run side by side. A block whose input failed doesn't run and says which. */
  const runSet = async (ids: string[]): Promise<void> => {
    const mine = gen.current
    const set = new Set(ids)
    const edges = canvasRef.current.edges
    const runs = new Map<string, Promise<boolean>>()
    for (const id of ids) {
      const ups = [...new Set(edges.filter((e) => e.target === id && set.has(e.source)).map((e) => e.source))]
      runs.set(id, Promise.all(ups.map((u) => runs.get(u) ?? Promise.resolve(true))).then((oks) => {
        if (mine !== gen.current) return false
        const failed = ups.find((_, i) => !oks[i])
        if (failed === undefined) return runOne(id)
        setState(id, { status: "failed", error: `An input failed: ${block(failed)?.title ?? failed}` })
        return false
      }))
    }
    await Promise.all(runs.values())
  }

  /** Run a block: its upstream blocks first where they aren't done. */
  const run = useCallback(async (id: string) => {
    const c = canvasRef.current
    let order: string[]
    try {
      order = upstreamOrder(c.blocks, c.edges, id)
    } catch (e) {
      setState(id, { status: "failed", error: (e as Error).message })
      return
    }
    await runSet([...order.slice(0, -1).filter((u) => !done(u)), id])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setState])

  /** Run every block (or those `only` picks), each after its inputs, the independent ones at once. */
  const runAll = useCallback(async (only?: (b: Block) => boolean) => {
    const c = canvasRef.current
    let order: string[]
    try {
      order = runAllOrder(c.blocks, c.edges)
    } catch {
      return
    }
    await runSet(order.filter((id) => { const b = block(id); return !!b && (!only || only(b)) }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const stop = useCallback((id: string) => ctrls.current.get(id)?.abort(), [])

  /** Open a canvas: stop everything, forget outputs, rerun the blocks it was saved with done. */
  const open = useCallback((c: Canvas) => {
    gen.current += 1
    for (const ctrl of ctrls.current.values()) ctrl.abort()
    ctrls.current.clear()
    inflight.current.clear()
    outRef.current = {}
    setOutputs({})
    const wasDone = new Set(c.blocks.filter((b) => b.state.status === "done").map((b) => b.id))
    setCanvas(() => ({ ...c, blocks: c.blocks.map((b) => ({ ...b, state: { status: "idle" as BlockStatus } })) }))
    if (wasDone.size) void runAll((b) => wasDone.has(b.id))
  }, [setCanvas, runAll])

  const addBlock = useCallback((kind: BlockKind, position: { x: number; y: number }) => {
    const b = newBlock(kind, position)
    setCanvas((c) => ({ ...c, blocks: [...c.blocks, b] }))
    return b.id
  }, [setCanvas])

  /** New params leave the block idle: its output stays on screen until it runs again. */
  const setParams = useCallback((id: string, params: Record<string, unknown>) =>
    patch(id, (b) => ({ ...b, params: { ...b.params, ...params }, state: b.state.status === "running" ? b.state : { status: "idle" } })), [patch])
  /** Params that don't change the output (a Prompt's follow-up conversation, a Plot's mode). */
  const setQuietParams = useCallback((id: string, params: Record<string, unknown>) => patch(id, (b) => ({ ...b, params: { ...b.params, ...params } })), [patch])
  const rename = useCallback((id: string, title: string) => patch(id, (b) => ({ ...b, title })), [patch])
  const move = useCallback((id: string, position: { x: number; y: number }) => patch(id, (b) => ({ ...b, position })), [patch])
  const resize = useCallback((id: string, size: { w: number; h: number } | undefined) => patch(id, (b) => ({ ...b, size })), [patch])

  const duplicate = useCallback((id: string) => {
    const b = block(id)
    if (!b) return
    const copy: Block = { ...structuredClone(b), id: newId(b.kind), title: `${b.title} (copy)`, position: { x: b.position.x + 40, y: b.position.y + 40 }, state: { status: "idle" } }
    setCanvas((c) => ({ ...c, blocks: [...c.blocks, copy] }))
    return copy.id
  }, [setCanvas])

  const remove = useCallback((id: string) => {
    ctrls.current.get(id)?.abort()
    setOut(id, undefined)
    setCanvas((c) => ({ ...c, blocks: c.blocks.filter((b) => b.id !== id), edges: c.edges.filter((e) => e.source !== id && e.target !== id) }))
  }, [setCanvas, setOut])

  const connect = useCallback((e: Omit<Edge, "id">) => {
    const id = `${e.source}.${e.sourceHandle}-${e.target}.${e.targetHandle}`
    setCanvas((c) => (c.edges.some((x) => x.id === id) ? c : { ...c, edges: [...c.edges, { id, ...e }] }))
  }, [setCanvas])
  const disconnect = useCallback((id: string) => setCanvas((c) => ({ ...c, edges: c.edges.filter((e) => e.id !== id) })), [setCanvas])
  const setName = useCallback((name: string) => setCanvas((c) => ({ ...c, name })), [setCanvas])
  const setId = useCallback((id: string) => setCanvas((c) => ({ ...c, id })), [setCanvas])

  return { canvas, outputs, logs, run, runAll, stop, open, addBlock, setParams, setQuietParams, rename, move, resize, duplicate, remove, connect, disconnect, setName, setId }
}
