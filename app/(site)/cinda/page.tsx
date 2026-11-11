import { Suspense } from "react"
import { CindaSearch } from "@/components/cinda/CindaSearch"

// /cinda (brief 65, Part C): the Computer Index of Nuclear Reaction Data, searched in the IAEA form's shape. A static
// shell; the lines load from nsr-api's /cinda after it paints (components/cinda/CindaSearch.tsx).
export const metadata = { title: "CINDA" }

export default function Page() {
  return (
    <Suspense>
      <CindaSearch />
    </Suspense>
  )
}
