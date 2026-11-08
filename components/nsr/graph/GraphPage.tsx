"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ReactFlow, ReactFlowProvider, Background, Controls, Panel, Handle, Position,
  useNodesState, useEdgesState, useReactFlow, addEdge,
  SelectionMode, ConnectionMode, ConnectionLineType, PanOnScrollMode,
  type Node, type Edge, type NodeProps, type Connection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "@dagrejs/dagre";
import {
  ArrowLeft, Atom, BookOpen, Boxes, Check, ChevronRight, Crosshair, Database, FileText, FlaskConical, History, Layers,
  GripVertical, Loader2, MessageSquare, MoreHorizontal, Play, Plus, Save, Search, Settings2, Users, X,
} from "lucide-react";
import { FlowSettingsPanel, DEFAULT_FLOW_PROPS, type FlowProps } from "@/components/nsr/graph/FlowSettings";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogPopup, DialogHeader, DialogTitle, DialogDescription } from "@/components/animate-ui/components/base/dialog";
import { Input } from "@/components/ui/input";
import { TexText } from "@/components/chat/TexText";
import { DetailBody } from "@/components/chat/EntityDetail";
import { ChatDock } from "@/components/nsr/graph/ChatDock";
import { RailToggle } from "@/components/rail-toggle";
import { type DragEntity, readDragEntity, setDragEntity } from "@/lib/nsr-drag-entity";
import { toast } from "sonner";

/**
 * The workspace canvas — OpenMetadata's lineage interaction model over our
 * corpus, plus the agentic layer: prompt nodes chain queries through /api/chat
 * (wired entities and files become context), files drop straight onto the
 * canvas, and a saved view containing prompt steps is a runnable recipe.
 * Record edges only for data; user-drawn edges only INTO prompt steps.
 */

/* ── graph state ──────────────────────────────────────────────────────────── */

export interface CardRowGroup { items: { id: string; label: string }[]; total: number }
export interface CardRows { authors?: CardRowGroup; nuclides?: CardRowGroup; reactions?: CardRowGroup }

export interface GNode {
  type: "paper" | "author" | "nuclide" | "reaction" | "exfor" | "prompt" | "file" | "more";
  id: string;
  label: string;
  sub?: string;
  title?: string | null;
  prompt?: string;
  output?: string;
  fileKey?: string;
  fileText?: string;
  /** Paper cards: the entity rows shown inside the card (op=cards). */
  rows?: CardRows;
  /** "+N more" overflow supernodes: whose overflow, which relation. */
  parentKey?: string;
  rel?: string;
  /** op=similar results: cosine to the anchor (rides onto the edge, not the card). */
  cos?: number;
  /** Paper cards: which row groups are unfolded (collapsed by default). */
  openGroups?: string[];
}
/** Edge provenance. Absent = a record from the join tables. */
type EdgeMeta = { kind?: "similar" | "wired"; cos?: number } & Record<string, unknown>;
const isSimilar = (e: Edge) => (e.data as EdgeMeta | undefined)?.kind === "similar";
const keyOf = (n: { type: string; id: string }) => `${n.type}:${n.id}`;

const RELS: Partial<Record<GNode["type"], { rel: string; label: string }[]>> = {
  paper: [
    { rel: "authors", label: "authors" },
    { rel: "nuclides", label: "nuclides" },
    { rel: "reactions", label: "reactions" },
    { rel: "exfor", label: "EXFOR" },
  ],
  author: [{ rel: "papers", label: "papers" }],
  nuclide: [{ rel: "papers", label: "papers" }],
  reaction: [{ rel: "papers", label: "papers" }],
  exfor: [{ rel: "papers", label: "papers" }],
};

/* ── layout ───────────────────────────────────────────────────────────────── */

const NODE_W: Record<GNode["type"], number> = {
  paper: 250, author: 150, nuclide: 130, reaction: 140, exfor: 150, prompt: 260, file: 170, more: 130,
};

/** Card heights vary — papers grow with their entity rows. Dagre needs truth. */
function nodeHeight(g: GNode): number {
  if (g.type === "prompt") return 150;
  if (g.type === "more") return 40;
  let h = 74;
  if (g.type === "paper" && g.rows) {
    for (const grp of ["nuclides", "reactions", "authors"] as const) {
      const rg = g.rows[grp];
      if (!rg?.total) continue;
      h += 22; // group header
      if (g.openGroups?.includes(grp)) h += rg.items.length * 18; // rows only when unfolded
    }
  }
  return h;
}

type LayoutMode = "none" | "dagre-lr" | "dagre-tb";
const LAYOUT_MODES: LayoutMode[] = ["none", "dagre-lr", "dagre-tb"];

function layout(nodes: Node[], edges: Edge[], rankdir: "LR" | "TB" = "LR"): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir, nodesep: 24, ranksep: 90 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of nodes) {
    const d = n.data as unknown as GNode;
    g.setNode(n.id, { width: NODE_W[d.type] ?? 160, height: nodeHeight(d) });
  }
  for (const e of edges) g.setEdge(e.source, e.target);
  dagre.layout(g);
  return nodes.map((n) => {
    const p = g.node(n.id);
    return { ...n, position: { x: p.x - p.width / 2, y: p.y - p.height / 2 } };
  });
}

/* ── node cards ───────────────────────────────────────────────────────────── */

const CARD = "rounded-lg border border-[var(--paper-rule)] bg-[var(--paper)] px-3 py-2 text-xs shadow-sm";

type EntityData = GNode & {
  onExpand: (node: GNode, rel: string) => void;
  onRow: (from: GNode, group: keyof CardRows, item: { id: string; label: string }) => void;
  onMore: (parentKey: string, rel: string) => void;
  onSimilar: (node: GNode) => void;
  onToggleGroup: (key: string, group: string) => void;
  onEditPrompt: (id: string, text: string) => void;
  onRun: (nodeKey: string) => void;
  running: string | null;
  expanding: string | null;
  expanded: Record<string, { loaded: number; total: number }>;
  dimmed: boolean;
} & Record<string, unknown>;

const supNuclide = (label: string) => label.replace(/^(\d+)/, "<sup>$1</sup>");

/* ── execution traces ─────────────────────────────────────────────────────── */

interface TraceStep {
  key: string;
  prompt: string;
  status: "running" | "done" | "error";
  input?: string;
  output?: string;
  error?: string;
  startedAt: number;
  ms?: number;
}
interface RunTrace {
  id: string;
  label: string;
  startedAt: number;
  finishedAt?: number;
  steps: TraceStep[];
}

/** The receipt behind a data edge — which join table, and what the record says. */
function edgeReceipt(x: GNode, y: GNode, meta?: EdgeMeta): { table?: string; text: string } {
  if (meta?.kind === "similar")
    return { text: `Inference from the embedding space (bge-m3 cosine similarity${meta.cos != null ? ` = ${meta.cos.toFixed(3)}` : ""}) — NOT a database record. ${x.label} and ${y.label} sit near each other in vector space; nothing in the corpus joins them.` };
  const pair = (t1: GNode["type"], t2: GNode["type"]) =>
    (x.type === t1 && y.type === t2) || (x.type === t2 && y.type === t1);
  const paper = x.type === "paper" ? x : y.type === "paper" ? y : null;
  const other = paper === x ? y : x;
  if (paper && pair("paper", "author"))
    return { table: "nsr_authors", text: `${other.label} is listed on ${paper.id}'s author roster in the NSR record.` };
  if (paper && pair("paper", "nuclide"))
    return { table: "nsr_nuclides", text: `${paper.id}'s NSR keyword annotations list ${other.label} among the nuclides studied.` };
  if (paper && pair("paper", "reaction"))
    return { table: "nsr_reactions", text: `${paper.id}'s NSR keyword annotations list the reaction ${other.label}.` };
  if (paper && pair("paper", "exfor"))
    return { table: "nsr_exfor", text: `EXFOR entry ${other.label} compiles experimental data from ${paper.id}.` };
  if (x.type === "prompt" || y.type === "prompt")
    return { text: "User-wired context: this edge feeds the connected node into a prompt step. It is a drawing you made, not a database record." };
  if (x.type === "more" || y.type === "more")
    return { text: "Overflow marker — the honest remainder of a paged expansion. Click it to load the next page." };
  return { table: "corpus join tables", text: "Relation record from the corpus." };
}

function EntityNode({ data, selected }: NodeProps<Node<EntityData>>) {
  const d = data;
  const accent = selected ? "border-nuclear ring-1 ring-nuclear" : "";
  const dim = d.dimmed ? "opacity-30" : "";

  if (d.type === "prompt") {
    const busy = d.running === keyOf(d);
    return (
      <div className={`${CARD} ${accent} ${dim} border-dashed transition-opacity`} style={{ width: NODE_W.prompt }}>
        <Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5 !border-0 !bg-nuclear" />
        <Handle type="source" position={Position.Right} className="!h-2.5 !w-2.5 !border-0 !bg-nuclear" />
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-nuclear">Prompt step</p>
          <button
            onClick={(e) => { e.stopPropagation(); d.onRun(keyOf(d)); }}
            className="flex items-center gap-1 rounded border bg-[var(--paper-quiet)] px-1.5 py-0.5 text-[9px] text-[var(--paper-text)] transition-colors hover:bg-[var(--paper-quiet)]"
            title="Run this step (runs upstream steps first)"
          >
            {busy ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Play className="h-2.5 w-2.5" />} run
          </button>
        </div>
        <textarea
          value={d.prompt ?? ""}
          onChange={(e) => d.onEditPrompt(d.id, e.target.value)}
          onClick={(e) => e.stopPropagation()}
          placeholder="Ask something about the wired context…"
          className="nodrag mt-1.5 h-16 w-full resize-none rounded-md border bg-[var(--paper)] p-1.5 text-[11px] text-[var(--paper-text)] focus-visible:outline-none"
        />
        {d.output && (
          <p className="mt-1.5 line-clamp-3 rounded bg-[var(--paper-quiet)] p-1.5 text-[10px] leading-snug text-[var(--paper-muted)]">
            {d.output}
          </p>
        )}
      </div>
    );
  }

  if (d.type === "more") {
    return (
      <button
        onClick={(e) => { e.stopPropagation(); if (d.parentKey && d.rel) d.onMore(d.parentKey, d.rel); }}
        className={`${dim} flex items-center justify-center rounded-lg border border-dashed bg-[var(--paper-quiet)] px-3 py-2 text-[11px] font-medium text-[var(--paper-muted)] transition-colors hover:bg-[var(--paper-quiet)] hover:text-[var(--paper-text)]`}
        style={{ width: NODE_W.more, height: 40 }}
        title="Load the next page"
      >
        <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-0 !bg-[var(--paper-quiet)]-foreground/40" />
        {d.expanding ? <Loader2 className="h-3 w-3 animate-spin" /> : d.label}
      </button>
    );
  }

  if (d.type === "file") {
    return (
      <div className={`${CARD} ${accent} ${dim} transition-opacity`} style={{ width: NODE_W.file }}>
        <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-0 !bg-[var(--paper-quiet)]-foreground/50" />
        <p className="flex items-center gap-1.5 truncate font-mono text-[11px] font-semibold text-[var(--paper-text)]">
          <FileText className="h-3 w-3 shrink-0 text-nuclear" /> {d.label}
        </p>
        {d.sub && <p className="mt-0.5 truncate text-[10px] text-[var(--paper-muted)]">{d.sub}</p>}
        {d.fileText && <Badge variant="secondary" className="mt-1 text-[9px]">text wired</Badge>}
      </div>
    );
  }

  return (
    <div className={`${CARD} ${accent} ${dim} group/card relative transition-opacity`} style={{ width: NODE_W[d.type] }}>
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-0 !bg-[var(--paper-quiet)]-foreground/50" />
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-0 !bg-[var(--paper-quiet)]-foreground/50" />
      {/* nodrag keeps React Flow's pointer-drag off this grip, so the native
          HTML5 drag fires — drop it on the chat dock to attach as context */}
      <span
        draggable
        onDragStart={(e) => { e.stopPropagation(); setDragEntity(e.dataTransfer, d); }}
        className="nodrag absolute right-1 top-1 hidden cursor-grab rounded p-0.5 text-[var(--paper-muted)] hover:bg-[var(--paper-quiet)] hover:text-[var(--paper-text)] group-hover/card:block"
        title="drag into the chat to attach as context"
      >
        <GripVertical className="h-3 w-3" />
      </span>
      <p className={`truncate pr-3 font-mono text-[11px] font-semibold ${d.type === "paper" ? "text-nuclear" : "text-[var(--paper-text)]"}`}>
        {d.type === "nuclide" ? <span dangerouslySetInnerHTML={{ __html: d.label.replace(/^(\d+)/, "<sup>$1</sup>") }} /> : d.label}
      </p>
      {d.title && (
        <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-[var(--paper-text)]"><TexText text={d.title} /></p>
      )}
      {d.sub && <p className="mt-0.5 truncate text-[10px] text-[var(--paper-muted)]">{d.sub}</p>}

      {/* paper cards carry their entity rows — column-lineage style */}
      {d.type === "paper" && d.rows &&
        (["nuclides", "reactions", "authors"] as const).map((grp) => {
          const rg = (d.rows as CardRows)[grp];
          if (!rg?.total) return null;
          const shown = d.expanded[grp];
          const open = !!d.openGroups?.includes(grp);
          return (
            <div key={grp} className="mt-1.5 border-t border-[var(--paper-rule)] pt-1">
              <div className="flex w-full items-center justify-between text-[9px] uppercase tracking-wide text-[var(--paper-muted)]">
                <button
                  onClick={(e) => { e.stopPropagation(); d.onToggleGroup(keyOf(d), grp); }}
                  className="flex items-center gap-0.5 transition-colors hover:text-[var(--paper-text)]"
                  title={open ? `fold ${grp}` : `unfold ${grp}`}
                >
                  <ChevronRight className={`h-2.5 w-2.5 transition-transform ${open ? "rotate-90" : ""}`} />
                  <span>{grp}</span>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); d.onExpand(d, grp); }}
                  className="rounded px-1 transition-colors hover:bg-[var(--paper-quiet)] hover:text-[var(--paper-text)]"
                  title={shown ? `${shown.loaded} of ${rg.total} on canvas — click for more` : `pull ${grp} onto the canvas`}
                >
                  {d.expanding === grp ? <Loader2 className="inline h-2.5 w-2.5 animate-spin" /> : shown ? `${shown.loaded}/${rg.total}` : rg.total.toLocaleString()}
                </button>
              </div>
              {open && rg.items.map((it) => (
                <button
                  key={it.id}
                  onClick={(e) => { e.stopPropagation(); d.onRow(d, grp, it); }}
                  className="flex w-full items-center justify-between gap-1 rounded px-1 py-0.5 text-left text-[10px] text-[var(--paper-text)] transition-colors hover:bg-[var(--paper-quiet)]"
                  title={`add ${it.label} to the canvas`}
                >
                  {grp === "nuclides"
                    ? <span className="truncate font-mono" dangerouslySetInnerHTML={{ __html: supNuclide(it.label) }} />
                    : <span className="truncate font-mono">{it.label}</span>}
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--paper-quiet)]-foreground/40" />
                </button>
              ))}
            </div>
          );
        })}

      <div className="mt-1.5 flex flex-wrap gap-1">
        {(RELS[d.type] ?? [])
          .filter(({ rel }) => d.type !== "paper" || !d.rows || rel === "exfor")
          .map(({ rel, label }) => {
            const st = d.expanded[rel];
            const busy = d.expanding === rel;
            return (
              <button
                key={rel}
                onClick={(e) => { e.stopPropagation(); d.onExpand(d, rel); }}
                className="rounded border bg-[var(--paper-quiet)] px-1.5 py-0.5 text-[9px] text-[var(--paper-muted)] transition-colors hover:bg-[var(--paper-quiet)] hover:text-[var(--paper-text)]"
                title={st ? `${st.loaded} of ${st.total} shown — click for more` : `expand ${label}`}
              >
                {busy ? <Loader2 className="inline h-2.5 w-2.5 animate-spin" /> : st ? `${label} ${st.loaded}/${st.total}` : `+ ${label}`}
              </button>
            );
          })}
        {d.type === "paper" && (() => {
          const st = d.expanded.similar;
          const busy = d.expanding === "similar";
          return (
            <button
              onClick={(e) => { e.stopPropagation(); d.onSimilar(d); }}
              className="rounded border border-dashed bg-[var(--paper-quiet)] px-1.5 py-0.5 text-[9px] text-[var(--paper-muted)] transition-colors hover:bg-[var(--paper-quiet)] hover:text-[var(--paper-text)]"
              title="nearest papers in the bge-m3 embedding space — an inference, drawn dashed"
            >
              {busy ? <Loader2 className="inline h-2.5 w-2.5 animate-spin" /> : st ? `similar ${st.loaded}` : "≈ similar"}
            </button>
          );
        })()}
      </div>
    </div>
  );
}

const nodeTypes = { entity: EntityNode };

/* ── catalog rail: the workspace's asset inventory ────────────────────────── */

interface CatalogItem { id: string; label: string; title?: string; pub_year?: number; citation_count?: number; papers?: number; z?: number; n?: number }
interface Catalog {
  counts: Record<string, number>;
  top: Record<string, CatalogItem[]>;
}

const CATALOG_TYPES = [
  { key: "papers", label: "Papers", icon: FileText, type: "paper" as const },
  { key: "authors", label: "Authors", icon: Users, type: "author" as const },
  { key: "nuclides", label: "Nuclides", icon: Atom, type: "nuclide" as const },
  { key: "reactions", label: "Reactions", icon: FlaskConical, type: "reaction" as const },
  { key: "exfor", label: "EXFOR", icon: Database, type: "exfor" as const },
];
const CATALOG_LINKS = [
  { key: "ensdf", label: "ENSDF archive", icon: Layers, href: "/ensdf/archive" },
  { key: "xundl", label: "XUNDL", icon: Boxes, href: "/xundl" },
];
/** Saved canvases from Community. A saved state is a recipe iff it has prompt steps. */
interface ViewRow { id: number; name: string; saved_by: string; created_at: string; state?: { nodes?: { type: string }[] } }
const isRecipe = (v: ViewRow) => !!v.state?.nodes?.some((n) => n.type === "prompt");

const toGNode = (typeKey: string, it: CatalogItem): GNode => {
  const t = CATALOG_TYPES.find((c) => c.key === typeKey)!.type;
  return {
    type: t, id: it.id, label: it.label,
    title: t === "paper" ? it.title : undefined,
    sub: t === "paper"
      ? `${it.pub_year ?? ""}${it.citation_count ? ` · ${Number(it.citation_count).toLocaleString()} cites` : ""}`
      : t === "nuclide"
        ? `Z=${it.z} N=${it.n}`
        : t === "reaction" ? "reaction" : `${Number(it.papers ?? 0).toLocaleString()} papers`,
  };
};

interface LibFile { key: string; name: string; size: number; modified: string | null }

/** Hover ⋯ on a rail row — Claude-chat style: Center · Add · Ask in chat. */
function RowMenu({ g, onPick, onAdd, onAsk }: {
  g: GNode; onPick: (g: GNode) => void; onAdd: (g: GNode) => void; onAsk: (g: GNode) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as globalThis.Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  const item = "flex w-full items-center gap-2 px-2.5 py-1.5 text-xs text-[var(--paper-muted)] transition-colors hover:bg-[var(--paper-quiet)] hover:text-[var(--paper-text)]";
  return (
    <div ref={ref} className={`absolute right-1.5 top-1.5 ${open ? "" : "hidden group-hover/row:block"}`}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="rounded p-0.5 text-[var(--paper-muted)] hover:bg-[var(--paper-quiet)] hover:text-[var(--paper-text)]"
        title="more"
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-40 rounded-lg border border-[var(--paper-rule)] bg-[var(--paper)] py-1 shadow-lg animate-in fade-in slide-in-from-top-1 duration-150">
          <button className={item} onClick={(e) => { e.stopPropagation(); setOpen(false); onPick(g); }}><Crosshair className="h-3.5 w-3.5" /> Center on canvas</button>
          <button className={item} onClick={(e) => { e.stopPropagation(); setOpen(false); onAdd(g); }}><Plus className="h-3.5 w-3.5" /> Add to canvas</button>
          <button className={item} onClick={(e) => { e.stopPropagation(); setOpen(false); onAsk(g); }}><MessageSquare className="h-3.5 w-3.5" /> Ask in chat</button>
        </div>
      )}
    </div>
  );
}

function CatalogRail({ onPick, onAdd, onAsk, onAddFile, onLoadView, navigate }: {
  onPick: (g: GNode) => void;
  onAdd: (g: GNode) => void;
  onAsk: (g: GNode) => void;
  onAddFile: (f: LibFile) => void;
  onLoadView: (id: number) => void;
  navigate: (p: string) => void;
}) {
  const { data } = useQuery({
    queryKey: ["catalog"],
    queryFn: async (): Promise<Catalog> => {
      const r = await fetch("/data/catalog.json");
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    },
    staleTime: Infinity,
  });
  const [browse, setBrowse] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const files = useQuery({
    queryKey: ["workspace-files"],
    queryFn: async (): Promise<{ files: LibFile[] }> => {
      const r = await fetch("/api/upload?list=1");
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    },
    enabled: browse === "files",
    staleTime: 60_000,
  });
  const views = useQuery({
    queryKey: ["community-views"],
    queryFn: async (): Promise<{ views: ViewRow[] }> => {
      const r = await fetch("/api/community?tab=views");
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    },
    enabled: browse === "views" || browse === "recipes",
    staleTime: 60_000,
  });

  if (browse === "views" || browse === "recipes") {
    const wantRecipes = browse === "recipes";
    const items = (views.data?.views ?? [])
      .filter((v) => isRecipe(v) === wantRecipes)
      .filter((v) => !filter.trim() || `${v.name} ${v.saved_by}`.toLowerCase().includes(filter.trim().toLowerCase()));
    return (
      <div className="hidden w-[284px] shrink-0 flex-col border-r bg-[var(--paper)] lg:flex">
        <div className="flex items-center gap-2 border-b p-3">
          <button onClick={() => { setBrowse(null); setFilter(""); }} className="text-[var(--paper-muted)] hover:text-[var(--paper-text)]" title="back">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold text-[var(--paper-text)]">{wantRecipes ? "Recipes" : "Views"}</span>
          <span className="ml-auto font-mono text-xs text-[var(--paper-muted)]">{views.data ? items.length : ""}</span>
        </div>
        <div className="border-b p-2">
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={wantRecipes ? "Filter recipes…" : "Filter views…"} className="h-8 text-xs" />
          <p className="mt-1 text-[10px] text-[var(--paper-muted)]">
            {wantRecipes ? "Saved canvases with prompt steps — click to load, then Run." : "Saved canvases, exactly as arranged. Click to load onto this one."}
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {views.isLoading && <p className="p-3 text-xs text-[var(--paper-muted)]">Loading…</p>}
          {views.data && items.length === 0 && (
            <p className="p-3 text-xs text-[var(--paper-muted)]">
              {wantRecipes ? "No recipes yet — add a Prompt step and hit Save." : "No saved views yet — arrange a canvas and hit Save."}
            </p>
          )}
          {items.map((v) => (
            <button
              key={v.id}
              onClick={() => onLoadView(v.id)}
              className="flex w-full flex-col gap-0.5 border-b border-[var(--paper-rule-soft)] px-3 py-2 text-left transition-colors hover:bg-[var(--paper-quiet)]"
              title="load onto the canvas"
            >
              <span className="flex w-full items-baseline justify-between gap-2">
                <span className="truncate text-xs font-semibold text-[var(--paper-text)]">{v.name}</span>
                <span className="shrink-0 font-mono text-[10px] text-[var(--paper-muted)]">{v.state?.nodes?.length ?? 0} nodes</span>
              </span>
              <span className="text-[10px] text-[var(--paper-muted)]">{v.saved_by} · {String(v.created_at).slice(0, 10)}</span>
            </button>
          ))}
        </div>
        <button onClick={() => navigate("/community")} className="border-t px-3 py-2 text-left text-[10px] text-[var(--paper-muted)] hover:text-[var(--paper-text)]">
          Open Community ↗
        </button>
      </div>
    );
  }

  if (browse === "files") {
    const items = (files.data?.files ?? []).filter(
      (f) => !filter.trim() || f.name.toLowerCase().includes(filter.trim().toLowerCase()),
    );
    return (
      <div className="hidden w-[284px] shrink-0 flex-col border-r bg-[var(--paper)] lg:flex">
        <div className="flex items-center gap-2 border-b p-3">
          <button onClick={() => { setBrowse(null); setFilter(""); }} className="text-[var(--paper-muted)] hover:text-[var(--paper-text)]" title="back">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold text-[var(--paper-text)]">Library</span>
          <span className="ml-auto font-mono text-xs text-[var(--paper-muted)]">
            {files.data ? files.data.files.length : ""}
          </span>
        </div>
        <div className="border-b p-2">
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter files…" className="h-8 text-xs" />
          <p className="mt-1 text-[10px] text-[var(--paper-muted)]">Everything ever dropped on a canvas. Click to add to this one.</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {files.isLoading && <p className="p-3 text-xs text-[var(--paper-muted)]">Loading…</p>}
          {files.data && items.length === 0 && (
            <p className="p-3 text-xs text-[var(--paper-muted)]">Nothing here yet — drop a file anywhere on the canvas.</p>
          )}
          {items.map((f) => (
            <button
              key={f.key}
              onClick={() => onAddFile(f)}
              className="flex w-full items-center gap-2 border-b border-[var(--paper-rule-soft)] px-3 py-2 text-left transition-colors hover:bg-[var(--paper-quiet)]"
              title="add to the canvas"
            >
              <FileText className="h-3.5 w-3.5 shrink-0 text-[var(--paper-muted)]" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono text-xs text-[var(--paper-text)]">{f.name}</span>
                <span className="block text-[10px] text-[var(--paper-muted)]">
                  {(f.size / 1024).toFixed(0)} kB{f.modified ? ` · ${f.modified.slice(0, 10)}` : ""}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (browse) {
    const meta = CATALOG_TYPES.find((c) => c.key === browse)!;
    const items = (data?.top[browse] ?? []).filter(
      (it) => !filter.trim() || `${it.label} ${it.title ?? ""}`.toLowerCase().includes(filter.trim().toLowerCase()),
    );
    return (
      <div className="hidden w-[284px] shrink-0 flex-col border-r bg-[var(--paper)] lg:flex">
        <div className="flex items-center gap-2 border-b p-3">
          <button onClick={() => { setBrowse(null); setFilter(""); }} className="text-[var(--paper-muted)] hover:text-[var(--paper-text)]" title="back">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold text-[var(--paper-text)]">{meta.label}</span>
          <span className="ml-auto font-mono text-xs text-[var(--paper-muted)]">
            {data ? data.counts[browse]?.toLocaleString() : ""}
          </span>
        </div>
        <div className="border-b p-2">
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter the top 50…" className="h-8 text-xs" />
          <p className="mt-1 text-[10px] text-[var(--paper-muted)]">Most-studied first — the search bar covers the full corpus.</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {items.map((it) => {
            const g = toGNode(browse, it);
            return (
              <div key={it.id} className="group/row relative border-b border-[var(--paper-rule-soft)]">
                <button
                  onClick={() => onPick(g)}
                  draggable
                  onDragStart={(e) => setDragEntity(e.dataTransfer, g)}
                  className="flex w-full flex-col gap-0.5 px-3 py-2 pr-7 text-left transition-colors hover:bg-[var(--paper-quiet)]"
                  title="center on the canvas · drag onto the canvas or into the chat"
                >
                  <span className="flex w-full items-baseline justify-between gap-2">
                    <span className="truncate font-mono text-xs font-semibold text-[var(--paper-text)]">
                      {browse === "nuclides"
                        ? <span dangerouslySetInnerHTML={{ __html: supNuclide(it.label) }} />
                        : it.label}
                    </span>
                    {it.papers != null && (
                      <span className="shrink-0 font-mono text-[10px] text-[var(--paper-muted)] group-hover/row:invisible">{Number(it.papers).toLocaleString()}</span>
                    )}
                  </span>
                  {it.title && <span className="line-clamp-2 text-[10px] leading-snug text-[var(--paper-muted)]">{it.title}</span>}
                </button>
                <RowMenu g={g} onPick={onPick} onAdd={onAdd} onAsk={onAsk} />
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="hidden w-[284px] shrink-0 flex-col border-r bg-[var(--paper)] lg:flex">
      <p className="px-3 pb-1 pt-3 text-[10px] uppercase tracking-wide text-[var(--paper-muted)]">Corpus</p>
      {CATALOG_TYPES.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          onClick={() => setBrowse(key)}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-[var(--paper-text)] transition-colors hover:bg-[var(--paper-quiet)]"
        >
          <Icon className="h-3.5 w-3.5 text-[var(--paper-muted)]" />
          <span>{label}</span>
          <span className="ml-auto font-mono text-xs text-[var(--paper-muted)]">
            {data ? data.counts[key]?.toLocaleString() : "…"}
          </span>
        </button>
      ))}
      <p className="px-3 pb-1 pt-4 text-[10px] uppercase tracking-wide text-[var(--paper-muted)]">Workspace</p>
      <button
        onClick={() => setBrowse("files")}
        className="flex items-center gap-2 px-3 py-1.5 text-sm text-[var(--paper-text)] transition-colors hover:bg-[var(--paper-quiet)]"
      >
        <FileText className="h-3.5 w-3.5 text-[var(--paper-muted)]" />
        <span>Library</span>
      </button>
      {([["views", "Views", Layers], ["recipes", "Recipes", BookOpen]] as const).map(([key, label, Icon]) => (
        <button
          key={key}
          onClick={() => setBrowse(key)}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-[var(--paper-text)] transition-colors hover:bg-[var(--paper-quiet)]"
        >
          <Icon className="h-3.5 w-3.5 text-[var(--paper-muted)]" />
          <span>{label}</span>
          {views.data && (
            <span className="ml-auto font-mono text-xs text-[var(--paper-muted)]">
              {views.data.views.filter((v) => isRecipe(v) === (key === "recipes")).length}
            </span>
          )}
        </button>
      ))}
      <p className="px-3 pb-1 pt-4 text-[10px] uppercase tracking-wide text-[var(--paper-muted)]">Datasets</p>
      {CATALOG_LINKS.map(({ key, label, icon: Icon, href }) => (
        <button
          key={key}
          onClick={() => navigate(href)}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-[var(--paper-text)] transition-colors hover:bg-[var(--paper-quiet)]"
        >
          <Icon className="h-3.5 w-3.5 text-[var(--paper-muted)]" />
          <span>{label}</span>
          <span className="ml-auto font-mono text-xs text-[var(--paper-muted)]">
            {data ? data.counts[key]?.toLocaleString() : "…"}
          </span>
        </button>
      ))}
    </div>
  );
}

/** Preloaded combo-box suggestions — the most-studied entities in the corpus,
 *  baked in so the dropdown opens instantly on focus, before any network. */
const STARTER: (GNode & { code?: string })[] = [
  { type: "nuclide", id: "12C", label: "12C", sub: "Z=6 N=6 · 24,646 papers" },
  { type: "nuclide", id: "208PB", label: "208Pb", sub: "Z=82 N=126 · 18,920 papers" },
  { type: "nuclide", id: "1H", label: "1H", sub: "Z=1 N=0 · 17,181 papers" },
  { type: "nuclide", id: "16O", label: "16O", sub: "Z=8 N=8 · 14,285 papers" },
  { type: "nuclide", id: "40CA", label: "40Ca", sub: "Z=20 N=20 · 13,025 papers" },
  { type: "reaction", id: "(N,G)", label: "(N,G)", sub: "7,723 papers" },
  { type: "reaction", id: "(P,P)", label: "(P,P)", sub: "5,861 papers" },
  { type: "reaction", id: "(N,F)", label: "(N,F)", sub: "5,547 papers" },
  { type: "author", id: "33137", label: "R.V.JANSSENS", sub: "1,198 papers" },
  { type: "author", id: "10834", label: "M.P.CARPENTER", sub: "1,020 papers" },
  { type: "author", id: "9239", label: "B.A.BROWN", sub: "942 papers" },
  { type: "paper", id: "2011CH57", label: "2011CH57", title: "ENDF/B-VII.1 Nuclear Data for Science and Technology: Cross Sections, Covariances, Fission Product Yields and Decay Data", sub: "2011 · 2,767 cites" },
  { type: "paper", id: "1971JA07", label: "1971JA07", title: "Precision Measurement of Half-Lives and Specific Activities of $^{235}$U and $^{238}$U", sub: "1971 · 2,648 cites" },
  { type: "paper", id: "2005AD25", label: "2005AD25", title: "Formation of dense partonic matter in relativistic nucleus-nucleus collisions at RHIC", sub: "2005 · 2,622 cites" },
];

/** Seed canvases for the props panel — each one centers a real entity. */
const DATASETS: { id: string; label: string; seed: GNode | null }[] = [
  { id: "137CS", label: "137Cs nuclide", seed: { type: "nuclide", id: "137CS", label: "137Cs", sub: "Z=55 N=82" } },
  { id: "235U", label: "235U nuclide", seed: { type: "nuclide", id: "235U", label: "235U", sub: "Z=92 N=143" } },
  { id: "(N,G)", label: "(N,G) reaction", seed: { type: "reaction", id: "(N,G)", label: "(N,G)", sub: "reaction" } },
  { id: "2011CH57", label: "2011CH57 paper", seed: STARTER.find((s) => s.id === "2011CH57") ?? null },
  { id: "empty", label: "Empty canvas", seed: null },
];

/* ── page ─────────────────────────────────────────────────────────────────── */

function GraphPageInner() {
  const router = useRouter();
  const navigate = (to: string) => router.push(to);
  const params = useSearchParams();
  const { screenToFlowPosition, fitView } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges] = useEdgesState<Edge>([]);
  const store = useRef(new Map<string, GNode>());
  const expandState = useRef(new Map<string, { loaded: number; total: number }>());
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [expanding, setExpanding] = useState<string | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<(GNode & { code?: string })[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const catalog = useQuery({
    queryKey: ["catalog"],
    queryFn: async (): Promise<Catalog> => {
      const r = await fetch("/data/catalog.json");
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    },
    staleTime: Infinity,
  });
  // the "Most studied" list: the baked-in starters, then the catalog's top
  // lists — paged in as the dropdown scrolls, never rendered all at once
  const mostStudied = useMemo(() => {
    const out: (GNode & { code?: string })[] = [...STARTER];
    const seen = new Set(out.map(keyOf));
    if (catalog.data) {
      for (const key of ["nuclides", "reactions", "authors", "papers", "exfor"]) {
        for (const it of catalog.data.top[key] ?? []) {
          const g = toGNode(key, it);
          if (!seen.has(keyOf(g))) { seen.add(keyOf(g)); out.push(g); }
        }
      }
    }
    return out;
  }, [catalog.data]);
  const [visibleStarter, setVisibleStarter] = useState(15);
  const suggestions = q.trim().length >= 2 ? results : mostStudied.slice(0, visibleStarter);
  const [saveOpen, setSaveOpen] = useState(false);
  const [edgeInfo, setEdgeInfo] = useState<{ source: GNode; target: GNode; meta?: EdgeMeta } | null>(null);
  const [viewName, setViewName] = useState("");
  const [savedBy, setSavedBy] = useState(() => localStorage.getItem("display-name") ?? "");

  /* ── <ReactFlow /> props panel: every row is a live prop ────────────────── */
  const [flowProps, setFlowProps] = useState<FlowProps>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("graph-flow-props") ?? "null");
      return saved && typeof saved === "object" ? { ...DEFAULT_FLOW_PROPS, ...saved } : DEFAULT_FLOW_PROPS;
    } catch { return DEFAULT_FLOW_PROPS; }
  });
  useEffect(() => {
    try { localStorage.setItem("graph-flow-props", JSON.stringify(flowProps)); } catch { /* quota */ }
  }, [flowProps]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(() => {
    const m = localStorage.getItem("graph-layout-mode") as LayoutMode | null;
    return m && LAYOUT_MODES.includes(m) ? m : "dagre-lr";
  });
  // syncNodes reads the mode through a ref so a mode change doesn't churn every
  // callback that depends on it
  const layoutModeRef = useRef<LayoutMode>(layoutMode);
  layoutModeRef.current = layoutMode;
  const [dataset, setDataset] = useState("137CS");
  const [dockOpen, setDockOpen] = useState(false);
  const [attached, setAttached] = useState<DragEntity | null>(null);

  /* ── undo / redo: content snapshots, never pan/zoom or selection ─────────── */
  // Ported from 44b's canvas-state reducer shape: every content mutation
  // snapshots first; ⌘Z/⌘⇧Z/⌘Y walk the stacks. Snapshots within 150 ms
  // coalesce (an expand adds nodes then its "+N more" marker — one undo step).
  interface Snap { store: [string, GNode][]; expand: [string, { loaded: number; total: number }][]; edges: Edge[]; pos: [string, { x: number; y: number }][]; at: number }
  const nodesRef = useRef<Node[]>(nodes); nodesRef.current = nodes;
  const edgesRef = useRef<Edge[]>(edges); edgesRef.current = edges;
  const past = useRef<Snap[]>([]);
  const future = useRef<Snap[]>([]);
  const takeSnap = useCallback((): Snap => ({
    store: [...store.current.entries()],
    expand: [...expandState.current.entries()],
    edges: edgesRef.current,
    pos: nodesRef.current.map((n) => [n.id, n.position]),
    at: Date.now(),
  }), []);
  const snapshot = useCallback(() => {
    const last = past.current[past.current.length - 1];
    if (last && Date.now() - last.at < 150) return;
    past.current = [...past.current.slice(-49), takeSnap()];
    future.current = [];
  }, [takeSnap]);
  const restore = useCallback((snap: Snap) => {
    store.current = new Map(snap.store);
    expandState.current = new Map(snap.expand);
    const pos = new Map(snap.pos);
    setSelectedKey(null);
    setEdgeInfo(null);
    setEdges(snap.edges);
    setNodes([...store.current.values()].map((g) => ({
      id: keyOf(g), type: "entity", position: pos.get(keyOf(g)) ?? { x: 0, y: 0 }, data: { ...g },
    })));
  }, [setEdges, setNodes]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const k = e.key.toLowerCase();
      if (k !== "z" && k !== "y") return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      const redo = k === "y" || (k === "z" && e.shiftKey);
      const from = redo ? future.current : past.current;
      if (!from.length) return;
      e.preventDefault();
      const snap = from[from.length - 1];
      const now = takeSnap();
      if (redo) { future.current = from.slice(0, -1); past.current = [...past.current.slice(-49), now]; }
      else { past.current = from.slice(0, -1); future.current = [...future.current.slice(-49), now]; }
      restore(snap);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [restore, takeSnap]);

  const syncNodes = useCallback((allEdges: Edge[], relayout: boolean) => {
    setNodes((prevNodes) => {
      const prevPos = new Map(prevNodes.map((n) => [n.id, n.position]));
      const mode = layoutModeRef.current;
      // "none": nothing moves — new nodes land beside their edge-source, stacked
      const fresh = new Map<string, number>();
      let next: Node[] = [...store.current.values()].map((g) => {
        const k = keyOf(g);
        let position = prevPos.get(k);
        if (!position && mode === "none") {
          const e = allEdges.find((x) => x.target === k) ?? allEdges.find((x) => x.source === k);
          const anchor = e ? e.source === k ? e.target : e.source : null;
          const src = anchor ? prevPos.get(anchor) : undefined;
          if (src && anchor) {
            const i = fresh.get(anchor) ?? 0;
            fresh.set(anchor, i + 1);
            const w = NODE_W[store.current.get(anchor)?.type ?? "paper"] ?? 160;
            position = { x: src.x + w + 70, y: src.y + i * 90 };
          }
        }
        return { id: k, type: "entity", position: position ?? { x: 0, y: 0 }, data: { ...g } };
      });
      if (relayout && mode !== "none") next = layout(next, allEdges, mode === "dagre-tb" ? "TB" : "LR");
      return next;
    });
  }, [setNodes]);

  const changeLayoutMode = useCallback((m: string) => {
    if (!LAYOUT_MODES.includes(m as LayoutMode)) return;
    setLayoutMode(m as LayoutMode);
    layoutModeRef.current = m as LayoutMode;
    localStorage.setItem("graph-layout-mode", m);
    setEdges((prev) => { syncNodes(prev, true); return prev; });
    setTimeout(() => fitView({ padding: 0.15, duration: 400 }), 60);
  }, [setEdges, syncNodes, fitView]);

  const addNodes = useCallback((items: GNode[], from?: string, relayout = true, kind?: EdgeMeta["kind"], at?: { x: number; y: number }) => {
    snapshot();
    for (const it of items) store.current.set(keyOf(it), it);
    // an explicit drop point wins over layout: seed the position first so
    // syncNodes sees it as "already placed"
    if (at) setNodes((prev) => [
      ...prev.filter((n) => !items.some((it) => keyOf(it) === n.id)),
      ...items.map((it, i) => ({ id: keyOf(it), type: "entity", position: { x: at.x, y: at.y + i * 90 }, data: { ...it } })),
    ]);
    setEdges((prev) => {
      const have = new Set(prev.map((e) => e.id));
      const added: Edge[] = from
        ? items
            .filter((it) => !have.has(`${from}->${keyOf(it)}`) && !have.has(`${keyOf(it)}->${from}`))
            .map((it) => kind === "similar"
              ? { id: `${from}->${keyOf(it)}`, source: from, target: keyOf(it), data: { kind, cos: it.cos } as EdgeMeta, label: it.cos != null ? `${it.cos.toFixed(2)} cos` : undefined }
              : { id: `${from}->${keyOf(it)}`, source: from, target: keyOf(it) })
        : [];
      const all = [...prev, ...added];
      syncNodes(all, relayout);
      // the relayout can push new nodes off-viewport — follow them
      if (relayout) setTimeout(() => fitView({ padding: 0.15, duration: 400 }), 60);
      return all;
    });
  }, [setEdges, setNodes, syncNodes, fitView, snapshot]);

  const patchNode = useCallback((key: string, patch: Partial<GNode>) => {
    const g = store.current.get(key);
    if (!g) return;
    store.current.set(key, { ...g, ...patch });
    setNodes((prev) => prev.map((n) => (n.id === key ? { ...n, data: { ...n.data, ...patch } } : n)));
  }, [setNodes]);

  const toggleGroup = useCallback((key: string, group: string) => {
    const g = store.current.get(key);
    if (!g) return;
    const cur = g.openGroups ?? [];
    const openGroups = cur.includes(group) ? cur.filter((x) => x !== group) : [...cur, group];
    snapshot();
    patchNode(key, { openGroups });
    // the card's height changed — dagre must see the truth
    setEdges((prev) => { syncNodes(prev, true); return prev; });
  }, [patchNode, setEdges, syncNodes, snapshot]);

  const removeNode = useCallback((key: string) => {
    if (!store.current.has(key)) return;
    snapshot();
    store.current.delete(key);
    setEdges((prev) => {
      const all = prev.filter((e) => e.source !== key && e.target !== key);
      syncNodes(all, true);
      return all;
    });
  }, [setEdges, syncNodes, snapshot]);

  /** Fill paper cards with their entity rows — one batched round trip. */
  const fetchCards = useCallback(async (keys: string[]) => {
    const ids = keys
      .filter((k) => k.startsWith("paper:") && !store.current.get(k)?.rows)
      .map((k) => k.slice(6))
      .slice(0, 24);
    if (!ids.length) return;
    try {
      const res = await fetch(`/api/graph?op=cards&ids=${encodeURIComponent(ids.join(","))}`);
      const { cards } = await res.json();
      let touched = false;
      for (const [id, rows] of Object.entries(cards ?? {})) {
        const k = `paper:${id}`;
        const g = store.current.get(k);
        if (g) { store.current.set(k, { ...g, rows: rows as CardRows }); touched = true; }
      }
      // card heights changed — relayout so rows don't overlap neighbors
      if (touched) setEdges((prev) => { syncNodes(prev, true); return prev; });
    } catch { /* rows are an enhancement, never fatal */ }
  }, [syncNodes, setEdges]);

  const expand = useCallback(async (node: GNode, rel: string) => {
    const k = `${keyOf(node)}|${rel}`;
    const st = expandState.current.get(k);
    const offset = st?.loaded ?? 0;
    if (st && st.loaded >= st.total) { toast.info("All loaded"); return; }
    setExpanding(`${keyOf(node)}|${rel}`);
    try {
      const res = await fetch(`/api/graph?op=expand&type=${node.type}&id=${encodeURIComponent(node.id)}&rel=${rel}&offset=${offset}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? res.statusText);
      const loaded = offset + json.nodes.length;
      expandState.current.set(k, { loaded, total: json.total });
      addNodes(json.nodes, keyOf(node));
      // overflow honesty: a "+N more" supernode carries the true remainder
      const moreKey = `more:${keyOf(node)}|${rel}`;
      if (loaded < json.total) {
        addNodes([{
          type: "more", id: `${keyOf(node)}|${rel}`,
          label: `+${(json.total - loaded).toLocaleString()} more`,
          parentKey: keyOf(node), rel,
        }], keyOf(node));
      } else if (store.current.has(moreKey)) {
        removeNode(moreKey);
      }
      fetchCards((json.nodes as GNode[]).map(keyOf));
    } catch (e) {
      // On dev no session is signed in, so every expand fails with "Sign in."; the toast is noise there (Brendan, 2026-11-08). Production keeps it.
      if (process.env.NODE_ENV !== "development") toast.error(`Expand failed: ${(e as Error).message}`);
    } finally {
      setExpanding(null);
    }
  }, [addNodes, removeNode, fetchCards]);

  /** Nearest neighbors in embedding space — INFERENCE edges, drawn dashed. */
  const similar = useCallback(async (node: GNode) => {
    const k = `${keyOf(node)}|similar`;
    if (expandState.current.has(k)) { toast.info("Similar papers already on the canvas"); return; }
    setExpanding(k);
    try {
      const res = await fetch(`/api/graph?op=similar&id=${encodeURIComponent(node.id)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? res.statusText);
      const items = json.nodes as GNode[];
      if (!items.length) { toast.info(json.reason ? `${node.id}: ${json.reason}` : "No neighbors found"); return; }
      expandState.current.set(k, { loaded: items.length, total: items.length });
      addNodes(items, keyOf(node), true, "similar");
      fetchCards(items.map(keyOf));
    } catch (e) {
      toast.error(`Similar failed: ${(e as Error).message}`);
    } finally {
      setExpanding(null);
    }
  }, [addNodes, fetchCards]);

  /* ── prompt chain execution, traced ─────────────────────────────────────── */

  const [runs, setRuns] = useState<RunTrace[]>(() => {
    try { return JSON.parse(localStorage.getItem("graph-runs") ?? "[]"); } catch { return []; }
  });
  const [traceOpen, setTraceOpen] = useState<string | null>(null);
  const [traceStep, setTraceStep] = useState<number | null>(null);
  const activeRun = useRef<RunTrace | null>(null);

  useEffect(() => {
    try { localStorage.setItem("graph-runs", JSON.stringify(runs.slice(0, 20))); } catch { /* quota */ }
  }, [runs]);

  const mutateRun = useCallback((fn: (r: RunTrace) => void) => {
    const r = activeRun.current;
    if (!r) return;
    fn(r);
    setRuns((prev) => [{ ...r, steps: r.steps.map((s) => ({ ...s })) }, ...prev.filter((x) => x.id !== r.id)].slice(0, 20));
  }, []);

  const contextFor = useCallback(async (promptKey: string, outputs: Map<string, string>): Promise<string> => {
    const upstream = edges.filter((e) => e.target === promptKey).map((e) => e.source);
    const parts: string[] = [];
    for (const src of upstream) {
      const g = store.current.get(src);
      if (!g) continue;
      if (g.type === "prompt") {
        const out = outputs.get(src) ?? g.output;
        if (out) parts.push(`OUTPUT OF PREVIOUS STEP ("${(g.prompt ?? "").slice(0, 80)}"):\n${out.slice(0, 3000)}`);
      } else if (g.type === "file") {
        parts.push(`ATTACHED FILE ${g.label}${g.fileText ? `:\n${g.fileText.slice(0, 4000)}` : " (binary; reference by name)"}`);
      } else if (g.type === "paper") {
        try {
          const d = await fetch(`/api/graph?op=node&type=paper&id=${encodeURIComponent(g.id)}`).then((r) => r.json());
          const n = d.node ?? {};
          parts.push(`PAPER ${g.id}: "${n.title ?? g.title ?? ""}" (${n.pub_year ?? ""})${n.abstract ? `\nAbstract: ${String(n.abstract).slice(0, 800)}` : ""}`);
        } catch {
          parts.push(`PAPER ${g.id}: ${g.title ?? ""}`);
        }
      } else {
        parts.push(`${g.type.toUpperCase()} ${g.label}${g.sub ? ` (${g.sub})` : ""}`);
      }
    }
    return parts.length
      ? `You are executing one step of a saved research recipe on the NSRgpt workspace canvas. The user wired the following context into this step:\n\n${parts.join("\n\n")}`
      : "";
  }, [edges]);

  // TODO (2026-09-24, SOP REC-001 §7.2): a failed step must stop the run. Today the
  // catch below records the error and returns "", so the steps downstream still run
  // without this step's output. Rethrow (or return a failed marker the caller checks)
  // and mark every dependant in the trace as "skipped" instead of running it.
  const runPrompt = useCallback(async (promptKey: string, outputs = new Map<string, string>()): Promise<string> => {
    const g = store.current.get(promptKey);
    if (!g || g.type !== "prompt") return "";
    if (outputs.has(promptKey)) return outputs.get(promptKey)!;
    if (!g.prompt?.trim()) { toast.error("Empty prompt step"); return ""; }

    for (const e of edges.filter((e) => e.target === promptKey)) {
      const src = store.current.get(e.source);
      if (src?.type === "prompt" && !outputs.has(e.source)) {
        await runPrompt(e.source, outputs);
      }
    }

    setRunning(promptKey);
    const t0 = Date.now();
    mutateRun((r) => r.steps.push({
      key: promptKey, prompt: g.prompt ?? "", status: "running", startedAt: t0,
    }));
    const stamp = (patch: Partial<TraceStep>) =>
      mutateRun((r) => {
        const s = [...r.steps].reverse().find((s) => s.key === promptKey);
        if (s) Object.assign(s, patch, { ms: Date.now() - t0 });
      });
    try {
      const systemContext = await contextFor(promptKey, outputs);
      stamp({ input: systemContext.slice(0, 20_000) });
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: g.prompt }], systemContext: systemContext || undefined }),
      });
      if (!res.ok) throw new Error(`chat ${res.status}`);
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        patchNode(promptKey, { output: acc });
      }
      outputs.set(promptKey, acc);
      stamp({ status: "done", output: acc.slice(0, 20_000) });
      return acc;
    } catch (e) {
      stamp({ status: "error", error: (e as Error).message });
      toast.error(`Step failed: ${(e as Error).message}`);
      return "";
    } finally {
      setRunning(null);
    }
  }, [edges, contextFor, patchNode, mutateRun]);

  /** Every execution gets a trace — the run tree opens alongside the canvas. */
  const runTraced = useCallback(async (promptKeys: string[], label: string) => {
    if (activeRun.current) { toast.info("A run is already in progress"); return; }
    const run: RunTrace = { id: Math.random().toString(36).slice(2, 10), label, startedAt: Date.now(), steps: [] };
    activeRun.current = run;
    setRuns((prev) => [run, ...prev].slice(0, 20));
    setTraceOpen(run.id);
    setTraceStep(null);
    setSelectedKey(null);
    setEdgeInfo(null);
    try {
      const outputs = new Map<string, string>();
      for (const k of promptKeys) await runPrompt(k, outputs);
      mutateRun((r) => { r.finishedAt = Date.now(); });
    } finally {
      activeRun.current = null;
    }
  }, [runPrompt, mutateRun]);

  const runChain = useCallback(async () => {
    const prompts = [...store.current.values()].filter((g) => g.type === "prompt");
    if (prompts.length === 0) { toast.info("No prompt steps on the canvas"); return; }
    await runTraced(prompts.map(keyOf), `Recipe · ${prompts.length} step${prompts.length === 1 ? "" : "s"}`);
    toast.success("Recipe complete");
  }, [runTraced]);

  const addPromptNode = useCallback((at?: { x: number; y: number }) => {
    const id = Math.random().toString(36).slice(2, 8);
    const g: GNode = { type: "prompt", id, label: "Prompt step", prompt: "" };
    snapshot();
    store.current.set(keyOf(g), g);
    setNodes((prev) => [...prev, {
      id: keyOf(g), type: "entity",
      position: screenToFlowPosition(at ?? { x: window.innerWidth / 2, y: window.innerHeight / 3 }),
      data: { ...g },
    }]);
  }, [setNodes, screenToFlowPosition, snapshot]);

  /* ── file drop ──────────────────────────────────────────────────────────── */

  const onDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    // an entity dragged from the rail / search / a card lands where dropped —
    // no recenter, no relayout
    const ent = readDragEntity(e.dataTransfer);
    if (ent) {
      if (store.current.has(keyOf(ent))) { toast.info(`${ent.label} is already on the canvas`); return; }
      addNodes([ent as GNode], undefined, false, undefined, pos);
      if (ent.type === "paper") fetchCards([keyOf(ent)]);
      return;
    }
    const files = [...(e.dataTransfer?.files ?? [])];
    if (!files.length) return;
    snapshot();
    for (const [i, f] of files.entries()) {
      try {
        const pre = await fetch(`/api/upload?name=${encodeURIComponent(f.name)}&type=${encodeURIComponent(f.type || "application/octet-stream")}`).then((r) => r.json());
        if (!pre.url) throw new Error(pre.error ?? "presign failed");
        const put = await fetch(pre.url, { method: "PUT", headers: { "Content-Type": f.type || "application/octet-stream" }, body: f });
        if (!put.ok) throw new Error(`upload ${put.status}`);
        const texty = f.size < 300_000 && (f.type.startsWith("text/") || /\.(txt|csv|md|json|xml)$/i.test(f.name));
        const fileText = texty ? (await f.text()).slice(0, 4000) : undefined;
        const g: GNode = {
          type: "file", id: pre.key, label: f.name,
          sub: `${(f.size / 1024).toFixed(0)} KB · ${f.type || "file"}`,
          fileKey: pre.key, fileText,
        };
        store.current.set(keyOf(g), g);
        setNodes((prev) => [...prev, { id: keyOf(g), type: "entity", position: { x: pos.x, y: pos.y + i * 90 }, data: { ...g } }]);
        toast.success(`${f.name} on canvas${fileText ? " (text wired)" : ""}`);
      } catch (err) {
        toast.error(`${f.name}: ${(err as Error).message}`);
      }
    }
  }, [screenToFlowPosition, setNodes, addNodes, fetchCards, snapshot]);

  /* ── user connections: only INTO prompt steps ───────────────────────────── */

  const onConnect = useCallback((c: Connection) => {
    if (!c.target?.startsWith("prompt:")) {
      toast.error("Draw connections into prompt steps — data edges are records, not drawings");
      return;
    }
    snapshot();
    setEdges((prev) => addEdge({ ...c, id: `${c.source}->${c.target}` }, prev));
  }, [setEdges, snapshot]);

  /* ── center / detail / search / boot / save ─────────────────────────────── */

  const center = useCallback((g: GNode) => {
    snapshot();
    store.current = new Map([[keyOf(g), g]]);
    expandState.current = new Map();
    setEdges([]);
    setSelectedKey(keyOf(g));
    setNodes([{ id: keyOf(g), type: "entity", position: { x: 0, y: 0 }, data: { ...g } }]);
    setResults([]);
    setQ("");
    // a centered entity arrives WITH its neighborhood — the canvas is never
    // one lonely node sitting on 300k rows of relations
    if (g.type === "paper") fetchCards([keyOf(g)]);
    else if (RELS[g.type]?.length) setTimeout(() => expand(g, RELS[g.type]![0].rel), 0);
  }, [setEdges, setNodes, expand, fetchCards, snapshot]);

  const applyDataset = useCallback((id: string) => {
    const d = DATASETS.find((x) => x.id === id);
    if (!d) return;
    setDataset(id);
    if (d.seed) { center(d.seed); return; }
    snapshot();
    store.current = new Map();
    expandState.current = new Map();
    setEdges([]);
    setNodes([]);
    setSelectedKey(null);
    setEdgeInfo(null);
  }, [center, setEdges, setNodes, snapshot]);

  useEffect(() => {
    if (!selectedKey) { setDetail(null); return; }
    const g = store.current.get(selectedKey);
    if (!g || g.type === "prompt" || g.type === "file" || g.type === "more") { setDetail(null); return; }
    setDetail(null);
    fetch(`/api/graph?op=node&type=${g.type}&id=${encodeURIComponent(g.id)}`)
      .then((r) => r.json())
      .then(setDetail)
      .catch(() => setDetail({ error: true }));
  }, [selectedKey]);

  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await fetch(`/api/graph?op=search&q=${encodeURIComponent(q)}`);
        const json = await r.json();
        setResults((json.results ?? []).map((x: GNode & { code?: string }) => x.type === "nuclide" && x.code ? { ...x, id: x.code } : x));
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  /** A saved view or recipe replaces the canvas — nothing on /graph navigates away. */
  const loadView = useCallback((viewId: number | string) => {
    fetch(`/api/community?tab=view&id=${viewId}`)
      .then((r) => r.json())
      .then(({ view }) => {
        snapshot();
        const state = view.state as { nodes: (GNode & { x: number; y: number })[]; edges: { s: string; t: string; k?: string; cos?: number }[] };
        store.current = new Map(state.nodes.map((n) => [keyOf(n), n]));
        expandState.current = new Map();
        setSelectedKey(null);
        setEdgeInfo(null);
        setNodes(state.nodes.map((n) => ({ id: keyOf(n), type: "entity", position: { x: n.x, y: n.y }, data: { ...n } })));
        setEdges(state.edges.map((e) => e.k === "similar"
          ? { id: `${e.s}->${e.t}`, source: e.s, target: e.t, data: { kind: "similar", cos: e.cos } as EdgeMeta, label: e.cos != null ? `${e.cos.toFixed(2)} cos` : undefined }
          : { id: `${e.s}->${e.t}`, source: e.s, target: e.t }));
        toast.success(`Loaded: ${view.name}`);
        setTimeout(() => fitView({ padding: 0.15, duration: 400 }), 60);
      })
      .catch(() => toast.error("View not found"));
  }, [setNodes, setEdges, fitView, snapshot]);

  const booted = useRef(false);
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    const viewId = params.get("view");
    const c = params.get("center");
    if (viewId) {
      loadView(viewId);
    } else if (c?.includes(":")) {
      const [type, ...rest] = c.split(":");
      const id = rest.join(":");
      center({ type: type as GNode["type"], id, label: id });
    } else {
      center({ type: "nuclide", id: "137CS", label: "137Cs", sub: "Z=55 N=82" });
    }
    // the boot itself is not an undo step
    past.current = [];
  }, [params, center, loadView]);

  const saveView = async () => {
    if (!viewName.trim()) return;
    localStorage.setItem("display-name", savedBy);
    const state = {
      nodes: nodes.map((n) => {
        const g = n.data as unknown as GNode;
        return {
          type: g.type, id: g.id, label: g.label, sub: g.sub, title: g.title,
          prompt: g.prompt, output: g.output ? g.output.slice(0, 2000) : undefined,
          fileKey: g.fileKey, fileText: g.fileText,
          x: n.position.x, y: n.position.y,
        };
      }),
      edges: edges.map((e) => ({ s: e.source, t: e.target, ...(isSimilar(e) ? { k: "similar", cos: (e.data as EdgeMeta).cos } : {}) })),
    };
    const res = await fetch("/api/community", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "view", name: viewName, saved_by: savedBy || "anonymous", state }),
    });
    if (res.ok) {
      toast.success(state.nodes.some((n) => n.type === "prompt") ? "Recipe saved to Community" : "View saved to Community");
      setSaveOpen(false);
      setViewName("");
    } else toast.error("Save failed");
  };

  const connected = useMemo(() => {
    if (!selectedKey) return null;
    const set = new Set<string>([selectedKey]);
    for (const e of edges) {
      if (e.source === selectedKey) set.add(e.target);
      if (e.target === selectedKey) set.add(e.source);
    }
    return set;
  }, [selectedKey, edges]);

  const hasPrompts = nodes.some((n) => (n.data as unknown as GNode).type === "prompt");

  const rfNodes = useMemo(() =>
    nodes.map((n) => ({
      ...n,
      selected: n.id === selectedKey,
      data: {
        ...n.data,
        onExpand: expand,
        onRow: (from: GNode, group: keyof CardRows, item: { id: string; label: string }) => {
          const t = group === "nuclides" ? "nuclide" : group === "reactions" ? "reaction" : "author";
          addNodes([{ type: t as GNode["type"], id: item.id, label: item.label, sub: group === "reactions" ? "reaction" : undefined }], keyOf(from));
        },
        onMore: (parentKey: string, rel: string) => {
          const parent = store.current.get(parentKey);
          if (parent) expand(parent, rel);
        },
        onSimilar: similar,
        onToggleGroup: toggleGroup,
        onEditPrompt: (id: string, text: string) => patchNode(`prompt:${id}`, { prompt: text }),
        onRun: (key: string) => runTraced([key], "Single step"),
        running,
        expanding: expanding?.startsWith(n.id + "|") ? expanding.split("|")[1] : null,
        expanded: Object.fromEntries(
          [...expandState.current.entries()]
            .filter(([k]) => k.startsWith(n.id + "|"))
            .map(([k, v]) => [k.split("|")[1], v]),
        ),
        dimmed: connected ? !connected.has(n.id) : false,
      },
    })), [nodes, selectedKey, expand, addNodes, patchNode, similar, toggleGroup, runTraced, running, expanding, connected]);

  const rfEdges = useMemo(() =>
    edges.map((e) => {
      const hot = selectedKey && (e.source === selectedKey || e.target === selectedKey);
      const intoPrompt = e.target.startsWith("prompt:");
      const sim = isSimilar(e);
      return {
        ...e,
        animated: intoPrompt && running === e.target,
        // inference edges never look like record edges: dashed, muted, labeled
        style: {
          stroke: sim ? "var(--color-muted-foreground)" : hot || intoPrompt ? "var(--color-nuclear)" : "var(--color-muted-foreground)",
          strokeWidth: hot ? 2 : 1,
          strokeDasharray: sim ? "6 3" : undefined,
          opacity: connected && !hot ? 0.15 : intoPrompt ? 0.8 : sim ? 0.7 : 0.6,
        },
        labelStyle: sim ? { fontSize: 9, fill: "var(--color-muted-foreground)", fontFamily: "ui-monospace, monospace" } : undefined,
        labelBgStyle: sim ? { fill: "var(--color-background)", fillOpacity: 0.9 } : undefined,
        labelBgPadding: sim ? [3, 2] as [number, number] : undefined,
        labelBgBorderRadius: sim ? 3 : undefined,
      };
    }), [edges, selectedKey, connected, running]);

  const sel = selectedKey ? store.current.get(selectedKey) : null;

  /** What the chat dock knows: the canvas inventory and the selection. */
  const canvasContext = useCallback(() => {
    const ents = [...store.current.values()].filter((g) => !["prompt", "file", "more"].includes(g.type));
    if (!ents.length) return "";
    const list = ents.slice(0, 30)
      .map((g) => `${g.type} ${g.label}${g.type === "paper" && g.title ? ` — ${String(g.title).slice(0, 90)}` : ""}`)
      .join("\n");
    const selNote = selectedKey ? `\nThe user currently has ${selectedKey} selected.` : "";
    return `You are the chat dock of the NSRgpt workspace canvas. The canvas currently shows these entities:\n${list}${selNote}\nGround answers in these where relevant and cite NSR key numbers.`;
  }, [selectedKey]);

  /** Citation chips (chat dock, detail panels) center their entity on the canvas. */
  useEffect(() => {
    const h = (e: Event) => {
      const { type, id } = (e as CustomEvent).detail ?? {};
      if (type && id) center({ type, id: String(id), label: String(id) });
    };
    window.addEventListener("open-entity", h);
    return () => window.removeEventListener("open-entity", h);
  }, [center]);

  return (
    <div className="flex h-full min-h-0">
      {/* The docs panel's rail tab (components/docs/DocsNav.tsx), on the catalog rail (Brendan, 2026-11-08): the chevron tab on the
          panel's edge closes and opens it; the column slides to 0 and the tab rides its edge. Open or closed is <html data-rail-left>,
          the same memory as /docs. The rail's panels are 284px wide, as the docs panel; the clip box hides them as the column narrows. */}
      <div className="relative hidden h-full w-[284px] shrink-0 transition-[width] duration-[500ms] ease-in-out lg:block [[data-rail-left=closed]_&]:w-0">
        <RailToggle side="left" className="top-24 right-0 w-[22px] border border-l-0 border-[#033882] bg-[var(--paper-text)] text-[#033882] shadow-[0_2px_10px_rgba(3,56,130,0.22)] hover:w-[30.25px] hover:text-[#033882]" />
        <div className="flex h-full w-full overflow-hidden">
          <CatalogRail
            onPick={center}
            onAdd={(g) => { if (store.current.has(keyOf(g))) toast.info(`${g.label} is already on the canvas`); else { addNodes([g]); if (g.type === "paper") fetchCards([keyOf(g)]); } }}
            onAsk={(g) => { setAttached(g); setDockOpen(true); }}
            onLoadView={loadView}
            onAddFile={(f) => addNodes([{
              type: "file", id: f.key, label: f.name,
              sub: `${(f.size / 1024).toFixed(0)} kB`, fileKey: f.key,
            }], undefined)}
            navigate={navigate}
          />
        </div>
      </div>
      <div className="relative min-w-0 flex-1" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onConnect={onConnect}
          onNodeClick={(_, n) => { setSelectedKey(n.id); setEdgeInfo(null); }}
          onEdgeClick={(_, e) => {
            const s = store.current.get(e.source), t = store.current.get(e.target);
            if (s && t) { setEdgeInfo({ source: s, target: t, meta: e.data as EdgeMeta | undefined }); setSelectedKey(null); }
          }}
          onPaneClick={() => { setSelectedKey(null); setEdgeInfo(null); }}
          onPaneContextMenu={(e) => {
            e.preventDefault();
            const ev = e as unknown as MouseEvent;
            addPromptNode({ x: ev.clientX, y: ev.clientY });
          }}
          onNodesDelete={(del) => del.forEach((n) => removeNode(n.id))}
          fitView
          proOptions={{ hideAttribution: true }}
          colorMode={flowProps.colorMode}
          selectionMode={flowProps.selectionMode as SelectionMode}
          selectNodesOnDrag={flowProps.selectNodesOnDrag}
          elevateNodesOnSelect={flowProps.elevateNodesOnSelect}
          elevateEdgesOnSelect={flowProps.elevateEdgesOnSelect}
          paneClickDistance={flowProps.paneClickDistance}
          preventScrolling={flowProps.preventScrolling}
          selectionOnDrag={flowProps.selectionOnDrag}
          panOnDrag={flowProps.panOnDrag}
          panOnScroll={flowProps.panOnScroll}
          panOnScrollSpeed={flowProps.panOnScrollSpeed}
          panOnScrollMode={flowProps.panOnScrollMode as PanOnScrollMode}
          zoomOnScroll={flowProps.zoomOnScroll}
          zoomOnPinch={flowProps.zoomOnPinch}
          zoomOnDoubleClick={flowProps.zoomOnDoubleClick}
          nodesDraggable={flowProps.nodesDraggable}
          nodeDragThreshold={flowProps.nodeDragThreshold}
          nodesConnectable={flowProps.nodesConnectable}
          elementsSelectable={flowProps.elementsSelectable}
          autoPanOnConnect={flowProps.autoPanOnConnect}
          autoPanOnNodeDrag={flowProps.autoPanOnNodeDrag}
          autoPanSpeed={flowProps.autoPanSpeed}
          minZoom={flowProps.minZoom}
          maxZoom={flowProps.maxZoom}
          onlyRenderVisibleElements={flowProps.onlyRenderVisibleElements}
          snapToGrid={flowProps.snapToGrid}
          snapGrid={[flowProps.snapGridX || 1, flowProps.snapGridY || 1]}
          connectionMode={flowProps.connectionMode as ConnectionMode}
          connectionRadius={flowProps.connectionRadius}
          connectionLineType={flowProps.connectionLineType as ConnectionLineType}
          connectOnClick={flowProps.connectOnClick}
          nodesFocusable={flowProps.nodesFocusable}
          edgesFocusable={flowProps.edgesFocusable}
          deleteKeyCode={flowProps.deleteKeyCode || null}
          selectionKeyCode={flowProps.selectionKeyCode || null}
          multiSelectionKeyCode={flowProps.multiSelectionKeyCode || null}
          zoomActivationKeyCode={flowProps.zoomActivationKeyCode || null}
          panActivationKeyCode={flowProps.panActivationKeyCode || null}
        >
          <Panel position="top-left">
            <div className="relative">
              {/* Outer shell + 4px inset around the bordered inner bar — per the mock. */}
              <div className="rounded-full border bg-[var(--paper)] p-1 shadow-sm backdrop-blur-sm">
                <div className="flex h-8 w-96 items-center gap-2 overflow-hidden rounded-full border bg-[var(--paper)] px-3">
                  <Search className="h-4 w-4 shrink-0 text-[var(--paper-muted)]" />
                  <Input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => setTimeout(() => { setSearchFocused(false); setVisibleStarter(15); }, 150)}
                    placeholder="Center an author, paper, nuclide, reaction…"
                    className="h-full flex-1 border-0 bg-transparent p-0 text-[13px] shadow-none focus-visible:ring-0"
                  />
                  {searching && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--paper-muted)]" />}
                </div>
              </div>
              {searchFocused && (suggestions.length > 0 || searching) && (
                <div
                  onScroll={(e) => {
                    const el = e.currentTarget;
                    if (q.trim().length < 2 && el.scrollTop + el.clientHeight >= el.scrollHeight - 40) setVisibleStarter((v) => v + 15);
                  }}
                  className="absolute left-0 top-[48px] z-10 max-h-80 w-96 overflow-y-auto rounded-lg border border-[var(--paper-rule)] bg-[var(--paper)] shadow-md"
                >
                  {q.trim().length < 2 && (
                    <p className="px-2.5 pb-1 pt-2 text-[10px] uppercase tracking-wide text-[var(--paper-muted)]">
                      Most studied
                    </p>
                  )}
                  {searching && suggestions.length === 0 && (
                    <p className="px-2.5 py-2 text-xs text-[var(--paper-muted)]">Searching…</p>
                  )}
                  {suggestions.map((r) => (
                    <button
                      key={keyOf(r)}
                      onClick={() => center(r)}
                      draggable
                      onDragStart={(e) => setDragEntity(e.dataTransfer, r)}
                      className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-[var(--paper-quiet)]"
                    >
                      <Badge variant="outline" className="w-16 shrink-0 justify-center text-[9px]">{r.type}</Badge>
                      <span className="truncate font-medium text-[var(--paper-text)]">
                        {r.title ? <TexText text={String(r.title)} /> : r.label}
                      </span>
                      <span className="ml-auto shrink-0 text-[10px] text-[var(--paper-muted)]">{r.sub}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Panel>
          <Panel position="top-right">
            <div className="flex items-center gap-1.5 rounded-full border bg-[var(--paper)] p-1 shadow-sm backdrop-blur-sm">
              <Button variant="outline" className="h-8 rounded-full px-3.5 text-[13px]" onClick={() => addPromptNode()}>
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Prompt
              </Button>
              <Button variant="outline" className="h-8 rounded-full px-3.5 text-[13px]" onClick={runChain} disabled={!hasPrompts || !!running}>
                {running ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1.5 h-3.5 w-3.5" />} Run
              </Button>
              <Button variant="outline" className="h-8 rounded-full px-3.5 text-[13px]" onClick={() => setSaveOpen(true)}>
                <Save className="mr-1.5 h-3.5 w-3.5" /> Save
              </Button>
              {runs.length > 0 && (
                <Button
                  variant="outline"
                  className="h-8 w-8 rounded-full p-0"
                  title="Run history"
                  onClick={() => { setTraceOpen(runs[0].id); setTraceStep(null); setSelectedKey(null); setEdgeInfo(null); }}
                >
                  <History className="h-4 w-4" />
                </Button>
              )}
              <Button
                variant="outline"
                className={`h-8 w-8 rounded-full p-0 ${settingsOpen ? "bg-[var(--paper-quiet)]" : ""}`}
                title="Canvas settings — <ReactFlow /> props"
                onClick={() => setSettingsOpen((v) => !v)}
              >
                <Settings2 className="h-4 w-4" />
              </Button>
            </div>
          </Panel>
          <Background gap={24} size={1} />
          <Controls showInteractive={false} />
        </ReactFlow>
        <ChatDock context={canvasContext} open={dockOpen} onOpenChange={setDockOpen} attached={attached} onAttach={setAttached} />
        <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
          <DialogPopup className="max-w-md nysgpt-app border border-[var(--paper-rule)] bg-[var(--paper)] text-[var(--paper-text)]">
            <DialogHeader>
              <DialogTitle>Save to Community</DialogTitle>
              <DialogDescription>
                {hasPrompts
                  ? "This canvas contains prompt steps — it will be saved as a runnable recipe."
                  : "The current canvas, exactly as arranged, shared with everyone."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 p-5">
              <Input value={viewName} onChange={(e) => setViewName(e.target.value)} placeholder="View / recipe name" autoFocus />
              <Input value={savedBy} onChange={(e) => setSavedBy(e.target.value)} placeholder="Your name (optional)" />
              <Button className="w-full" onClick={saveView} disabled={!viewName.trim()}>Save</Button>
            </div>
          </DialogPopup>
        </Dialog>
      </div>

      {settingsOpen && (
        <FlowSettingsPanel
          value={flowProps}
          onChange={setFlowProps}
          dataset={dataset}
          onDataset={applyDataset}
          datasets={DATASETS.map(({ id, label }) => ({ id, label }))}
          layoutMode={layoutMode}
          onLayoutMode={changeLayoutMode}
          onClose={() => setSettingsOpen(false)}
          onReset={() => setFlowProps(DEFAULT_FLOW_PROPS)}
        />
      )}
      {!settingsOpen && traceOpen && !sel && !edgeInfo && (() => {
        const run = runs.find((r) => r.id === traceOpen);
        if (!run) return null;
        const dur = (run.finishedAt ?? Date.now()) - run.startedAt;
        const step = traceStep != null ? run.steps[traceStep] : null;
        return (
          <div className="hidden w-96 shrink-0 overflow-y-auto border-l bg-[var(--paper)] p-4 md:block">
            <div className="mb-2 flex items-center justify-between gap-2">
              <Badge variant="secondary" className="text-[10px]">run</Badge>
              {runs.length > 1 && (
                <select
                  value={traceOpen}
                  onChange={(e) => { setTraceOpen(e.target.value); setTraceStep(null); }}
                  className="h-6 min-w-0 flex-1 rounded border bg-[var(--paper)] px-1 text-[10px] text-[var(--paper-muted)]"
                >
                  {runs.map((r) => (
                    <option key={r.id} value={r.id}>
                      {new Date(r.startedAt).toLocaleTimeString()} — {r.label}
                    </option>
                  ))}
                </select>
              )}
              <button onClick={() => setTraceOpen(null)} className="text-[var(--paper-muted)] hover:text-[var(--paper-text)]"><X className="h-4 w-4" /></button>
            </div>
            <h2 className="text-sm font-semibold text-[var(--paper-text)]">{run.label}</h2>
            <p className="mt-0.5 text-[10px] text-[var(--paper-muted)]">
              {new Date(run.startedAt).toLocaleString()} · {run.finishedAt ? `${(dur / 1000).toFixed(1)}s total` : "running…"}
            </p>
            <div className="mt-3 space-y-0.5">
              {run.steps.map((s, i) => (
                <button
                  key={`${s.key}-${i}`}
                  onClick={() => setTraceStep(traceStep === i ? null : i)}
                  className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-[var(--paper-quiet)] ${traceStep === i ? "bg-[var(--paper-quiet)]" : ""}`}
                >
                  {s.status === "running"
                    ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[var(--paper-muted)]" />
                    : s.status === "done"
                      ? <Check className="h-3.5 w-3.5 shrink-0 text-nuclear" />
                      : <X className="h-3.5 w-3.5 shrink-0 text-red-500" />}
                  <span className="truncate text-[var(--paper-text)]">{s.prompt || "(empty prompt)"}</span>
                  {s.ms != null && (
                    <span className="ml-auto shrink-0 font-mono text-[10px] text-[var(--paper-muted)]">{(s.ms / 1000).toFixed(1)}s</span>
                  )}
                </button>
              ))}
              {run.steps.length === 0 && <p className="px-2 text-xs text-[var(--paper-muted)]">No steps recorded.</p>}
            </div>
            {step && (
              <div className="mt-3 space-y-3 border-t pt-3">
                {step.error && <p className="text-xs text-red-500">{step.error}</p>}
                <div>
                  <p className="mb-1 text-[10px] uppercase tracking-wide text-[var(--paper-muted)]">Input · assembled context</p>
                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md border bg-[var(--paper-quiet)] p-2 text-[10px] leading-snug text-[var(--paper-muted)]">
                    {step.input || "(no wired context — the prompt ran bare)"}
                  </pre>
                </div>
                <div>
                  <p className="mb-1 text-[10px] uppercase tracking-wide text-[var(--paper-muted)]">Output · {(step.output?.length ?? 0).toLocaleString()} chars</p>
                  <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md border bg-[var(--paper-quiet)] p-2 text-[10px] leading-snug text-[var(--paper-text)]">
                    {step.output || "(no output)"}
                  </pre>
                </div>
              </div>
            )}
          </div>
        );
      })()}
      {!settingsOpen && !sel && edgeInfo && (
        <div className="hidden w-80 shrink-0 overflow-y-auto border-l bg-[var(--paper)] p-4 md:block">
          <div className="mb-2 flex items-start justify-between">
            <Badge variant={edgeInfo.meta?.kind === "similar" ? "outline" : "secondary"} className="text-[10px]">
              {edgeInfo.meta?.kind === "similar" ? "inference" : "edge"}
            </Badge>
            <button onClick={() => setEdgeInfo(null)} className="text-[var(--paper-muted)] hover:text-[var(--paper-text)]"><X className="h-4 w-4" /></button>
          </div>
          <h2 className="text-sm font-semibold text-[var(--paper-text)]">Edge information</h2>
          <div className="mt-3 space-y-2">
            {([["Source", edgeInfo.source], ["Target", edgeInfo.target]] as const).map(([role, g]) => (
              <div key={role} className="flex items-center justify-between gap-2 text-xs">
                <span className="text-[var(--paper-muted)]">{role}</span>
                <button
                  onClick={() => setSelectedKey(keyOf(g))}
                  className="truncate font-mono font-medium text-nuclear hover:underline"
                  title={`open ${g.label}`}
                >
                  {g.label}
                </button>
              </div>
            ))}
          </div>
          {(() => {
            const r = edgeReceipt(edgeInfo.source, edgeInfo.target, edgeInfo.meta);
            return (
              <div className="mt-4">
                {"table" in r && (
                  <p className="mb-1.5 font-mono text-[10px] text-[var(--paper-muted)]">record in <span className="text-[var(--paper-text)]">{r.table}</span></p>
                )}
                <p className="text-xs leading-relaxed text-[var(--paper-muted)]">{r.text}</p>
                {"table" in r && (
                  <p className="mt-3 border-t pt-2 text-[10px] leading-relaxed text-[var(--paper-muted)]">
                    Every data edge on this canvas is a database record. Nothing is inferred.
                  </p>
                )}
              </div>
            );
          })()}
        </div>
      )}
      {!settingsOpen && sel && sel.type !== "prompt" && sel.type !== "file" && sel.type !== "more" && (
        <div className="hidden w-80 shrink-0 overflow-y-auto border-l bg-[var(--paper)] p-4 md:block">
          <div className="mb-2 flex items-start justify-between">
            <Badge variant="secondary" className="text-[10px]">{sel.type}</Badge>
            <button onClick={() => setSelectedKey(null)} className="text-[var(--paper-muted)] hover:text-[var(--paper-text)]"><X className="h-4 w-4" /></button>
          </div>
          <h2
            draggable
            onDragStart={(e) => setDragEntity(e.dataTransfer, sel)}
            className="cursor-grab font-mono text-sm font-semibold text-nuclear"
            title="drag into the chat to attach as context"
          >
            {sel.label}
          </h2>
          {!detail && <p className="mt-3 text-xs text-[var(--paper-muted)]">Loading…</p>}
          {detail && !detail.error && (
            <DetailBody type={sel.type} detail={detail} navigate={navigate} onCanvas={(g) => expand(g as GNode, "papers")} />
          )}
        </div>
      )}
      {!settingsOpen && sel && sel.type === "prompt" && sel.output && (
        <div className="hidden w-80 shrink-0 overflow-y-auto border-l bg-[var(--paper)] p-4 md:block">
          <div className="mb-2 flex items-start justify-between">
            <Badge variant="secondary" className="text-[10px]">step output</Badge>
            <button onClick={() => setSelectedKey(null)} className="text-[var(--paper-muted)] hover:text-[var(--paper-text)]"><X className="h-4 w-4" /></button>
          </div>
          <p className="whitespace-pre-wrap text-xs leading-relaxed text-[var(--paper-text)]">{sel.output}</p>
        </div>
      )}
    </div>
  );
}

// The query cache is the app's one (components/DataProvider.tsx, 2026-11-08).
export function GraphPage() {
  return (
    <ReactFlowProvider>
      <GraphPageInner />
    </ReactFlowProvider>
  );
}
