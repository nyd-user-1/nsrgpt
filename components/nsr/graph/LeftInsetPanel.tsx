"use client";

import type { ReactNode } from "react";

import { InsetPanel } from "@/components/nsr/graph/InsetPanel";

/** /graph's left inset panel: the catalog (GraphPage.tsx CatalogRail) on the shared frame. */
export function LeftInsetPanel({ children }: { children: ReactNode }) {
  return (
    <InsetPanel side="left" storageKey="graph:inset-left-w">
      {children}
    </InsetPanel>
  );
}
