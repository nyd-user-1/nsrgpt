"use client"

import {
  Background,
  Controls,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useNodesState,
  useReactFlow,
  ViewportPortal,
  type Connection,
  type Edge as FlowEdge,
  type EdgeChange,
  type Node,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { ChevronDown, ChevronRight, LayoutDashboard, PanelBottom, Play, Plus, Rows3, Save, type LucideIcon } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { BlockNode } from "@/components/lab/BlockNode"
import { KIND_ICON, LabContext, PORT_COLOR, type LabContextValue } from "@/components/lab/LabContext"
import { KIND_DRAG, LabRail } from "@/components/lab/LabRail"
import { LabRight } from "@/components/lab/LabRight"
import { OutputPane } from "@/components/lab/OutputPane"
import { useLab } from "@/components/lab/useLab"
import { setRail } from "@/components/rail-toggle"
import { Button } from "@/components/ui/button"
import { streamChat, type ChatTurn } from "@/lib/chat-stream"
import { inputsFor, isDataset, newId, portsMatch, seriesList, type Block, type BlockKind, type Canvas, type Dataset, type Edge, type Side } from "@/lib/lab/blocks"
import { PlotChart } from "@/components/lab/PlotChart"
import type { PlotMode } from "@/lib/lab/canvases/plot"

const ChatMarkdown = lazy(() => import("@/components/chat/ChatMessage").then((m) => ({ default: m.ChatMarkdown })))
import { DEFAULT_CANVAS } from "@/lib/lab/default"
import { KINDS, newBlock } from "@/lib/lab/kinds"
import { answerOnly, contextOf } from "@/lib/lab/kinds/prompt"
import { listCanvases, loadCanvas, saveCanvas, type SavedCanvas } from "@/lib/lab/save"

// /lab (brief 52): the workbench. Left, the block kinds and the saved canvases; the canvas of blocks that run; right, the
// selected block's settings and output, or the copilot; beneath, the selected block's output as a table or text and the
// run log. /lab opens the default canvas (lib/lab/default.ts), /lab?canvas=<id> a saved one.

const nodeTypes = { block: BlockNode }
/** The fit leaves the toolbar its strip at the top, so it never covers a block's header. */
const FIT = { padding: { top: "64px", right: "32px", bottom: "32px", left: "32px" }, maxZoom: 1 } as const

/** The lanes (Brendan, 2026-11-10): a block's kind puts it in a stage, and the stages stand left to right. */
const LANES = ["Sources", "Process", "Compare", "Results"] as const
const STAGE: Record<BlockKind, number> = { data: 0, process: 1, compare: 2, plot: 3, prompt: 3 }
const LANE_GAP = 40
const LANE_GUTTER = 120
type Lane = { label: string; x: number; w: number }
/** Each lane's icon, the kind's own, beside the lane's name (Brendan, 2026-11-10); the blocks' headers carry none. */
const LANE_ICON: Record<string, LucideIcon> = { Sources: KIND_ICON.data, Process: KIND_ICON.process, Compare: KIND_ICON.compare, Results: KIND_ICON.plot }
/** Each stage's colour, for its frame's dotted edge, its tint and its name (Brendan, 2026-11-10). */
const LANE_COLOR: Record<string, string> = { Sources: "#2a78d6", Process: "#1baf7a", Compare: "#eda100", Results: "#9b6bdf" }
/** What a port colour carries, for the legend. */
const PORT_LABEL = { dataset: "Dataset: rows and columns", series: "Series: x and y, a curve or points", text: "Text" } as const

const fresh = (): Canvas => {
  const now = new Date().toISOString()
  return { id: newId("canvas"), name: "Untitled canvas", blocks: [newBlock("data", { x: 0, y: 0 })], edges: [], created_at: now, updated_at: now }
}

function LabInner() {
  const lab = useLab(DEFAULT_CANVAS)
  const { canvas, outputs } = lab
  const router = useRouter()
  const params = useSearchParams()
  const canvasParam = params.get("canvas")
  const isNew = !canvasParam && params.get("new") === "1"
  const flow = useReactFlow()
  const [selected, setSelected] = useState<string | null>(null)
  const [subentry, setSubentry] = useState<string | null>(null)
  const [saved, setSaved] = useState<SavedCanvas[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [asking, setAsking] = useState<string | null>(null)
  // A save puts the new id in the URL; that change must not reopen the canvas it came from.
  const skipLoad = useRef<string | null>(null)

  const refreshSaved = useCallback(() => listCanvases().then(setSaved).catch(() => setSaved([])), [])
  useEffect(() => { void refreshSaved() }, [refreshSaved])

  // The drawers and the output sheet open shut (Brendan, 2026-11-09); the rail tabs open them. The rails are set before
  // the panels mount, so the right one no longer draws open and slides shut (Brendan, 2026-11-10).
  const [railsReady, setRailsReady] = useState(false)
  useLayoutEffect(() => {
    setRail("left", true)
    setRail("right", true)
    setRailsReady(true)
  }, [])

  // Tidy, lanes by stage (Brendan, 2026-11-10): four columns, Sources, Process, Compare, Results, each as wide as its widest
  // block; a block stands in its kind's lane, the lane's blocks stacked in the order of the blocks that feed them, each
  // block's measured size respected. The default canvas opens in lanes; the top-right circle re-tidies after edits; a
  // dragged block snaps back to a lane's left edge and keeps its height.
  const pendingTidy = useRef(false)
  const nodesInitialized = useNodesInitialized()
  const [lanes, setLanes] = useState<Lane[]>([])
  // Notebook (option 6, a switch): the stages as rows, top to bottom, the plot full width at the foot. Outputs in panels
  // (option 7, a switch): the Plot and the Prompt stand as cards and show their output in the sheet and the right panel.
  const [notebook, setNotebook] = useState(false)
  const [outputsInPanels, setOutputsInPanels] = useState(false)
  const tidy = useCallback(() => {
    const measured = new Map(flow.getNodes().map((n) => [n.id, n.measured]))
    const sizeOf = (b: Block) => ({ w: measured.get(b.id)?.width ?? b.size?.w ?? 300, h: measured.get(b.id)?.height ?? b.size?.h ?? 320 })
    const byLane: Block[][] = LANES.map(() => [])
    for (const b of canvas.blocks) byLane[STAGE[b.kind]].push(b)
    const order = new Map<string, number>()
    // Blocks fed from the stage before stand level with their sources; the unfed keep the canvas's order after them.
    const key = (b: Block) => {
      const from = canvas.edges.filter((e) => e.target === b.id).map((e) => order.get(e.source)).filter((n): n is number => n !== undefined)
      return from.length ? from.reduce((a, c) => a + c, 0) / from.length : Number.POSITIVE_INFINITY
    }
    const out: Lane[] = []
    if (notebook) {
      // Rows: each stage's blocks side by side; the widest row sets the page, and the Plot takes the whole of it.
      const rowWidth = Math.max(560, ...byLane.map((list) => list.reduce((w, b) => w + sizeOf(b).w, 0) + Math.max(0, list.length - 1) * LANE_GAP))
      let y = 0
      byLane.forEach((list, i) => {
        const sorted = [...list].sort((a, b) => key(a) - key(b))
        let x = 0
        let rowH = 0
        sorted.forEach((b, k) => {
          order.set(b.id, k)
          if (b.kind === "plot") lab.resize(b.id, { w: rowWidth, h: sizeOf(b).h })
          lab.move(b.id, { x, y })
          x += (b.kind === "plot" ? rowWidth : sizeOf(b).w) + LANE_GAP
          rowH = Math.max(rowH, sizeOf(b).h)
        })
        if (list.length) {
          out.push({ label: LANES[i], x: 0, w: rowWidth })
          y += rowH + LANE_GAP + 44
        }
      })
    } else {
      let x = 0
      byLane.forEach((list, i) => {
        const w = Math.max(240, ...list.map((b) => sizeOf(b).w))
        const sorted = [...list].sort((a, b) => key(a) - key(b))
        let y = 0
        sorted.forEach((b, k) => {
          order.set(b.id, k)
          if (b.kind === "plot" && b.size) lab.resize(b.id, undefined)
          lab.move(b.id, { x, y })
          y += sizeOf(b).h + LANE_GAP
        })
        out.push({ label: LANES[i], x, w })
        x += w + LANE_GUTTER
      })
    }
    setLanes(out)
    requestAnimationFrame(() => flow.fitView(FIT))
  }, [canvas.blocks, canvas.edges, flow, lab, notebook])
  /** A dropped block lands on the nearest lane's left edge in the lanes layout; in the notebook it stays where it was put. */
  const snap = useCallback((id: string, p: { x: number; y: number }) => {
    const lane = !notebook && lanes.length ? lanes.reduce((best, l) => (Math.abs(l.x - p.x) < Math.abs(best.x - p.x) ? l : best)) : null
    lab.move(id, { x: lane ? lane.x : p.x, y: p.y })
  }, [lanes, lab, notebook])
  useEffect(() => {
    if (!nodesInitialized || !pendingTidy.current) return
    pendingTidy.current = false
    tidy()
  }, [nodesInitialized, tidy])
  // A layout switch re-tidies into the other shape at once.
  const firstLayout = useRef(true)
  useEffect(() => {
    if (firstLayout.current) { firstLayout.current = false; return }
    pendingTidy.current = false
    tidy()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notebook])
  // The view fits once, on load; nothing recentres it afterwards (Brendan, 2026-11-10). Tidy is the circle, by hand.
  const [legendOpen, setLegendOpen] = useState(false)
  // The rails close over 500 ms after the page draws, and the canvas widens under the first fit; fit again once they
  // have settled (Brendan, 2026-11-10).
  const fitSettled = useCallback(() => {
    requestAnimationFrame(() => flow.fitView(FIT))
    for (const ms of [650, 1150]) window.setTimeout(() => flow.fitView(FIT), ms)
  }, [flow])

  // Open the canvas the URL names, a new one (?new=1), or the default.
  useEffect(() => {
    if (skipLoad.current !== null && skipLoad.current === canvasParam) return
    skipLoad.current = null
    setSelected(null)
    setSubentry(null)
    if (isNew) {
      lab.open(fresh())
      fitSettled()
      return
    }
    if (!canvasParam) {
      lab.open(structuredClone(DEFAULT_CANVAS))
      pendingTidy.current = true
      fitSettled()
      return
    }
    loadCanvas(canvasParam)
      .then((c) => { lab.open(c); fitSettled() })
      .catch((e) => toast.error((e as Error).message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasParam, isNew])

  // React Flow keeps the nodes (it measures them); the canvas is the record, written back when a drag ends.
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const layoutKey = canvas.blocks.map((b) => `${b.id}:${b.position.x},${b.position.y}`).join("|")
  useEffect(() => {
    setNodes((prev) => canvas.blocks.map((b) => {
      const old = prev.find((n) => n.id === b.id)
      return { ...(old ?? {}), id: b.id, type: "block", position: b.position, dragHandle: ".lab-grip", data: {} }
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey, setNodes])

  // The frames: each lane's rectangle around its blocks as they stand now, from React Flow's measured nodes, 16 px of
  // room around them and 30 px over them for the name.
  const frames = useMemo(() => {
    if (!lanes.length) return [] as { label: string; x: number; y: number; w: number; h: number }[]
    return lanes.map((l, i) => {
      const mine = nodes.filter((n) => STAGE[(canvas.blocks.find((b) => b.id === n.id)?.kind ?? "data")] === i)
      if (!mine.length) return null
      const top = Math.min(...mine.map((n) => n.position.y))
      const bottom = Math.max(...mine.map((n) => n.position.y + (n.measured?.height ?? 320)))
      const left = Math.min(l.x, ...mine.map((n) => n.position.x))
      const right = Math.max(l.x + l.w, ...mine.map((n) => n.position.x + (n.measured?.width ?? 300)))
      return { label: l.label, x: left - 16, y: top - 44, w: right - left + 32, h: bottom - top + 60 }
    }).filter((f): f is { label: string; x: number; y: number; w: number; h: number } => f !== null)
  }, [lanes, nodes, canvas.blocks])

  const [edgeSel, setEdgeSel] = useState<Set<string>>(new Set())
  // Floating edges (Brendan, 2026-11-10): an edge's ends sit on the sides that face each other, worked out from where the
  // two blocks stand, so a moved block takes its dots with it; a side the reader drew the end to is kept.
  const sidesOf = useCallback((e: Edge): { s: Side; t: Side } => {
    if (e.sourceSide && e.targetSide) return { s: e.sourceSide, t: e.targetSide }
    const a = nodes.find((n) => n.id === e.source), b = nodes.find((n) => n.id === e.target)
    if (!a || !b) return { s: e.sourceSide ?? "right", t: e.targetSide ?? "left" }
    const centre = (n: Node) => ({ x: n.position.x + (n.measured?.width ?? 300) / 2, y: n.position.y + (n.measured?.height ?? 320) / 2 })
    const ca = centre(a), cb = centre(b)
    const dx = cb.x - ca.x, dy = cb.y - ca.y
    const auto: { s: Side; t: Side } = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? { s: "right", t: "left" } : { s: "left", t: "right" }) : dy >= 0 ? { s: "bottom", t: "top" } : { s: "top", t: "bottom" }
    return { s: e.sourceSide ?? auto.s, t: e.targetSide ?? auto.t }
  }, [nodes])
  const edges: FlowEdge[] = useMemo(() => canvas.edges.map((e) => {
    const from = canvas.blocks.find((b) => b.id === e.source)
    const port = from?.outputs[e.sourceHandle]
    const { s, t } = sidesOf(e)
    return {
      ...e,
      sourceHandle: `${e.sourceHandle}@${s}`,
      targetHandle: `${e.targetHandle}@${t}`,
      selected: edgeSel.has(e.id),
      type: "smoothstep",
      pathOptions: { borderRadius: 14, offset: 28 },
      animated: from?.state.status === "running",
      reconnectable: true,
      style: { stroke: port ? PORT_COLOR[port] : undefined, strokeWidth: edgeSel.has(e.id) ? 2.5 : 1.5 },
    }
  }), [canvas.edges, canvas.blocks, edgeSel, sidesOf])
  const usedHandles = useMemo(() => {
    const set = new Set<string>()
    for (const e of canvas.edges) {
      const { s, t } = sidesOf(e)
      set.add(`${e.source}:${e.sourceHandle}@${s}`)
      set.add(`${e.target}:${e.targetHandle}@${t}`)
    }
    return set
  }, [canvas.edges, sidesOf])
  /** A handle id on the canvas is `${port}@${side}`. */
  const splitHandle = (h: string | null | undefined): { port: string; side?: Side } => {
    const [port, side] = (h ?? "").split("@")
    return { port, side: side as Side | undefined }
  }

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    for (const c of changes) {
      if (c.type === "remove") lab.disconnect(c.id)
      if (c.type === "select") setEdgeSel((s) => { const n = new Set(s); if (c.selected) n.add(c.id); else n.delete(c.id); return n })
    }
  }, [lab])

  const portOf = useCallback((c: Connection | FlowEdge) => {
    const s = canvas.blocks.find((b) => b.id === c.source), t = canvas.blocks.find((b) => b.id === c.target)
    return { from: s?.outputs[splitHandle(c.sourceHandle).port], to: t?.inputs[splitHandle(c.targetHandle).port] }
  }, [canvas.blocks])
  const onConnect = useCallback((c: Connection) => {
    const { from, to } = portOf(c)
    if (!portsMatch(from, to)) return toast.info(`A ${from ?? "?"} output joins a ${from ?? "matching"} input only`)
    if (c.source === c.target) return
    const sh = splitHandle(c.sourceHandle), th = splitHandle(c.targetHandle)
    lab.connect({ source: c.source, sourceHandle: sh.port, target: c.target, targetHandle: th.port, sourceSide: sh.side, targetSide: th.side })
  }, [lab, portOf])
  // An edge's end dragged to another dot (React Flow's reconnect): the port, and the side it was drawn to, are kept.
  const onReconnect = useCallback((old: FlowEdge, c: Connection) => {
    const { from, to } = portOf(c)
    if (!portsMatch(from, to) || c.source === c.target) return
    const sh = splitHandle(c.sourceHandle), th = splitHandle(c.targetHandle)
    lab.reconnect(old.id, { source: c.source, sourceHandle: sh.port, target: c.target, targetHandle: th.port, sourceSide: sh.side, targetSide: th.side })
  }, [lab, portOf])

  const addAt = useCallback((kind: BlockKind, screen?: { x: number; y: number }) => {
    const box = document.querySelector(".lab-flow")?.getBoundingClientRect()
    const at = screen ?? (box ? { x: box.left + box.width / 2 - 150, y: box.top + box.height / 2 - 100 } : { x: 0, y: 0 })
    const id = lab.addBlock(kind, flow.screenToFlowPosition(at))
    setSelected(id)
  }, [lab, flow])

  const save = useCallback(async () => {
    setSaving(true)
    try {
      const id = await saveCanvas(lab.canvas)
      lab.setId(id)
      skipLoad.current = id
      router.replace(`/lab?canvas=${id}`)
      toast.success(`Saved "${lab.canvas.name}"`)
      void refreshSaved()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }, [lab, router, refreshSaved])

  const openCanvas = useCallback((id: string | null) => router.push(id ? `/lab?canvas=${id}` : "/lab"), [router])
  // ?new=1 opens one; already there, open another in place.
  const newCanvas = useCallback(() => {
    if (!isNew) return router.push("/lab?new=1")
    setSelected(null)
    setSubentry(null)
    lab.open(fresh())
    requestAnimationFrame(() => flow.fitView(FIT))
  }, [lab, router, flow, isNew])

  // A Prompt's follow-up: the prompt, its answer and the conversation so far, with the block's inputs as context.
  const ask = useCallback(async (blockId: string, q: string) => {
    const b = lab.canvas.blocks.find((x) => x.id === blockId)
    const answer = lab.outputs[blockId]?.text
    if (!b || typeof answer !== "string") return
    const p = b.params as { prompt?: string; chat?: ChatTurn[] }
    const history: ChatTurn[] = [...(p.chat ?? []), { role: "user", content: q }]
    lab.setQuietParams(blockId, { chat: [...history, { role: "assistant", content: "" }] })
    setAsking(blockId)
    try {
      const full = await streamChat(
        {
          messages: [{ role: "user", content: p.prompt ?? "" }, { role: "assistant", content: answer }, ...history],
          systemContext: `The user is on the Lab, asking a follow-up to a prompt block. Its inputs:\n\n${contextOf(inputsFor(b, lab.canvas.edges, lab.outputs)) || "(none connected)"}`,
        },
        (cur) => lab.setQuietParams(blockId, { chat: [...history, { role: "assistant", content: answerOnly(cur, true) }] }),
      )
      lab.setQuietParams(blockId, { chat: [...history, { role: "assistant", content: answerOnly(full) }] })
    } catch (e) {
      lab.setQuietParams(blockId, { chat: [...history, { role: "assistant", content: `Error: ${(e as Error).message}` }] })
    } finally {
      setAsking(null)
    }
  }, [lab])

  const ctx: LabContextValue = useMemo(() => ({
    lab,
    selected,
    select: (id) => { setSelected(id); setSubentry(null) },
    openSubentry: (id) => setSubentry(id),
    ask: (id, q) => void ask(id, q),
    asking,
    usedHandles,
    outputsInPanels,
  }), [lab, selected, ask, asking, usedHandles, outputsInPanels])

  const running = canvas.blocks.some((b) => b.state.status === "running")
  const sel = canvas.blocks.find((b) => b.id === selected) ?? null

  // The sheet's preview when outputs read in the panels: the selected Plot's chart, or the selected Prompt's answer.
  const preview = useMemo(() => {
    if (!outputsInPanels || !sel) return null
    if (sel.kind === "plot") {
      const inputs = inputsFor(sel, canvas.edges, outputs)
      const points = (inputs.points ?? []).find(isDataset) as Dataset | undefined
      const series = (inputs.series ?? []).flatMap(seriesList), ratio = (inputs.ratio ?? []).flatMap(seriesList)
      const p = sel.params as { mode?: PlotMode; highlight?: [number, number] }
      if (!points && !series.length && !ratio.length) return null
      return <PlotChart className="h-full min-h-[200px]" points={points} series={series} ratio={ratio} mode={p.mode ?? "both"} highlight={p.highlight} title={sel.title} onPoint={(d) => setSubentry(d)} />
    }
    if (sel.kind === "prompt") {
      const text = typeof outputs[sel.id]?.text === "string" ? (outputs[sel.id]!.text as string) : ""
      return text ? <Suspense fallback={<p className="whitespace-pre-wrap text-xs">{text}</p>}><div className="max-w-3xl p-2"><ChatMarkdown content={text} size="sm" /></div></Suspense> : null
    }
    return null
  }, [outputsInPanels, sel, canvas.edges, outputs])

  return (
    <LabContext.Provider value={ctx}>
      <div className="flex h-full min-h-0">
        {railsReady && <LabRail saved={saved} current={canvasParam ?? (canvas.id === DEFAULT_CANVAS.id ? DEFAULT_CANVAS.id : canvas.id)} onAdd={(k) => addAt(k)} onOpen={openCanvas} onNew={newCanvas} />}
        <div className="flex min-w-0 flex-1 flex-col">
          <div
            className="lab-flow relative min-h-0 flex-1"
            onDragOver={(e) => { if (e.dataTransfer.types.includes(KIND_DRAG)) { e.preventDefault(); e.dataTransfer.dropEffect = "copy" } }}
            onDrop={(e) => {
              const k = e.dataTransfer.getData(KIND_DRAG) as BlockKind
              if (!KINDS[k]) return
              e.preventDefault()
              addAt(k, { x: e.clientX, y: e.clientY })
            }}
          >
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onReconnect={onReconnect}
              edgesReconnectable
              isValidConnection={(c) => c.source !== c.target && portsMatch(portOf(c).from, portOf(c).to)}
              onNodeDragStop={(_, n) => snap(n.id, n.position)}
              onNodeClick={(_, n) => { setSelected(n.id); setSubentry(null) }}
              onNodeDoubleClick={(_, n) => void flow.fitView({ nodes: [{ id: n.id }], duration: 400, padding: 0.2, maxZoom: 1.25 })}
              onPaneClick={() => { setSelected(null); setSubentry(null); setEdgeSel(new Set()) }}
              onNodesDelete={(del) => { for (const n of del) lab.remove(n.id); if (del.some((n) => n.id === selected)) setSelected(null) }}
              deleteKeyCode={["Backspace", "Delete"]}
              fitView
              fitViewOptions={FIT}
              minZoom={0.2}
              proOptions={{ hideAttribution: true }}
            >
              {/* The graph canvas's three groups, in its dress (Brendan, 2026-11-09): top left the title where the search
                  sits on /graph, its circle a click-to-copy; top right the tools, Run all and New canvas with Tidy between;
                  bottom right the save, where /graph keeps share, download and copy. */}
              {/* The dots' legend (Brendan, 2026-11-10), top left where the title pill was: an accordion, folded at rest, that
                  opens to the three port colours. */}
              <Panel position="top-left">
                <div className="rounded-lg border border-[var(--paper-rule)] bg-[var(--paper)] text-[11px] text-[var(--paper-muted)] shadow-sm">
                  <button type="button" aria-expanded={legendOpen} onClick={() => setLegendOpen((v) => !v)} className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left hover:text-[var(--paper-text)]">
                    {legendOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    Legend
                  </button>
                  {legendOpen && (
                    <ul className="flex flex-col gap-1 border-t border-[var(--paper-rule-soft)] px-2.5 py-1.5">
                      {(Object.keys(PORT_COLOR) as (keyof typeof PORT_COLOR)[]).map((port) => (
                        <li key={port} className="flex items-center gap-2">
                          <span aria-hidden className="inline-block h-3 w-3 rounded-full border-2 border-[var(--paper)]" style={{ background: PORT_COLOR[port] }} />
                          {PORT_LABEL[port]}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </Panel>
              <Panel position="top-right">
                <div className="flex items-center gap-1.5 rounded-full border bg-[var(--paper)] p-1 shadow-sm backdrop-blur-sm">
                  <Button variant="outline" aria-label="Run all" title="Run all" className="h-8 w-8 shrink-0 rounded-full p-0" onClick={() => void lab.runAll()} disabled={running}>
                    <Play className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" aria-label="Tidy the layout" title="Tidy" className="h-8 w-8 shrink-0 rounded-full p-0" onClick={tidy}>
                    <LayoutDashboard className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" aria-label="New canvas" title="New canvas" className="h-8 w-8 shrink-0 rounded-full p-0" onClick={newCanvas}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </Panel>
              {/* The lanes' names over their columns, in the canvas's own coordinates, so they pan and zoom with the blocks. */}
              {/* Group frames (Brendan, 2026-11-10, option 5): a labelled frame around each stage's blocks, in the canvas's
                  coordinates behind the blocks, its name and the kind's icon in its top-left corner. */}
              <ViewportPortal>
                {frames.map((f) => {
                  const LaneIcon = LANE_ICON[f.label]
                  return (
                    <div key={f.label} style={{ position: "absolute", left: f.x, top: f.y, width: f.w, height: f.h, zIndex: -1, borderColor: LANE_COLOR[f.label], background: `${LANE_COLOR[f.label]}14` }} className="pointer-events-none select-none rounded-2xl border border-dotted">
                      <div className="flex items-center gap-1.5 px-3 pt-2 text-[11px] uppercase tracking-wider" style={{ color: LANE_COLOR[f.label] }}>
                        {LaneIcon && <LaneIcon className="h-3.5 w-3.5" />}
                        {f.label}
                      </div>
                    </div>
                  )
                })}
              </ViewportPortal>
              <Background gap={24} size={1} />
              <Controls showInteractive={false} />
            </ReactFlow>
            {/* Bottom right (Brendan, 2026-11-10): the two layout switches, Notebook (the stages as rows, the plot full width)
                and Outputs in panels (the chart and the answer in the sheet), then Save. */}
            <div className="absolute bottom-4 right-4 z-10 flex items-center gap-1.5 rounded-full border bg-[var(--paper)] p-1 shadow-sm backdrop-blur-sm">
              <Button variant="outline" aria-label="Notebook layout" aria-pressed={notebook} title={notebook ? "Lanes" : "Notebook"} className={`h-8 w-8 shrink-0 rounded-full p-0 ${notebook ? "bg-[var(--paper-quiet)]" : ""}`} onClick={() => { setNotebook((v) => !v); pendingTidy.current = true }}>
                <Rows3 className="h-4 w-4" />
              </Button>
              <Button variant="outline" aria-label="Outputs in the panels" aria-pressed={outputsInPanels} title={outputsInPanels ? "Outputs on the canvas" : "Outputs in the panels"} className={`h-8 w-8 shrink-0 rounded-full p-0 ${outputsInPanels ? "bg-[var(--paper-quiet)]" : ""}`} onClick={() => setOutputsInPanels((v) => !v)}>
                <PanelBottom className="h-4 w-4" />
              </Button>
              <Button variant="outline" aria-label="Save the canvas" title="Save" className="h-8 w-8 shrink-0 rounded-full p-0" onClick={save} disabled={saving}>
                <Save className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <OutputPane block={sel} outputs={sel ? outputs[sel.id] : undefined} logs={lab.logs} preview={preview} />
        </div>
        {railsReady && <LabRight subentry={subentry} onCloseSubentry={() => setSubentry(null)} />}
      </div>
    </LabContext.Provider>
  )
}

export function LabPage() {
  return (
    <ReactFlowProvider>
      <LabInner />
    </ReactFlowProvider>
  )
}
