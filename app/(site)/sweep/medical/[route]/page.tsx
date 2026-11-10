import { Suspense } from "react"
import { MedicalRoute } from "@/components/sweep/MedicalRoute"

// /sweep/medical/{route} (brief 58, Part D.2): one production route (components/sweep/MedicalRoute.tsx). A static shell:
// the route loads after it paints, and names itself in the header.

export const metadata = { title: "Medical isotope route" }

export default function Page() {
  return (
    <Suspense>
      <MedicalRoute />
    </Suspense>
  )
}
