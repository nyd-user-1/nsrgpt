import { VizShell } from "@/components/viz/VizShell"
import { GammaLinesView } from "./view"

export const metadata = { title: "γ lines — Viz" }

export default function Page() {
  return (
    <VizShell framed>
      <GammaLinesView />
    </VizShell>
  )
}
