import { VizShell } from "@/components/viz/VizShell"
import { RadiationChart } from "./chart"

export const metadata = { title: "Decay radiation — Viz" }

export default function Page() {
  return (
    <VizShell framed>
      <RadiationChart />
    </VizShell>
  )
}
