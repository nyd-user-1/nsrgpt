"use client";
// The s-process chart cell (brief 28): a square with its mass number in the top-left corner in the accent colour,
// solid yellow with a black border when the nuclide is on the path, pale with a grey border when it isn't (faint).
import type { NodeProps } from "@xyflow/react";
import type { LabelField } from "@/lib/diagram/spec";
import { useThemeVersion } from "@/lib/theme-client";
import { isDark } from "@/lib/viz-physics";
import { Handles } from "./Handles";
import { familyFill, type NuclidePartData } from "./DiscNode";

export function SquareNode({ data, selected }: NodeProps) {
  useThemeVersion();
  const d = data as NuclidePartData;
  const x = d.node;
  const on = (f: LabelField) => d.labels.includes(f);
  const chart = d.palette === "chart";
  const fill = chart ? (x.faint ? "#fbf3c4" : "#f5d90a") : familyFill(x.family, isDark());
  const border = x.faint ? "#9a9a9a" : isDark() ? "#e8e0cc" : "#16181d";
  return (
    <div
      className={`relative border text-[#16181d] ${selected ? "ring-2 ring-nuclear" : ""} ${d.dimmed ? "opacity-30" : ""}`}
      style={{ width: 64, height: 64, background: fill, borderColor: border, borderWidth: x.faint ? 1 : 1.5 }}
      title={d.label}
    >
      <Handles />
      {on("A") && <span className="absolute left-1 top-0.5 font-mono text-[10px] font-semibold text-[#d1242f]">{x.a}</span>}
      {on("symbol") && <span className="absolute inset-0 flex items-center justify-center pt-2 text-lg font-bold">{d.label.replace(/^\d+m?/, "")}</span>}
      {on("Z") && <span className="absolute bottom-0.5 left-1 font-mono text-[9px] text-[#555]">{x.z}</span>}
    </div>
  );
}
