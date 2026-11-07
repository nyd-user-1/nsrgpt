import { Suspense } from "react"
import { Toaster } from "sonner"

import { GraphClient } from "@/components/nsr/graph/GraphClient"

export const metadata = { title: "Graph" }

// /graph, ported from the old nsr app (2026-11-07): the workspace canvas — papers, authors, nuclides,
// reactions and EXFOR entries expanded from their records, similar papers from the NSR-CPT space, and
// prompt steps run over what's on the canvas.
export default function Page() {
  return (
    <div className="h-full min-h-0">
      <Suspense>
        <GraphClient />
      </Suspense>
      <Toaster position="bottom-center" />
    </div>
  )
}
