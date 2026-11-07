import { Suspense } from "react"

import { SearchPage } from "@/components/nsr/SearchPage"

export const metadata = { title: "Search" }

// /search, ported from the old nsr app (2026-11-07): hybrid, semantic and keyword search over the
// NSR corpus, with the result widgets, the record drawer and a chat per record.
export default function Page() {
  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <Suspense>
        <SearchPage />
      </Suspense>
    </div>
  )
}
