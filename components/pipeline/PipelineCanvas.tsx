"use client"

import * as React from "react"
import Link from "next/link"
import { ChevronDown, Database } from "lucide-react"
import {
  Background, Controls, Handle, MarkerType, Position, ReactFlow, ReactFlowProvider, useNodesInitialized, useReactFlow, useUpdateNodeInternals,
  type Edge, type Node, type NodeProps, type NodeTypes,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"

import { SideBarFold, SideBarFoldItem } from "@/components/sidebar/SideBarFold"
import { CORE, LAKE, NUCLIDE, SOURCES, SURFACES, type Status } from "@/lib/pipeline-map"
import { cn } from "@/lib/utils"

// /pipeline on the graph's canvas (Brendan, 2026-11-08): the sources on the left, the NSR Lake in the middle, what
// reads it on the right, in the paper palette on the dotted infinite canvas /graph uses. Three nodes, one per column;
// every card carries its own handle on its header, so a connector stays with its card when a card above it opens.
// No path labels; no status chips on the sources; what isn't built yet says Coming Soon and draws dashed.

const COL_W = 300
const LAKE_W = 330
const GAP = 230
const LINE = "var(--paper-faint)"

const CARD = "rounded-xl border border-[var(--paper-rule)] bg-[var(--paper)] text-[var(--paper-text)] shadow-sm"
const SOON = "border-dashed text-[var(--paper-muted)]"
const RULE = "border-[var(--paper-rule-soft)]"

function Pill({ children }: { children: React.ReactNode }) {
  return <span className={cn("inline-flex shrink-0 items-center whitespace-nowrap rounded-full border bg-[var(--paper-quiet)] px-2 py-0.5 text-[11px] text-[var(--paper-muted)]", RULE)}>{children}</span>
}

function Row({ left, pill }: { left: React.ReactNode; pill: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <p className="text-[13px]">{left}</p>
      <div className={cn("grow border-b", RULE)} />
      <Pill>{pill}</Pill>
    </div>
  )
}

function Title({ children }: { children: React.ReactNode }) {
  return <p className="mb-1.5 text-[12px] text-[var(--paper-muted)]">{children}</p>
}

function Rows({ rows }: { rows: [string, string][] }) {
  return (
    <div className="flex flex-col gap-1.5">
      {rows.map(([l, p]) => (
        <Row key={l} left={l} pill={p} />
      ))}
    </div>
  )
}

/** A leaf's state: held filled, partly outlined, to get dashed, blocked faint. */
function Mark({ s }: { s: Status }) {
  const cls = { held: "bg-nuclear", partly: "border border-nuclear", toget: "border border-dashed border-[var(--paper-muted)]", blocked: "bg-[var(--paper-faint)]" }[s]
  return <span aria-hidden className={cn("size-2 shrink-0 rounded-full", cls)} />
}

type Port = { type: "source" | "target"; position: Position; id: string }

/** A card: its header opens it; a port on the header's outer edge keeps the connector at the header. */
function Card({ nodeId, title, soon, port, width, children }: { nodeId: string; title: string; soon?: boolean; port?: Port; width?: number; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)
  const update = useUpdateNodeInternals()
  // The ports below this card move when it opens or closes; React Flow re-measures them on request. Not on mount: a
  // request then ran the first fitView with only the sources measured, and the lake and surfaces sat off the view.
  const opened = React.useRef(open)
  React.useEffect(() => {
    if (opened.current === open) return
    opened.current = open
    update(nodeId)
  }, [open, nodeId, update])
  // pointer-events-auto: React Flow turns pointer events off on a node that is neither selectable nor draggable, which
  // left every card's header unpressable; the card takes them back, and the gaps between cards still pan the canvas.
  return (
    <div className={cn(CARD, soon && SOON, "pointer-events-auto")} style={width ? { width } : undefined}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="relative flex h-11 w-full items-center gap-2 px-3.5 text-left text-[15px] font-medium">
        <span className="truncate">{title}</span>
        {soon && <span className="shrink-0 rounded-full border border-dashed border-[var(--paper-muted)] px-2 py-px text-[11px] font-normal">Coming Soon</span>}
        <ChevronDown className={cn("ml-auto size-4 shrink-0 text-[var(--paper-muted)] transition-transform", open && "rotate-180")} />
        {port && <Handle type={port.type} position={port.position} id={port.id} isConnectable={false} className="!pointer-events-none !opacity-0" />}
      </button>
      {open && <div className={cn("border-t", RULE)}>{children}</div>}
    </div>
  )
}

function SourcesNode({ id }: NodeProps) {
  return (
    <div className="flex flex-col gap-3" style={{ width: COL_W }}>
      {SOURCES.map((s) => (
        <Card key={s.id} nodeId={id} title={s.title} port={{ type: "source", position: Position.Right, id: s.id }}>
          <div className="px-1 py-1.5">
            {s.folds.map((f) => (
              <SideBarFold key={f.label} label={f.label} hint={`${f.items.filter((i) => i.status === "held").length} of ${f.items.length}`}>
                {f.items.map((i) => (
                  <SideBarFoldItem key={i.name} mark={<Mark s={i.status} />} label={i.name} pill={i.pill} />
                ))}
              </SideBarFold>
            ))}
            {s.note && <p className="px-3 pb-1.5 pt-1 text-[12px] text-[var(--paper-muted)]">{s.note}</p>}
          </div>
        </Card>
      ))}
    </div>
  )
}

function LakeNode({ id }: NodeProps) {
  return (
    <div className={CARD} style={{ width: LAKE_W }}>
      <header className="relative flex h-11 items-center gap-2 px-3.5 text-[15px] font-medium">
        <Database className="size-4 text-[var(--paper-muted)]" aria-hidden />
        NSR Lake
        <Handle type="target" position={Position.Left} id="in" isConnectable={false} className="!pointer-events-none !opacity-0" />
        <Handle type="source" position={Position.Right} id="out" isConnectable={false} className="!pointer-events-none !opacity-0" />
      </header>
      <div className={cn("divide-y border-t", RULE, "divide-[var(--paper-rule-soft)]")}>
        <section className="px-3.5 py-3">
          <Title>Detail</Title>
          <Rows rows={[["Size", LAKE.size], ["Files", LAKE.files], ["Records", LAKE.records]]} />
        </section>
        <section className="px-3.5 py-3">
          <Title>Core Datasets</Title>
          <div className="flex flex-col gap-2">
            {CORE.map((d) => (
              <Card key={d.id} nodeId={id} title={d.name}>
                <div className="px-3 py-2.5 text-[13px]">
                  <p>{d.what}</p>
                  <p className="mt-0.5 text-[12px] text-[var(--paper-muted)]">{d.count} {d.record} · {d.keys}</p>
                </div>
                <section className={cn("border-t px-3 py-2.5", RULE)}>
                  <Title>Inside</Title>
                  <Rows rows={d.inside} />
                </section>
                <section className={cn("border-t px-3 py-2.5", RULE)}>
                  <Title>Joins</Title>
                  <Rows rows={d.links} />
                </section>
              </Card>
            ))}
          </div>
        </section>
        <section className="px-3.5 py-3">
          <Title>Shared key</Title>
          <Row left={NUCLIDE.name} pill={`${NUCLIDE.keys} · ${NUCLIDE.count}`} />
        </section>
      </div>
    </div>
  )
}

function SurfacesNode({ id }: NodeProps) {
  return (
    <div className="flex flex-col gap-3" style={{ width: COL_W }}>
      {SURFACES.map((s) => (
        <Card key={s.id} nodeId={id} title={s.title} soon={s.soon} port={{ type: "target", position: Position.Left, id: s.id }}>
          <div className="flex flex-col gap-1.5 px-3.5 py-3">
            <Rows rows={s.rows} />
            {s.href && s.open && (
              <Link href={s.href} className="mt-1 text-[13px] text-nuclear underline underline-offset-4">
                {s.open}
              </Link>
            )}
          </div>
        </Card>
      ))}
    </div>
  )
}

const nodeTypes: NodeTypes = { sources: SourcesNode, lake: LakeNode, surfaces: SurfacesNode }

const NODES: Node[] = [
  { id: "sources", type: "sources", position: { x: 0, y: 0 }, data: {} },
  { id: "lake", type: "lake", position: { x: COL_W + GAP, y: 0 }, data: {} },
  { id: "surfaces", type: "surfaces", position: { x: COL_W + GAP + LAKE_W + GAP, y: 0 }, data: {} },
]

const edge = (id: string, source: string, sourceHandle: string, target: string, targetHandle: string, soon?: boolean): Edge => ({
  id, source, sourceHandle, target, targetHandle,
  type: "smoothstep",
  pathOptions: { borderRadius: 10 },
  style: { stroke: LINE, strokeWidth: 2, strokeDasharray: soon ? "6 5" : undefined },
  markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
})

const EDGES: Edge[] = [
  ...SOURCES.map((s) => edge(`in-${s.id}`, "sources", s.id, "lake", "in")),
  ...SURFACES.map((s) => edge(`out-${s.id}`, "lake", "out", "surfaces", s.id, s.soon)),
]

/** Centres the diagram once the nodes are measured, and again after the page's reveal has finished resizing the pane. */
function Fit() {
  const { fitView } = useReactFlow()
  const ready = useNodesInitialized()
  React.useEffect(() => {
    if (!ready) return
    const fit = () => fitView({ padding: 0.08, maxZoom: 1 })
    const t = [60, 450].map((ms) => setTimeout(fit, ms))
    return () => t.forEach(clearTimeout)
  }, [ready, fitView])
  return null
}

export function PipelineCanvas() {
  return (
    <ReactFlowProvider>
      <div className="pipeline-flow h-full w-full">
        <ReactFlow
          nodes={NODES}
          edges={EDGES}
          nodeTypes={nodeTypes}
          minZoom={0.25}
          nodesDraggable={false}
          nodesConnectable={false}
          nodesFocusable={false}
          selectNodesOnDrag={false}
          proOptions={{ hideAttribution: true }}
        >
          <Fit />
          <Background gap={24} size={1} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </ReactFlowProvider>
  )
}
