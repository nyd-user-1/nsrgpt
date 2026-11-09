"use client";
// Free text on a diagram (brief 28): an element's name, an axis title.
import type { NodeProps } from "@xyflow/react";

export function LabelNode({ data }: NodeProps) {
  const d = data as { text: string; size?: number };
  return <span className="whitespace-nowrap text-[var(--paper-muted)]" style={{ fontSize: d.size ?? 13 }}>{d.text}</span>;
}
