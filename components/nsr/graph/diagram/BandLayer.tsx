"use client";
// The element bands behind a decay series (brief 28): alternating full-width stripes, one per element row, the element's
// name at the right edge, as the series figures draw them. Not selectable, not draggable; clicks pass through.
import type { NodeProps } from "@xyflow/react";

export function BandLayer({ data }: NodeProps) {
  const d = data as { label: string; shade: boolean };
  return (
    <div className="pointer-events-none flex h-full w-full items-center justify-end pr-4" style={{ background: d.shade ? "var(--paper-quiet)" : "transparent" }}>
      <span className="text-[15px] text-[var(--paper-muted)]">{d.label}</span>
    </div>
  );
}
