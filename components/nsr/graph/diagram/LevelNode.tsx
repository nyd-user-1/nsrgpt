"use client";
// A level of a decay scheme's ladder (brief 28): a horizontal line across the ladder, Jπ at its left, the energy in keV at
// its right, the half-life beneath the energy when it has one.
import type { NodeProps } from "@xyflow/react";
import { halfLifeValueText } from "@/lib/diagram/data";
import type { DiagramNode, LabelField } from "@/lib/diagram/spec";
import { Handles } from "./Handles";

export function LevelNode({ data }: NodeProps) {
  const d = data as { node: DiagramNode; labels: LabelField[] };
  const x = d.node;
  const hl = x.halfLife;
  return (
    <div className="relative h-full w-full text-[var(--paper-text)]">
      <Handles />
      <div className="absolute inset-x-0 top-1/2 border-t-2 border-[var(--paper-text)]" />
      {d.labels.includes("jpi") && x.jpi && <span className="absolute -top-0.5 left-0 font-mono text-[11px]">{x.jpi}</span>}
      {d.labels.includes("energy") && x.energyKeV !== undefined && (
        <span className="absolute -top-0.5 right-0 font-mono text-[11px]">{Number(x.energyKeV.toFixed(1))} keV</span>
      )}
      {d.labels.includes("halflife") && hl !== undefined && (
        <span className="absolute right-0 top-[60%] font-mono text-[10px] text-[var(--paper-muted)]">
          {hl === "stable" ? "stable" : `${halfLifeValueText(hl.value)} ${hl.unit.toLowerCase()}`}
        </span>
      )}
    </div>
  );
}
