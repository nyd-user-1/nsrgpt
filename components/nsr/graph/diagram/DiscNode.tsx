"use client";
// The decay-series disc (brief 28), as Wikipedia's series figures draw it: A over Z small at the left, the symbol large
// and bold, the half-life's value on one line and its unit beneath ("1.41e+10 / Years", "Stable"). Filled with a tint
// of the nuclide's decay-family colour (lib/nuclide.ts FAMILY, as the chart of nuclides), dark text, a thin border.
import type { NodeProps } from "@xyflow/react";
import { FAMILY, type Family } from "@/lib/nuclide";
import { halfLifeValueText } from "@/lib/diagram/data";
import type { DiagramNode, LabelField } from "@/lib/diagram/spec";
import { useThemeVersion } from "@/lib/theme-client";
import { isDark } from "@/lib/viz-physics";
import { Handles } from "./Handles";

export type NuclidePartData = { node: DiagramNode; labels: LabelField[]; label: string; dimmed?: boolean; palette?: string } & Record<string, unknown>;

export function familyFill(family: string | undefined, dark: boolean): string {
  const f = FAMILY[(family ?? "unknown") as Family] ?? FAMILY.unknown;
  return `color-mix(in oklab, ${dark ? f.dark : f.light} 42%, #ffffff)`;
}

export function DiscNode({ data, selected }: NodeProps) {
  useThemeVersion();
  const d = data as NuclidePartData;
  const x = d.node;
  const dark = isDark();
  const on = (f: LabelField) => d.labels.includes(f);
  const symbol = d.label.replace(/^\d+/, "");
  const hl = x.halfLife;
  return (
    <div
      className={`relative flex flex-col items-center justify-center rounded-full border text-[#16181d] ${selected ? "ring-2 ring-nuclear" : ""} ${d.dimmed ? "opacity-30" : ""}`}
      style={{ width: 100, height: 100, background: familyFill(x.family, dark), borderColor: dark ? "#c9c2b0" : "#3a3a3a" }}
      title={`${d.label}${x.family ? ` · ${FAMILY[x.family as Family]?.label ?? x.family}` : ""}`}
    >
      <Handles />
      <p className="flex items-center leading-none">
        {(on("A") || on("Z")) && (
          <span className="mr-0.5 flex flex-col items-end font-mono text-[10px] leading-[1.05]">
            {on("A") && <span>{x.a}</span>}
            {on("Z") && <span>{x.z}</span>}
          </span>
        )}
        {on("symbol") && <span className="text-[26px] font-bold tracking-tight">{symbol}</span>}
      </p>
      {on("halflife") && hl !== undefined && (
        hl === "stable"
          ? <p className="mt-0.5 text-[11px] leading-tight">Stable</p>
          : <>
              <p className="mt-0.5 font-mono text-[11px] leading-tight">{halfLifeValueText(hl.value)}</p>
              <p className="text-[10px] leading-tight">{hl.unit}</p>
            </>
      )}
      {on("jpi") && x.jpi && <p className="font-mono text-[10px] leading-tight">{x.jpi}</p>}
    </div>
  );
}
