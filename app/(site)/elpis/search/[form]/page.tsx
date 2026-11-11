import { Suspense } from "react"
import { notFound } from "next/navigation"
import { ElpisSearch } from "@/components/elpis/ElpisSearch"
import { FORMS } from "@/components/elpis/search-forms"

// /elpis/search/{endf|exfor|cinda|resonances|decay|covariances} (briefs 67, 69): JANIS Web's search forms, searching the
// lake. The form reads the URL's query (a prefilled search), so it renders under Suspense.
type Props = { params: Promise<{ form: string }> }

export function generateStaticParams() {
  return Object.keys(FORMS).map((form) => ({ form }))
}

export async function generateMetadata({ params }: Props) {
  const f = FORMS[(await params).form]
  return { title: f ? `Elpis · Search ${f.title}` : "Elpis" }
}

export default async function Page({ params }: Props) {
  const { form } = await params
  if (!FORMS[form]) notFound()
  return (
    <Suspense>
      <ElpisSearch form={form} />
    </Suspense>
  )
}
