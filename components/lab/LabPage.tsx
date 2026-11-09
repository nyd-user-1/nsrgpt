"use client"

import {
  Background,
  Controls,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge as FlowEdge,
  type EdgeChange,
  type Node,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { FilePlus, Play, Save } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { BlockNode } from "@/components/lab/BlockNode"
import { LabContext, PORT_COLOR, type LabContextValue } from "@/components/lab/LabContext"
import { KIND_DRAG, LabRail } from "@/components/lab/LabRail"
import { LabRight } from "@/components/lab/LabRight"
import { OutputPane } from "@/components/lab/OutputPane"
import { useLab } from "@/components/lab/useLab"
import { Button } from "@/components/ui/button"
import { streamChat, type ChatTurn } from "@/lib/chat-stream"
import { inputsFor, newId, portsMatch, type BlockKind, type Canvas } from "@/lib/lab/blocks"
import { DEFAULT_CANVAS } from "@/lib/lab/default"
import { KINDS, newBlock } from "@/lib/lab/kinds"
import { contextOf } from "@/lib/lab/kinds/prompt"
import { listCanvases, loadCanvas, saveCanvas, type SavedCanvas } from "@/lib/lab/save"

// /lab (brief 52): the workbench. Left, the block kinds and the saved canvases; the canvas of blocks that run; right, the
// selected block's settings and output, or the copilot; beneath, the selected block's output as a table or text and the
// run log. /lab opens the default canvas (lib/lab/default.ts), /lab?canvas=<id> a saved one.

const nodeTypes = { block: BlockNode }

const fresh = (): Canvas => {
  const now = new Date().toISOString()
  return { id: newId("canvas"), name: "Untitled canvas", blocks: [newBlock("data", { x: 0, y: 0 })], edges: [], created_at: now, updated_at: now }
}

function LabInner() {
  const lab = useLab(structuredClone(DEFAULT_CANVAS))
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

  // Open the canvas the URL names, a new one (?new=1), or the default.
  useEffect(() => {
    if (skipLoad.current !== null && skipLoad.current === canvasParam) return
    skipLoad.current = null
    setSelected(null)
    setSubentry(null)
    if (isNew) {
      lab.open(fresh())
      requestAnimationFrame(() => flow.fitView({ padding: 0.4, maxZoom: 1 }))
      return
    }
    if (!canvasParam) {
      lab.open(structuredClone(DEFAULT_CANVAS))
      requestAnimationFrame(() => flow.fitView({ padding: 0.15 }))
      return
    }
    loadCanvas(canvasParam)
      .then((c) => { lab.open(c); requestAnimationFrame(() => flow.fitView({ padding: 0.15 })) })
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
    requestAnimationFrame(() => flow.fitView({ padding: 0.4, maxZoom: 1 }))
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
      await streamChat(
        {
          messages: [{ role: "user", content: p.prompt ?? "" }, { role: "assistant", content: answer }, ...history],
          systemContext: `The user is on the Lab, asking a follow-up to a prompt block. Its inputs:\n\n${contextOf(inputsFor(b, lab.canvas.edges, lab.outputs)) || "(none connected)"}`,
        },
        (cur) => lab.setQuietParams(blockId, { chat: [...history, { role: "assistant", content: cur }] }),
      )
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
              onNodeDragStop={(_, n) => lab.move(n.id, n.position)}
              onNodeClick={(_, n) => { setSelected(n.id); setSubentry(null) }}
              onPaneClick={() => { setSelected(null); setSubentry(null); setEdgeSel(new Set()) }}
              onNodesDelete={(del) => { for (const n of del) lab.remove(n.id); if (del.some((n) => n.id === selected)) setSelected(null) }}
              deleteKeyCode={["Backspace", "Delete"]}
              fitView
              fitViewOptions={{ padding: 0.15 }}
              minZoom={0.2}
              proOptions={{ hideAttribution: true }}
            >
              <Panel position="top-left">
                <div className="flex items-center gap-1.5 rounded-full border border-[var(--paper-rule)] bg-[var(--paper)] p-1 pl-3 shadow-sm">
                  <input
                    className="w-64 min-w-0 bg-transparent text-[13px] text-[var(--paper-text)] outline-none"
                    defaultValue={canvas.name}
                    key={`${canvas.id}:${canvas.name}`}
                    aria-label="Canvas name"
                    onBlur={(e) => e.target.value.trim() && e.target.value !== canvas.name && lab.setName(e.target.value.trim())}
                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur() }}
                  />
                  <Button variant="outline" className="h-8 shrink-0 gap-1.5 rounded-full px-3 text-xs" onClick={() => void lab.runAll()} disabled={running} title="Run every block">
                    <Play className="h-3.5 w-3.5" />Run all
                  </Button>
                  <Button variant="outline" aria-label="Save the canvas" title="Save" className="h-8 w-8 shrink-0 rounded-full p-0" onClick={save} disabled={saving}>
                    <Save className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" aria-label="New canvas" title="New canvas" className="h-8 w-8 shrink-0 rounded-full p-0" onClick={newCanvas}>
                    <FilePlus className="h-4 w-4" />
                  </Button>
                </div>
              </Panel>
              <Background gap={24} size={1} />
              <Controls showInteractive={false} />
            </ReactFlow>
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
