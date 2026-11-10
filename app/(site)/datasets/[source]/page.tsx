import { Suspense } from "react"
import { Toaster } from "sonner"
import { DatasetIndex } from "@/components/datasets/DatasetIndex"
import { isSource, SOURCES } from "@/lib/datasets"

// /datasets/{source}: the index of one parsed dataset (brief 33). A static shell; the rows load after it paints.
export async function generateMetadata({ params }: { params: Promise<{ source: string }> }) {
  const { source } = await params
  return { title: isSource(source) ? SOURCES[source].label : "Datasets" }
}

export default function DatasetIndexPage() {
  return (
    <>
      <Suspense>
        <DatasetIndex />
      </Suspense>
      {/* ENDF/B's Compile to GNDS 2.0 reports in toasts. */}
      <Toaster position="bottom-center" />
    </>
  )
}
