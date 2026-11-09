"use client";
// A diagram's legend (brief 28): a bordered box of swatch and label rows, bottom-left by default. The series' legend
// names the decay families (lib/nuclide.ts FAMILY); other specs give their own rows.
import type { NodeProps } from "@xyflow/react";
import { FAMILY, type Family } from "@/lib/nuclide";
import { useThemeVersion } from "@/lib/theme-client";
import { isDark } from "@/lib/viz-physics";
import { familyFill } from "./DiscNode";

export function LegendBox({ data }: NodeProps) {
  useThemeVersion();
  const d = data as { items: { label: string; color: string }[]; family?: boolean };
  const dark = isDark();
  return (
    <div className="rounded-md border border-[var(--paper-rule)] bg-[var(--paper)] px-3 py-2 text-[11px] text-[var(--paper-text)] shadow-sm">
      {d.items.map((it) => {
        const f = d.family ? FAMILY[it.color as Family] : undefined;
        return (
          <p key={it.label} className="flex items-center gap-2 py-0.5">
            <span className="inline-block h-3 w-3 shrink-0 rounded-sm border border-[#3a3a3a]" style={{ background: f ? familyFill(it.color, dark) : it.color }} />
            <span>{f ? f.label : it.label}</span>
          </p>
        );
      })}
    </div>
  );
}
