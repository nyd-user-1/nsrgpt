"use client";

import { useEffect, type ReactNode } from "react";
import { FileText, ListOrdered, Settings2 } from "lucide-react";

import { InsetPanel, InsetTip } from "@/components/nsr/graph/InsetPanel";
import { setRail, useRailClosed } from "@/components/rail-toggle";
import { cn } from "@/lib/utils";

export type RightView = "papers" | "config" | "features";

const VIEWS: { key: RightView; label: string; text: string; icon: typeof FileText }[] = [
  { key: "papers", label: "Papers", text: "The selected node's record, or the selected edge's receipt.", icon: FileText },
  { key: "config", label: "Config", text: "The canvas's <ReactFlow /> props, live.", icon: Settings2 },
  { key: "features", label: "Graph Features", text: "What the lake makes possible, ranked.", icon: ListOrdered },
];

/** /graph's right inset panel (Brendan, 2026-11-08): one of three views at a time, switched by rail tabs under its open
 *  and close tab, in that tab's style. A tab on a closed panel opens it on its view. */
export function RightInsetPanel({ view, onView, papers, config, features }: {
  view: RightView;
  onView: (v: RightView) => void;
  papers: ReactNode;
  config: ReactNode;
  features: ReactNode;
}) {
  const closed = useRailClosed("right");
  // The panel used to start at 320 px under this key; both panels now start at 284 under their own.
  useEffect(() => {
    try { localStorage.removeItem("graph:right-w"); } catch {}
  }, []);
  const tabs = VIEWS.map((v, i) => {
    const on = view === v.key && !closed;
    return (
      <InsetTip key={v.key} name={v.label} text={v.text} side="right">
        <button
          type="button"
          aria-label={v.label}
          aria-pressed={on}
          onClick={() => {
            onView(v.key);
            if (closed) setRail("right", false);
          }}
          style={{ top: 140 + i * 44 }}
          className={cn(
            "absolute left-0 z-40 flex h-8 -translate-x-full items-center justify-center rounded-l-[10px] border border-r-0 border-[#033882] bg-[var(--paper-text)] text-[#033882] shadow-[0_2px_10px_rgba(3,56,130,0.22)] transition-[width] duration-200 ease-out select-none",
            on ? "w-[30.25px]" : "w-[22px] hover:w-[30.25px]",
          )}
        >
          <v.icon className="size-3.5" aria-hidden />
        </button>
      </InsetTip>
    );
  });
  return (
    <InsetPanel side="right" storageKey="graph:inset-right-w" tabs={tabs}>
      {{ papers, config, features }[view]}
    </InsetPanel>
  );
}
