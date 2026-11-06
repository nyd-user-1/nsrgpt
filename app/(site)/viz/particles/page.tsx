import { VizShell } from "@/components/viz/VizShell"
import { ParticleView } from "./view"

export const metadata = { title: "Particles — Viz" }

// The particle view (2026-11-06): one gram of a nuclide's decay heat driving smoke through a column of air,
// on threejs-particle-fluids' WebGPU physics.
export default function Page() {
  return (
    <VizShell framed>
      <ParticleView />
    </VizShell>
  )
}
