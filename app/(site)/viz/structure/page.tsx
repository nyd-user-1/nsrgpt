import { VizShell } from "@/components/viz/VizShell"
import { StructureView } from "./view"

export const metadata = { title: "ENSDF Evaluation Cutoffs — Viz" }

export default function Page() {
  return (
    <VizShell framed title="ENSDF Evaluation Cutoffs">
      <StructureView />
    </VizShell>
  )
}
