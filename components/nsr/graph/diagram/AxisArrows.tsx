"use client";
// The N and Z arrows of the N-Z chart (brief 28): N to the right, Z up, with their letters.
import { useThemeVersion } from "@/lib/theme-client";
import { ink } from "@/lib/viz-physics";

export function AxisArrows() {
  useThemeVersion();
  const c = ink();
  return (
    <svg width={140} height={120} className="overflow-visible">
      <defs>
        <marker id="diagram-axis-head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill={c} />
        </marker>
      </defs>
      <line x1={10} y1={100} x2={120} y2={100} stroke={c} strokeWidth={2} markerEnd="url(#diagram-axis-head)" />
      <line x1={10} y1={100} x2={10} y2={10} stroke={c} strokeWidth={2} markerEnd="url(#diagram-axis-head)" />
      <text x={128} y={105} fill={c} fontSize={16} fontStyle="italic">N</text>
      <text x={3} y={4} fill={c} fontSize={16} fontStyle="italic">Z</text>
    </svg>
  );
}
