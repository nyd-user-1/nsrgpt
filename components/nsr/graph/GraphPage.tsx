"use client";

import { Fragment, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ReactFlow, ReactFlowProvider, Background, Controls, Panel, Handle, Position,
  useNodesState, useEdgesState, useReactFlow, useNodesInitialized, addEdge,
  SelectionMode, ConnectionMode, ConnectionLineType, PanOnScrollMode,
  type Node, type Edge, type NodeProps, type Connection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "@dagrejs/dagre";
import {
  ArrowLeft, Check, ChevronRight, Copy, Crosshair, Download, History, Redo2, RotateCcw, Share2, Trash2, Undo2,
  GripVertical, Loader2, MessageSquare, MoreHorizontal, Play, Plus, Save, Settings2, Star, X,
} from "lucide-react";
import { useNavRows } from "@/lib/nav-rows";
import { Atom } from "@/components/animate-ui/icons/atom";
import { BookOpen } from "@/components/animate-ui/icons/book-open";
import { Boxes } from "@/components/animate-ui/icons/boxes";
import { Database } from "@/components/animate-ui/icons/database";
import { FileText } from "@/components/animate-ui/icons/file-text";
import { FlaskConical } from "@/components/animate-ui/icons/flask-conical";
import { Layers } from "@/components/animate-ui/icons/layers";
import { Users } from "@/components/animate-ui/icons/users";
import { Activity } from "@/components/animate-ui/icons/activity";
import { Blocks } from "@/components/animate-ui/icons/blocks";
import { ListOrdered } from "@/components/animate-ui/icons/list-ordered";
import { KINDS, KIND_LABEL, SUBTYPE_LABEL, type DiagramKind } from "@/lib/diagram/spec";
import { configFor, type DiagramConfig, type DiagramSpec } from "@/lib/diagram/spec";
import { LIBRARY, loadSpec } from "@/lib/diagram/library";
import { toFlow } from "@/lib/diagram/layout";
import { DIAGRAM_EDGE_TYPES, DIAGRAM_NODE_TYPES } from "@/components/nsr/graph/diagram";
import { FlowSettingsPanel, DEFAULT_FLOW_PROPS, type FlowProps } from "@/components/nsr/graph/FlowSettings";
import { EntitySearch } from "@/components/nsr/graph/EntitySearch";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogPopup, DialogHeader, DialogTitle, DialogDescription } from "@/components/animate-ui/components/base/dialog";
import { Input } from "@/components/ui/input";
import { TexText } from "@/components/chat/TexText";
import { DetailBody } from "@/components/chat/EntityDetail";
import { ChatDock } from "@/components/nsr/graph/ChatDock";
import { StepChat } from "@/components/nsr/graph/StepChat";
import { setRail, useRailClosed, useRailsClosedWhileMounted } from "@/components/rail-toggle";
import { INSET, InsetBody, InsetLayers, InsetTip } from "@/components/nsr/graph/InsetPanel";
import { BRANCH, SideBarGroupHeader, SideBarMenuItem, SideBarSection, type SideBarIcon } from "@/components/sidebar/SideBarMenuItem";
import { PAGE_ICONS } from "@/components/sidebar/page-icons";
import { LeftInsetPanel } from "@/components/nsr/graph/LeftInsetPanel";
import { RIGHT_VIEWS, RightInsetPanel, RightViewHeader, type RightView } from "@/components/nsr/graph/RightInsetPanel";
import { cn } from "@/lib/utils";
import { copyPng, copyText, elementToPng } from "@/lib/canvas-png";
import { canvasToSvg, downloadSvg, svgFileName } from "@/lib/canvas-svg";
import { apiUrl } from "@/lib/api-url";
import { apiJson, apiText, fileBase, levelsOf, nuclideName, recordOfNode, recordView, SOURCES, type GraphRef, type RecordView } from "@/lib/datasets";
import { FAMILY, isDark, type Family } from "@/lib/viz-physics";
import { type DragEntity, readDragEntity, setDragEntity } from "@/lib/nsr-drag-entity";
import { toast } from "sonner";
import { GRAPH_CENTER, STARTER, keyOf, toGNode, type Catalog } from "./entities";

// Answers render as /chat renders them (brief 50), loaded with the first answer shown, as the dock loads them.
const ChatMarkdown = lazy(() => import("@/components/chat/ChatMessage").then((m) => ({ default: m.ChatMarkdown })));

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
  /** dataset (an ENSDF or XUNDL dataset, id source:NUCID:DSID), material (an ENDF/B material, id release:MAT) and level
   *  (one of a dataset's levels) come from the dataset pages' records (brief 33). */
  type: "paper" | "author" | "nuclide" | "reaction" | "exfor" | "prompt" | "file" | "more" | "dataset" | "material" | "level";
  id: string;
  label: string;
  sub?: string;
  title?: string | null;
  prompt?: string;
  output?: string;
  /** A prompt step's conversation about its output (brief 50), saved with the view as `output` is. */
  chat?: { role: "user" | "assistant"; content: string }[];
  fileKey?: string;
  fileText?: string;
  /** Nuclide cards on a chart grid (decay chains, capture paths): proton and neutron numbers; levels: energy in keV. */
  z?: number;
  n?: number;
  e?: number;
  /** The nuclide's decay family (lib/nuclide.ts FAMILY): the card wears its colour, as every chart does. */
  family?: Family;
  /** The transmutation figure's card (brief 28 specs, shape "rect"): "glyph" is the bare "238 U" in its class colour with its
   *  fission share beneath. */
  style?: "glyph";
  cls?: "fissile" | "fertile" | "less" | "short";
  fission?: number;
  /** Paper cards: the entity rows shown inside the card (op=cards). */
  rows?: CardRows;
  /** "+N more" overflow supernodes: whose overflow, which relation. */
  parentKey?: string;
  rel?: string;
  /** op=similar results: cosine to the anchor (rides onto the edge, not the card). */
  cos?: number;
  /** Paper cards: which row groups are unfolded (collapsed by default). */
  openGroups?: string[];
  /** A card's own expanders where they depend on its record (a dataset's "+ nuclide", "+ references", "+ levels"). */
  rels?: { rel: string; label: string }[];
}
/** Edge provenance. Absent = a record from the join tables. */
type EdgeMeta = { kind?: "similar" | "wired" | "decay" | "reaction" | "sample"; cos?: number; mode?: string; pct?: number | null } & Record<string, unknown>;
const isSimilar = (e: Edge) => (e.data as EdgeMeta | undefined)?.kind === "similar";

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
  paper: 250, author: 150, nuclide: 130, reaction: 140, exfor: 150, prompt: 260, file: 170, more: 130, dataset: 250, material: 220, level: 150,
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
// The actinide build-up figure's classes (Sasahara): fissile dark red, fertile blue, less fertile grey, short-lived light grey;
// its arrows: capture blue, α magenta, β and EC green.
const GLYPH_COLOR: Record<"fissile" | "fertile" | "less" | "short", string> = { fissile: "#a0352c", fertile: "#1f4fd6", less: "#6b6b6b", short: "#aaaaaa" };

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
  if (typeof meta?.receipt === "string") return { table: typeof meta.source === "string" ? meta.source : undefined, text: meta.receipt };
  if (meta?.kind === "similar")
    return { text: `Inference from the embedding space (bge-m3 cosine similarity${meta.cos != null ? ` = ${meta.cos.toFixed(3)}` : ""}) — NOT a database record. ${x.label} and ${y.label} sit near each other in vector space; nothing in the corpus joins them.` };
  if (meta?.kind === "decay")
    return { table: "ensdf decay modes (decay.json)", text: `${x.label} decays to ${y.label} by ${meta.mode}${meta.pct != null ? `, ${meta.pct}% of its decays` : ""}: the ground-state decay mode and branching ENSDF lists for ${x.label}.` };
  if (meta?.kind === "reaction")
    return { table: "endfb_xs (ENDF/B-VIII.1, MT by reaction)", text: `${x.label} ${meta.mode} ${y.label}: a reaction step. Its cross section is in the ENDF/B tables; this canvas is sample data until the API serves it.` };
  if (meta?.kind === "sample")
    return { text: `${x.label} to ${y.label}${meta.mode ? ` (${meta.mode})` : ""}: sample data for the layout, not yet a database record.` };
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

  // Eight quiet handles so an arrow can leave or enter any side; the edge picks the pair by direction.
  const sides = (
    <>
      {([["t", Position.Top], ["b", Position.Bottom], ["l", Position.Left], ["r", Position.Right]] as const).map(([id, p]) => (
        <Fragment key={id}>
          <Handle type="source" id={id} position={p} className="!h-1 !w-1 !border-0 !bg-transparent" />
          <Handle type="target" id={`${id}t`} position={p} className="!h-1 !w-1 !border-0 !bg-transparent" />
        </Fragment>
      ))}
    </>
  );
  if (d.style === "glyph") {
    // The actinide build-up's glyph: mass number small, symbol large, in the class colour; the fission share in red beneath.
    const color = GLYPH_COLOR[d.cls ?? "less"];
    const a = d.label.match(/^\d+m?/)?.[0] ?? "";
    const el = d.label.replace(/^\d+m?/, "");
    return (
      <div className={`relative flex flex-col items-center px-2 py-1 ${accent ? "rounded-md ring-1 ring-nuclear" : ""} ${dim}`} style={{ width: NODE_W.nuclide }} title={d.sub}>
        {sides}
        <p className="font-mono leading-none" style={{ color }}><span className="text-sm">{a}</span> <span className="text-xl font-semibold">{el}</span></p>
        {d.fission !== undefined && <p className="mt-0.5 font-mono text-sm font-semibold leading-none text-[#d1242f]">{d.fission}%</p>}
      </div>
    );
  }
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
          <div className="mt-1.5 max-h-[54px] overflow-hidden rounded bg-[var(--paper-quiet)] p-1.5">
            <Suspense fallback={<p className="line-clamp-3 text-[10px] leading-snug text-[var(--paper-muted)]">{d.output}</p>}>
              <ChatMarkdown content={d.output.slice(0, 600)} size="xs" />
            </Suspense>
          </div>
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

  // Nuclide cards wear their decay family's colour (lib/nuclide.ts FAMILY, the same as every chart): a 4px left edge
  // and a strong wash of it over the paper, so yellow reads yellow and blue reads blue (Brendan, 2026-11-08, 03:23).
  const famColor = d.type === "nuclide" && d.family ? (isDark() ? FAMILY[d.family].dark : FAMILY[d.family].light) : null;
  const famStyle = famColor ? { borderLeft: `5px solid ${famColor}`, borderColor: famColor, background: `color-mix(in oklab, ${famColor} 38%, var(--paper))` } : {};
  return (
    <div className={`${CARD} ${accent} ${dim} group/card relative transition-opacity`} style={{ width: NODE_W[d.type], ...famStyle }} title={d.family ? FAMILY[d.family].label : undefined}>
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
      <p className={`truncate pr-3 font-mono text-[11px] font-semibold ${d.type === "paper" || d.type === "dataset" || d.type === "material" ? "text-nuclear" : "text-[var(--paper-text)]"}`}>
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
        {(d.rels ?? RELS[d.type] ?? [])
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

// Cards are EntityNode; a diagram's discs, squares, levels, bands, legend and axes are its parts (brief 28).
const nodeTypes = { entity: EntityNode, ...DIAGRAM_NODE_TYPES };
const edgeTypes = DIAGRAM_EDGE_TYPES;

/* ── catalog rail: the workspace's asset inventory ────────────────────────── */

const CATALOG_TYPES = [
  { key: "papers", label: "Papers", icon: FileText, type: "paper" as const },
  { key: "authors", label: "Authors", icon: Users, type: "author" as const },
  { key: "nuclides", label: "Nuclides", icon: Atom, type: "nuclide" as const },
  { key: "reactions", label: "Reactions", icon: FlaskConical, type: "reaction" as const },
  { key: "exfor", label: "EXFOR", icon: Database, type: "exfor" as const },
];
// The five parsed datasets' pages (brief 33), A to Z.
const CATALOG_LINKS = [
  { key: "endf", label: "ENDF/B", href: "/datasets/endf" },
  { key: "ensdf", label: "ENSDF", href: "/datasets/ensdf" },
  { key: "exfor", label: "EXFOR", href: "/datasets/exfor" },
  { key: "nsr", label: "NSR", href: "/datasets/nsr" },
  { key: "xundl", label: "XUNDL", href: "/datasets/xundl" },
].map((l) => ({ ...l, icon: PAGE_ICONS[l.href] }));
/** How many of a record's links one press of its expander brings (brief 33). */
const RECORD_PAGE: Record<string, number> = { references: 12, levels: 20, subentry: 12 };
/** Saved canvases from Community. A saved state is a recipe iff it has prompt steps. */
interface ViewRow { id: number | string; name: string; saved_by: string; created_at: string; state?: { nodes?: { type: string }[]; diagram?: string; center?: { label: string } } }
const isRecipe = (v: ViewRow) => !!v.state?.nodes?.some((n) => n.type === "prompt");

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

/** A diagram the rail lists: a spec from the library (lib/diagram/library, brief 28). */
export type RailDiagram = { id: string; title: string; kind: DiagramKind; subtype: string; href: string; onSelect: () => void };

/** Each diagram kind's icon, on its row in the Diagrams section and on its diagrams' rows. */
const KIND_ICON: Record<DiagramKind, SideBarIcon> = {
  "decay-chain": Atom,
  "reaction-network": Blocks,
  "activation-burnup": FlaskConical,
  "production-route": Boxes,
  "fission-fan": Activity,
  "level-scheme": ListOrdered,
};

function CatalogRail({ onPick, onAdd, onAsk, onAddFile, onLoadView, onNewCanvas, navigate, initialBrowse = null, railDiagrams }: {
  initialBrowse?: string | null;
  /** Workspace's New canvas: an empty canvas, the rail where it is (brief 49). */
  onNewCanvas: () => void;
  onPick: (g: GNode) => void;
  onAdd: (g: GNode) => void;
  onAsk: (g: GNode) => void;
  onAddFile: (f: LibFile) => void;
  onLoadView: (id: number | string) => void;
  navigate: (p: string) => void;
  /** The diagrams the rail lists, from the library (brief 28). */
  railDiagrams: RailDiagram[];
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
  const [browse, setBrowse] = useState<string | null>(initialBrowse);
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

  // The signed-in reader's name as the store stamps saves with it (lib/community.ts signedInName): their own rows can be deleted.
  const me = useQuery({
    queryKey: ["auth-me"],
    queryFn: async (): Promise<string | null> => {
      const r = await fetch("/api/auth/me", { cache: "no-store" });
      const { user } = (await r.json()) as { user?: { name?: string; email?: string } | null };
      return user ? user.name || user.email?.split("@")[0] || null : null;
    },
    enabled: browse === "views" || browse === "recipes",
    staleTime: 5 * 60_000,
  });
  const queryClient = useQueryClient();
  const deleteView = async (v: ViewRow) => {
    if (!window.confirm(`Delete "${v.name}" from Community?`)) return;
    const r = await fetch(`/api/community?id=${encodeURIComponent(String(v.id))}`, { method: "DELETE" });
    const body = (await r.json().catch(() => ({}))) as { error?: string };
    if (!r.ok) { toast.error(body.error ?? `Couldn't delete it (${r.status})`); return; }
    toast.success(`Deleted "${v.name}"`);
    queryClient.invalidateQueries({ queryKey: ["community-views"] });
  };

  const diagrams = railDiagrams;
  // Favorites (Brendan, 2026-11-09): every rail row a reader has starred from its menu (lib/nav-rows.ts, keyed by the
  // row's address), in the rail's own order. Workspace shows the first three and a See more; the layer lists them all.
  const { rows: navRows } = useNavRows();
  // Favorites folds open and shut like the sidebar's groups, shut on every load (Brendan, 2026-11-09).
  const [favOpen, setFavOpen] = useState(false);
  const favorites = useMemo(() => {
    const all: { href: string; label: string; icon: SideBarIcon; group: string; onSelect: () => void }[] = [
      { href: "/graph?browse=files", label: "Library", icon: FileText, group: "Workspace", onSelect: () => setBrowse("files") },
      { href: "/graph?browse=recipes", label: "Recipes", icon: BookOpen, group: "Workspace", onSelect: () => setBrowse("recipes") },
      { href: "/graph?browse=views", label: "Views", icon: Layers, group: "Workspace", onSelect: () => setBrowse("views") },
      ...CATALOG_TYPES.map(({ key, label, icon }) => ({ href: `/graph?browse=${key}`, label, icon, group: "Database", onSelect: () => setBrowse(key) })),
      ...CATALOG_LINKS.map(({ label, icon, href }) => ({ href, label, icon, group: "Datasets", onSelect: () => navigate(href) })),
      ...KINDS.map((k) => ({ href: `/graph?browse=kind:${k}`, label: KIND_LABEL[k], icon: KIND_ICON[k], group: "Diagrams", onSelect: () => setBrowse(`kind:${k}`) })),
      ...diagrams.map((d) => ({ href: d.href, label: d.title, icon: KIND_ICON[d.kind], group: KIND_LABEL[d.kind], onSelect: d.onSelect })),
    ];
    return all.filter((r) => navRows[r.href]?.favorite);
  }, [navRows, diagrams, navigate]);
  const layer = (() => {
  if (browse === "views" || browse === "recipes") {
    const wantRecipes = browse === "recipes";
    const items = (views.data?.views ?? [])
      .filter((v) => isRecipe(v) === wantRecipes)
      .filter((v) => !filter.trim() || `${v.name} ${v.saved_by}`.toLowerCase().includes(filter.trim().toLowerCase()));
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className={INSET.header}>
          <button onClick={() => { setBrowse(null); setFilter(""); }} className="text-[var(--paper-muted)] hover:text-[var(--paper-text)]" title="back">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className={INSET.title}>{wantRecipes ? "Recipes" : "Views"}</span>
          <span className="ml-auto font-mono text-xs text-[var(--paper-muted)]">{views.data ? items.length : ""}</span>
        </div>
        <div className="border-b p-2">
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={wantRecipes ? "Filter recipes…" : "Filter views…"} className="h-8 text-xs" />
        </div>
        <InsetBody>
          {views.isLoading && <p className="p-3 text-xs text-[var(--paper-muted)]">Loading…</p>}
          {items.map((v) => (
            <InsetTip key={v.id} name={v.name} side="left">
            <div className="group/view relative">
            <button
              onClick={() => onLoadView(v.id)}
              className={`flex w-full flex-col gap-0.5 border-b border-[var(--paper-rule-soft)] px-3 py-2 text-left transition-colors hover:bg-[var(--paper-quiet)] ${me.data && v.saved_by === me.data ? "pr-9" : ""}`}
            >
              <span className="flex w-full items-baseline justify-between gap-2">
                <span className="truncate text-xs font-semibold text-[var(--paper-text)]">{v.name}</span>
                <span className="shrink-0 font-mono text-[10px] text-[var(--paper-muted)]">{v.state?.diagram ? "diagram" : v.state?.center ? `${v.state.center.label} and its papers` : `${v.state?.nodes?.length ?? 0} nodes`}</span>
              </span>
              <span className="text-[10px] text-[var(--paper-muted)]">{v.saved_by} · {String(v.created_at).slice(0, 10)}</span>
            </button>
            {me.data && v.saved_by === me.data && (
              <button
                type="button"
                aria-label={`Delete ${v.name}`}
                title="Delete"
                onClick={() => deleteView(v)}
                className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-[var(--paper-muted)] opacity-0 transition-opacity hover:bg-[var(--paper)] hover:text-[var(--paper-text)] focus-visible:opacity-100 group-hover/view:opacity-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
            </div>
            </InsetTip>
          ))}
        </InsetBody>
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
      <div className="flex h-full min-h-0 flex-col">
        <div className={INSET.header}>
          <button onClick={() => { setBrowse(null); setFilter(""); }} className="text-[var(--paper-muted)] hover:text-[var(--paper-text)]" title="back">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className={INSET.title}>Library</span>
          <span className="ml-auto font-mono text-xs text-[var(--paper-muted)]">
            {files.data ? files.data.files.length : ""}
          </span>
        </div>
        <div className="border-b p-2">
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter files…" className="h-8 text-xs" />
        </div>
        <InsetBody>
          {files.isLoading && <p className="p-3 text-xs text-[var(--paper-muted)]">Loading…</p>}
          {items.map((f) => (
            <InsetTip key={f.key} name={f.name} side="left">
            <button
              onClick={() => onAddFile(f)}
              className="flex w-full items-center gap-2 border-b border-[var(--paper-rule-soft)] px-3 py-2 text-left transition-colors hover:bg-[var(--paper-quiet)]"
            >
              <FileText className="h-3.5 w-3.5 shrink-0 text-[var(--paper-muted)]" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono text-xs text-[var(--paper-text)]">{f.name}</span>
                <span className="block text-[10px] text-[var(--paper-muted)]">
                  {(f.size / 1024).toFixed(0)} kB{f.modified ? ` · ${f.modified.slice(0, 10)}` : ""}
                </span>
              </span>
            </button>
            </InsetTip>
          ))}
        </InsetBody>
      </div>
    );
  }

  // Favorites, drilled into from Workspace's See more (Brendan, 2026-11-09): every starred row, with its own icon.
  if (browse === "favorites") {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className={INSET.header}>
          <button onClick={() => setBrowse(null)} className="text-[var(--paper-muted)] hover:text-[var(--paper-text)]" title="back">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className={INSET.title}>Favorites</span>
          <span className="ml-auto font-mono text-xs text-[var(--paper-muted)]">{favorites.length}</span>
        </div>
        <InsetBody className="pt-1.5">
          {favorites.length === 0 && <p className="px-3 py-3 text-xs text-[var(--paper-muted)]">Nothing starred yet. Favorite a row from its menu.</p>}
          {favorites.map((f) => (
            <SideBarMenuItem key={f.href} href={f.href} label={f.label} icon={f.icon} on={false} group={f.group} sub={f.group} onSelect={f.onSelect} tip={{ name: f.label, side: "left" }} />
          ))}
        </InsetBody>
      </div>
    );
  }

  // A diagram kind, drilled into from the Diagrams section (Brendan, 2026-11-08): its diagrams, as Corpus > Papers drills.
  const kind = browse?.startsWith("kind:") ? KINDS.find((k) => `kind:${k}` === browse) : undefined;
  if (kind) {
    const list = diagrams.filter((d) => d.kind === kind);
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className={INSET.header}>
          <button onClick={() => setBrowse(null)} className="text-[var(--paper-muted)] hover:text-[var(--paper-text)]" title="back">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className={INSET.title}>{KIND_LABEL[kind]}</span>
          <span className="ml-auto font-mono text-xs text-[var(--paper-muted)]">{list.length}</span>
        </div>
        <InsetBody className="pt-1.5">
          {list.map((d) => (
            <SideBarMenuItem key={d.id} href={d.href} label={d.title} icon={KIND_ICON[kind]} on={false} group={KIND_LABEL[kind]} sub={SUBTYPE_LABEL[d.subtype] ?? d.subtype} onSelect={d.onSelect} tip={{ name: d.title, side: "left" }} />
          ))}
        </InsetBody>
      </div>
    );
  }

  if (browse) {
    const meta = CATALOG_TYPES.find((c) => c.key === browse)!;
    const items = (data?.top[browse] ?? []).filter(
      (it) => !filter.trim() || `${it.label} ${it.title ?? ""}`.toLowerCase().includes(filter.trim().toLowerCase()),
    );
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className={INSET.header}>
          <button onClick={() => { setBrowse(null); setFilter(""); }} className="text-[var(--paper-muted)] hover:text-[var(--paper-text)]" title="back">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className={INSET.title}>{meta.label}</span>
          <span className="ml-auto font-mono text-xs text-[var(--paper-muted)]">
            {data ? data.counts[browse]?.toLocaleString() : ""}
          </span>
        </div>
        <div className="border-b p-2">
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter the top 50…" className="h-8 text-xs" />
          <p className="mt-1 text-[10px] text-[var(--paper-muted)]">Most-studied first — the search bar covers the full corpus.</p>
        </div>
        <InsetBody>
          {items.map((it) => {
            const g = toGNode(browse, it);
            return (
              <div key={it.id} className="group/row relative border-b border-[var(--paper-rule-soft)]">
                <InsetTip name={it.label} side="left">
                <button
                  onClick={() => onPick(g)}
                  draggable
                  onDragStart={(e) => setDragEntity(e.dataTransfer, g)}
                  className="flex w-full flex-col gap-0.5 px-3 py-2 pr-7 text-left transition-colors hover:bg-[var(--paper-quiet)]"
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
                </InsetTip>
                <RowMenu g={g} onPick={onPick} onAdd={onAdd} onAsk={onAsk} />
              </div>
            );
          })}
        </InsetBody>
      </div>
    );
  }

  // The main view. Every row is a sidebar row (SideBarMenuItem: its hover, the open-in-panel arrow, the kebab menu),
  // acting instead of navigating; its count rides in the tooltip beneath the name (Brendan, 2026-11-08). Each section's
  // header is a sidebar group header that folds its rows, remembered per section (SideBarSection). Workspace stands above
  // them, fixed and always open, and the rest scroll beneath it (brief 49). New canvas's address is its own, so its marks
  // (hide, rename) stay off the sidebar's Graph row; it opens /graph.
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b bg-[var(--paper)] pb-1 pt-2.5">
        <SideBarGroupHeader label="Workspace" />
        <div className="flex flex-col">
          {/* Favorites: an item with sub-items on the sidebar's tree lines (SideBarMenuGroup's trunk and elbows): the
              row opens them all; beneath it the first three, and See more when there are more (Brendan, 2026-11-09). */}
          <SideBarGroupHeader label="Favorites" icon={Star} open={favOpen} onToggle={() => setFavOpen((v) => !v)} />
          {favOpen && (() => {
            const shown = favorites.slice(0, 3).map((f) => ({ key: f.href, row: <SideBarMenuItem href={f.href} label={f.label} icon={f.icon} on={false} small group="Favorites" onSelect={f.onSelect} tip={{ name: f.label, side: "left" }} /> }));
            if (favorites.length > 3) shown.push({ key: "more", row: <SideBarMenuItem href="/graph?browse=favorites" label={`See more (${favorites.length - 3})`} icon={ChevronRight} on={false} small group="Favorites" onSelect={() => setBrowse("favorites")} tip={{ name: "All favorites", side: "left" }} /> });
            return shown.map((s, k) => (
              <div key={s.key} className="relative pl-8">
                {k < shown.length - 1 && <span aria-hidden className="absolute bottom-0 left-[21px] top-0 w-px" style={{ background: BRANCH }} />}
                <span aria-hidden className="absolute left-[21px] top-0 h-4 w-5 rounded-bl-[10px] border-b-[1.5px] border-l-[1.5px]" style={{ borderColor: BRANCH }} />
                {s.row}
              </div>
            ));
          })()}
          <SideBarMenuItem href="/graph?browse=files" label="Library" icon={FileText} on={false} group="Workspace" onSelect={() => setBrowse("files")} tip={{ name: "Library", side: "left" }} />
          <SideBarMenuItem href="/graph?canvas=new" label="New canvas" icon={Plus} on={false} group="Workspace" onSelect={onNewCanvas} tip={{ name: "New canvas", side: "left" }} />
          {([["recipes", "Recipes", BookOpen], ["views", "Views", Layers]] as const).map(([key, label, icon]) => (
            <SideBarMenuItem key={key} href={`/graph?browse=${key}`} label={label} icon={icon} on={false} group="Workspace" onSelect={() => setBrowse(key)} tip={{ name: label, side: "left" }} />
          ))}
        </div>
      </div>
      <InsetBody>
        <SideBarSection label="Database" storageKey="graph:section:database">
        {CATALOG_TYPES.map(({ key, label, icon }) => (
          <SideBarMenuItem key={key} href={`/graph?browse=${key}`} label={label} icon={icon} on={false} group="Database" onSelect={() => setBrowse(key)} tip={{ name: label, side: "left" }} />
        ))}
        </SideBarSection>
        <SideBarSection label="Datasets" storageKey="graph:section:datasets">
        {CATALOG_LINKS.map(({ key, label, icon, href }) => (
          <SideBarMenuItem key={key} href={href} label={label} icon={icon} on={false} group="Datasets" onSelect={() => navigate(href)} tip={{ name: label, side: "left" }} />
        ))}
        </SideBarSection>
        {/* One Diagrams section whose rows are the six kinds; a kind drills into its diagrams (Brendan, 2026-11-08). */}
        <SideBarSection label="Diagrams" storageKey="graph:section:diagrams">
          {KINDS.map((k) => (
            <SideBarMenuItem key={k} href={`/graph?browse=kind:${k}`} label={KIND_LABEL[k]} icon={KIND_ICON[k]} on={false} group="Diagrams" onSelect={() => setBrowse(`kind:${k}`)} tip={{ name: KIND_LABEL[k], side: "left" }} />
          ))}
        </SideBarSection>
      </InsetBody>
    </div>
  );
  })();
  // The views push in from the right and slide back on the back arrow, in the sidebar's 500 ms (InsetPanel.tsx InsetLayers).
  return <InsetLayers layerKey={browse ?? "main"} depth={browse ? 1 : 0}>{layer}</InsetLayers>;
}

/** Seed canvases for the props panel — each one centers a real entity. */
const DATASETS: { id: string; label: string; seed: GNode | null }[] = [
  { id: "137CS", label: "137Cs nuclide", seed: { type: "nuclide", id: "137CS", label: "137Cs", sub: "Z=55 N=82" } },
  { id: "235U", label: "235U nuclide", seed: { type: "nuclide", id: "235U", label: "235U", sub: "Z=92 N=143" } },
  { id: "(N,G)", label: "(N,G) reaction", seed: { type: "reaction", id: "(N,G)", label: "(N,G)", sub: "reaction" } },
  { id: "2011CH57", label: "2011CH57 paper", seed: STARTER.find((s) => s.id === "2011CH57") ?? null },
  { id: "empty", label: "Empty canvas", seed: null },
];

/** The earlier sample links (?chain=, ?demo=), now library specs. */
const OLD_LINKS: Record<string, string> = {
  thorium: "thorium-series", neptunium: "neptunium-series", uranium: "uranium-series", actinium: "actinium-series",
  "thorium-figure": "thorium-series", pu241: "pu241-chain", "s-ag-sb": "s-process-ag-sb", "mass-201-210": "mass-201-210",
  sasahara: "transmutation-u238-cm244", "sasahara-figure": "transmutation-u238-cm244", mo99: "mo99-tc99m", lu177: "lu177",
  "u235-fan": "u235-fan", co60: "co60",
};

/* ── page ─────────────────────────────────────────────────────────────────── */

// Graph Features (Brendan, 2026-11-08; "Ideas, ranked" until then): what the lake makes possible, ranked by Brendan on the
// night shift. One of the right inset panel's three views (RightInsetPanel.tsx), the one it shows first.
const IDEAS: { title: string; text: string; href?: string; soon?: boolean }[] = [
  { title: "Our own evaluated library", text: "Fit all 19 million EXFOR points with their covariances (IAEA's GMAP code is in the lake) across every reaction at once on GPUs; publish NSRgpt-1.0, rebuilt whenever EXFOR changes, every number traceable to its measurements." },
  { title: "A nuclear data model", text: "Train on every measured and evaluated point, level and decay record, TENDL as the prior for all 2,800 nuclides. It predicts unmeasured cross sections with calibrated uncertainty and flags measurements that don't fit." },
  { title: "The validation fleet", text: "OpenMC on thousands of ICSBEP and CoNDERC benchmarks times every library, plus total Monte Carlo with TENDL's random files: a standing scoreboard of which library gets which benchmark right, and which cross sections drive the misses." },
  { title: "Run the physics on demand", text: "OpenMC's libraries and depletion chains plus CoNDERC's benchmark inputs: k-eff, activation, inventories computed when asked. TALYS for reactions nobody measured, with its uncertainty." },
  { title: "Spectrum identification by learned model", text: "Millions of simulated detector spectra from ENSDF and fission yields, calibrated against IDB's real U and Pu spectra, train a model that reads a raw spectrum and returns isotopics." },
  { title: "Structure at scale", text: "Check all 20,117 ENSDF datasets for internal consistency in one pass, then a level-scheme model trained on 568,000 levels that proposes schemes for nuclides with none." },
  { title: "Structure systematics", text: "568,000 levels with spin, parity and half-life: first 2+ energies, magic numbers, deformation regions, drawn from the data." },
  { title: "Mine the scans", text: "Vision models over the 37,000 PDFs and NNDC's scanned reports pull tables and figures into EXFOR-shaped data: the uncompiled literature, compiled. Later." },
  { title: "Gaps for compilers and evaluators", text: "Papers with no EXFOR entry, EXFOR entries no evaluation uses, nuclides with structure but no reaction data. Later." },
  { title: "Process everything ourselves", text: "NJOY and ENDFtk on the fleet turn every evaluation into transport-ready data at any temperature; the phase 3 and 4 processed forms become things we generate." },
  { title: "Spectra", text: "ENSDF decay data and fission yields predict a gamma spectrum for any inventory at any time; IDB's real spectra check it; identification from detector peaks against 793,000 known gammas." },
  { title: "What pins a number", text: "EXFOR partial uncertainties, C5 correlations, ENDF covariances: which experiments constrain an evaluation, and what one new measurement would buy." },
  { title: "Fifty years of a cross section", text: "ENDF/B-II to VIII.1, release by release, for any material, with the papers that changed it." },
  { title: "Measured against evaluated, everywhere", text: "EXFOR points over every library: residuals per reaction, a ranked map of where libraries disagree with experiment." },
  { title: "The nuclide as the hub", text: "Z, A joins levels, gammas, decay radiation, cross sections, measurements, evaluations and papers, with provenance to the record." },
  { title: "Answers that cite the card", text: "The ENSDF line, the EXFOR subentry, the ENDF MAT and MT section, quoted for every number in a chat." },
  // Brief 33: for Brendan to rank; not built yet.
  { title: "Build one for a nuclide", text: "Type a nuclide and get its decay chain, capture chain or level scheme drawn from the lake, not only from the library's figures.", soon: true },
  { title: "Compare two diagrams side by side", text: "Two canvases of the same type for two nuclides, panning and zooming together.", soon: true },
  { title: "An editable legend", text: "Click a family to hide or recolour its nuclides, click an arrow kind to show or hide those edges; the legend prints with the export.", soon: true },
  // Reading, to go over together (Brendan, 2026-11-08).
  { title: "EXFOR formats manual, IAEA WP2007-23 (PDF)", text: "", href: "https://nds.iaea.org/exfor/x4guide/manuals/wp2007-23.pdf" },
  { title: "NuDat at USNDP 2022, BNL (PDF)", text: "", href: "https://indico.bnl.gov/event/15497/contributions/70076/attachments/44350/74834/NUDAT_USNDP2022.pdf" },
];

function GraphPageInner() {
  const router = useRouter();
  const navigate = (to: string) => router.push(to);
  const params = useSearchParams();
  const { screenToFlowPosition, fitView } = useReactFlow();
  const queryClient = useQueryClient();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges] = useEdgesState<Edge>([]);
  const store = useRef(new Map<string, GNode>());
  const expandState = useRef(new Map<string, { loaded: number; total: number }>());
  // expand() is defined before the dataset cards' expanders; it reaches them through this ref (brief 33)
  const expandRecordRef = useRef<(node: GNode, rel: string) => void>(() => {});
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  // The library diagram on the canvas and its config (brief 28); null when the canvas holds anything else.
  const [diagram, setDiagram] = useState<{ spec: DiagramSpec; config: DiagramConfig } | null>(null);
  // The saved view on the canvas, named in the bottom-right group while no diagram is loaded.
  const [loadedView, setLoadedView] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [expanding, setExpanding] = useState<string | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  // The tools bar rests as circles and opens to full width in the sidebar's 500 ms (Brendan, 2026-11-08). The search
  // that sat beside it is the app header's now (brief 36, components/nsr/graph/EntitySearch.tsx).
  const [toolsOpen, setToolsOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [edgeInfo, setEdgeInfo] = useState<{ source: GNode; target: GNode; meta?: EdgeMeta } | null>(null);
  const [viewName, setViewName] = useState("");

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
  // The right inset panel's layer (RightInsetPanel.tsx): the menu on load and after a click on the pane; selecting a
  // node or an edge, or opening a run's trace, drills into the papers.
  const [rightView, setRightView] = useState<RightView>("menu");
  const rightClosed = useRailClosed("right");
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
      const prevById = new Map(prevNodes.map((n) => [n.id, n]));
      const mode = layoutModeRef.current;
      // "none": nothing moves — new nodes land beside their edge-source, stacked
      const fresh = new Map<string, number>();
      let next: Node[] = [...store.current.values()].map((g) => {
        const k = keyOf(g);
        const part = prevById.get(k);
        if (part && part.type !== "entity") return part;
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
      next = [...next, ...prevNodes.filter((n) => n.id.startsWith("diagram:"))];
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

  const loadFit = useRef(true);
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
      // the relayout can push new nodes off-viewport — follow them. The first, the load's own neighbourhood, fits as the
      // controls' fit button does (Brendan, 2026-11-08: the canvas loads fitted the way the button fits it).
      if (relayout) setTimeout(() => {
        const onLoad = loadFit.current;
        loadFit.current = false;
        fitView(onLoad ? undefined : { padding: 0.15, duration: 400 });
      }, 60);
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
    if (node.type === "dataset" || node.type === "material") { expandRecordRef.current(node, rel); return; }
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
    setDiagram(null);
    store.current = new Map([[keyOf(g), g]]);
    expandState.current = new Map();
    setEdges([]);
    setSelectedKey(keyOf(g));
    setNodes([{ id: keyOf(g), type: "entity", position: { x: 0, y: 0 }, data: { ...g } }]);
    // a centered entity arrives WITH its neighborhood — the canvas is never
    // one lonely node sitting on 300k rows of relations
    if (g.type === "paper") fetchCards([keyOf(g)]);
    else if (RELS[g.type]?.length) setTimeout(() => expand(g, RELS[g.type]![0].rel), 0);
  }, [setEdges, setNodes, expand, fetchCards, snapshot]);

  /* ── dataset and material cards (brief 33) ───────────────────────────────── */

  // A dataset's or material's record from the API (services/nsr-api/README.md, "Dataset records"), by card key: the view
  // the dataset page draws, the JSON (its levels), or what the API answered instead.
  const records = useRef(new Map<string, { view?: RecordView; json?: unknown; error?: unknown }>());
  const [, setDetailTick] = useState(0);
  /** Graph's card for a node of a record's graph block. */
  const cardOf = useCallback((r: GraphRef): GNode => {
    const rec = recordOfNode(r.type, r.id);
    if (rec) return { type: r.type as GNode["type"], id: r.id, label: `${SOURCES[rec.source].label} · ${rec.id.split(/[:/]/)[0]}`, title: r.label, sub: r.sub };
    if (r.type === "nuclide") return { type: "nuclide", id: r.id, label: r.label && r.label !== r.id ? r.label : nuclideName(r.id), sub: r.sub };
    if (r.type === "paper") return { type: "paper", id: r.id, label: r.id, title: r.label !== r.id ? r.label : undefined, sub: r.sub };
    return { type: (["exfor", "author", "reaction"].includes(r.type) ? r.type : "exfor") as GNode["type"], id: r.id, label: r.label || r.id, sub: r.sub };
  }, []);
  /** A record's links by expander: nuclide, references, its parent and subentries, and its levels where it has them. */
  const recordLinks = useCallback((key: string, rel: string): GNode[] => {
    const rec = records.current.get(key);
    if (!rec?.view) return [];
    if (rel === "levels") {
      const owner = store.current.get(key);
      return levelsOf(rec.json).map((l): GNode => ({ type: "level", id: `${owner?.id ?? key}#${l.seq}`, label: l.energy ? `${l.energy} keV` : "level", sub: [l.jpi, l.halfLife].filter(Boolean).join(" · ") || undefined }));
    }
    const want = rel === "references" ? "reference" : rel;
    return rec.view.graph.links.filter((x) => (x.rel ?? (x.type === "nuclide" ? "nuclide" : "reference")) === want).map(cardOf);
  }, [cardOf]);
  /** One page of a record's links onto the canvas, with the honest remainder as "+N more", as expand() does. */
  const expandRecord = useCallback((node: GNode, rel: string) => {
    const key = keyOf(node);
    const all = recordLinks(key, rel);
    const k = `${key}|${rel}`;
    const offset = expandState.current.get(k)?.loaded ?? 0;
    if (offset >= all.length) { if (all.length) toast.info("All loaded"); return; }
    const page = all.slice(offset, offset + (RECORD_PAGE[rel] ?? all.length));
    const loaded = offset + page.length;
    expandState.current.set(k, { loaded, total: all.length });
    addNodes(page, key);
    const moreKey = `more:${k}`;
    if (loaded < all.length) addNodes([{ type: "more", id: k, label: `+${(all.length - loaded).toLocaleString()} more`, parentKey: key, rel }], key);
    else if (store.current.has(moreKey)) removeNode(moreKey);
    fetchCards(page.filter((g) => g.type === "paper").map(keyOf));
  }, [recordLinks, addNodes, removeNode, fetchCards]);
  expandRecordRef.current = expandRecord;
  /** A dataset or material centred with its nuclide, parent and first references already linked; the card's expanders
   *  page the rest. A record that doesn't load leaves the card, and the Papers view says what the API answered. */
  const centerRecord = useCallback(async (g: GNode) => {
    const key = keyOf(g);
    const rec = recordOfNode(g.type, g.id);
    const first: GNode = { ...g, ...(rec ? { label: `${SOURCES[rec.source].label} · ${rec.id.split(/[:/]/)[0]}`, title: g.title ?? rec.id.split(/[:/]/).slice(1).join(" ") } : {}) };
    center(first);
    if (!rec) return;
    try {
      const json = await apiJson(SOURCES[rec.source].recordPath(rec.id, {}));
      if (!store.current.has(key)) return;
      const view = recordView(rec.source, rec.id, json);
      records.current.set(key, { view, json });
      const has = (rel: string) => recordLinks(key, rel).length > 0;
      const rels = [
        ...(has("nuclide") ? [{ rel: "nuclide", label: "nuclide" }] : []),
        ...(has("references") ? [{ rel: "references", label: "references" }] : []),
        ...(has("levels") ? [{ rel: "levels", label: "levels" }] : []),
      ];
      store.current.set(key, { ...first, title: view.graph.node.label || first.title, sub: view.graph.node.sub ?? view.sub, rels });
      for (const rel of ["nuclide", "parent", "subentry", "references"]) if (has(rel)) expandRecord(store.current.get(key) as GNode, rel);
      setEdges((prev) => { syncNodes(prev, false); return prev; });
    } catch (error) {
      records.current.set(key, { error });
      setDetailTick((n) => n + 1);
    }
  }, [center, recordLinks, expandRecord, setEdges, syncNodes]);

  /** A diagram from the library (brief 28) drawn onto a fresh canvas: toFlow(spec, config) gives the parts' nodes and the
   *  typed arrows; the nuclides go into the canvas store, so clicking a disc or square opens its papers as any card does.
   *  `fit` refits the view (a new diagram, or a new grid). */
  const drawDiagram = useCallback((spec: DiagramSpec, config: DiagramConfig, fit: boolean) => {
    const out = toFlow(spec, config);
    if (fit) snapshot();
    store.current = new Map([...out.gnodes].map(([k, g]) => [k, g as unknown as GNode] as [string, GNode]));
    expandState.current = new Map();
    setLayoutMode("none");
    layoutModeRef.current = "none";
    setNodes(out.nodes);
    setEdges(out.edges);
    // The fit runs once the new nodes have measured (the effect on nodesInitialized below) and again late, after the
    // page's transition and the panels' 500 ms have settled the canvas (Brendan, 2026-11-09: a reload must open fitted).
    if (fit) {
      pendingFit.current = true;
      [450, 1000].forEach((ms) => setTimeout(() => fitView({ padding: 0.12, duration: 300, maxZoom: 1 }), ms));
    }
  }, [setNodes, setEdges, fitView, snapshot]);
  const nodesInitialized = useNodesInitialized();
  const pendingFit = useRef(false);
  useEffect(() => {
    if (!nodesInitialized || !pendingFit.current) return;
    pendingFit.current = false;
    fitView({ padding: 0.12, duration: 300, maxZoom: 1 });
  }, [nodesInitialized, nodes, fitView]);

  /** Opens a library diagram: its spec built from the data, its config the spec's defaults (the Config panel edits it). */
  const fitNext = useRef(false);
  const loadDiagram = useCallback(async (id: string) => {
    let spec: DiagramSpec;
    try { spec = await loadSpec(id); } catch (e) { toast.error(`${LIBRARY.find((s) => s.id === id)?.title ?? id}: ${(e as Error).message}`); return; }
    if (!spec.nodes.length) { toast.error(`${spec.title}: its data holds no nuclides`); return; }
    setSelectedKey(null);
    setEdgeInfo(null);
    fitNext.current = true;
    configHistory.current = { past: [], future: [] };
    setLoadedView(null);
    setHistoryTick((n) => n + 1);
    setDiagram({ spec, config: configFor(spec) });
  }, []);
  // The loaded diagram's change history (Brendan, 2026-11-08): every Config change and every Reset is a step the
  // toolbar's Back and Forward walk; a newly loaded diagram starts with none.
  const diagramNow = useRef(diagram);
  diagramNow.current = diagram;
  const configHistory = useRef<{ past: DiagramConfig[]; future: DiagramConfig[] }>({ past: [], future: [] });
  // The history lives in a ref; the tick re-renders the toolbar when it changes.
  const [, setHistoryTick] = useState(0);
  const changeDiagram = useCallback((config: DiagramConfig, fit = false) => {
    const cur = diagramNow.current;
    if (!cur) return;
    configHistory.current.past.push(cur.config);
    configHistory.current.future = [];
    setHistoryTick((n) => n + 1);
    if (fit) fitNext.current = true;
    setDiagram({ spec: cur.spec, config });
  }, []);
  const setDiagramConfig = useCallback((patch: Partial<DiagramConfig>) => {
    const cur = diagramNow.current;
    if (cur) changeDiagram({ ...cur.config, ...patch });
  }, [changeDiagram]);
  /** Reset: the loaded diagram as the page loaded it, its spec's own config and layout, fitted. */
  const resetDiagram = useCallback(() => {
    const cur = diagramNow.current;
    if (cur) changeDiagram(configFor(cur.spec), true);
  }, [changeDiagram]);
  const stepDiagram = useCallback((back: boolean) => {
    const cur = diagramNow.current;
    const h = configHistory.current;
    const to = back ? h.past.pop() : h.future.pop();
    if (!cur || !to) return;
    (back ? h.future : h.past).push(cur.config);
    setHistoryTick((n) => n + 1);
    setDiagram({ spec: cur.spec, config: to });
  }, []);
  // The bottom-right group (Brendan, 2026-11-08): what the canvas shows, then Share (the diagram's link, through the
  // browser's share sheet where it has one), Export (the canvas as an SVG file, brief 33) and Copy (the canvas as a PNG).
  const canvasTitle = diagram?.spec.title ?? loadedView ?? "Canvas";
  const shareDiagram = useCallback(async () => {
    const cur = diagramNow.current;
    if (!cur) return;
    const url = `${window.location.origin}/graph?diagram=${cur.spec.id}`;
    try {
      if (window.isSecureContext && navigator.share) { await navigator.share({ title: cur.spec.title, url }); return; }
      await copyText(url);
      toast.success("Link copied");
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast.error("Couldn't share the link");
    }
  }, []);
  const copyCanvas = useCallback(async () => {
    const flow = document.querySelector<HTMLElement>(".react-flow");
    if (!flow) return;
    try {
      const paper = getComputedStyle(flow).getPropertyValue("--paper").trim() || "#ffffff";
      const blob = await elementToPng(flow, paper);
      const how = await copyPng(blob, `${(diagramNow.current?.spec.id ?? "canvas")}.png`);
      toast.success(how === "copied" ? "Canvas copied as a PNG" : "Canvas saved as a PNG");
    } catch {
      toast.error("Couldn't copy the canvas");
    }
  }, []);
  const exportSvg = useCallback(() => {
    const flow = document.querySelector<HTMLElement>(".react-flow");
    if (!flow) return;
    try {
      downloadSvg(canvasToSvg(flow, canvasTitle), svgFileName(canvasTitle));
      toast.success("Canvas saved as an SVG");
    } catch {
      toast.error("Couldn't export the canvas");
    }
  }, [canvasTitle]);
  // Every config change redraws the canvas; a new diagram or a new grid fits the view again.
  const lastGrid = useRef<string | null>(null);
  useEffect(() => {
    if (!diagram) return;
    const fit = fitNext.current || lastGrid.current !== diagram.config.grid;
    fitNext.current = false;
    lastGrid.current = diagram.config.grid;
    drawDiagram(diagram.spec, diagram.config, fit);
  }, [diagram, drawDiagram]);
  const railDiagrams = useMemo(() => LIBRARY.map((s) => ({
    id: s.id, title: s.title, kind: s.kind, subtype: s.subtype, href: `/graph?diagram=${s.id}`, onSelect: () => loadDiagram(s.id),
  })), [loadDiagram]);

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
  // The rail's New canvas (brief 49): what the empty dataset does, and it also leaves a diagram or a loaded view.
  const newCanvas = useCallback(() => {
    snapshot();
    setDiagram(null);
    store.current = new Map();
    expandState.current = new Map();
    setEdges([]);
    setNodes([]);
    setSelectedKey(null);
    setEdgeInfo(null);
    setLoadedView(null);
  }, [setEdges, setNodes, snapshot]);

  useEffect(() => {
    if (!selectedKey) { setDetail(null); return; }
    const g = store.current.get(selectedKey);
    if (!g || g.type === "prompt" || g.type === "file" || g.type === "more" || g.type === "dataset" || g.type === "material" || g.type === "level") { setDetail(null); return; }
    setDetail(null);
    fetch(`/api/graph?op=node&type=${g.type}&id=${encodeURIComponent(g.id)}`)
      .then((r) => r.json())
      .then(setDetail)
      .catch(() => setDetail({ error: true }));
  }, [selectedKey]);

  // A pick in the header's search centres here, in place (brief 36).
  useEffect(() => {
    const on = (e: Event) => center((e as CustomEvent<GNode>).detail);
    window.addEventListener(GRAPH_CENTER, on);
    return () => window.removeEventListener(GRAPH_CENTER, on);
  }, [center]);

  /** A saved view or recipe replaces the canvas — nothing on /graph navigates away. */
  const loadView = useCallback((viewId: number | string) => {
    fetch(`/api/community?tab=view&id=${viewId}`)
      .then((r) => r.json())
      .then(({ view }) => {
        const state = view.state as { nodes: (GNode & { x: number; y: number })[]; edges: { s: string; t: string; k?: string; cos?: number }[]; diagram?: string; center?: GNode };
        // A view of a library diagram opens it; a view of a node centres it and expands it once (brief 30's seeds).
        if (state.diagram) { loadDiagram(state.diagram).then(() => setLoadedView(view.name)); toast.success(`Loaded: ${view.name}`); return; }
        if (state.center) { center(state.center); setLoadedView(view.name); toast.success(`Loaded: ${view.name}`); return; }
        snapshot();
        setDiagram(null);
        store.current = new Map(state.nodes.map((n) => [keyOf(n), n]));
        expandState.current = new Map();
        setSelectedKey(null);
        setEdgeInfo(null);
        setNodes(state.nodes.map((n) => ({ id: keyOf(n), type: "entity", position: { x: n.x, y: n.y }, data: { ...n } })));
        setEdges(state.edges.map((e) => e.k === "similar"
          ? { id: `${e.s}->${e.t}`, source: e.s, target: e.t, data: { kind: "similar", cos: e.cos } as EdgeMeta, label: e.cos != null ? `${e.cos.toFixed(2)} cos` : undefined }
          : { id: `${e.s}->${e.t}`, source: e.s, target: e.t }));
        toast.success(`Loaded: ${view.name}`);
        setDiagram(null);
        setLoadedView(view.name);
        setTimeout(() => {
          const onLoad = loadFit.current;
          loadFit.current = false;
          fitView(onLoad ? undefined : { padding: 0.15, duration: 400 });
        }, 60);
      })
      .catch(() => toast.error("View not found"));
  }, [setNodes, setEdges, fitView, snapshot, loadDiagram, center]);

  const bootSelection = useRef(false);
  const booted = useRef(false);
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    const viewId = params.get("view");
    const c = params.get("center");
    // ?diagram=<id> opens a library diagram; the earlier ?chain= and ?demo= links open their spec
    const diagramId = params.get("diagram") ?? OLD_LINKS[params.get("chain") ?? ""] ?? OLD_LINKS[params.get("demo") ?? ""];
    if (viewId) {
      loadView(viewId);
    } else if (diagramId && LIBRARY.some((s) => s.id === diagramId)) {
      loadDiagram(diagramId);
    } else if (c?.includes(":")) {
      const [type, ...rest] = c.split(":");
      const id = rest.join(":");
      bootSelection.current = true;
      if (type === "dataset" || type === "material") centerRecord({ type, id, label: id });
      else center({ type: type as GNode["type"], id, label: params.get("label") ?? id });
    } else {
      // The default load (Brendan, 2026-11-09): the library's "Mass 201 to 210, s and r" diagram.
      loadDiagram("mass-201-210");
    }
    // A right panel row's link (/graph?panel=config) opens the panel on that view.
    const panel = RIGHT_VIEWS.find((v) => v.key === params.get("panel"));
    if (panel) { setRightView(panel.key); setRail("right", false); }
    // the boot itself is not an undo step
    past.current = [];
  }, [params, center, centerRecord, loadView, loadDiagram]);

  // A /graph?diagram=<id> link followed later (a row opened by its link, the browser's back) opens that diagram.
  const urlDiagram = params.get("diagram");
  const seenDiagram = useRef(urlDiagram);
  useEffect(() => {
    if (!urlDiagram || urlDiagram === seenDiagram.current) return;
    seenDiagram.current = urlDiagram;
    if (LIBRARY.some((s) => s.id === urlDiagram)) loadDiagram(urlDiagram);
  }, [urlDiagram, loadDiagram]);

  // Selecting a node or an edge, or opening a run's trace, drills into the papers; selecting nothing returns to the
  // menu. The node the load centres (137Cs) is selected by the boot, not the reader, so the menu stays.
  const subject = selectedKey ?? (edgeInfo ? `${keyOf(edgeInfo.source)}->${keyOf(edgeInfo.target)}` : traceOpen ? `run:${traceOpen}` : null);
  const lastSubject = useRef<string | null>(null);
  useEffect(() => {
    if (subject === lastSubject.current) return;
    lastSubject.current = subject;
    if (bootSelection.current) { bootSelection.current = false; return; }
    setRightView(subject ? "papers" : "menu");
  }, [subject]);

  const saveView = async () => {
    if (!viewName.trim()) return;
    const state = {
      nodes: nodes.map((n) => {
        const g = n.data as unknown as GNode;
        return {
          type: g.type, id: g.id, label: g.label, sub: g.sub, title: g.title,
          prompt: g.prompt, output: g.output ? g.output.slice(0, 2000) : undefined,
          chat: g.chat?.slice(-10).map((m) => ({ role: m.role, content: m.content.slice(0, 2000) })),
          fileKey: g.fileKey, fileText: g.fileText,
          x: n.position.x, y: n.position.y,
        };
      }),
      edges: edges.map((e) => ({ s: e.source, t: e.target, ...(isSimilar(e) ? { k: "similar", cos: (e.data as EdgeMeta).cos } : {}) })),
    };
    const res = await fetch("/api/community", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // the server stamps the save with the signed-in reader's name (brief 34)
      body: JSON.stringify({ name: viewName, state }),
    });
    if (res.ok) {
      toast.success(state.nodes.some((n) => n.type === "prompt") ? "Recipe saved to Community" : "View saved to Community");
      setSaveOpen(false);
      setViewName("");
      queryClient.invalidateQueries({ queryKey: ["community-views"] });
    } else {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(body.error ?? `Save failed (${res.status})`);
    }
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

  // The right inset panel's papers: the selected node's record or a step's output, else the selected edge's receipt,
  // else a run's trace. The panel's header and lists take the left panel's type and spacing (InsetPanel.tsx INSET).
  // Its back arrow lets go of what it shows and returns to the menu.
  const backToMenu = () => { setSelectedKey(null); setEdgeInfo(null); setTraceOpen(null); setRightView("menu"); };
  const traceRun = traceOpen ? runs.find((r) => r.id === traceOpen) : undefined;
  let papersView: ReactNode;
  if (sel) {
    const type = sel.type;
    papersView = (
      <>
        <RightViewHeader onBack={backToMenu}>
          <Badge variant="secondary" className="shrink-0 text-[10px]">{sel.type === "prompt" ? "step output" : sel.type}</Badge>
          {sel.type !== "prompt" && (
            <h2
              draggable
              onDragStart={(e) => setDragEntity(e.dataTransfer, sel)}
              className="min-w-0 cursor-grab truncate font-mono text-sm font-semibold text-nuclear"
              title="drag into the chat to attach as context"
            >
              {sel.label}
            </h2>
          )}
        </RightViewHeader>
        {(type === "dataset" || type === "material" || type === "level") && (
          <InsetBody className="px-3 pt-3">
            <RecordDetail node={sel} rec={records.current.get(selectedKey ?? "")} />
          </InsetBody>
        )}
        {type !== "prompt" && type !== "file" && type !== "more" && type !== "dataset" && type !== "material" && type !== "level" && (
          <InsetBody className="px-3 pt-3">
            {!detail && <p className="text-xs text-[var(--paper-muted)]">Loading…</p>}
            {detail && !detail.error && (
              <DetailBody type={type} detail={detail} navigate={navigate} onCanvas={(g) => expand(g as GNode, "papers")} />
            )}
          </InsetBody>
        )}
        {sel.type === "prompt" && sel.output && selectedKey && (
          <StepChat key={selectedKey} prompt={sel.prompt ?? ""} output={sel.output} chat={sel.chat ?? []} onChat={(chat) => patchNode(selectedKey, { chat })} />
        )}
      </>
    );
  } else if (edgeInfo) {
    const r = edgeReceipt(edgeInfo.source, edgeInfo.target, edgeInfo.meta);
    papersView = (
      <>
        <RightViewHeader onBack={backToMenu}>
          <Badge variant={edgeInfo.meta?.kind === "similar" ? "outline" : "secondary"} className="shrink-0 text-[10px]">
            {edgeInfo.meta?.kind === "similar" ? "inference" : "edge"}
          </Badge>
          <h2 className={INSET.title}>Edge information</h2>
        </RightViewHeader>
        <InsetBody>
          <div className="pt-1.5">
            {([["Source", edgeInfo.source], ["Target", edgeInfo.target]] as const).map(([role, g]) => (
              <div key={role} className={cn(INSET.row, "justify-between")}>
                <span>{role}</span>
                <button onClick={() => setSelectedKey(keyOf(g))} className="truncate font-mono text-xs font-medium text-nuclear hover:underline" title={`open ${g.label}`}>
                  {g.label}
                </button>
              </div>
            ))}
          </div>
          <div className="px-3 pt-3">
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
        </InsetBody>
      </>
    );
  } else if (traceRun) {
    const dur = (traceRun.finishedAt ?? Date.now()) - traceRun.startedAt;
    const step = traceStep != null ? traceRun.steps[traceStep] : null;
    papersView = (
      <>
        <RightViewHeader onBack={backToMenu}>
          <Badge variant="secondary" className="shrink-0 text-[10px]">run</Badge>
          {runs.length > 1 && (
            <select
              value={traceOpen ?? ""}
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
        </RightViewHeader>
        <InsetBody>
          <div className="px-3 pt-3">
            <h2 className={INSET.title}>{traceRun.label}</h2>
            <p className="mt-0.5 text-[10px] text-[var(--paper-muted)]">
              {new Date(traceRun.startedAt).toLocaleString()} · {traceRun.finishedAt ? `${(dur / 1000).toFixed(1)}s total` : "running…"}
            </p>
          </div>
          <div className="mt-2">
            {traceRun.steps.map((s, i) => (
              <button
                key={`${s.key}-${i}`}
                onClick={() => setTraceStep(traceStep === i ? null : i)}
                className={cn(INSET.row, traceStep === i && "bg-[var(--paper-quiet)]")}
              >
                {s.status === "running"
                  ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[var(--paper-muted)]" />
                  : s.status === "done"
                    ? <Check className="h-3.5 w-3.5 shrink-0 text-nuclear" />
                    : <X className="h-3.5 w-3.5 shrink-0 text-red-500" />}
                <span className="truncate">{s.prompt || "(empty prompt)"}</span>
                {s.ms != null && <span className={INSET.count}>{(s.ms / 1000).toFixed(1)}s</span>}
              </button>
            ))}
            {traceRun.steps.length === 0 && <p className={INSET.note}>No steps recorded.</p>}
          </div>
          {step && (
            <div className="mx-3 mt-3 space-y-3 border-t pt-3">
              {step.error && <p className="text-xs text-red-500">{step.error}</p>}
              <div>
                <p className="mb-1 text-[10px] uppercase tracking-wide text-[var(--paper-muted)]">Input · assembled context</p>
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md border bg-[var(--paper-quiet)] p-2 text-[10px] leading-snug text-[var(--paper-muted)]">
                  {step.input || "(no wired context — the prompt ran bare)"}
                </pre>
              </div>
              <div>
                <p className="mb-1 text-[10px] uppercase tracking-wide text-[var(--paper-muted)]">Output · {(step.output?.length ?? 0).toLocaleString()} chars</p>
                <div className="max-h-64 overflow-auto rounded-md border bg-[var(--paper-quiet)] p-2">
                  {step.output ? (
                    <Suspense fallback={<p className="whitespace-pre-wrap text-[10px] leading-snug text-[var(--paper-text)]">{step.output}</p>}>
                      <ChatMarkdown content={step.output} size="xs" />
                    </Suspense>
                  ) : (
                    <p className="text-[10px] text-[var(--paper-muted)]">(no output)</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </InsetBody>
      </>
    );
  } else {
    papersView = (
      <>
        <RightViewHeader onBack={backToMenu}>
          <h2 className={INSET.title}>Papers</h2>
        </RightViewHeader>
        <p className={INSET.note}>Select a node or an edge on the canvas.</p>
      </>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      {/* The catalog in the left inset panel (LeftInsetPanel.tsx): open or closed is <html data-rail-left>, the same memory as
          /docs, closed on load (GraphPage below). */}
      <LeftInsetPanel>
          <CatalogRail
            onPick={center}
            onAdd={(g) => { if (store.current.has(keyOf(g))) toast.info(`${g.label} is already on the canvas`); else { addNodes([g]); if (g.type === "paper") fetchCards([keyOf(g)]); } }}
            onAsk={(g) => { setAttached(g); setDockOpen(true); }}
            onLoadView={loadView}
            onNewCanvas={newCanvas}
            onAddFile={(f) => addNodes([{
              type: "file", id: f.key, label: f.name,
              sub: `${(f.size / 1024).toFixed(0)} kB`, fileKey: f.key,
            }], undefined)}
            railDiagrams={railDiagrams}
            initialBrowse={params.get("browse")}
            navigate={navigate}
          />
      </LeftInsetPanel>
      <div className="relative min-w-0 flex-1" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onConnect={onConnect}
          onNodeClick={(_, n) => { if (n.id.startsWith("diagram:")) return; setSelectedKey(n.id); setEdgeInfo(null); setRightView("papers"); }}
          onEdgeClick={(_, e) => {
            const s = store.current.get(e.source), t = store.current.get(e.target);
            if (s && t) { setEdgeInfo({ source: s, target: t, meta: e.data as EdgeMeta | undefined }); setSelectedKey(null); setRightView("papers"); }
          }}
          onPaneClick={() => { setSelectedKey(null); setEdgeInfo(null); setRightView("menu"); }}
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
          {/* The tools (Brendan, 2026-11-08): at rest two circles, the plus that opens them and Config, which never moves;
              open, between them: a plain plus (a prompt node), Prompt, Run, Save, Reset, and Back and Forward once the
              diagram has a change to step through. The fold takes 500 ms; the plus turns into a cross while open. */}
          {/* The corpus search, back on the canvas (Brendan, 2026-11-09): top left, in line with the tools opposite. */}
          <Panel position="top-left">
            <EntitySearch />
          </Panel>
          <Panel position="top-right">
            <div className="flex items-center rounded-full border bg-[var(--paper)] p-1 shadow-sm backdrop-blur-sm">
              <Button variant="outline" aria-label={toolsOpen ? "Hide the tools" : "Show the tools"} aria-expanded={toolsOpen} className="h-8 w-8 shrink-0 rounded-full p-0" onClick={() => setToolsOpen((v) => !v)}>
                <Plus className={`h-4 w-4 transition-transform duration-[500ms] ease-in-out ${toolsOpen ? "rotate-45" : ""}`} />
              </Button>
              <div className={`flex items-center gap-1.5 overflow-hidden transition-[max-width,opacity,margin] duration-[500ms] ease-in-out ${toolsOpen ? "ml-1.5 max-w-[720px] opacity-100" : "ml-0 max-w-0 opacity-0"}`}>
              <Button variant="outline" aria-label="Add a prompt node" title="Add a prompt node" className="h-8 w-8 shrink-0 rounded-full p-0" onClick={() => addPromptNode()}>
                <Plus className="h-4 w-4" />
              </Button>
              <Button variant="outline" className="h-8 shrink-0 whitespace-nowrap rounded-full px-3.5 text-[13px]" onClick={() => addPromptNode()}>
                Prompt
              </Button>
              <Button variant="outline" className="h-8 shrink-0 whitespace-nowrap rounded-full px-3.5 text-[13px]" onClick={runChain} disabled={!hasPrompts || !!running}>
                {running ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1.5 h-3.5 w-3.5" />} Run
              </Button>
              <Button variant="outline" className="h-8 shrink-0 whitespace-nowrap rounded-full px-3.5 text-[13px]" onClick={() => setSaveOpen(true)}>
                <Save className="mr-1.5 h-3.5 w-3.5" /> Save
              </Button>
              {runs.length > 0 && (
                <Button
                  variant="outline"
                  className="h-8 w-8 shrink-0 rounded-full p-0"
                  title="Run history"
                  onClick={() => { setTraceOpen(runs[0].id); setTraceStep(null); setSelectedKey(null); setEdgeInfo(null); setRail("right", false); }}
                >
                  <History className="h-4 w-4" />
                </Button>
              )}
              <Button variant="outline" className="h-8 shrink-0 whitespace-nowrap rounded-full px-3.5 text-[13px]" onClick={resetDiagram} disabled={!diagram} title="The diagram as the page loaded it">
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset
              </Button>
              {(configHistory.current.past.length > 0 || configHistory.current.future.length > 0) && (
                <>
                  <Button variant="outline" aria-label="Back" title="Back" className="h-8 w-8 shrink-0 rounded-full p-0" onClick={() => stepDiagram(true)} disabled={!configHistory.current.past.length}>
                    <Undo2 className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" aria-label="Forward" title="Forward" className="h-8 w-8 shrink-0 rounded-full p-0" onClick={() => stepDiagram(false)} disabled={!configHistory.current.future.length}>
                    <Redo2 className="h-4 w-4" />
                  </Button>
                </>
              )}
              </div>
              {/* The right inset panel's Config view: opens the panel on it, or closes the panel when it already shows it. */}
              <Button
                variant="outline"
                className={`ml-1.5 h-8 w-8 shrink-0 rounded-full p-0 ${rightView === "config" && !rightClosed ? "bg-[var(--paper-quiet)]" : ""}`}
                title="Config"
                onClick={() => {
                  if (rightView === "config" && !rightClosed) setRail("right", true);
                  else { setRightView("config"); setRail("right", false); }
                }}
              >
                <Settings2 className="h-4 w-4" />
              </Button>
            </div>
          </Panel>
          <Background gap={24} size={1} />
          <Controls showInteractive={false} />
        </ReactFlow>
        <ChatDock context={canvasContext} open={dockOpen} onOpenChange={setDockOpen} attached={attached} onAttach={setAttached} launcher={false} />
        {!dockOpen && (
          <div className="absolute bottom-4 right-4 z-10 flex max-w-[calc(100%-6rem)] items-center gap-1.5 rounded-full border bg-[var(--paper)] p-1 pl-3.5 shadow-sm backdrop-blur-sm">
            <span className="min-w-0 truncate text-[13px] text-[var(--paper-text)]">{canvasTitle}</span>
            <Button variant="outline" aria-label="Share" className="h-8 w-8 shrink-0 rounded-full p-0" onClick={shareDiagram} disabled={!diagram} title={diagram ? `/graph?diagram=${diagram.spec.id}` : undefined}>
              <Share2 className="h-4 w-4" />
            </Button>
            <Button variant="outline" aria-label="Export the canvas as SVG" title="Export SVG" className="h-8 w-8 shrink-0 rounded-full p-0" onClick={exportSvg}>
              <Download className="h-4 w-4" />
            </Button>
            <Button variant="outline" aria-label="Copy the canvas" title="Copy" className="h-8 w-8 shrink-0 rounded-full p-0" onClick={copyCanvas}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        )}
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
              <Button className="w-full" onClick={saveView} disabled={!viewName.trim()}>Save</Button>
            </div>
          </DialogPopup>
        </Dialog>
      </div>

      <RightInsetPanel
        view={rightView}
        onView={setRightView}
        papers={papersView}
        config={
          <FlowSettingsPanel
            value={flowProps}
            onChange={setFlowProps}
            dataset={dataset}
            onDataset={applyDataset}
            datasets={DATASETS.map(({ id, label }) => ({ id, label }))}
            layoutMode={layoutMode}
            onLayoutMode={changeLayoutMode}
            onBack={() => setRightView("menu")}
            onReset={() => setFlowProps(DEFAULT_FLOW_PROPS)}
            diagram={diagram}
            setDiagramConfig={setDiagramConfig}
          />
        }
        features={
          <>
            <RightViewHeader onBack={() => setRightView("menu")}>
              <h2 className={INSET.title}>Graph Features</h2>
            </RightViewHeader>
            <InsetBody>
              <ol className="pt-1.5">
                {IDEAS.map((i, n) => (
                  <li key={i.title} className="flex gap-2 px-3 py-1.5 transition-colors hover:bg-[var(--paper-quiet)]">
                    <span className="w-5 shrink-0 pt-0.5 font-mono text-xs text-[var(--paper-muted)]">{n + 1}</span>
                    <span className="min-w-0">
                      {i.href
                        ? <a href={i.href} target="_blank" rel="noreferrer" className="text-sm text-nuclear hover:underline">{i.title}</a>
                        : <span className="block text-sm text-[var(--paper-text)]">
                            {i.title}
                            {i.soon && <span className="ml-1.5 rounded-full border border-[var(--paper-rule)] px-1.5 py-px align-middle text-[10px] text-[var(--paper-muted)]">soon</span>}
                          </span>}
                      {i.text && <span className="mt-0.5 block text-xs leading-relaxed text-[var(--paper-muted)]">{i.text}</span>}
                    </span>
                  </li>
                ))}
              </ol>
            </InsetBody>
          </>
        }
      />
    </div>
  );
}

/** A dataset's or material's record in the Papers view (brief 33): its header, then Text, Markdown and PDF (the dataset
 *  page's print, opened with ?print=1) and its page. A level shows its line. */
function RecordDetail({ node, rec }: { node: GNode; rec?: { view?: RecordView; error?: unknown } }) {
  const page = recordOfNode(node.type, node.id);
  if (node.type === "level") return <p className="text-xs text-[var(--paper-text)]">{node.label}{node.sub ? ` · ${node.sub}` : ""}</p>;
  if (!page) return null;
  const def = SOURCES[page.source];
  const save = async (path: string, ext: string, type: string) => {
    try {
      const body = ext === "txt" && rec?.view?.text ? rec.view.text : await apiText(path);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([body], { type }));
      a.download = `${fileBase(page.source, page.id)}.${ext}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch (e) {
      const err = e as { status?: number; path?: string; detail?: string; message?: string };
      toast.error(err.path ? `The API answered ${err.status || "nothing"} for ${err.path}. ${err.detail}` : String(err.message));
    }
  };
  const link = "text-xs text-nuclear hover:underline";
  return (
    <div className="space-y-3">
      {rec?.view && <p className="text-sm font-medium leading-snug text-[var(--paper-text)]">{rec.view.title}</p>}
      {rec?.view && (
        <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs">
          {rec.view.header.slice(0, 10).map((h) => (
            <Fragment key={h.label}>
              <dt className="text-[var(--paper-muted)]">{h.label}</dt>
              <dd className="min-w-0 break-words text-[var(--paper-text)]">{String(h.value ?? "")}</dd>
            </Fragment>
          ))}
        </dl>
      )}
      {!rec && <p className="text-xs text-[var(--paper-muted)]">Loading…</p>}
      {rec?.error ? (
        <p className="break-words font-mono text-[11px] text-[var(--paper-muted)]">
          {(() => { const e = rec.error as { status?: number; path?: string; detail?: string; message?: string }; return e.path ? `The API answered ${e.status || "nothing"} for GET ${e.path}: ${e.detail}` : String(e.message); })()}
        </p>
      ) : null}
      <p className="flex flex-wrap gap-x-3 gap-y-1">
        <button type="button" className={link} onClick={() => save(def.textPath(page.id, {}), "txt", "text/plain;charset=utf-8")}>Text</button>
        <button type="button" className={link} onClick={() => save(def.mdPath(page.id, {}), "md", "text/markdown;charset=utf-8")}>Markdown</button>
        <a className={link} href={def.pdfPath ? apiUrl(def.pdfPath(page.id, {})) : `${page.href}?print=1`} target="_blank" rel="noreferrer">PDF</a>
        <a className={link} href={page.href}>{def.label} page</a>
      </p>
    </div>
  );
}

// The query cache is the app's one (components/DataProvider.tsx, 2026-11-08).
export function GraphPage() {
  // Both inset panels closed on load (Brendan, 2026-11-08), without changing what this browser remembers for /docs; a
  // right panel row's link (/graph?panel=config) leaves the right one to open on its view (GraphPageInner's boot).
  const panel = useSearchParams().get("panel");
  const panelLink = RIGHT_VIEWS.some((v) => v.key === panel);
  useRailsClosedWhileMounted(panelLink ? ["left"] : ["left", "right"]);
  return (
    <ReactFlowProvider>
      <GraphPageInner />
    </ReactFlowProvider>
  );
}
