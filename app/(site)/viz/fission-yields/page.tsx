import { VizShell } from "@/components/viz/VizShell"
import { FissionChart } from "./chart"

export const metadata = { title: "Fission yields — Viz" }

export default function Page() {
  return (
    <VizShell framed>
      <FissionChart />
    </VizShell>
  )
}
