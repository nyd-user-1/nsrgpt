import { Suspense } from "react"
import { SweepPage } from "@/components/sweep/SweepPage"

// /sweep (brief 58, Part C, 2026-11-10): every measured cross section against every evaluation, ranked by disagreement
// (components/sweep/SweepPage.tsx). A static shell: the rows load from the API after it paints.

export const metadata = { title: "Sweep" }

export default function Page() {
  return (
    <Suspense>
      <SweepPage />
    </Suspense>
  )
}
