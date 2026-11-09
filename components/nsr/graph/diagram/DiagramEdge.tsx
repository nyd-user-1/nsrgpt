"use client";
// One arrow for every kind (brief 28). Colour and head by kind: α magenta, β− green, β+ and EC green, IT grey, capture
// blue (on the N-Z chart the s-process figure's red with a solid dot head), fission red, γ in ink, SF orange; β− dashed
// blue on the chart. The Greek letter and the percent ride in a small pill. Straight by default; `curve` bends it.
// Points (a ladder's γ lines and feeding) replace the handles' ends.
import { BaseEdge, EdgeLabelRenderer, type EdgeProps } from "@xyflow/react";
import type { EdgeKind } from "@/lib/diagram/spec";
import { useThemeVersion } from "@/lib/theme-client";
import { ink } from "@/lib/viz-physics";

export type DiagramEdgeData = { kind: EdgeKind; text?: string; curve?: boolean; palette?: "chart" | "figure"; points?: [number, number][] } & Record<string, unknown>;

export function edgeColor(kind: EdgeKind, palette: string | undefined): string {
  if (palette === "chart" && kind === "capture") return "#d1242f";
  if (palette === "chart" && kind === "beta-") return "#2f6fdc";
  switch (kind) {
    case "alpha": return "#e22bd0";
    case "beta-": case "beta+": case "ec": return "#1b8c3a";
    case "it": return "#8a8a8a";
    case "capture": return "#1f4fd6";
    case "fission": return "#d1242f";
    case "sf": return "#e8730c";
    case "gamma": return ink();
  }
}

export function DiagramEdge({ id, sourceX, sourceY, targetX, targetY, data, style }: EdgeProps) {
  useThemeVersion();
  const d = (data ?? { kind: "gamma" }) as DiagramEdgeData;
  const color = edgeColor(d.kind, d.palette);
  const pts: [number, number][] = d.points ?? [[sourceX, sourceY], [targetX, targetY]];
  const [sx, sy] = pts[0], [tx, ty] = pts[pts.length - 1];
  let path: string, mx: number, my: number, fromX: number, fromY: number;
  if (d.curve && !d.points) {
    // a bend to the left of travel, a quarter of the length
    const cx = (sx + tx) / 2 - (ty - sy) * 0.25, cy = (sy + ty) / 2 + (tx - sx) * 0.25;
    path = `M${sx},${sy} Q${cx},${cy} ${tx},${ty}`;
    mx = 0.25 * sx + 0.5 * cx + 0.25 * tx;
    my = 0.25 * sy + 0.5 * cy + 0.25 * ty;
    fromX = cx; fromY = cy;
  } else {
    path = pts.map(([x, y], i) => `${i ? "L" : "M"}${x},${y}`).join(" ");
    mx = (sx + tx) / 2; my = (sy + ty) / 2;
    [fromX, fromY] = pts[pts.length - 2];
  }
  const ang = Math.atan2(ty - fromY, tx - fromX);
  const dot = d.kind === "capture" && d.palette === "chart";
  const head = 11, wing = 5;
  const back = [tx - head * Math.cos(ang), ty - head * Math.sin(ang)];
  const tri = `M${tx},${ty} L${back[0] - wing * Math.sin(ang)},${back[1] + wing * Math.cos(ang)} L${back[0] + wing * Math.sin(ang)},${back[1] - wing * Math.cos(ang)} Z`;
  const opacity = typeof style?.opacity === "number" ? style.opacity : 1;
  const dashed = (d.kind === "beta-" && d.palette === "chart") || d.kind === "sf";
  return (
    <>
      <BaseEdge id={id} path={path} style={{ stroke: color, strokeWidth: 2, strokeDasharray: dashed ? "6 4" : undefined, opacity, fill: "none" }} interactionWidth={14} />
      <g style={{ opacity }} pointerEvents="none">
        {dot ? <circle cx={tx - 4 * Math.cos(ang)} cy={ty - 4 * Math.sin(ang)} r={4.5} fill={color} /> : <path d={tri} fill={color} />}
      </g>
      {d.text && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-none absolute rounded-full border bg-[var(--paper)] px-1.5 py-px font-mono text-[10px] font-semibold leading-tight"
            style={{ transform: `translate(-50%, -50%) translate(${mx}px, ${my}px)`, color, borderColor: color, opacity }}
          >
            {d.text}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
