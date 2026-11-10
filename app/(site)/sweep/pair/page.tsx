import { Suspense } from "react"
import { SweepPairView } from "@/components/sweep/SweepPair"

// /sweep/pair (brief 58, Part C.1): one pair of the sweep, as a /sweep row opens it in the second panel
// (components/sweep/SweepPair.tsx). A static shell: the pair loads from the API after it paints.

export const metadata = { title: "Sweep pair" }

export default function Page() {
  return (
    <Suspense>
      <SweepPairView />
    </Suspense>
  )
}
