import { VizShell } from "@/components/viz/VizShell"
import { ExplorerChart } from "./chart"

export const metadata = { title: "3D explorer — Viz" }

export default function Page() {
  return (
    <VizShell framed>
      <ExplorerChart />
    </VizShell>
  )
}
