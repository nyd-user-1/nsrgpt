import { VizShell } from "@/components/viz/VizShell"
import { GammaLinesChart } from "./chart"

export const metadata = { title: "γ-line finder — Viz" }

export default function Page() {
  return (
    <VizShell framed>
      <GammaLinesChart />
    </VizShell>
  )
}
