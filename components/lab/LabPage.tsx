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
import { ChevronLeft, ChevronRight, Copy, LayoutDashboard, Play, Plus, Save } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { BlockNode } from "@/components/lab/BlockNode"
import { LabContext, PORT_COLOR, type LabContextValue } from "@/components/lab/LabContext"
import { KIND_DRAG, LabRail } from "@/components/lab/LabRail"
import { LabRight } from "@/components/lab/LabRight"
import { OutputPane } from "@/components/lab/OutputPane"
import { useLab } from "@/components/lab/useLab"
import { setRail } from "@/components/rail-toggle"
import { Button } from "@/components/ui/button"
import { streamChat, type ChatTurn } from "@/lib/chat-stream"
import { inputsFor, newId, portsMatch, type Block, type BlockKind, type Canvas } from "@/lib/lab/blocks"
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

/** The title at rest: up to its first colon or comma, with an ellipsis when that cut something. */
const shortName = (name: string) => {
  const cut = name.split(/[:,]/)[0].trim()
  return cut.length < name.trim().length ? `${cut}…` : cut
}

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

  // The drawers and the output sheet open shut (Brendan, 2026-11-09); the rail tabs open them.
  useEffect(() => {
    setRail("left", true)
    setRail("right", true)
  }, [])

  // Tidy, lanes by stage (Brendan, 2026-11-10): four columns, Sources, Process, Compare, Results, each as wide as its widest
  // block; a block stands in its kind's lane, the lane's blocks stacked in the order of the blocks that feed them, each
  // block's measured size respected. The default canvas opens in lanes; the top-right circle re-tidies after edits; a
  // dragged block snaps back to a lane's left edge and keeps its height.
  const pendingTidy = useRef(false)
  const nodesInitialized = useNodesInitialized()
  const [lanes, setLanes] = useState<Lane[]>([])
  const tidy = useCallback(() => {
    const measured = new Map(flow.getNodes().map((n) => [n.id, n.measured]))
    const sizeOf = (b: Block) => ({ w: measured.get(b.id)?.width ?? b.size?.w ?? 300, h: measured.get(b.id)?.height ?? b.size?.h ?? 320 })
    const byLane: Block[][] = LANES.map(() => [])
    for (const b of canvas.blocks) byLane[STAGE[b.kind]].push(b)
    const order = new Map<string, number>()
    const out: Lane[] = []
    let x = 0
    byLane.forEach((list, i) => {
      const w = Math.max(240, ...list.map((b) => sizeOf(b).w))
      // Blocks fed from the lane before stand level with their sources; the unfed keep the canvas's order after them.
      const key = (b: Block) => {
        const from = canvas.edges.filter((e) => e.target === b.id).map((e) => order.get(e.source)).filter((n): n is number => n !== undefined)
        return from.length ? from.reduce((a, c) => a + c, 0) / from.length : Number.POSITIVE_INFINITY
      }
      const sorted = [...list].sort((a, b) => key(a) - key(b))
      let y = 0
      sorted.forEach((b, k) => {
        order.set(b.id, k)
        lab.move(b.id, { x, y })
        y += sizeOf(b).h + LANE_GAP
      })
      out.push({ label: LANES[i], x, w })
      x += w + LANE_GUTTER
    })
    setLanes(out)
    requestAnimationFrame(() => flow.fitView(FIT))
  }, [canvas.blocks, canvas.edges, flow, lab])
  /** A dropped block lands on the nearest lane's left edge; its height stays where it was put. */
  const snap = useCallback((id: string, p: { x: number; y: number }) => {
    const lane = lanes.length ? lanes.reduce((best, l) => (Math.abs(l.x - p.x) < Math.abs(best.x - p.x) ? l : best)) : null
    lab.move(id, { x: lane ? lane.x : p.x, y: p.y })
  }, [lanes, lab])
  useEffect(() => {
    if (!nodesInitialized || !pendingTidy.current) return
    pendingTidy.current = false
    tidy()
  }, [nodesInitialized, tidy])
  // The view fits once, on load; nothing recentres it afterwards (Brendan, 2026-11-10). Tidy is the circle, by hand.
  const [titleOpen, setTitleOpen] = useState(false)
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

  const [edgeSel, setEdgeSel] = useState<Set<string>>(new Set())
  const edges: FlowEdge[] = useMemo(() => canvas.edges.map((e) => {
    const from = canvas.blocks.find((b) => b.id === e.source)
    const port = from?.outputs[e.sourceHandle]
    return {
      ...e,
      selected: edgeSel.has(e.id),
      type: "smoothstep",
      pathOptions: { borderRadius: 14, offset: 28 },
      animated: from?.state.status === "running",
      style: { stroke: port ? PORT_COLOR[port] : undefined, strokeWidth: edgeSel.has(e.id) ? 2.5 : 1.5 },
    }
  }), [canvas.edges, canvas.blocks, edgeSel])

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    for (const c of changes) {
      if (c.type === "remove") lab.disconnect(c.id)
      if (c.type === "select") setEdgeSel((s) => { const n = new Set(s); if (c.selected) n.add(c.id); else n.delete(c.id); return n })
    }
  }, [lab])

  const portOf = useCallback((c: Connection | FlowEdge) => {
    const s = canvas.blocks.find((b) => b.id === c.source), t = canvas.blocks.find((b) => b.id === c.target)
    return { from: s?.outputs[c.sourceHandle ?? ""], to: t?.inputs[c.targetHandle ?? ""] }
  }, [canvas.blocks])
  const onConnect = useCallback((c: Connection) => {
    const { from, to } = portOf(c)
    if (!portsMatch(from, to)) return toast.info(`A ${from ?? "?"} output joins a ${from ?? "matching"} input only`)
    if (c.source === c.target) return
    lab.connect({ source: c.source, sourceHandle: c.sourceHandle ?? "", target: c.target, targetHandle: c.targetHandle ?? "" })
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
  }), [lab, selected, ask, asking])

  const running = canvas.blocks.some((b) => b.state.status === "running")
  const sel = canvas.blocks.find((b) => b.id === selected) ?? null

  return (
    <LabContext.Provider value={ctx}>
      <div className="flex h-full min-h-0">
        <LabRail saved={saved} current={canvasParam ?? (canvas.id === DEFAULT_CANVAS.id ? DEFAULT_CANVAS.id : canvas.id)} onAdd={(k) => addAt(k)} onOpen={openCanvas} onNew={newCanvas} />
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
              <Panel position="top-left">
                {/* The title reads short at rest, its first clause and an ellipsis; the rail tab's chevron at its end grows on
                    hover as the tabs do and opens the pill to the full, editable name over 500 ms (Brendan, 2026-11-10). */}
                <div className="flex h-10 items-center gap-2 rounded-full border bg-[var(--paper)] p-1 shadow-sm backdrop-blur-sm">
                  <Button variant="outline" aria-label="Copy the canvas name" title="Copy" className="h-8 w-8 shrink-0 rounded-full p-0" onClick={() => void navigator.clipboard.writeText(canvas.name).then(() => toast.success("Copied"))}>
                    <Copy className="h-4 w-4" />
                  </Button>
                  <div className={`flex min-w-0 items-center overflow-hidden transition-[width] duration-[500ms] ease-in-out ${titleOpen ? "w-[24rem]" : "w-[7.5rem]"}`}>
                    {titleOpen ? (
                      <input
                        className="w-full min-w-0 bg-transparent text-[13px] text-[var(--paper-text)] outline-none"
                        defaultValue={canvas.name}
                        key={`${canvas.id}:${canvas.name}`}
                        aria-label="Canvas name"
                        autoFocus
                        onBlur={(e) => e.target.value.trim() && e.target.value !== canvas.name && lab.setName(e.target.value.trim())}
                        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur() }}
                      />
                    ) : (
                      <span className="truncate text-[13px] text-[var(--paper-text)]" title={canvas.name}>{shortName(canvas.name)}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    aria-label={titleOpen ? "Show the short title" : "Show the full title"}
                    aria-expanded={titleOpen}
                    onClick={() => setTitleOpen((v) => !v)}
                    className="flex h-8 w-4 shrink-0 items-center justify-center rounded-r-full text-[var(--paper-muted)] transition-[width,color] duration-200 ease-out hover:w-[17.5px] hover:text-[var(--paper-text)]"
                  >
                    {titleOpen ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  </button>
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
              <ViewportPortal>
                {lanes.map((l) => (
                  <div key={l.label} style={{ position: "absolute", left: l.x, top: -34, width: l.w }} className="pointer-events-none select-none border-b border-[var(--paper-rule-soft)] pb-1 text-[11px] uppercase tracking-wider text-[var(--paper-faint)]">
                    {l.label}
                  </div>
                ))}
              </ViewportPortal>
              <Background gap={24} size={1} />
              <Controls showInteractive={false} />
            </ReactFlow>
            <div className="absolute bottom-4 right-4 z-10 flex items-center rounded-full border bg-[var(--paper)] p-1 shadow-sm backdrop-blur-sm">
              <Button variant="outline" aria-label="Save the canvas" title="Save" className="h-8 w-8 shrink-0 rounded-full p-0" onClick={save} disabled={saving}>
                <Save className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <OutputPane block={sel} outputs={sel ? outputs[sel.id] : undefined} logs={lab.logs} />
        </div>
        <LabRight subentry={subentry} onCloseSubentry={() => setSubentry(null)} />
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
