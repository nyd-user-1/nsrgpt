"use client"

import * as React from "react"
import Link from "next/link"
import { ChevronDown } from "lucide-react"
import {
  Background, Controls, Handle, MarkerType, Position, ReactFlow, ReactFlowProvider, useReactFlow, useStore, useUpdateNodeInternals,
  type Edge, type Node, type NodeProps, type NodeTypes,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"

import { Activity } from "@/components/animate-ui/icons/activity"
import { Blocks } from "@/components/animate-ui/icons/blocks"
import { Database } from "@/components/animate-ui/icons/database"
import { AnimateIcon } from "@/components/animate-ui/icons/icon"
import { MessagesSquare } from "@/components/animate-ui/icons/messages-square"
import { Radar } from "@/components/animate-ui/icons/radar"
import { SideBarFold, SideBarFoldItem } from "@/components/sidebar/SideBarFold"
import { ICON_ON, ICON_REST, type SideBarIcon } from "@/components/sidebar/SideBarMenuItem"
import { CORE, LAKE, NUCLIDE, SOURCES, SURFACES, type Status } from "@/lib/pipeline-map"
import { cn } from "@/lib/utils"
import { apiUrl } from "@/lib/api-url"
import { short } from "@/lib/datasets"

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

/** Counts in short form on this page (Brendan, 2026-11-08): 303,568 reads 304K, 9,127,277 reads 9.1M, 20,117 reads 20K. */
export function compact(s: string): string {
  return s.replace(/\d{1,3}(?:,\d{3})+/g, (m) => {
    const n = Number(m.replace(/,/g, ""))
    const unit = n >= 1e6 ? [1e6, "M"] as const : [1e3, "K"] as const
    const v = n / unit[0]
    return (v < 10 ? v.toFixed(1).replace(/\.0$/, "") : Math.round(v).toString()) + unit[1]
  })
}

function Pill({ children }: { children: React.ReactNode }) {
  if (typeof children === "string") children = compact(children)
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

/** A–Z by label, numbers in numeric order, case and accents ignored (Brendan, 2026-11-08): every list inside a card
 *  sorts at render time, so the data file's order doesn't matter. The cards in each column keep their order. */
function az<T>(items: readonly T[], label: (item: T) => string): T[] {
  return [...items].sort((a, b) => label(a).localeCompare(label(b), undefined, { numeric: true, sensitivity: "base" }))
}

function Rows({ rows }: { rows: [string, string][] }) {
  return (
    <div className="flex flex-col gap-1.5">
      {az(rows, ([l]) => l).map(([l, p]) => (
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

/** Re-measures a node when a card in it opens or closes, so the ports below the card follow it. Not on mount: a
 *  request then measured one column ahead of the others. */
function useRemeasure(nodeId: string, open: boolean) {
  const update = useUpdateNodeInternals()
  const was = React.useRef(open)
  React.useEffect(() => {
    if (was.current === open) return
    was.current = open
    update(nodeId)
  }, [open, nodeId, update])
}

/** A card's header: it opens and closes the card, and holds the card's ports. A card with the sidebar's icon plays it
 *  when the header is hovered, as a sidebar row plays its icon (SideBarMenuItem.tsx): AnimateIcon on the header, the
 *  row's group, size and two tones. */
function Header({ title, icon: Icon, iconOn, soon, open, onToggle, children }: { title: string; icon?: SideBarIcon; iconOn?: boolean; soon?: boolean; open: boolean; onToggle: () => void; children?: React.ReactNode }) {
  const button = (
    <button type="button" onClick={onToggle} aria-expanded={open} className={cn("group/item relative flex h-11 w-full items-center gap-2 rounded-xl px-3.5 text-left text-[15px] font-medium transition-colors hover:bg-[var(--paper-quiet)]", open && "rounded-b-none")}>
      {Icon && <Icon size={18} className={cn("shrink-0 transition-colors", iconOn ? ICON_ON : cn("text-[var(--paper-muted)]", ICON_REST))} strokeWidth={iconOn ? 2.25 : 1.75} />}
      <span className="truncate">{title}</span>
      {soon && <span className="shrink-0 rounded-full border border-dashed border-[var(--paper-muted)] px-2 py-px text-[11px] font-normal">Coming Soon</span>}
      <ChevronDown className={cn("ml-auto size-4 shrink-0 text-[var(--paper-muted)] transition-transform", open && "rotate-180")} />
      {children}
    </button>
  )
  return Icon ? <AnimateIcon asChild animateOnHover>{button}</AnimateIcon> : button
}

/** A card: its header opens it; a port on the header's outer edge keeps the connector at the header. */
function Card({ nodeId, title, icon, iconOn, soon, port, width, children }: { nodeId: string; title: string; icon?: SideBarIcon; iconOn?: boolean; soon?: boolean; port?: Port; width?: number; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)
  useRemeasure(nodeId, open)
  // pointer-events-auto: React Flow turns pointer events off on a node that is neither selectable nor draggable, which
  // left every card's header unpressable; the card takes them back, and the gaps between cards still pan the canvas.
  return (
    <div className={cn(CARD, soon && SOON, "pointer-events-auto")} style={width ? { width } : undefined}>
      <Header title={title} icon={icon} iconOn={iconOn} soon={soon} open={open} onToggle={() => setOpen((v) => !v)}>
        {port && <Handle type={port.type} position={port.position} id={port.id} isConnectable={false} className="!pointer-events-none !opacity-0" />}
      </Header>
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
            {az(s.folds, (f) => f.label).map((f) => (
              <SideBarFold key={f.label} label={f.label} hint={`${f.items.filter((i) => i.status === "held").length} of ${f.items.length}`}>
                {az(f.items, (i) => i.name).map((i) => (
                  <SideBarFoldItem key={i.name} mark={<Mark s={i.status} />} label={i.name} pill={i.pill && compact(i.pill)} />
                ))}
              </SideBarFold>
            ))}
          </div>
        </Card>
      ))}
    </div>
  )
}

/** The GNDS 2.0 line (brief 60): the materials converted of those held, across the releases, from GET /gnds/releases. */
function useGndsLine(): string | null {
  const [line, setLine] = React.useState<string | null>(null)
  React.useEffect(() => {
    let on = true
    fetch(apiUrl("/gnds/releases"))
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { totals?: { materials?: number; converted?: number }; releases?: Record<string, unknown> } | null) => {
        const t = j?.totals
        if (!on || !t || typeof t.converted !== "number" || typeof t.materials !== "number") return
        setLine(`${short(t.converted)} of ${short(t.materials)} materials converted, ${Object.keys(j?.releases ?? {}).length} releases`)
      })
      .catch(() => {})
    return () => {
      on = false
    }
  }, [])
  return line
}

/** The lake: open on load; closed, it shows only the five core dataset cards. The datasets' section keeps its place in
 *  both states, so a dataset card left open stays open. */
function LakeNode({ id }: NodeProps) {
  const [open, setOpen] = React.useState(true)
  const gnds = useGndsLine()
  useRemeasure(id, open)
  return (
    <div className={cn(CARD, "pointer-events-auto")} style={{ width: LAKE_W }}>
      <Header title="NSR Lake" icon={Database} open={open} onToggle={() => setOpen((v) => !v)}>
        <Handle type="target" position={Position.Left} id="in" isConnectable={false} className="!pointer-events-none !opacity-0" />
        <Handle type="source" position={Position.Right} id="out" isConnectable={false} className="!pointer-events-none !opacity-0" />
      </Header>
      <div className={cn("divide-y border-t", RULE, "divide-[var(--paper-rule-soft)]")}>
        {open && (
          <section className="px-3.5 py-3">
            <Title>Detail</Title>
            <Rows rows={[["Size", LAKE.size], ["Files", LAKE.files], ["Records", LAKE.records], ...(gnds ? [["GNDS 2.0", gnds] as [string, string]] : [])]} />
          </section>
        )}
        <section className="px-3.5 py-3">
          {open && <Title>Core Datasets</Title>}
          <div className="flex flex-col gap-2">
            {az(CORE, (d) => d.name).map((d) => (
              <Card key={d.id} nodeId={id} title={d.name}>
                <div className="px-3 py-2.5 text-[13px]">
                  <p>{d.what}</p>
                  <p className="mt-0.5 text-[12px] text-[var(--paper-muted)]">{d.count} · {d.keys}</p>
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
        {open && (
          <section className="px-3.5 py-3">
            <Title>Shared key</Title>
            <Row left={NUCLIDE.name} pill={`${NUCLIDE.keys} · ${NUCLIDE.count}`} />
          </section>
        )}
      </div>
    </div>
  )
}

/** The surfaces that have a sidebar row wear its icon (components/sidebar/SideBarMenu.tsx). */
const SURFACE_ICON: Record<string, SideBarIcon> = { chat: MessagesSquare, search: Radar, graph: Blocks, charts: Activity }

function SurfacesNode({ id }: NodeProps) {
  return (
    <div className="flex flex-col gap-3" style={{ width: COL_W }}>
      {SURFACES.map((s) => (
        <Card key={s.id} nodeId={id} title={s.title} icon={SURFACE_ICON[s.id]} soon={s.soon} port={{ type: "target", position: Position.Left, id: s.id }}>
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
  style: { stroke: LINE, strokeWidth: 2, strokeDasharray: soon ? "6 5" : undefined },
  markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
})

const EDGES: Edge[] = [
  ...SOURCES.map((s) => edge(`in-${s.id}`, "sources", s.id, "lake", "in")),
  ...SURFACES.map((s) => edge(`out-${s.id}`, "lake", "out", "surfaces", s.id, s.soon)),
]

/** Fits the diagram exactly as the controls' fit button does (React Flow's default fitView), once every node is
 *  measured and again whenever the pane changes size, until the reader pans or zooms. It watches the measured sizes
 *  itself: useNodesInitialized stays false on this canvas, since its nodes are a constant with no onNodesChange and
 *  React Flow only updates that flag when nodes are set, so a fit waiting on it never ran (2026-11-08). */
function Fit({ moved }: { moved: React.RefObject<boolean> }) {
  const { fitView } = useReactFlow()
  const measured = useStore((s) => s.nodeLookup.size > 0 && [...s.nodeLookup.values()].every((n) => n.measured.width && n.measured.height))
  const width = useStore((s) => s.width)
  const height = useStore((s) => s.height)
  React.useEffect(() => {
    if (measured && width && height && !moved.current) fitView()
  }, [measured, width, height, moved, fitView])
  return null
}

export function PipelineCanvas() {
  // A pan or zoom by the reader (an event, not a fit) ends the automatic fits.
  const moved = React.useRef(false)
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
          elementsSelectable={false}
          proOptions={{ hideAttribution: true }}
          onMoveStart={(event) => {
            if (event) moved.current = true
          }}
        >
          <Fit moved={moved} />
          <Background gap={24} size={1} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </ReactFlowProvider>
  )
}
