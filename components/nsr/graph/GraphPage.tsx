"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ReactFlow, ReactFlowProvider, Background, Controls, Panel, Handle, Position,
  useNodesState, useEdgesState, useReactFlow, addEdge,
  SelectionMode, ConnectionMode, ConnectionLineType, PanOnScrollMode, MarkerType,
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
import { setRail, useRailClosed, useRailsClosedWhileMounted } from "@/components/rail-toggle";
import { INSET, InsetBody, InsetTip } from "@/components/nsr/graph/InsetPanel";
import { LeftInsetPanel } from "@/components/nsr/graph/LeftInsetPanel";
import { RightInsetPanel, type RightView } from "@/components/nsr/graph/RightInsetPanel";
import { cn } from "@/lib/utils";
import { decayIndex, halfLifeText, loadDecay, seriesFrom, FAMILY, familyOf, familyOfMode, isDark, type Family } from "@/lib/viz-physics";
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
  /** Nuclide cards on a chart grid (decay chains, capture paths): proton and neutron numbers; levels: energy in keV. */
  z?: number;
  n?: number;
  e?: number;
  /** The nuclide's decay family (lib/nuclide.ts FAMILY): the card wears its colour, as every chart does. */
  family?: Family;
  /** Figure-faithful drawings (Brendan, 2026-11-08): "glyph" is the actinide build-up's bare "238 U" with its fission share;
   *  "bubble" the decay-series circle with A, Z, symbol and half-life. `pos` is the figure's own column and row. */
  style?: "glyph" | "bubble";
  cls?: "fissile" | "fertile" | "less" | "short";
  fission?: number;
  hl?: string;
  pos?: [number, number];
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
type EdgeMeta = { kind?: "similar" | "wired" | "decay" | "reaction" | "sample"; cos?: number; mode?: string; pct?: number | null } & Record<string, unknown>;
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
// The actinide build-up figure's classes (Sasahara): fissile dark red, fertile blue, less fertile grey, short-lived light grey;
// its arrows: capture blue, α magenta, β and EC green.
const GLYPH_COLOR: Record<"fissile" | "fertile" | "less" | "short", string> = { fissile: "#a0352c", fertile: "#1f4fd6", less: "#6b6b6b", short: "#aaaaaa" };
const ARROW_COLOR = { capture: "#1f4fd6", alpha: "#e22bd0", beta: "#1b8c3a" } as const;
/** The decay-series figure's bubble fills by the element's class (periodic-table colours). */
function bubbleFill(z: number): string {
  if (z >= 89 && z <= 103) return "#bcd8ff"; // actinides
  if (z === 87 || z === 55 || z === 37 || z === 19 || z === 11 || z === 3) return "#ffb3b3"; // alkali metals
  if (z === 88 || z === 56 || z === 38 || z === 20 || z === 12 || z === 4) return "#ffe0b8"; // alkaline earth metals
  if (z === 85 || z === 53 || z === 35 || z === 17 || z === 9) return "#ffff99"; // halogens
  if (z === 84 || z === 52 || z === 51 || z === 33 || z === 32 || z === 14 || z === 5) return "#d8dcae"; // metalloids
  if (z === 86 || z === 54 || z === 36 || z === 18 || z === 10 || z === 2) return "#c8f8ff"; // noble gases
  if ((z >= 21 && z <= 30) || (z >= 39 && z <= 48) || (z >= 72 && z <= 80)) return "#ffd0d0"; // transition metals
  return "#dedede"; // post-transition metals and the rest
}

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
  if (d.style === "bubble") {
    // The decay-series bubble: A over Z at the left, the symbol large, the half-life beneath, filled in the element's class colour.
    const fill = bubbleFill(d.z ?? 0);
    const a = d.z !== undefined && d.n !== undefined ? d.z + d.n : "";
    const [hlValue, hlUnit] = (d.hl ?? "").split("|");
    return (
      <div className={`relative flex flex-col items-center justify-center rounded-full border border-[#333] text-[#16181d] ${accent ? "ring-2 ring-nuclear" : ""} ${dim}`} style={{ width: 112, height: 112, background: `radial-gradient(circle at 35% 30%, #fff 0%, ${fill} 70%)` }} title={d.sub}>
        {sides}
        <p className="flex items-center leading-none">
          <span className="mr-0.5 flex flex-col items-end font-mono text-[11px] leading-[1.05]"><span>{a}</span><span>{d.z}</span></span>
          <span className="text-3xl font-bold tracking-tight">{d.label.replace(/^\d+m?/, "")}</span>
        </p>
        <p className="mt-0.5 font-mono text-[11px] leading-tight">{hlValue}</p>
        {hlUnit && <p className="text-[11px] leading-tight">{hlUnit}</p>}
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

function CatalogRail({ onPick, onAdd, onAsk, onAddFile, onLoadView, onLoadChain, onLoadDemo, navigate }: {
  onPick: (g: GNode) => void;
  onAdd: (g: GNode) => void;
  onAsk: (g: GNode) => void;
  onAddFile: (f: LibFile) => void;
  onLoadView: (id: number) => void;
  onLoadChain: (id: string) => void;
  onLoadDemo: (id: string) => void;
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
          <p className="mt-1 text-[10px] text-[var(--paper-muted)]">
            {wantRecipes ? "Saved canvases with prompt steps — click to load, then Run." : "Saved canvases, exactly as arranged. Click to load onto this one."}
          </p>
        </div>
        <InsetBody>
          {views.isLoading && <p className="p-3 text-xs text-[var(--paper-muted)]">Loading…</p>}
          {views.data && items.length === 0 && (
            <p className="p-3 text-xs text-[var(--paper-muted)]">
              {wantRecipes ? "No recipes yet — add a Prompt step and hit Save." : "No saved views yet — arrange a canvas and hit Save."}
            </p>
          )}
          {items.map((v) => (
            <InsetTip key={v.id} name={v.name} text="Loads onto the canvas." side="left">
            <button
              onClick={() => onLoadView(v.id)}
              className="flex w-full flex-col gap-0.5 border-b border-[var(--paper-rule-soft)] px-3 py-2 text-left transition-colors hover:bg-[var(--paper-quiet)]"
            >
              <span className="flex w-full items-baseline justify-between gap-2">
                <span className="truncate text-xs font-semibold text-[var(--paper-text)]">{v.name}</span>
                <span className="shrink-0 font-mono text-[10px] text-[var(--paper-muted)]">{v.state?.nodes?.length ?? 0} nodes</span>
              </span>
              <span className="text-[10px] text-[var(--paper-muted)]">{v.saved_by} · {String(v.created_at).slice(0, 10)}</span>
            </button>
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
          <p className="mt-1 text-[10px] text-[var(--paper-muted)]">Everything ever dropped on a canvas. Click to add to this one.</p>
        </div>
        <InsetBody>
          {files.isLoading && <p className="p-3 text-xs text-[var(--paper-muted)]">Loading…</p>}
          {files.data && items.length === 0 && (
            <p className="p-3 text-xs text-[var(--paper-muted)]">Nothing here yet — drop a file anywhere on the canvas.</p>
          )}
          {items.map((f) => (
            <InsetTip key={f.key} name={f.name} text="Adds to the canvas." side="left">
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
                <InsetTip name={it.label} text="Centres on the canvas. Drag onto the canvas or into the chat." side="left">
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

  // The main view. Its type, spacing and hover are the standard both inset panels share (InsetPanel.tsx INSET).
  const demoTip = (d: Demo) => (d.grid === "figure" ? "Drawn to its reference figure." : "Hand-typed sample values, in the shape the real data will take.");
  return (
    <InsetBody>
      <p className={cn(INSET.section, "pt-3")}>Corpus</p>
      {CATALOG_TYPES.map(({ key, label, icon: Icon }) => (
        <InsetTip key={key} name={key} text="Most studied first. The search bar covers the full corpus." side="left">
          <button onClick={() => setBrowse(key)} className={INSET.row}>
            <Icon className={INSET.icon} />
            <span>{label}</span>
            <span className={INSET.count}>{data ? data.counts[key]?.toLocaleString() : "…"}</span>
          </button>
        </InsetTip>
      ))}
      <p className={INSET.section}>Workspace</p>
      <InsetTip name="library" text="Everything ever dropped on a canvas. Click a file to add it to this one." side="left">
        <button onClick={() => setBrowse("files")} className={INSET.row}>
          <FileText className={INSET.icon} />
          <span>Library</span>
        </button>
      </InsetTip>
      {([["views", "Views", Layers, "Saved canvases, exactly as arranged. Click one to load it onto this one."], ["recipes", "Recipes", BookOpen, "Saved canvases with prompt steps. Click one to load it, then Run."]] as const).map(([key, label, Icon, tip]) => (
        <InsetTip key={key} name={key} text={tip} side="left">
          <button onClick={() => setBrowse(key)} className={INSET.row}>
            <Icon className={INSET.icon} />
            <span>{label}</span>
            {views.data && (
              <span className={INSET.count}>{views.data.views.filter((v) => isRecipe(v) === (key === "recipes")).length}</span>
            )}
          </button>
        </InsetTip>
      ))}
      <p className={INSET.section}>Datasets</p>
      {CATALOG_LINKS.map(({ key, label, icon: Icon, href }) => (
        <InsetTip key={key} name={href} text={`Opens the ${label} page.`} side="left">
          <button onClick={() => navigate(href)} className={INSET.row}>
            <Icon className={INSET.icon} />
            <span>{label}</span>
            <span className={INSET.count}>{data ? data.counts[key]?.toLocaleString() : "…"}</span>
          </button>
        </InsetTip>
      ))}
      <p className={INSET.section}>Decay chains</p>
      {CHAINS.map((c) => (
        <InsetTip key={c.id} name={c.id} text="Loads the series onto a fresh canvas from ENSDF's decay modes." side="left">
          <button onClick={() => onLoadChain(c.id)} className={INSET.row}>
            <Atom className={INSET.icon} />
            <span>{c.label}</span>
          </button>
        </InsetTip>
      ))}
      {ALL_DEMOS.filter((d) => d.section === "Decay chains").map((d) => (
        <InsetTip key={d.id} name={d.id} text={demoTip(d)} side="left">
          <button onClick={() => onLoadDemo(d.id)} className={INSET.row}>
            <Atom className={INSET.icon} />
            <span>{d.label}</span>
          </button>
        </InsetTip>
      ))}
      {DEMO_SECTIONS.map((section) => (
        <div key={section}>
          <p className={INSET.section}>{section}</p>
          {ALL_DEMOS.filter((d) => d.section === section).map((d) => (
            <InsetTip key={d.id} name={d.id} text={demoTip(d)} side="left">
              <button onClick={() => onLoadDemo(d.id)} className={INSET.row}>
                <Atom className={INSET.icon} />
                <span>{d.label}</span>
              </button>
            </InsetTip>
          ))}
        </div>
      ))}
    </InsetBody>
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

/** The four decay series (Brendan, 2026-11-08): node = nuclide, edge = a decay mode with its branching, walked from
 *  the head through ENSDF's ground-state decay modes (decay.json, the Flow Map's data) down to stable lead or bismuth. */
const CHAINS: { id: string; label: string; head: readonly [number, number] }[] = [
  { id: "thorium", label: "Thorium series (4n)", head: [90, 142] },
  { id: "neptunium", label: "Neptunium series (4n+1)", head: [93, 144] },
  { id: "uranium", label: "Uranium series (4n+2)", head: [92, 146] },
  { id: "actinium", label: "Actinium series (4n+3)", head: [92, 143] },
];

/** Sample canvases for the design review (Brendan, 2026-11-08, 02:52): one or two per section, hand-typed values in the
 *  shape the real data will take. Real data replaces them section by section; the decay chains above are real already. */
/** The grids the reference figures use (Brendan, 2026-11-08): "ZA" is the decay-series drawing (columns Z, rows A down the page,
 *  α steps down-left, β− steps right); "NZ" the chart of nuclides (x N, y Z: (n,γ) right, β− up-left); "AZ" the actinide
 *  build-up (x A, y Z: capture right, β− up, α down-left); "levels" a level scheme (the parent top-left, levels a ladder by energy). */
type Grid = "ZA" | "NZ" | "AZ" | "levels" | "figure";
type DemoEdge = { s: string; t: string; label: string; kind: EdgeMeta["kind"]; curve?: boolean; arrow?: keyof typeof ARROW_COLOR | "ink" };
type Demo = { section: string; id: string; label: string; layout: "LR" | "TB"; grid?: Grid; cell?: [number, number]; nodes: GNode[]; edges: DemoEdge[] };
const ZS: Record<string, number> = { CO: 27, NI: 28, SR: 38, Y: 39, ZR: 40, NB: 41, MO: 42, TC: 43, RU: 44, AG: 47, CD: 48, IN: 49, SN: 50, SB: 51, TE: 52, I: 53, XE: 54, CS: 55, BA: 56, LA: 57, CE: 58, PR: 59, ND: 60, YB: 70, LU: 71, HF: 72, HG: 80, TL: 81, PB: 82, BI: 83, PO: 84, AT: 85, RN: 86, FR: 87, RA: 88, AC: 89, TH: 90, PA: 91, U: 92, NP: 93, PU: 94, AM: 95, CM: 96 };
/** "107AG" → Z 47, N 60; "137BAM" (an isomer) the same as 137BA; "60NI-2505" → Z 28, N 32, level 2505 keV. */
const nuc = (id: string, label: string, sub: string): GNode => {
  const m = /^(\d+)([A-Z]+?)(M)?(?:-(\d+))?$/.exec(id);
  const g: GNode = { type: "nuclide", id, label, sub };
  if (m && ZS[m[2]] !== undefined) { g.z = ZS[m[2]]; g.n = Number(m[1]) - g.z; }
  if (m && m[4] !== undefined) g.e = Number(m[4]);
  else if (m && /\s0 keV$/.test(label)) g.e = 0;
  return g;
};
/** A glyph of the actinide figure: "239Pu" at column c, row r, in a class, with its fission share. */
const glyph = (id: string, label: string, cls: GNode["cls"], c: number, r: number, fission?: number, sub = ""): GNode => ({ ...nuc(id, label, sub), style: "glyph", cls, fission, pos: [c, r] });
/** A bubble of the decay-series figure: half-life as "value|unit". */
const bubble = (id: string, label: string, hl: string, c: number, r: number): GNode => ({ ...nuc(id, label, hl.replace("|", " ")), style: "bubble", hl, pos: [c, r] });
const FIGURES: Demo[] = [
  { section: "Decay chains", id: "thorium-figure", label: "Thorium series, as the figure", layout: "TB", grid: "figure", cell: [210, 150],
    nodes: [bubble("232TH", "232Th", "1.41e+10|Years", 0, 0), bubble("228RA", "228Ra", "5.7|Years", 0, 2), bubble("228AC", "228Ac", "6.1|Hours", 1, 1), bubble("228TH", "228Th", "1.9|Years", 2, 0), bubble("224RA", "224Ra", "3.6|Days", 2, 2), bubble("220RN", "220Rn", "55|Seconds", 2, 4), bubble("216PO", "216Po", "0.14|Seconds", 2, 6), bubble("212PB", "212Pb", "10.6|Hours", 2, 8), bubble("212BI", "212Bi", "61|Minutes", 3, 7), bubble("212PO", "212Po", "3e-07|Seconds", 4, 6), bubble("208PB", "208Pb", "Stable|", 4, 8), bubble("208TL", "208Tl", "3.1|Minutes", 3, 9)],
    edges: [["232TH", "228RA", "α"], ["228RA", "228AC", "β−"], ["228AC", "228TH", "β−"], ["228TH", "224RA", "α"], ["224RA", "220RN", "α"], ["220RN", "216PO", "α"], ["216PO", "212PB", "α"], ["212PB", "212BI", "β−"], ["212BI", "212PO", "β−"], ["212PO", "208PB", "α"], ["212BI", "208TL", "α"], ["208TL", "208PB", "β−"]].map(([s, t, label]) => ({ s, t, label, kind: "decay" as const, arrow: "ink" as const })) },
  { section: "Actinide build-up", id: "sasahara-figure", label: "U-238 to Cm-245, as the figure", layout: "LR", grid: "figure", cell: [230, 170],
    nodes: [glyph("238U", "238U", "fertile", 0, 0), glyph("239PU", "239Pu", "fissile", 1, 0, 64), glyph("240PU", "240Pu", "fertile", 2, 0), glyph("238PU", "238Pu", "fertile", 0, 1, 9), glyph("241PU", "241Pu", "fissile", 1, 2, 72), glyph("242PU", "242Pu", "less", 2, 2), glyph("243PU", "243Pu", "short", 3, 2), glyph("241AM", "241Am", "less", 0, 3.6, 10), glyph("242AM", "242Am", "short", 1, 3.6), glyph("243AM", "243Am", "less", 2, 3.6, 1), glyph("244AM", "244Am", "short", 3, 3.6), glyph("242AMM", "242mAm", "fissile", 1.5, 4.4, 84), glyph("242CM", "242Cm", "short", 0, 5.4, 1), glyph("243CM", "243Cm", "fissile", 1, 5.4, 85), glyph("244CM", "244Cm", "fertile", 2, 5.4, 4), glyph("245CM", "245Cm", "fissile", 3, 5.4, 85)],
    edges: [
      { s: "238U", t: "239PU", label: "91%", kind: "reaction", arrow: "capture", curve: true }, { s: "239PU", t: "240PU", label: "36%", kind: "reaction", arrow: "capture" }, { s: "240PU", t: "241PU", label: "", kind: "reaction", arrow: "capture" }, { s: "241PU", t: "242PU", label: "25%", kind: "reaction", arrow: "capture" }, { s: "242PU", t: "243PU", label: "", kind: "reaction", arrow: "capture" },
      { s: "241PU", t: "241AM", label: "β 3%", kind: "decay", arrow: "beta" }, { s: "243PU", t: "243AM", label: "β", kind: "decay", arrow: "beta" },
      { s: "241AM", t: "242AM", label: "79%", kind: "reaction", arrow: "capture" }, { s: "241AM", t: "242AMM", label: "10%", kind: "reaction", arrow: "capture", curve: true }, { s: "242AM", t: "242CM", label: "β 81%", kind: "decay", arrow: "beta" }, { s: "242AM", t: "242PU", label: "EC 17%", kind: "decay", arrow: "beta" }, { s: "242AM", t: "243AM", label: "1%", kind: "reaction", arrow: "capture" }, { s: "242AMM", t: "243AM", label: "16%", kind: "reaction", arrow: "capture" }, { s: "243AM", t: "244AM", label: "99%", kind: "reaction", arrow: "capture" }, { s: "244AM", t: "244CM", label: "β", kind: "decay", arrow: "beta" },
      { s: "242CM", t: "238PU", label: "α 96%", kind: "decay", arrow: "alpha", curve: true }, { s: "243CM", t: "239PU", label: "α 2%", kind: "decay", arrow: "alpha", curve: true }, { s: "244CM", t: "240PU", label: "α 15%", kind: "decay", arrow: "alpha", curve: true },
      { s: "242CM", t: "243CM", label: "3%", kind: "reaction", arrow: "capture" }, { s: "243CM", t: "244CM", label: "13%", kind: "reaction", arrow: "capture" }, { s: "244CM", t: "245CM", label: "81%", kind: "reaction", arrow: "capture" },
    ] },
];
/** Positions for a grid; a node without the numbers it needs lands at the origin and the layout leaves it there. */
function gridPositions(nodes: GNode[], grid: Grid): Map<string, { x: number; y: number }> {
  const pos = new Map<string, { x: number; y: number }>();
  if (grid === "levels") {
    // The parent top-left; the daughter's levels a ladder on the right, the highest at the top, 0.25 px a keV.
    const maxE = Math.max(0, ...nodes.map((g) => g.e ?? 0));
    nodes.forEach((g, i) => pos.set(keyOf(g), g.e === undefined ? { x: 0, y: i * 100 } : { x: 480, y: (maxE - g.e) * 0.25 + 120 }));
    return pos;
  }
  // Columns and rows start at the smallest Z, N or A on the canvas, so the drawing sits at the origin and fits the view.
  const have = nodes.filter((g) => g.z !== undefined && g.n !== undefined) as (GNode & { z: number; n: number })[];
  const zs = have.map((g) => g.z), ns = have.map((g) => g.n), as = have.map((g) => g.z + g.n);
  const zMin = Math.min(...zs), zMax = Math.max(...zs), nMin = Math.min(...ns), aMin = Math.min(...as), aMax = Math.max(...as);
  for (const g of nodes) {
    if (g.z === undefined || g.n === undefined) { pos.set(keyOf(g), { x: 0, y: 0 }); continue; }
    const a = g.z + g.n;
    pos.set(keyOf(g), grid === "ZA" ? { x: (g.z - zMin) * 170, y: (aMax - a) * 40 } : grid === "NZ" ? { x: (g.n - nMin) * 165, y: (zMax - g.z) * 100 } : { x: (a - aMin) * 165, y: (zMax - g.z) * 100 });
  }
  return pos;
}
const DEMOS: Demo[] = [
  { section: "Decay chains", id: "pu241", label: "241Pu chain (sample)", layout: "TB", grid: "ZA",
    nodes: [nuc("241PU", "241Pu", "Z=94 N=147 · 14.3 y"), nuc("241AM", "241Am", "Z=95 N=146 · 432.6 y"), nuc("237NP", "237Np", "Z=93 N=144 · 2.1×10⁶ y"), nuc("233PA", "233Pa", "Z=91 N=142 · 27.0 d"), nuc("233U", "233U", "Z=92 N=141 · 1.6×10⁵ y"), nuc("229TH", "229Th", "Z=90 N=139 · 7,880 y"), nuc("225RA", "225Ra", "Z=88 N=137 · 14.9 d"), nuc("225AC", "225Ac", "Z=89 N=136 · 10.0 d"), nuc("221FR", "221Fr", "Z=87 N=134 · 4.8 min"), nuc("217AT", "217At", "Z=85 N=132 · 32 ms"), nuc("213BI", "213Bi", "Z=83 N=130 · 45.6 min"), nuc("213PO", "213Po", "Z=84 N=129 · 3.7 μs"), nuc("209TL", "209Tl", "Z=81 N=128 · 2.2 min"), nuc("209PB", "209Pb", "Z=82 N=127 · 3.25 h"), nuc("209BI", "209Bi", "Z=83 N=126 · 2.0×10¹⁹ y"), nuc("205TL", "205Tl", "Z=81 N=124 · stable")],
    edges: [["241PU", "241AM", "β− 99.998%"], ["241AM", "237NP", "α 100%"], ["237NP", "233PA", "α 100%"], ["233PA", "233U", "β− 100%"], ["233U", "229TH", "α 100%"], ["229TH", "225RA", "α 100%"], ["225RA", "225AC", "β− 100%"], ["225AC", "221FR", "α 100%"], ["221FR", "217AT", "α 100%"], ["217AT", "213BI", "α 99.99%"], ["213BI", "213PO", "β− 97.8%"], ["213BI", "209TL", "α 2.2%"], ["213PO", "209PB", "α 100%"], ["209TL", "209PB", "β− 100%"], ["209PB", "209BI", "β− 100%"], ["209BI", "205TL", "α 100%"]].map(([s, t, label]) => ({ s, t, label, kind: "decay" as const })) },
  { section: "Neutron capture paths", id: "s-ag-sb", label: "s-process, Ag to Sb (sample)", layout: "LR", grid: "NZ",
    nodes: [nuc("107AG", "107Ag", "Z=47 N=60 · stable"), nuc("108AG", "108Ag", "Z=47 N=61 · 2.4 min"), nuc("108CD", "108Cd", "Z=48 N=60 · stable"), nuc("109CD", "109Cd", "Z=48 N=61 · 462 d"), nuc("109AG", "109Ag", "Z=47 N=62 · stable"), nuc("110AG", "110Ag", "Z=47 N=63 · 24.6 s"), nuc("110CD", "110Cd", "Z=48 N=62 · stable"), nuc("111CD", "111Cd", "Z=48 N=63 · stable"), nuc("112CD", "112Cd", "Z=48 N=64 · stable"), nuc("113CD", "113Cd", "Z=48 N=65 · 8×10¹⁵ y"), nuc("114CD", "114Cd", "Z=48 N=66 · stable"), nuc("115CD", "115Cd", "Z=48 N=67 · 53.5 h"), nuc("115IN", "115In", "Z=49 N=66 · 4.4×10¹⁴ y"), nuc("116IN", "116In", "Z=49 N=67 · 14.1 s"), nuc("116SN", "116Sn", "Z=50 N=66 · stable"), nuc("120SN", "120Sn", "Z=50 N=70 · stable"), nuc("121SN", "121Sn", "Z=50 N=71 · 27.0 h"), nuc("121SB", "121Sb", "Z=51 N=70 · stable"), nuc("122SB", "122Sb", "Z=51 N=71 · 2.72 d"), nuc("122TE", "122Te", "Z=52 N=70 · stable")],
    edges: [["107AG", "108AG", "(n,γ) 38 b"], ["108AG", "108CD", "β− 97%"], ["108CD", "109CD", "(n,γ) 1.1 b"], ["109CD", "109AG", "EC 100%"], ["109AG", "110AG", "(n,γ) 91 b"], ["110AG", "110CD", "β− 99.7%"], ["110CD", "111CD", "(n,γ) 11 b"], ["111CD", "112CD", "(n,γ) 24 b"], ["112CD", "113CD", "(n,γ) 2.2 b"], ["113CD", "114CD", "(n,γ) 20,600 b"], ["114CD", "115CD", "(n,γ) 0.3 b"], ["115CD", "115IN", "β− 100%"], ["115IN", "116IN", "(n,γ) 202 b"], ["116IN", "116SN", "β− 99.98%"], ["116SN", "120SN", "(n,γ) × 4"], ["120SN", "121SN", "(n,γ) 0.14 b"], ["121SN", "121SB", "β− 100%"], ["121SB", "122SB", "(n,γ) 5.8 b"], ["122SB", "122TE", "β− 97.6%"]].map(([s, t, label]) => ({ s, t, label, kind: label.startsWith("(") ? "reaction" as const : "decay" as const })) },
  { section: "Neutron capture paths", id: "mass-201-210", label: "Mass 201 to 210, s and r (sample)", layout: "LR", grid: "NZ",
    nodes: [nuc("201HG", "201Hg", "Z=80 N=121 · stable"), nuc("202HG", "202Hg", "Z=80 N=122 · stable"), nuc("203HG", "203Hg", "Z=80 N=123 · 46.6 d"), nuc("203TL", "203Tl", "Z=81 N=122 · stable"), nuc("204TL", "204Tl", "Z=81 N=123 · 3.78 y"), nuc("204PB", "204Pb", "Z=82 N=122 · stable"), nuc("205TL", "205Tl", "Z=81 N=124 · stable"), nuc("205PB", "205Pb", "Z=82 N=123 · 1.7×10⁷ y"), nuc("206PB", "206Pb", "Z=82 N=124 · stable"), nuc("207PB", "207Pb", "Z=82 N=125 · stable"), nuc("208PB", "208Pb", "Z=82 N=126 · stable"), nuc("209PB", "209Pb", "Z=82 N=127 · 3.25 h"), nuc("209BI", "209Bi", "Z=83 N=126 · 2×10¹⁹ y"), nuc("210BI", "210Bi", "Z=83 N=127 · 5.01 d"), nuc("210PO", "210Po", "Z=84 N=126 · 138 d")],
    edges: [["201HG", "202HG", "(n,γ)"], ["202HG", "203HG", "(n,γ)"], ["203HG", "203TL", "β− 100%"], ["203TL", "204TL", "(n,γ)"], ["204TL", "204PB", "β− 97%"], ["204PB", "205PB", "(n,γ)"], ["205PB", "205TL", "EC 100%"], ["205TL", "206PB", "r-process β−"], ["206PB", "207PB", "(n,γ)"], ["207PB", "208PB", "(n,γ)"], ["208PB", "209PB", "(n,γ)"], ["209PB", "209BI", "β− 100%"], ["209BI", "210BI", "(n,γ)"], ["210BI", "210PO", "β− 100%"], ["210PO", "206PB", "α 100%"]].map(([s, t, label]) => ({ s, t, label, kind: label.startsWith("(") ? "reaction" as const : label.startsWith("r-") ? "sample" as const : "decay" as const })) },
  { section: "Actinide build-up", id: "sasahara", label: "U-238 to Cm-244 in a reactor (sample)", layout: "LR", grid: "AZ",
    nodes: [nuc("235U", "235U", "Z=92 N=143 · 7.0×10⁸ y"), nuc("236U", "236U", "Z=92 N=144 · 2.3×10⁷ y"), nuc("237U", "237U", "Z=92 N=145 · 6.75 d"), nuc("237NP", "237Np", "Z=93 N=144 · 2.1×10⁶ y"), nuc("238NP", "238Np", "Z=93 N=145 · 2.1 d"), nuc("238PU", "238Pu", "Z=94 N=144 · 87.7 y"), nuc("238U", "238U", "Z=92 N=146 · 4.5×10⁹ y"), nuc("239U", "239U", "Z=92 N=147 · 23.5 min"), nuc("239NP", "239Np", "Z=93 N=146 · 2.36 d"), nuc("239PU", "239Pu", "Z=94 N=145 · 24,110 y"), nuc("240PU", "240Pu", "Z=94 N=146 · 6,561 y"), nuc("241PU", "241Pu", "Z=94 N=147 · 14.3 y"), nuc("241AM", "241Am", "Z=95 N=146 · 432.6 y"), nuc("242AM", "242Am", "Z=95 N=147 · 16.0 h"), nuc("242CM", "242Cm", "Z=96 N=146 · 163 d"), nuc("242PU", "242Pu", "Z=94 N=148 · 3.7×10⁵ y"), nuc("243PU", "243Pu", "Z=94 N=149 · 4.96 h"), nuc("243AM", "243Am", "Z=95 N=148 · 7,370 y"), nuc("244AM", "244Am", "Z=95 N=149 · 10.1 h"), nuc("244CM", "244Cm", "Z=96 N=148 · 18.1 y")],
    edges: [["235U", "236U", "(n,γ) 99 b"], ["236U", "237U", "(n,γ) 5.1 b"], ["237U", "237NP", "β− 100%"], ["237NP", "238NP", "(n,γ) 176 b"], ["238NP", "238PU", "β− 100%"], ["238U", "239U", "(n,γ) 2.7 b"], ["239U", "239NP", "β− 100%"], ["239NP", "239PU", "β− 100%"], ["239PU", "240PU", "(n,γ) 271 b"], ["240PU", "241PU", "(n,γ) 290 b"], ["241PU", "241AM", "β− 99.998%"], ["241AM", "242AM", "(n,γ) 684 b"], ["242AM", "242CM", "β− 82.7%"], ["242CM", "238PU", "α 100%"], ["241PU", "242PU", "(n,γ) 363 b"], ["242PU", "243PU", "(n,γ) 19 b"], ["243PU", "243AM", "β− 100%"], ["243AM", "244AM", "(n,γ) 75 b"], ["244AM", "244CM", "β− 100%"], ["244CM", "240PU", "α 100%"], ["241AM", "237NP", "α 100%"]].map(([s, t, label]) => ({ s, t, label, kind: label.startsWith("(") ? "reaction" as const : "decay" as const })) },
  { section: "Production routes", id: "mo99", label: "Mo-99 and Tc-99m (sample)", layout: "LR",
    nodes: [nuc("235U", "235U", "Z=92 N=143 · fission target"), nuc("98MO", "98Mo", "Z=42 N=56 · stable"), nuc("100MO", "100Mo", "Z=42 N=58 · stable"), nuc("99MO", "99Mo", "Z=42 N=57 · 65.9 h"), nuc("99TCM", "99mTc", "Z=43 N=56 · 6.01 h"), nuc("99TC", "99Tc", "Z=43 N=56 · 2.1×10⁵ y"), nuc("99RU", "99Ru", "Z=44 N=55 · stable")],
    edges: [["235U", "99MO", "(n,f) 6.1% yield"], ["98MO", "99MO", "(n,γ) 0.13 b"], ["100MO", "99MO", "(γ,n)"], ["99MO", "99TCM", "β− 87.6%"], ["99MO", "99TC", "β− 12.4%"], ["99TCM", "99TC", "IT 99.996%"], ["99TC", "99RU", "β− 100%"]].map(([s, t, label]) => ({ s, t, label, kind: label.startsWith("(") ? "reaction" as const : "decay" as const })) },
  { section: "Production routes", id: "lu177", label: "Lu-177, two routes (sample)", layout: "LR",
    nodes: [nuc("176LU", "176Lu", "Z=71 N=105 · 3.8×10¹⁰ y"), nuc("176YB", "176Yb", "Z=70 N=106 · stable"), nuc("177YB", "177Yb", "Z=70 N=107 · 1.9 h"), nuc("177LU", "177Lu", "Z=71 N=106 · 6.65 d"), nuc("177HF", "177Hf", "Z=72 N=105 · stable")],
    edges: [["176LU", "177LU", "(n,γ) 2,090 b · direct"], ["176YB", "177YB", "(n,γ) 2.85 b · carrier-free"], ["177YB", "177LU", "β− 100%"], ["177LU", "177HF", "β− 100%"]].map(([s, t, label]) => ({ s, t, label, kind: label.startsWith("(") ? "reaction" as const : "decay" as const })) },
  { section: "Fission fans", id: "u235-fan", label: "U-235 thermal fission, top products (sample)", layout: "LR",
    nodes: [nuc("235U", "235U", "Z=92 N=143 · thermal fission"), nuc("137CS", "137Cs", "30.08 y · 6.2%"), nuc("137BAM", "137mBa", "2.55 min"), nuc("137BA", "137Ba", "stable"), nuc("90SR", "90Sr", "28.9 y · 5.8%"), nuc("90Y", "90Y", "64.0 h"), nuc("90ZR", "90Zr", "stable"), nuc("131I", "131I", "8.02 d · 2.9%"), nuc("131XE", "131Xe", "stable"), nuc("133XE", "133Xe", "5.25 d · 6.7%"), nuc("133CS", "133Cs", "stable"), nuc("140BA", "140Ba", "12.8 d · 6.2%"), nuc("140LA", "140La", "1.68 d"), nuc("140CE", "140Ce", "stable"), nuc("95ZR", "95Zr", "64.0 d · 6.5%"), nuc("95NB", "95Nb", "35.0 d"), nuc("95MO", "95Mo", "stable"), nuc("99MO", "99Mo", "65.9 h · 6.1%"), nuc("99TC", "99Tc", "2.1×10⁵ y"), nuc("144CE", "144Ce", "285 d · 5.5%"), nuc("144PR", "144Pr", "17.3 min"), nuc("144ND", "144Nd", "2.3×10¹⁵ y")],
    edges: [["235U", "137CS", "(n,f) 6.2%"], ["137CS", "137BAM", "β− 94.7%"], ["137BAM", "137BA", "IT 100%"], ["235U", "90SR", "(n,f) 5.8%"], ["90SR", "90Y", "β− 100%"], ["90Y", "90ZR", "β− 100%"], ["235U", "131I", "(n,f) 2.9%"], ["131I", "131XE", "β− 100%"], ["235U", "133XE", "(n,f) 6.7%"], ["133XE", "133CS", "β− 100%"], ["235U", "140BA", "(n,f) 6.2%"], ["140BA", "140LA", "β− 100%"], ["140LA", "140CE", "β− 100%"], ["235U", "95ZR", "(n,f) 6.5%"], ["95ZR", "95NB", "β− 100%"], ["95NB", "95MO", "β− 100%"], ["235U", "99MO", "(n,f) 6.1%"], ["99MO", "99TC", "β− 100%"], ["235U", "144CE", "(n,f) 5.5%"], ["144CE", "144PR", "β− 100%"], ["144PR", "144ND", "β− 100%"]].map(([s, t, label]) => ({ s, t, label, kind: label.startsWith("(") ? "reaction" as const : "decay" as const })) },
  { section: "Level schemes", id: "co60", label: "60Co decay into 60Ni levels (sample)", layout: "TB", grid: "levels",
    nodes: [nuc("60CO", "60Co", "5+ · 5.27 y · ground state"), nuc("60NI-2505", "60Ni 2505.8 keV", "4+ · 0.59 ps"), nuc("60NI-2158", "60Ni 2158.6 keV", "2+ · 0.6 ps"), nuc("60NI-1332", "60Ni 1332.5 keV", "2+ · 0.73 ps"), nuc("60NI", "60Ni 0 keV", "0+ · stable")],
    edges: [["60CO", "60NI-2505", "β− 99.88% · 317 keV"], ["60CO", "60NI-2158", "β− 0.12% · 664 keV"], ["60NI-2505", "60NI-1332", "γ 1173.2 keV · E2 · 99.85"], ["60NI-2158", "60NI-1332", "γ 826.1 keV · 0.008"], ["60NI-2158", "60NI", "γ 2158.6 keV · 0.0012"], ["60NI-1332", "60NI", "γ 1332.5 keV · E2 · 99.98"]].map(([s, t, label]) => ({ s, t, label, kind: label.startsWith("γ") ? "sample" as const : "decay" as const })) },
  { section: "Level schemes", id: "cs137", label: "137Cs decay into 137Ba levels (sample)", layout: "TB", grid: "levels",
    nodes: [nuc("137CS", "137Cs", "7/2+ · 30.08 y · ground state"), nuc("137BA-661", "137Ba 661.7 keV", "11/2− · 2.55 min · 137mBa"), nuc("137BA", "137Ba 0 keV", "3/2+ · stable")],
    edges: [["137CS", "137BA-661", "β− 94.7% · 514 keV"], ["137CS", "137BA", "β− 5.3% · 1176 keV"], ["137BA-661", "137BA", "γ 661.7 keV · M4 · 85.1"]].map(([s, t, label]) => ({ s, t, label, kind: label.startsWith("γ") ? "sample" as const : "decay" as const })) },
];
const ALL_DEMOS: Demo[] = [...FIGURES, ...DEMOS];
const DEMO_SECTIONS = [...new Set(ALL_DEMOS.map((d) => d.section))].filter((s) => s !== "Decay chains");

/** Seed canvases for the props panel — each one centers a real entity. */
const DATASETS: { id: string; label: string; seed: GNode | null }[] = [
  { id: "137CS", label: "137Cs nuclide", seed: { type: "nuclide", id: "137CS", label: "137Cs", sub: "Z=55 N=82" } },
  { id: "235U", label: "235U nuclide", seed: { type: "nuclide", id: "235U", label: "235U", sub: "Z=92 N=143" } },
  { id: "(N,G)", label: "(N,G) reaction", seed: { type: "reaction", id: "(N,G)", label: "(N,G)", sub: "reaction" } },
  { id: "2011CH57", label: "2011CH57 paper", seed: STARTER.find((s) => s.id === "2011CH57") ?? null },
  { id: "empty", label: "Empty canvas", seed: null },
];

/* ── page ─────────────────────────────────────────────────────────────────── */

// Graph Features (Brendan, 2026-11-08; "Ideas, ranked" until then): what the lake makes possible, ranked by Brendan on the
// night shift. One of the right inset panel's three views (RightInsetPanel.tsx), the one it shows first.
const IDEAS: { title: string; text: string; href?: string }[] = [
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
  // Reading, to go over together (Brendan, 2026-11-08).
  { title: "EXFOR formats manual, IAEA WP2007-23 (PDF)", text: "", href: "https://nds.iaea.org/exfor/x4guide/manuals/wp2007-23.pdf" },
  { title: "NuDat at USNDP 2022, BNL (PDF)", text: "", href: "https://indico.bnl.gov/event/15497/contributions/70076/attachments/44350/74834/NUDAT_USNDP2022.pdf" },
];

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
  // The right inset panel's view (RightInsetPanel.tsx): `chosen` is the one last picked from its tabs, Graph Features
  // until one is; selecting a node or an edge shows the papers, and selecting nothing goes back to `chosen`.
  const [chosen, setChosen] = useState<RightView>("features");
  const [rightView, setRightView] = useState<RightView>("features");
  const pickView = useCallback((v: RightView) => { setChosen(v); setRightView(v); }, []);
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

  /** A whole graph onto a fresh canvas: the nodes, the edges, laid out left-to-right or top-to-bottom. */
  const loadGraph = useCallback((gnodes: GNode[], edges: Edge[], layoutDir: "LR" | "TB" = "LR", positions?: Map<string, { x: number; y: number }>) => {
    snapshot();
    store.current = new Map();
    expandState.current = new Map();
    setSelectedKey(null);
    setEdgeInfo(null);
    for (const g of gnodes) store.current.set(keyOf(g), g);
    // A grid (the reference figure's own arrangement) pins every node; otherwise dagre lays the graph out.
    const mode: LayoutMode = positions ? "none" : layoutDir === "TB" ? "dagre-tb" : "dagre-lr";
    setLayoutMode(mode);
    layoutModeRef.current = mode;
    setNodes(positions ? gnodes.map((g) => ({ id: keyOf(g), type: "entity", position: positions.get(keyOf(g)) ?? { x: 0, y: 0 }, data: { ...g } })) : []);
    // Fit twice: once as the nodes land, once after they've measured; never closer than zoom 1, so small drawings don't balloon.
    setEdges(() => { syncNodes(edges, !positions); [60, 450].forEach((ms) => setTimeout(() => fitView({ padding: 0.12, duration: 300, maxZoom: 1 }), ms)); return edges; });
  }, [setEdges, setNodes, syncNodes, fitView, snapshot]);

  /** A decay series: nuclide nodes, decay edges labelled with mode and branching, from ENSDF's decay modes. */
  const loadChain = useCallback(async (id: string) => {
    const c = CHAINS.find((x) => x.id === id);
    if (!c) return;
    let d;
    try { d = await loadDecay(); } catch (e) { toast.error(`The decay data didn't load: ${(e as Error).message}`); return; }
    const steps = seriesFrom(d, decayIndex(d), c.head);
    if (!steps.length) { toast.error(`${c.label}: its head is not in the decay data`); return; }
    const gnode = (i: number): GNode => {
      const x = d.nuclides[i];
      const a = x.z + x.n;
      return { type: "nuclide", id: `${a}${x.el.toUpperCase()}`, label: `${a}${x.el}`, sub: `Z=${x.z} N=${x.n} · ${halfLifeText(x)}`, z: x.z, n: x.n, family: familyOf(x) };
    };
    const pct = (p: number | null) => (p == null ? "" : ` ${p >= 10 ? p.toFixed(0) : p >= 1 ? p.toFixed(1) : p.toPrecision(2)}%`);
    const gnodes = new Map<string, GNode>();
    for (const s of steps) for (const i of [s.from, s.to]) { const g = gnode(i); gnodes.set(keyOf(g), g); }
    const edges: Edge[] = steps.map((s) => {
      const from = keyOf(gnode(s.from)), to = keyOf(gnode(s.to));
      return { id: `${from}->${to}:${s.mode}`, source: from, target: to, label: `${s.mode}${pct(s.pct)}`, data: { kind: "decay", mode: s.mode, pct: s.pct } as EdgeMeta };
    });
    const all = [...gnodes.values()];
    loadGraph(all, edges, "TB", gridPositions(all, "ZA"));
  }, [loadGraph]);

  /** A sample canvas (DEMOS and FIGURES): the layout review's hand-typed graphs. */
  const loadDemo = useCallback((id: string) => {
    const d = ALL_DEMOS.find((x) => x.id === id);
    if (!d) return;
    // The figure grid: each node's own column and row, scaled by the demo's cell size.
    const figurePos = d.grid === "figure" ? new Map(d.nodes.map((g) => [keyOf(g), { x: (g.pos?.[0] ?? 0) * (d.cell?.[0] ?? 200), y: (g.pos?.[1] ?? 0) * (d.cell?.[1] ?? 150) }])) : undefined;
    const byId = new Map(d.nodes.map((g) => [g.id, g]));
    const dark = isDark();
    const edges: Edge[] = d.edges.map((e) => {
      const base: Edge = { id: `nuclide:${e.s}->nuclide:${e.t}`, source: `nuclide:${e.s}`, target: `nuclide:${e.t}`, label: e.label || undefined, data: { kind: e.kind, mode: e.label } as EdgeMeta };
      if (!figurePos || !e.arrow) return base;
      // Figure arrows: coloured, arrow-headed, leaving and entering the sides that face each other.
      const color = e.arrow === "ink" ? (dark ? "#f0e9d8" : "#16181d") : ARROW_COLOR[e.arrow];
      const sp = figurePos.get(`nuclide:${e.s}`)!, tp = figurePos.get(`nuclide:${e.t}`)!;
      const dx = tp.x - sp.x, dy = tp.y - sp.y;
      const horizontal = Math.abs(dx) >= Math.abs(dy);
      const sourceHandle = horizontal ? (dx > 0 ? "r" : "l") : dy > 0 ? "b" : "t";
      const targetHandle = horizontal ? (dx > 0 ? "lt" : "rt") : dy > 0 ? "tt" : "bt";
      void byId;
      return { ...base, type: e.curve ? "default" : "straight", sourceHandle, targetHandle, style: { stroke: color, strokeWidth: 2.2 }, markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14 }, labelStyle: { fill: color, fontWeight: 600, fontSize: 12 }, labelBgStyle: { fill: "transparent" } };
    });
    // A sample card's family from its first decay edge out (β−, α, EC, IT), or "stable" from its text.
    const fam = (g: GNode): Family => {
      if (/stable/.test(g.sub ?? "")) return "stable";
      const out = d.edges.find((e) => e.s === g.id && e.kind !== "reaction" && !e.label.startsWith("("));
      if (!out) return "unknown";
      const m = out.label.split(/\s/)[0];
      return m.startsWith("β−") || m.startsWith("β-") ? "b-" : m.startsWith("α") ? "a" : m.startsWith("EC") || m.startsWith("β+") ? "ec" : m.startsWith("IT") || m.startsWith("γ") ? "unknown" : m.startsWith("SF") ? "sf" : "unknown";
    };
    const nodes = d.nodes.map((g) => ({ ...g, family: g.family ?? fam(g) }));
    loadGraph(nodes, edges, d.layout, figurePos ?? (d.grid ? gridPositions(nodes, d.grid) : undefined));
  }, [loadGraph]);

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
        setTimeout(() => {
          const onLoad = loadFit.current;
          loadFit.current = false;
          fitView(onLoad ? undefined : { padding: 0.15, duration: 400 });
        }, 60);
      })
      .catch(() => toast.error("View not found"));
  }, [setNodes, setEdges, fitView, snapshot]);

  const bootSelection = useRef(false);
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
      bootSelection.current = true;
      center({ type: type as GNode["type"], id, label: id });
    } else {
      bootSelection.current = true;
      center({ type: "nuclide", id: "137CS", label: "137Cs", sub: "Z=55 N=82" });
    }
    // the boot itself is not an undo step
    past.current = [];
  }, [params, center, loadView]);

  // Selecting a node or an edge, or opening a run's trace, shows the papers; selecting nothing shows the view last
  // picked. The node the load centres (137Cs) is selected by the boot, not the reader, so Graph Features stays.
  const subject = selectedKey ?? (edgeInfo ? `${keyOf(edgeInfo.source)}->${keyOf(edgeInfo.target)}` : traceOpen ? `run:${traceOpen}` : null);
  const lastSubject = useRef<string | null>(null);
  useEffect(() => {
    if (subject === lastSubject.current) return;
    lastSubject.current = subject;
    if (bootSelection.current) { bootSelection.current = false; return; }
    setRightView(subject ? "papers" : chosen);
  }, [subject, chosen]);

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

  // The right inset panel's papers: the selected node's record or a step's output, else the selected edge's receipt,
  // else a run's trace. The panel's header and lists take the left panel's type and spacing (InsetPanel.tsx INSET).
  const closeButton = (onClose: () => void) => (
    <button onClick={onClose} aria-label="Close" className="ml-auto shrink-0 text-[var(--paper-muted)] hover:text-[var(--paper-text)]"><X className="h-4 w-4" /></button>
  );
  const traceRun = traceOpen ? runs.find((r) => r.id === traceOpen) : undefined;
  let papersView: ReactNode;
  if (sel) {
    const type = sel.type;
    papersView = (
      <>
        <div className={INSET.header}>
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
          {closeButton(() => setSelectedKey(null))}
        </div>
        {type !== "prompt" && type !== "file" && type !== "more" && (
          <InsetBody className="px-3 pt-3">
            {!detail && <p className="text-xs text-[var(--paper-muted)]">Loading…</p>}
            {detail && !detail.error && (
              <DetailBody type={type} detail={detail} navigate={navigate} onCanvas={(g) => expand(g as GNode, "papers")} />
            )}
          </InsetBody>
        )}
        {sel.type === "prompt" && sel.output && (
          <InsetBody className="px-3 pt-3">
            <p className="whitespace-pre-wrap text-xs leading-relaxed text-[var(--paper-text)]">{sel.output}</p>
          </InsetBody>
        )}
      </>
    );
  } else if (edgeInfo) {
    const r = edgeReceipt(edgeInfo.source, edgeInfo.target, edgeInfo.meta);
    papersView = (
      <>
        <div className={INSET.header}>
          <Badge variant={edgeInfo.meta?.kind === "similar" ? "outline" : "secondary"} className="shrink-0 text-[10px]">
            {edgeInfo.meta?.kind === "similar" ? "inference" : "edge"}
          </Badge>
          <h2 className={INSET.title}>Edge information</h2>
          {closeButton(() => setEdgeInfo(null))}
        </div>
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
        <div className={INSET.header}>
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
          {closeButton(() => setTraceOpen(null))}
        </div>
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
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md border bg-[var(--paper-quiet)] p-2 text-[10px] leading-snug text-[var(--paper-text)]">
                  {step.output || "(no output)"}
                </pre>
              </div>
            </div>
          )}
        </InsetBody>
      </>
    );
  } else {
    papersView = (
      <>
        <div className={INSET.header}>
          <h2 className={INSET.title}>Papers</h2>
        </div>
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
            onAddFile={(f) => addNodes([{
              type: "file", id: f.key, label: f.name,
              sub: `${(f.size / 1024).toFixed(0)} kB`, fileKey: f.key,
            }], undefined)}
            onLoadChain={loadChain}
            onLoadDemo={loadDemo}
            navigate={navigate}
          />
      </LeftInsetPanel>
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
                  onClick={() => { setTraceOpen(runs[0].id); setTraceStep(null); setSelectedKey(null); setEdgeInfo(null); setRail("right", false); }}
                >
                  <History className="h-4 w-4" />
                </Button>
              )}
              {/* The right inset panel's Config view: opens the panel on it, or closes the panel when it already shows it. */}
              <Button
                variant="outline"
                className={`h-8 w-8 rounded-full p-0 ${rightView === "config" && !rightClosed ? "bg-[var(--paper-quiet)]" : ""}`}
                title="Canvas settings — <ReactFlow /> props"
                onClick={() => {
                  if (rightView === "config" && !rightClosed) setRail("right", true);
                  else { pickView("config"); setRail("right", false); }
                }}
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

      <RightInsetPanel
        view={rightView}
        onView={pickView}
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
            onClose={() => setRail("right", true)}
            onReset={() => setFlowProps(DEFAULT_FLOW_PROPS)}
          />
        }
        features={
          <>
            <div className={INSET.header}>
              <h2 className={INSET.title}>Graph Features</h2>
            </div>
            <InsetBody>
              <ol className="pt-1.5">
                {IDEAS.map((i, n) => (
                  <li key={i.title} className="flex gap-2 px-3 py-1.5 transition-colors hover:bg-[var(--paper-quiet)]">
                    <span className="w-5 shrink-0 pt-0.5 font-mono text-xs text-[var(--paper-muted)]">{n + 1}</span>
                    <span className="min-w-0">
                      {i.href
                        ? <a href={i.href} target="_blank" rel="noreferrer" className="text-sm text-nuclear hover:underline">{i.title}</a>
                        : <span className="block text-sm text-[var(--paper-text)]">{i.title}</span>}
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

// The query cache is the app's one (components/DataProvider.tsx, 2026-11-08).
export function GraphPage() {
  // Both inset panels closed on load (Brendan, 2026-11-08), without changing what this browser remembers for /docs.
  useRailsClosedWhileMounted(["left", "right"]);
  return (
    <ReactFlowProvider>
      <GraphPageInner />
    </ReactFlowProvider>
  );
}
