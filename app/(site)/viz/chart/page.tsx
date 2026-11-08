import { VizShell } from "@/components/viz/VizShell"
import { NuclideChart } from "./chart"

export const metadata = { title: "Chart of Nuclides — Viz" }

export default function Page() {
  return (
    <VizShell framed title="Chart of Nuclides">
      <NuclideChart />
    </VizShell>
  )
}
