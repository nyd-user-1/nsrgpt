"use client";

import { useEffect, type ReactNode } from "react";

import { FileText } from "@/components/animate-ui/icons/file-text";
import { ListOrdered } from "@/components/animate-ui/icons/list-ordered";
import { Settings2 } from "@/components/animate-ui/icons/settings-2";
import { INSET, InsetBody, InsetLayers, InsetPanel } from "@/components/nsr/graph/InsetPanel";
import { BackButton } from "@/components/SwitchboardPanel";
import { SideBarMenuItem, type SideBarIcon } from "@/components/sidebar/SideBarMenuItem";

/** The right inset panel's layers: the menu on top, and the three views a row drills down to. */
export type RightView = "menu" | "papers" | "config" | "features";

export const RIGHT_VIEWS: { key: Exclude<RightView, "menu">; label: string; icon: SideBarIcon }[] = [
  { key: "papers", label: "Papers", icon: FileText },
  { key: "config", label: "Config", icon: Settings2 },
  { key: "features", label: "Features", icon: ListOrdered },
];

/** A view's header: the switchboard's back arrow to the menu, then the view's own title and controls. */
export function RightViewHeader({ onBack, children }: { onBack: () => void; children: ReactNode }) {
  return (
    <div className={INSET.header}>
      <BackButton onClick={onBack} label="Back to the menu" />
      {children}
    </div>
  );
}

/** /graph's right inset panel (Brendan, 2026-11-08): it opens on a menu, one sidebar row per view (SideBarMenuItem, as
 *  the left rail's rows), acting instead of navigating; a row drills down to its view, which pushes in from the right
 *  (InsetLayers), and the view's back arrow returns to the menu. A row's link, /graph?panel=<view>, opens /graph there. */
export function RightInsetPanel({ view, onView, papers, config, features }: {
  view: RightView;
  onView: (v: RightView) => void;
  papers: ReactNode;
  config: ReactNode;
  features: ReactNode;
}) {
  // The panel used to start at 320 px under this key; both panels now start at 284 under their own.
  useEffect(() => {
    try { localStorage.removeItem("graph:right-w"); } catch {}
  }, []);
  const menu = (
    <>
      <div className={INSET.header}>
        <h2 className={INSET.title}>Canvas</h2>
      </div>
      <InsetBody className="pt-1.5">
        {RIGHT_VIEWS.map((v) => (
          <SideBarMenuItem key={v.key} href={`/graph?panel=${v.key}`} label={v.label} icon={v.icon} on={false} group="Canvas" onSelect={() => onView(v.key)} tip={{ name: v.label, side: "right" }} />
        ))}
      </InsetBody>
    </>
  );
  return (
    <InsetPanel side="right" storageKey="graph:inset-right-w">
      <InsetLayers layerKey={view} depth={view === "menu" ? 0 : 1}>
        {{ menu, papers, config, features }[view]}
      </InsetLayers>
    </InsetPanel>
  );
}
