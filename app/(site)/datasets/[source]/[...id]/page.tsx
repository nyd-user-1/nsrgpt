import { Suspense } from "react"
import { Toaster } from "sonner"
import { DatasetRecord } from "@/components/datasets/DatasetRecord"
import { idFromSegments, isSource, SOURCES } from "@/lib/datasets"

// /datasets/{source}/{id}: one record of a parsed dataset (brief 33). A static shell; the record loads after it paints.
// ENDF/B's id is two segments, release and MAT: /datasets/endf/B-VIII.1/9228.
export async function generateMetadata({ params }: { params: Promise<{ source: string; id: string[] }> }) {
  const { source, id } = await params
  return { title: `${idFromSegments(id)} · ${isSource(source) ? SOURCES[source].label : "Datasets"}` }
}

export default function DatasetRecordPage() {
  return (
    <>
      <Suspense>
        <DatasetRecord />
      </Suspense>
      <Toaster position="bottom-center" />
    </>
  )
}
