"use client"

import * as React from "react"
import {
  Background, BaseEdge, ConnectionMode, Controls, EdgeLabelRenderer, getSmoothStepPath, Handle,
  MarkerType, Position, ReactFlow, ReactFlowProvider, applyNodeChanges, useInternalNode,
  type Edge, type EdgeProps, type InternalNode, type Node, type NodeChange, type NodeProps,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import {
  ArchiveRestore, Binary, BookOpen, ChartLine, Cloud, Cpu, Database, Download, FileJson, FileSearch, Globe, HardDrive, History,
  Layers, MessageCircleQuestionMark, Monitor, Network, PenLine, RefreshCw, RotateCcw, Save, ScrollText, Search, Server, Settings2,
  Table, TableProperties, Waypoints, Zap, type LucideIcon,
} from "lucide-react"

import { Blocks } from "@/components/animate-ui/icons/blocks"
import { Boxes } from "@/components/animate-ui/icons/boxes"
import { INSET, InsetBody, InsetLayers, InsetPanel } from "@/components/nsr/graph/InsetPanel"
import { RightViewHeader } from "@/components/nsr/graph/RightInsetPanel"
import { setRail, useRailClosed, useRailsClosedWhileMounted } from "@/components/rail-toggle"
import { SideBarMenuItem } from "@/components/sidebar/SideBarMenuItem"
import { Button } from "@/components/ui/button"
import { CORE, LAKE } from "@/lib/pipeline-map"
import { cn } from "@/lib/utils"

// /factory (Brendan, 2026-11-08, brief 32): pax-trinity's factory canvas (src/components/factory-canvas.tsx, pax2's /erd,
// once /pipeline-2), ported whole and turned to NSRgpt: the whole lake as one fixed diagram on the xyflow canvas. Six node
// kinds (door, stage, store, instrument, service, surface) and three edge kinds (flow, loop, planned). Boxes carry their
// names and live counts; what each one is shows on hover. Each edge carries an icon chip, blue-grey for flow, purple for a
// loop with its number, dashed for planned; its words show on hover. The gear at the canvas's top right opens the
// Architecture panel in the right inset panel: Factory (the kinds and the loops) and Widgets (every chip and its words),
// each a drill-down layer. Clicking an entry lights its boxes or lines and dims the rest. The boxes drag; where they were
// dragged is kept in this browser until Reset layout puts them back. A line touching a moved box reroutes between the
// sides that face each other.

const FLOW = "#94a3b8"
const LOOP = "#7c3aed"
const PLANNED = "#cbd5e1"
const LIGHT: Record<Kindof, string> = { flow: "#3b82f6", loop: "#c4b5fd", planned: "#94a3b8" }

/** A kind's colour mixed into the paper, so the boxes read in every theme. */
const tint = (color: string, pct: number) => `color-mix(in oklab, ${color} ${pct}%, var(--paper))`

type Status = "Live" | "Staged"
/** What an instrument is: a neural network, a ranking index, or data built from the lake. Its circle wears the kind's icon. */
type Make = "neural" | "statistical" | "reference"
type Chip = { n: number; name: string; status: Status; make: Make }
const MAKE: Record<Make, { icon: LucideIcon; label: string }> = {
  neural: { icon: Network, label: "neural network" },
  statistical: { icon: FileSearch, label: "ranking index" },
  reference: { icon: TableProperties, label: "data built from the lake" },
}

// The models and indexes NSRgpt runs, numbered as the Architecture panel lists them.
const MODELS: Chip[] = [
  { n: 1, name: "NSR-CPT encoder", status: "Live", make: "neural" },
  { n: 2, name: "Keyword index", status: "Live", make: "statistical" },
  { n: 3, name: "Chart data", status: "Live", make: "reference" },
  { n: 4, name: "Diagram library", status: "Live", make: "reference" },
]
const model = (n: number) => MODELS[n - 1]
const coreCount = (id: string) => CORE.find((c) => c.id === id)?.count ?? ""

// ---------------------------------------------------------------------------------------------
// What's lit: the boxes and lines an Architecture entry points at. Everything else dims while one is.

type NodeKind = "door" | "stage" | "store" | "instrument" | "service" | "surface"
type Kindof = "flow" | "loop" | "planned"
export type Focus = { on: "kind"; kind: NodeKind } | { on: "edges"; kind: Kindof } | { on: "loop"; n: number } | { on: "edge"; id: string } | null
type Lit = { nodes: Set<string>; edges: Set<string> } | null

const LitCtx = React.createContext<Lit>(null)
/** The boxes dragged from where build() put them. An edge touching one drops its pinned chip back onto its own line. */
const MovedCtx = React.createContext<Set<string>>(new Set())
const useLit = (set: "nodes" | "edges", id: string): "lit" | "dim" | null => {
  const lit = React.useContext(LitCtx)
  return lit ? (lit[set].has(id) ? "lit" : "dim") : null
}
const glow = (s: "lit" | "dim" | null) => cn("transition-opacity duration-300", s === "lit" && "erd-lit", s === "dim" && "opacity-20")

function lights(focus: Focus, nodes: Node[], edges: Edge[]): Lit {
  if (!focus) return null
  const ns = new Set<string>()
  const es = new Set<string>()
  const kindOf = (n: Node) => (n.type === "rack" ? "instrument" : n.type)
  const ends = (e: Edge) => (es.add(e.id), ns.add(e.source), ns.add(e.target))
  if (focus.on === "kind") for (const n of nodes) kindOf(n) === focus.kind && ns.add(n.id)
  if (focus.on === "edges") {
    for (const e of edges) (e.data as FxData).kind === focus.kind && es.add(e.id)
    if (focus.kind === "planned") for (const n of nodes) (n.data as { planned?: boolean }).planned && ns.add(n.id)
  }
  if (focus.on === "loop") for (const e of edges) (e.data as FxData).loop === focus.n && ends(e)
  if (focus.on === "edge") for (const e of edges) e.id === focus.id && ends(e)
  return { nodes: ns, edges: es }
}

// ---------------------------------------------------------------------------------------------
// Handles: every node carries one hidden handle per side ("t", "r", "b", "l"). The canvas runs in loose mode, so any
// handle can end an edge; the lines here take the sides that face each other (FxData.auto).

type Side = "t" | "r" | "b" | "l"
type Extra = { id: string; side: Side; at: number }
const POS: Record<Side, Position> = { t: Position.Top, r: Position.Right, b: Position.Bottom, l: Position.Left }
const HIDDEN = "!size-1 !min-h-0 !min-w-0 !border-0 !bg-transparent"

function Sides({ extra = [] }: { extra?: Extra[] }) {
  return (
    <>
      {(["t", "r", "b", "l"] as Side[]).map((s) => <Handle key={s} id={s} type="source" position={POS[s]} isConnectable={false} className={HIDDEN} />)}
      {extra.map((h) => (
        <Handle key={h.id} id={h.id} type="source" position={POS[h.side]} isConnectable={false} className={HIDDEN} style={h.side === "l" || h.side === "r" ? { top: h.at } : { left: h.at }} />
      ))}
    </>
  )
}

// ---------------------------------------------------------------------------------------------
// The six node kinds: a name; `about` is the hover.

type Box = { w: number; h: number; extra?: Extra[]; about?: string }
type DoorData = Box & { title: string; planned?: boolean; big?: boolean }
type StageData = Box & { title: string; tools?: [string, string][]; foot?: string[] }
type StoreData = Box & { service: "Amazon S3" | "AWS Glue" | "DuckDB file"; title: string; count?: string }
type ChipData = Box & { n: number }
type RackData = Box & { ns: number[] }
type ServiceData = Box & { title: string; cost?: string }
type SurfaceData = Box & { title: string; path: string }

const STORE_ICON: Record<StoreData["service"], LucideIcon> = { "Amazon S3": HardDrive, "AWS Glue": Database, "DuckDB file": FileJson }

function Door({ id, data: d }: NodeProps<Node<DoorData>>) {
  return (
    <div
      title={d.about}
      style={{ width: d.w, height: d.h, ...(d.planned ? {} : { background: "var(--paper-strong)" }) }}
      className={cn("flex items-center justify-center gap-2 rounded-xl px-3", d.planned ? "border-2 border-dashed border-[var(--paper-rule-soft)] bg-[var(--paper)]" : "shadow-e1", d.big && "ring-4 ring-[color-mix(in_oklab,var(--paper-strong)_25%,var(--paper))]", glow(useLit("nodes", id)))}
    >
      <span className={cn("font-semibold leading-tight", d.big ? "text-lg" : "text-[15px]", d.planned ? "text-[var(--paper-muted)]" : "text-white")}>{d.title}</span>
      <Sides extra={d.extra} />
    </div>
  )
}

function Stage({ id, data: d }: NodeProps<Node<StageData>>) {
  return (
    <div title={d.about} style={{ width: d.w, height: d.h }} className={cn("flex flex-col rounded-2xl border-2 border-[var(--paper-strong)] bg-[var(--paper)] px-4", d.tools ? "py-3.5" : "justify-center", glow(useLit("nodes", id)))}>
      <p className={cn("text-lg font-semibold text-[var(--paper-strong)]", !d.tools && "text-center")}>{d.title}</p>
      {d.tools && (
        <ul className="mt-1.5 space-y-0.5">
          {d.tools.map(([tool, does]) => (
            <li key={tool} title={does} className="text-[13px] leading-5 text-[var(--paper-muted)]">
              {tool}
            </li>
          ))}
        </ul>
      )}
      {d.foot?.length ? (
        <div className="mt-auto border-t border-[var(--paper-rule-soft)] pt-2">
          {d.foot.map((f) => <p key={f} className="tabular text-[13px] font-semibold text-[var(--paper-strong)]">{f}</p>)}
        </div>
      ) : null}
      <Sides extra={d.extra} />
    </div>
  )
}

function Store({ id, data: d }: NodeProps<Node<StoreData>>) {
  const Icon = STORE_ICON[d.service]
  return (
    <div title={d.about ? `${d.service}: ${d.about}` : d.service} style={{ width: d.w, height: d.h }} className={cn("flex flex-col justify-center rounded-[14px_14px_10px_10px] border border-[var(--paper-rule-soft)] bg-[var(--paper-quiet)] px-3", glow(useLit("nodes", id)))}>
      <p className="flex items-center gap-1.5 font-mono text-[13px] font-semibold text-[var(--paper-text)]">
        <Icon className="size-3.5 shrink-0 text-[var(--paper-muted)]" />
        {d.title}
      </p>
      {d.count && <p className="tabular pl-5 text-xs font-semibold text-[var(--paper-strong)]">{d.count}</p>}
      <Sides extra={d.extra} />
    </div>
  )
}

// A staged instrument wears the planned dash: fitted or in build, not yet serving.
function MakeBadge({ make, small = false }: { make: Make; small?: boolean }) {
  const Icon = MAKE[make].icon
  return (
    <span style={{ background: "var(--paper-strong)" }} className={cn("flex shrink-0 items-center justify-center rounded-full text-white", small ? "size-5" : "size-[26px]")}>
      <Icon className={small ? "size-3" : "size-3.5"} strokeWidth={2} />
    </span>
  )
}

function ChipBody({ c }: { c: Chip }) {
  return (
    <span
      title={`${c.status} · ${MAKE[c.make].label}`}
      style={{ background: c.status === "Live" ? tint("var(--paper-strong)", 10) : "var(--paper)", borderColor: tint("var(--paper-strong)", 35) }}
      className={cn("flex min-h-[34px] items-center gap-2 rounded-[18px] border py-1 pl-1 pr-3 text-xs font-semibold leading-tight text-[var(--paper-strong)]", c.status !== "Live" && "border-dashed")}
    >
      <MakeBadge make={c.make} />
      <span>
        <span className="tabular">{c.n}.</span> {c.name}
      </span>
    </span>
  )
}

function Instrument({ id, data: d }: NodeProps<Node<ChipData>>) {
  return (
    <div style={{ width: d.w }} className={cn("rounded-[18px]", glow(useLit("nodes", id)))}>
      <ChipBody c={model(d.n)} />
      <Sides extra={d.extra} />
    </div>
  )
}

function Rack({ id, data: d }: NodeProps<Node<RackData>>) {
  return (
    <div style={{ width: d.w, borderColor: tint("var(--paper-strong)", 30) }} className={cn("grid grid-cols-2 gap-1.5 rounded-2xl border bg-[var(--paper)] p-2.5", glow(useLit("nodes", id)))}>
      {d.ns.map((n) => <ChipBody key={n} c={model(n)} />)}
      <Sides extra={d.extra} />
    </div>
  )
}

function Service({ id, data: d }: NodeProps<Node<ServiceData>>) {
  return (
    <div title={d.about} style={{ width: d.w, height: d.h, background: tint("#f59e0b", 14), borderColor: tint("#d97706", 55) }} className={cn("flex flex-col justify-center rounded-xl border px-3", glow(useLit("nodes", id)))}>
      <p className="flex items-center gap-1.5 text-[14px] font-semibold text-[var(--paper-text)]">
        <Server className="size-3.5 shrink-0 text-[#d97706]" /> {d.title}
      </p>
      {d.cost && <p className="tabular text-xs font-semibold text-[var(--paper-muted)]">{d.cost}</p>}
      <Sides extra={d.extra} />
    </div>
  )
}

function Surface({ id, data: d }: NodeProps<Node<SurfaceData>>) {
  return (
    <div title={d.about} style={{ width: d.w, height: d.h }} className={cn("flex flex-col overflow-hidden rounded-xl border border-[var(--paper-rule-soft)] bg-[var(--paper)] shadow-e1", glow(useLit("nodes", id)))}>
      <div className="flex h-4 shrink-0 items-center gap-1 bg-[var(--paper-quiet)] px-2">
        {[0, 1, 2].map((i) => <span key={i} className="size-1.5 rounded-full bg-[var(--paper-rule-soft)]" />)}
        <span className="ml-1.5 font-mono text-[10px] text-[var(--paper-muted)]">{d.path}</span>
      </div>
      <p className="flex flex-1 items-center gap-1.5 px-3 text-[15px] font-semibold text-[var(--paper-text)]">
        <Monitor className="size-3.5 shrink-0 text-[var(--paper-muted)]" /> {d.title}
      </p>
      <Sides extra={d.extra} />
    </div>
  )
}

const nodeTypes = { door: Door, stage: Stage, store: Store, instrument: Instrument, rack: Rack, service: Service, surface: Surface }

// ---------------------------------------------------------------------------------------------
// The one edge: a rounded orthogonal path, styled by kind, carrying its chip. `at` pins a chip; `offset` sets how far
// a line runs past its lower or upper node. Lit, it carries a travelling light.

/** `auto` runs the line between the boxes' facing sides; `bare` draws it with no chip. */
type FxData = { kind: Kindof; label: string; icon?: LucideIcon; text?: string; loop?: number; offset?: number; at?: [number, number]; auto?: boolean; bare?: boolean }

function LoopBadge({ n }: { n: number }) {
  return <span className="tabular flex size-[18px] shrink-0 items-center justify-center rounded-full bg-violet-600 text-[10px] font-semibold text-white">{n}</span>
}

/** An edge's chip: a circle holding its icon (a pill for a word), the accent on paper for flow, purple with the loop's
 *  number on its shoulder, dashed when planned. `big` is the panel's size, where the loop's section heading carries
 *  the number. */
function EdgeChip({ d, big = false, className, style }: { d: FxData; big?: boolean; className?: string; style?: React.CSSProperties }) {
  const Icon = d.icon
  return (
    <span
      title={d.label}
      style={style}
      className={cn(
        "relative flex shrink-0 items-center justify-center rounded-full border bg-[var(--paper)] font-medium leading-none",
        Icon ? (big ? "size-8" : "size-7") : cn("w-max whitespace-nowrap px-2.5 text-xs", big ? "h-8" : "h-7"),
        d.kind === "loop" ? "border-violet-300 text-violet-600" : d.kind === "planned" ? "border-dashed border-[var(--paper-rule-soft)] italic text-[var(--paper-faint)]" : "border-[var(--paper-rule-soft)] text-[var(--paper-strong)]",
        className,
      )}
    >
      {Icon ? <Icon className={big ? "size-4" : "size-3.5"} strokeWidth={2} /> : d.text}
      {d.loop && !big && <span className="tabular absolute -right-1.5 -top-1.5 flex size-4 items-center justify-center rounded-full bg-violet-600 text-[9px] font-semibold not-italic text-white ring-2 ring-[var(--paper)]">{d.loop}</span>}
    </span>
  )
}

type Rect = { x: number; y: number; w: number; h: number }
const rectOf = (n: InternalNode | undefined): Rect | null =>
  n?.measured?.width ? { x: n.internals.positionAbsolute.x, y: n.internals.positionAbsolute.y, w: n.measured.width, h: n.measured.height ?? 0 } : null
type Ends = { sourceX: number; sourceY: number; sourcePosition: Position; targetX: number; targetY: number; targetPosition: Position }

/** A line from box a to box b on the sides that face each other: straight down or up where the boxes overlap
 *  side to side, straight across where they overlap top to bottom, one elbow where they overlap neither way
 *  (out of a's side, into b's top or bottom). Null when the boxes overlap each other. */
function facing(a: Rect, b: Rect): Ends | null {
  const ox: [number, number] = [Math.max(a.x, b.x), Math.min(a.x + a.w, b.x + b.w)]
  const oy: [number, number] = [Math.max(a.y, b.y), Math.min(a.y + a.h, b.y + b.h)]
  const below = b.y >= a.y + a.h
  const above = b.y + b.h <= a.y
  const right = b.x >= a.x + a.w
  const left = b.x + b.w <= a.x
  if ((below || above) && ox[1] - ox[0] > 16) {
    const x = (ox[0] + ox[1]) / 2
    return { sourceX: x, sourceY: below ? a.y + a.h : a.y, sourcePosition: below ? Position.Bottom : Position.Top, targetX: x, targetY: below ? b.y : b.y + b.h, targetPosition: below ? Position.Top : Position.Bottom }
  }
  if ((right || left) && oy[1] - oy[0] > 12) {
    const y = (oy[0] + oy[1]) / 2
    return { sourceX: right ? a.x + a.w : a.x, sourceY: y, sourcePosition: right ? Position.Right : Position.Left, targetX: right ? b.x : b.x + b.w, targetY: y, targetPosition: right ? Position.Left : Position.Right }
  }
  if ((below || above) && (right || left))
    return { sourceX: right ? a.x + a.w : a.x, sourceY: a.y + a.h / 2, sourcePosition: right ? Position.Right : Position.Left, targetX: b.x + b.w / 2, targetY: below ? b.y : b.y + b.h, targetPosition: below ? Position.Top : Position.Bottom }
  return null
}

function FxEdge({ id, source, target, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd }: EdgeProps<Edge<FxData>>) {
  const d = data!
  const lit = useLit("edges", id)
  const moved = React.useContext(MovedCtx)
  const a = rectOf(useInternalNode(source))
  const b = rectOf(useInternalNode(target))
  // A moved box's line takes the facing sides; a rail (a set offset) keeps the route it was drawn with.
  const ends = (d.auto || moved.has(source) || moved.has(target)) && d.offset === undefined && a && b ? facing(a, b) : null
  const [path, lx, ly] = getSmoothStepPath({ ...(ends ?? { sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition }), borderRadius: 14, offset: d.offset ?? 22 })
  const [x, y] = d.at && !moved.has(source) && !moved.has(target) ? d.at : [lx, ly]
  const color = d.kind === "loop" ? LOOP : d.kind === "planned" ? PLANNED : FLOW
  const width = (d.kind === "loop" ? 2.25 : 1.75) + (lit === "lit" ? 1 : 0)
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={{ stroke: color, strokeWidth: width, opacity: lit === "dim" ? 0.15 : 1, transition: "opacity 300ms", ...(d.kind === "planned" && { strokeDasharray: "6 5" }) }} />
      {lit === "lit" && <path d={path} fill="none" stroke={LIGHT[d.kind]} strokeWidth={5} className="erd-travel" style={{ filter: `drop-shadow(0 0 4px ${LIGHT[d.kind]})` }} />}
      {!d.bare && <EdgeLabelRenderer>
        {/* Above every line, the elevated loops included. */}
        <EdgeChip
          d={d}
          style={{ transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`, zIndex: 10 }}
          className={cn("pointer-events-auto absolute transition-opacity duration-300", lit === "dim" && "opacity-20", lit === "lit" && "ring-2 ring-sky-300")}
        />
      </EdgeLabelRenderer>}
    </>
  )
}

const edgeTypes = { fx: FxEdge }

// ---------------------------------------------------------------------------------------------
// The Architecture panel, in the right inset panel: two rows, Factory (the kinds and the loops) and Widgets (every chip
// and its words), each drilling down to its list. An entry lights what it names on the canvas; a second click, Escape,
// a click on the canvas, or closing the panel puts the lights out.

const LOOPS: [number, string, string][] = [
  [1, "New releases", "Each serving table names the release it was built from; the fetch lanes look for a newer one at the sources and pull it, and it runs through Parse and Serve again."],
  [2, "Saved canvases", "A canvas saved on Graph becomes a View, and a View loads back onto Graph. Saving waits on a store for Community."],
  [3, "Questions", "A question asked in Chat runs through the keyword index; the records it finds come back as the answer's citations."],
]

function Line({ kind }: { kind: Kindof }) {
  const color = kind === "loop" ? LOOP : kind === "planned" ? PLANNED : FLOW
  return (
    <svg width="56" height="12" className="shrink-0" aria-hidden>
      <defs>
        <marker id={`lg-${kind}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill={color} />
        </marker>
      </defs>
      <line x1="2" y1="6" x2="50" y2="6" stroke={color} strokeWidth={kind === "loop" ? 2.25 : 1.75} strokeDasharray={kind === "flow" ? undefined : kind === "loop" ? "5" : "6 5"} markerEnd={`url(#lg-${kind})`}>
        {kind === "loop" && <animate attributeName="stroke-dashoffset" from="10" to="0" dur="0.5s" repeatCount="indefinite" />}
      </line>
    </svg>
  )
}

const same = (a: Focus, b: Focus) => JSON.stringify(a) === JSON.stringify(b)

/** An entry: the sidebar row's hover and its on state, a sample of what it names, the name and its words. */
function Entry({ focus, current, onFocus, sample, children }: { focus: Focus; current: Focus; onFocus: (f: Focus) => void; sample: React.ReactNode; children: React.ReactNode }) {
  const on = same(focus, current)
  return (
    <button
      type="button"
      onClick={() => onFocus(on ? null : focus)}
      aria-pressed={on}
      className={cn("flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-[background-color,box-shadow] hover:bg-[color-mix(in_oklab,var(--paper-text)_8%,var(--paper))] hover:shadow-e1", on && "bg-[color-mix(in_oklab,var(--paper-text)_8%,var(--paper))] shadow-e1")}
    >
      <span className="flex min-h-8 w-14 shrink-0 items-center justify-center">{sample}</span>
      <span className="min-w-0">{children}</span>
    </button>
  )
}

const Name = ({ children }: { children: React.ReactNode }) => <span className="block text-[13px] font-semibold text-[var(--paper-text)]">{children}</span>
const Def = ({ children }: { children: React.ReactNode }) => <span className="block text-xs leading-snug text-[var(--paper-muted)]">{children}</span>

type View = "rows" | "factory" | "widgets"

function Architecture({ view, edges, focus, onFocus, onOpen }: { view: View; edges: Edge[]; focus: Focus; onFocus: (f: Focus) => void; onOpen: (v: View) => void }) {
  const kind = (k: NodeKind, sample: React.ReactNode, name: string, def: string) => (
    <Entry key={k} focus={{ on: "kind", kind: k }} current={focus} onFocus={onFocus} sample={sample}>
      <Name>{name}</Name>
      <Def>{def}</Def>
    </Entry>
  )
  const line = (k: Kindof, name: string, def: string) => (
    <Entry key={k} focus={{ on: "edges", kind: k }} current={focus} onFocus={onFocus} sample={<Line kind={k} />}>
      <Name>{name}</Name>
      <Def>{def}</Def>
    </Entry>
  )
  const chips = (pick: (d: FxData) => boolean) =>
    edges
      .filter((e) => pick(e.data as FxData))
      .map((e) => {
        const d = e.data as FxData
        return (
          <Entry key={e.id} focus={{ on: "edge", id: e.id }} current={focus} onFocus={onFocus} sample={d.bare ? <Line kind={d.kind} /> : <EdgeChip d={d} big />}>
            <Def>{d.label}</Def>
          </Entry>
        )
      })
  const heading = (label: React.ReactNode, f: Focus, loopN?: number) => {
    const on = same(f, focus)
    return (
      <button type="button" onClick={() => onFocus(on ? null : f)} aria-pressed={on} className={cn("mb-1 flex items-center gap-2 rounded-md text-[13px] font-semibold hover:underline", loopN ? "text-violet-600" : "text-[var(--paper-text)]")}>
        {loopN && <LoopBadge n={loopN} />}
        {label}
      </button>
    )
  }
  if (view === "rows")
    return (
      <div className="pt-1.5">
        <SideBarMenuItem href="/factory?panel=factory" label="Factory" icon={Boxes} on={false} group="Architecture" sub="The boxes, the lines and the three loops" onSelect={() => onOpen("factory")} tip={{ name: "The boxes, the lines and the three loops", side: "right" }} />
        <SideBarMenuItem href="/factory?panel=widgets" label="Widgets" icon={Blocks} on={false} group="Architecture" sub="Every chip on the lines, and its words" onSelect={() => onOpen("widgets")} tip={{ name: "Every chip on the lines, and its words", side: "right" }} />
      </div>
    )
  if (view === "factory")
    return (
      <>
        <div className="space-y-1">
          {kind("door", <span style={{ background: "var(--paper-strong)" }} className="h-6 w-14 rounded-lg" />, "Door", "A source the lake takes its data from.")}
          {kind("stage", <span className="h-6 w-14 rounded-xl border-2 border-[var(--paper-strong)] bg-[var(--paper)]" />, "Stage", "What the lake does to the data, with the tools that do it.")}
          {kind("store", <span className="flex h-6 w-14 items-center justify-center rounded-[10px_10px_6px_6px] border border-[var(--paper-rule-soft)] bg-[var(--paper-quiet)]"><HardDrive className="size-3.5 text-[var(--paper-muted)]" /></span>, "Store", "Where it is kept: the lake's S3 prefixes, the Glue catalog, the search index file.")}
          {kind("instrument", <span style={{ background: tint("var(--paper-strong)", 10), borderColor: tint("var(--paper-strong)", 35) }} className="flex h-6 w-14 items-center gap-1 rounded-full border pl-0.5"><MakeBadge make="neural" small /></span>, "Instrument", "A model or an index NSRgpt runs, numbered as listed here. Its circle names the kind: a network for a neural network, a magnifier for a ranking index, a table for data built from the lake. A dashed one is staged: in build, not yet serving.")}
          {kind("service", <span style={{ background: tint("#f59e0b", 14), borderColor: tint("#d97706", 55) }} className="flex h-6 w-14 items-center justify-center rounded-lg border"><Server className="size-3.5 text-[#d97706]" /></span>, "Service", "An AWS service the lake calls, named for its job; what it does shows on hover.")}
          {kind("surface", <span className="h-6 w-14 overflow-hidden rounded-lg border border-[var(--paper-rule-soft)] bg-[var(--paper)]"><span className="block h-1.5 bg-[var(--paper-quiet)]" /></span>, "Surface", "A page the lake feeds.")}
        </div>
        <div className="mt-3 space-y-1 border-t border-[var(--paper-rule-soft)] pt-3">
          {line("flow", "Flow", "The data, or what was built from it, moves on.")}
          {line("loop", "Loop", "A result comes back to re-enter the lake or feed what runs in it.")}
          {line("planned", "Planned", "Dashed: drawn where it will run; not yet wired.")}
        </div>
        <div className="mt-3 space-y-1 border-t border-[var(--paper-rule-soft)] pt-3">
          {LOOPS.map(([n, name, def]) => (
            <Entry key={n} focus={{ on: "loop", n }} current={focus} onFocus={onFocus} sample={<LoopBadge n={n} />}>
              <span className="block text-[13px] font-semibold text-violet-600">{name}</span>
              <Def>{def}</Def>
            </Entry>
          ))}
        </div>
      </>
    )
  return (
    <div className="space-y-3 divide-y divide-[var(--paper-rule-soft)] [&>*:not(:first-child)]:pt-3">
      {LOOPS.map(([n, name]) => (
        <div key={n}>
          {heading(name, { on: "loop", n }, n)}
          {chips((d) => d.loop === n)}
        </div>
      ))}
      <div>
        {heading("Flow", { on: "edges", kind: "flow" })}
        {chips((d) => d.kind === "flow")}
      </div>
      <div>
        {heading("Planned", { on: "edges", kind: "planned" })}
        {chips((d) => d.kind === "planned")}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------
// The drawing's grid: the doors on the left, then the raw store, Parse, the parsed lake and its catalog, Serve, the
// serving stores, the instruments and services, and the surfaces on the right. Every position derives from these.

const GAP = 90 // between columns: room for a chip
const W = { door: 150, store: 210, stage: 230, service: 170, surface: 160, chip: 210 }
const DOOR_H = 44
const STORE_H = 56
const SURFACE_H = 52
const ROW = 76 // one door, store or surface and the gap under it

const X_DOOR = 0
const X_RAW = X_DOOR + W.door + GAP
const X_PARSE = X_RAW + W.store + GAP
const X_LAKE = X_PARSE + W.stage + GAP
const X_SERVE = X_LAKE + W.store + GAP
const X_SERVING = X_SERVE + W.stage + GAP
const X_RUN = X_SERVING + W.store + GAP
const X_SURFACE = X_RUN + W.chip + GAP

const doorY = (i: number) => 60 + i * (DOOR_H + 24)
const rowY = (i: number) => 40 + i * ROW
const STAGE_Y = 40
const STAGE_H = 6 * (DOOR_H + 24) + 40
const STAGE_BOTTOM = STAGE_Y + STAGE_H
const RAIL_BOTTOM = STAGE_BOTTOM + 40 // loop 1's rail, under everything
// The surfaces sit level with what feeds them: Graph with Delivery, Charts with the chart data; Views and Pipeline under them.
const GRAPH_Y = rowY(3) + 2
const CHARTS_Y = rowY(4) + 1
const VIEWS_Y = rowY(5) + 20
const PIPELINE_Y = VIEWS_Y + SURFACE_H + 24
/** Halfway between Graph's and Views' middles, where loop 2's chips sit on their rails. */
const VIEWS_MID = (GRAPH_Y + VIEWS_Y + SURFACE_H) / 2
/** The middle of the gap between the instruments and the surfaces. */
const RUN_GAP = X_RUN + W.chip + GAP / 2

export function build(): { nodes: Node[]; edges: Edge[] } {
  const n = (id: string, type: string, x: number, y: number, data: Record<string, unknown>): Node => ({ id, type, position: { x, y }, data, selectable: false })

  const nodes: Node[] = [
    // Doors: the sources
    n("iaea", "door", X_DOOR, doorY(0), { w: W.door, h: DOOR_H, title: "IAEA", about: "nds.iaea.org: EXFOR, the Live Chart, the ENDF archive" }),
    n("nndc", "door", X_DOOR, doorY(1), { w: W.door, h: DOOR_H, title: "NNDC", about: "nndc.bnl.gov: ENSDF, XUNDL, NSR and ENDF/B, every release", big: true }),
    n("nea", "door", X_DOOR, doorY(2), { w: W.door, h: DOOR_H, title: "OECD NEA", about: "JEFF libraries and the WPEC documents" }),
    n("jaea", "door", X_DOOR, doorY(3), { w: W.door, h: DOOR_H, title: "JAEA", about: "the JENDL libraries" }),
    n("proxy", "door", X_DOOR, doorY(4), { w: W.door, h: DOOR_H, title: "Proxy lane", about: "fetches through residential proxies where a source refuses the cloud" }),
    n("wayback", "door", X_DOOR, doorY(5), { w: W.door, h: DOOR_H, title: "Wayback lane", about: "the Internet Archive's copies of what a source no longer serves" }),

    // The raw layer
    n("raw", "store", X_RAW, doorY(2) + (DOOR_H - STORE_H) / 2 + 34, { w: W.store, h: STORE_H, service: "Amazon S3", title: "raw/", count: `${LAKE.files} files`, about: "every file as its source served it, under the source's own paths" }),

    // Parse
    n("parse", "stage", X_PARSE, STAGE_Y, {
      w: W.stage, h: STAGE_H, title: "Parse", about: "Where it runs: Lambda and short-lived EC2 boxes, one script per dataset under scripts/parse/",
      tools: [
        ["ENSDF reader", "the 80-column cards into 16 tables: datasets, levels, gammas, decays, Q-values and the rest"],
        ["XUNDL reader", "the same reader, on the unevaluated list"],
        ["EXFOR J4 and X4Pro", "entries, subentries, reactions and every data point"],
        ["ENDFtk", "every ENDF-6 file's materials, sections and cross-section points"],
        ["NSR loader", "the references, their keywords, nuclides and reactions"],
        ["PDF worker", "the arXiv and APS papers the references point to"],
      ],
      foot: [`${LAKE.size} in the lake`],
    }),

    // The parsed layer and its catalog
    n("lake", "store", X_LAKE, rowY(1), { w: W.store, h: STORE_H, service: "Amazon S3", title: "lake/", count: `${LAKE.records} records`, about: "the parsed layer: one Parquet table per kind of record" }),
    n("glue", "store", X_LAKE, rowY(3), { w: W.store, h: STORE_H, service: "AWS Glue", title: "nsr catalog", count: "297 tables", about: "the Glue database every table is named in, with its columns" }),
    n("athena", "service", X_LAKE + (W.store - W.service) / 2, rowY(5), { w: W.service, h: 48, title: "Queries", about: "Amazon Athena: SQL over the lake's tables where they sit" }),

    // Serve
    n("serve", "stage", X_SERVE, STAGE_Y, {
      w: W.stage, h: STAGE_H, title: "Serve", about: "Builds the tables the pages and the API read: scripts/parse/serve-structure/, scripts/parse/search/",
      tools: [
        ["Nuclide tables", "summary, levels, gammas and decays, from ENSDF"],
        ["ENDF tables", "materials, MT names and cross sections, the POINT releases first"],
        ["EXFOR tables", "the search index and its pickers"],
        ["Search index", "every dataset's words, into one DuckDB file"],
        ["Chart and diagram data", "the JSON the charts and the diagram library read"],
      ],
      foot: [`NSR ${coreCount("nsr")}`, `ENSDF ${coreCount("ensdf")} · EXFOR ${coreCount("exfor")}`],
    }),

    // The serving layer
    n("serving", "store", X_SERVING, rowY(2), { w: W.store, h: STORE_H, service: "Amazon S3", title: "lake/serve/", about: "the serving tables: nuclide, ENDF, EXFOR and search" }),
    n("index", "store", X_SERVING, rowY(1), { w: W.store, h: STORE_H, service: "DuckDB file", title: "search.duckdb", about: "the keyword index, copied into the API on a cold start" }),
    n("vizdata", "store", X_SERVING, rowY(4), { w: W.store, h: STORE_H, extra: [{ id: "r-lib", side: "r", at: STORE_H - 10 }], service: "Amazon S3", title: "site/viz-data/", about: "the charts' and diagrams' JSON, one version folder at a time" }),

    // What runs: the instruments and the services
    n("i1", "instrument", X_RUN, rowY(0) + 10, { w: W.chip, n: 1 }),
    n("i2", "instrument", X_RUN, rowY(1) + 10, { w: W.chip, n: 2, extra: [{ id: "r-q", side: "r", at: 4 }] }),
    n("api", "service", X_RUN + (W.chip - W.service) / 2, rowY(2) + 4, { w: W.service, h: 48, title: "API", about: "AWS Lambda nsr-api: the nuclide, ENDF, EXFOR and search routes" }),
    n("i3", "instrument", X_RUN, rowY(4) + 10, { w: W.chip, n: 3 }),
    n("i4", "instrument", X_RUN, rowY(5) + 10, { w: W.chip, n: 4 }),
    n("cdn", "service", X_RUN + (W.chip - W.service) / 2, rowY(3) + 4, { w: W.service, h: 48, title: "Delivery", about: "Amazon CloudFront: the API and the chart data, cached at the edge" }),

    // Surfaces
    n("chat", "surface", X_SURFACE, rowY(0), { w: W.surface, h: SURFACE_H, title: "Chat", path: "/chat", about: "answers that cite the records", extra: [{ id: "l-q", side: "l", at: 44 }] }),
    n("search", "surface", X_SURFACE, rowY(1), { w: W.surface, h: SURFACE_H, title: "Search", path: "/search", about: "every dataset's records, by keyword" }),
    n("graph", "surface", X_SURFACE, GRAPH_Y, { w: W.surface, h: SURFACE_H, extra: [{ id: "l-lib", side: "l", at: 42 }], title: "Graph", path: "/graph", about: "the canvas and its diagram library" }),
    n("charts", "surface", X_SURFACE, CHARTS_Y, { w: W.surface, h: SURFACE_H, title: "Charts", path: "/viz", about: "the chart pages" }),
    n("pipeline", "surface", X_SURFACE, PIPELINE_Y, { w: W.surface, h: SURFACE_H, title: "Pipeline", path: "/pipeline", about: "the sources, the lake and the pages, with the lake's counts written in" }),
    n("views", "surface", X_SURFACE, VIEWS_Y, { w: W.surface, h: SURFACE_H, title: "Views", path: "/graph", about: "saved canvases and recipes", planned: true }),
  ]

  /** A line between the facing sides; given handles and an offset, a line on a rail around the drawing, as pax-trinity's
   *  loops run. */
  const e = (id: string, source: string, target: string, data: FxData, sourceHandle = "r", targetHandle = "l"): Edge => {
    const color = data.kind === "loop" ? LOOP : data.kind === "planned" ? PLANNED : FLOW
    return {
      id, source, sourceHandle, target, targetHandle, type: "fx", data: { auto: data.offset === undefined, ...data },
      animated: data.kind === "loop",
      markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
      zIndex: data.kind === "loop" ? 1 : 0,
    }
  }
  const flow = (icon: LucideIcon | string, label: string, more: Partial<FxData> = {}): FxData => ({ kind: "flow", label, ...(typeof icon === "string" ? { text: icon } : { icon }), ...more })
  const loop = (loopN: number, icon: LucideIcon, label: string, more: Partial<FxData> = {}): FxData => ({ kind: "loop", loop: loopN, icon, label, ...more })
  const planned = (icon: LucideIcon | string, label: string, more: Partial<FxData> = {}): FxData => ({ kind: "planned", label, ...(typeof icon === "string" ? { text: icon } : { icon }), ...more })

  const edges: Edge[] = [
    // Into the lake
    e("iaea-raw", "iaea", "raw", flow(Download, "EXFOR, the Live Chart and the ENDF archive, downloaded")),
    e("nndc-raw", "nndc", "raw", flow(Download, "every ENSDF, XUNDL, NSR and ENDF/B release, downloaded")),
    e("nea-raw", "nea", "raw", flow(Download, "the JEFF libraries")),
    e("jaea-raw", "jaea", "raw", flow(Download, "the JENDL libraries")),
    e("proxy-raw", "proxy", "raw", flow(Globe, "what a source refuses the cloud, fetched through the proxies")),
    e("wayback-raw", "wayback", "raw", flow(ArchiveRestore, "copies of what a source no longer serves")),

    // Parse and the parsed layer
    e("raw-parse", "raw", "parse", flow(Zap, "each source's files, read by its parser")),
    e("parse-lake", "parse", "lake", flow(Table, "one Parquet table per kind of record")),
    e("lake-glue", "lake", "glue", flow(Database, "every table named, with its columns")),
    e("glue-athena", "glue", "athena", flow(Search, "SQL over the tables where they sit")),

    // Serve and the serving layer
    e("athena-serve", "athena", "serve", flow(Layers, "the parsed tables, joined and shaped")),
    e("serve-serving", "serve", "serving", flow(TableProperties, "the serving tables")),
    e("serve-index", "serve", "index", flow(Binary, "every dataset's words, indexed")),
    e("serve-vizdata", "serve", "vizdata", flow(ChartLine, "the charts' and diagrams' JSON")),

    // What reads the serving layer
    e("serving-api", "serving", "api", flow(Cpu, "read by the routes, held in memory")),
    e("index-i2", "index", "i2", flow(FileSearch, "loaded on a cold start")),
    e("vizdata-i3", "vizdata", "i3", flow(ChartLine, "one version folder")),
    e("vizdata-i4", "vizdata", "i4", flow(Waypoints, "the diagram files", { offset: 16 }), "r-lib", "l"),
    e("api-cdn", "api", "cdn", flow(Cloud, "every route behind the edge cache")),

    // What feeds the surfaces
    e("i1-chat", "i1", "chat", flow(PenLine, "papers by meaning, for the answer")),
    e("i2-search", "i2", "search", flow(Search, "records by keyword")),
    e("cdn-graph", "cdn", "graph", flow(Network, "nuclides, papers and edges")),
    e("i3-charts", "i3", "charts", flow(ChartLine, "the charts' data")),
    e("i4-graph", "i4", "graph", flow(Waypoints, "the reference figures, drawn from the data", { offset: 16, at: [RUN_GAP, rowY(5) - 2] }), "r", "l-lib"),
    // Under everything, below loop 1's rail
    e("serve-pipeline", "serve", "pipeline", flow(ScrollText, "the lake's counts, written into the cards", { offset: 32, at: [X_RUN + W.chip / 2, PIPELINE_Y + SURFACE_H + 32] }), "b", "b"),

    // Loop 1: a newer release comes in and runs through again. Under the stages, then up the left of the doors.
    e("serve-wayback", "serve", "wayback", loop(1, History, "each table names the release it was built from", { offset: RAIL_BOTTOM - STAGE_BOTTOM, at: [X_LAKE + W.store / 2, RAIL_BOTTOM] }), "b", "b"),
    e("wayback-nndc", "wayback", "nndc", loop(1, RefreshCw, "the lanes look for a newer release at the sources", { offset: 28, at: [X_DOOR - 28, (doorY(5) + doorY(1)) / 2 + DOOR_H / 2] }), "l", "l"),
    // Loop 2: saved canvases, down the right of the surfaces
    e("graph-views", "graph", "views", planned(Save, "a canvas saved on Graph becomes a View, once Community has a store", { offset: 64, at: [X_SURFACE + W.surface + 64, VIEWS_MID] }), "r", "r"),
    e("views-graph", "views", "graph", loop(2, BookOpen, "a View loads back onto Graph", { offset: 28, at: [X_SURFACE + W.surface + 28, VIEWS_MID] }), "r", "r"),
    // Loop 3: questions, in the gap beside Chat
    e("i2-chat", "i2", "chat", loop(3, MessageCircleQuestionMark, "a question asked in Chat runs through the keyword index, and the records it finds come back as citations", { offset: 20 }), "r-q", "l-q"),
  ]
  return { nodes, edges }
}

function Canvas({ nodes, edges, onNodesChange, onPane }: { nodes: Node[]; edges: Edge[]; onNodesChange: (changes: NodeChange[]) => void; onPane: () => void }) {
  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      connectionMode={ConnectionMode.Loose}
      nodesDraggable
      nodesConnectable={false}
      elementsSelectable={false}
      onPaneClick={onPane}
      fitView
      fitViewOptions={{ padding: 0.04 }}
      minZoom={0.08}
      maxZoom={2.5}
      proOptions={{ hideAttribution: true }}
    >
      {/* /graph's canvas chrome: its dots and its zoom controls in the paper palette (app/globals.css). */}
      <Background gap={24} size={1} />
      <Controls showInteractive={false} />
    </ReactFlow>
  )
}

/** The canvas, with the Architecture panel in the right inset panel, which the gear at its top right opens. */
const LAYOUT_KEY = "factory-layout-v2" // a new key whenever the default layout changes, so old moves don't stack on it

export function FactoryCanvas() {
  // The panel starts closed, as /graph's do, without changing what this browser remembers elsewhere.
  useRailsClosedWhileMounted(["right"])
  const base = React.useMemo(() => build(), [])
  const { edges } = base
  // Where the drawing puts each box. A kept layout holds each moved box's offset from that home, so a
  // change to the drawing carries the moves with it.
  const home = React.useMemo(() => new Map(base.nodes.map((n) => [n.id, n.position])), [base])
  const [nodes, setNodes] = React.useState(base.nodes)
  React.useEffect(() => {
    let moves: Record<string, { dx: number; dy: number }> = {}
    try {
      const kept = JSON.parse(window.localStorage.getItem(LAYOUT_KEY) ?? "null") as { v?: number; moves?: Record<string, { dx: number; dy: number }> } | null
      moves = kept?.v === 2 ? (kept.moves ?? {}) : {}
    } catch {
      moves = {}
    }
    setNodes(base.nodes.map((n) => (moves[n.id] ? { ...n, position: { x: n.position.x + moves[n.id].dx, y: n.position.y + moves[n.id].dy } } : n)))
  }, [base])
  const onNodesChange = React.useCallback((changes: NodeChange[]) => setNodes((ns) => applyNodeChanges(changes, ns)), [])
  const moved = React.useMemo(() => {
    const out = new Set<string>()
    for (const n of nodes) {
      const h = home.get(n.id)
      if (h && (h.x !== n.position.x || h.y !== n.position.y)) out.add(n.id)
    }
    return out
  }, [nodes, home])
  // Kept once a drag ends, not on every frame of it.
  React.useEffect(() => {
    if (nodes.some((n) => n.dragging)) return
    try {
      const moves = Object.fromEntries(nodes.filter((n) => moved.has(n.id)).map((n) => [n.id, { dx: n.position.x - home.get(n.id)!.x, dy: n.position.y - home.get(n.id)!.y }]))
      if (moved.size) window.localStorage.setItem(LAYOUT_KEY, JSON.stringify({ v: 2, moves }))
      else window.localStorage.removeItem(LAYOUT_KEY)
    } catch {
      // storage full or off: the layout lasts the visit
    }
  }, [nodes, moved, home])
  const reset = () => setNodes(base.nodes)
  const [focus, setFocus] = React.useState<Focus>(null)
  // The Architecture panel: the right inset panel, its rows the top layer and Factory and Widgets one drill down.
  const closed = useRailClosed("right")
  const [view, setView] = React.useState<View>("rows")
  // Closing the panel puts the lights out.
  React.useEffect(() => {
    if (closed) setFocus(null)
  }, [closed])
  const lit = React.useMemo(() => lights(focus, nodes, edges), [focus, nodes, edges])
  React.useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && setFocus(null)
    window.addEventListener("keydown", key)
    return () => window.removeEventListener("keydown", key)
  }, [])
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1">
      <div className="relative min-w-0 flex-1 overflow-hidden">
        <LitCtx.Provider value={lit}>
          <MovedCtx.Provider value={moved}>
            <ReactFlowProvider>
              <div className="absolute inset-0">
                <Canvas nodes={nodes} edges={edges} onNodesChange={onNodesChange} onPane={() => setFocus(null)} />
              </div>
            </ReactFlowProvider>
          </MovedCtx.Provider>
        </LitCtx.Provider>
        {moved.size > 0 && (
          <div className="absolute left-4 top-4 z-10 rounded-full border bg-[var(--paper)] p-1 shadow-sm">
            <Button variant="outline" className="h-8 rounded-full px-3.5 text-[13px]" onClick={reset}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset layout
            </Button>
          </div>
        )}
        <div className="absolute right-4 top-4 z-10 rounded-full border bg-[var(--paper)] p-1 shadow-sm">
          <Button
            variant="outline"
            onClick={() => { if (!closed) setRail("right", true); else { setView("rows"); setRail("right", false); } }}
            aria-pressed={!closed}
            aria-label="Architecture"
            title="Architecture"
            className={cn("h-8 w-8 rounded-full p-0", !closed && "bg-[var(--paper-quiet)]")}
          >
            <Settings2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <InsetPanel side="right" storageKey="factory:inset-right-w">
        <InsetLayers layerKey={view} depth={view === "rows" ? 0 : 1}>
          {view === "rows" ? (
            <>
              <div className={INSET.header}>
                <h2 className={INSET.title}>Architecture</h2>
              </div>
              <InsetBody>
                <Architecture view="rows" edges={edges} focus={focus} onFocus={setFocus} onOpen={setView} />
              </InsetBody>
            </>
          ) : (
            <>
              <RightViewHeader onBack={() => setView("rows")}>
                <h2 className={INSET.title}>{view === "factory" ? "Factory" : "Widgets"}</h2>
              </RightViewHeader>
              <InsetBody className="px-3 pt-2">
                <Architecture view={view} edges={edges} focus={focus} onFocus={setFocus} onOpen={setView} />
              </InsetBody>
            </>
          )}
        </InsetLayers>
      </InsetPanel>
    </div>
  )
}
