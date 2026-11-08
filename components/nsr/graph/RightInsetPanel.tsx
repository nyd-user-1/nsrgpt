"use client";

import { useEffect, type ReactNode } from "react";

import { FileText } from "@/components/animate-ui/icons/file-text";
import { ListOrdered } from "@/components/animate-ui/icons/list-ordered";
import { Settings2 } from "@/components/animate-ui/icons/settings-2";
import { INSET, IconRow, InsetBody, InsetIcon, InsetLayers, InsetPanel } from "@/components/nsr/graph/InsetPanel";
import { BackButton, RowArrow } from "@/components/SwitchboardPanel";
import type { SideBarIcon } from "@/components/sidebar/SideBarMenuItem";

/** The right inset panel's layers: the menu on top, and the three views a row drills down to. */
export type RightView = "menu" | "papers" | "config" | "features";

const VIEWS: { key: Exclude<RightView, "menu">; label: string; icon: SideBarIcon }[] = [
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

/** /graph's right inset panel (Brendan, 2026-11-08): it opens on a menu, one row per view in the panel's row style with
 *  the sidebar's icon and the switchboard's drill-down arrow; a row drills down to its view, which pushes in from the
 *  right (InsetLayers), and the view's back arrow returns to the menu. */
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
        {VIEWS.map((v) => (
          <IconRow key={v.key}>
            <button type="button" onClick={() => onView(v.key)} className={INSET.row}>
              <InsetIcon icon={v.icon} />
              <span className="min-w-0 flex-1 truncate">{v.label}</span>
              <RowArrow />
            </button>
          </IconRow>
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
