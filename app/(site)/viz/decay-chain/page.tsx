import { VizShell } from "@/components/viz/VizShell"
import { DecayChainChart } from "./chart"

export const metadata = { title: "Decay chain — Viz" }

export default function Page() {
  return (
    <VizShell framed>
      <DecayChainChart />
    </VizShell>
  )
}
