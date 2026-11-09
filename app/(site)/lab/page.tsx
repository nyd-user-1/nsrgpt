import { Suspense } from "react"
import { Toaster } from "sonner"

import { LabClient } from "@/components/lab/LabClient"

export const metadata = { title: "Lab" }

// /lab (brief 52): the workbench, a canvas of blocks that run. Removing the Lab is deleting app/(site)/lab,
// components/lab, lib/lab and app/api/jobs, and its rows in the sidebar, the header titles and the plate.
export default function Page() {
  return (
    <div className="h-full min-h-0">
      <Suspense>
        <LabClient />
      </Suspense>
      <Toaster position="bottom-center" />
    </div>
  )
}
