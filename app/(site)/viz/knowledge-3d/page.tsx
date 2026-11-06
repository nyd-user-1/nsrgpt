import { VizShell } from "@/components/viz/VizShell"
import { Knowledge3dView } from "./view"

export const metadata = { title: "Knowledge map 2 — Viz" }

// Knowledge map 2 (2026-11-05): the knowledge map in 3D, with a grid of blocks that selects the nuclides inside one.
export default function Page() {
  return (
    <VizShell framed>
      <Knowledge3dView />
    </VizShell>
  )
}
