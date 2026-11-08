import { PipelineClient } from "@/components/pipeline/PipelineClient"

// /pipeline (ported from pax2 2026-11-07; out of its block and onto the graph's canvas, Brendan, 2026-11-08): where
// the data comes from, the lake it lands in, and what reads it. Content in lib/pipeline-map.ts.

export const metadata = { title: "Pipeline" }

export default function Page() {
  return (
    <div className="h-full min-h-0">
      <PipelineClient />
    </div>
  )
}
