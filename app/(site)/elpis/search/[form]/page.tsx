import { notFound } from "next/navigation"
import { ElpisSearch } from "@/components/elpis/ElpisSearch"
import { FORMS } from "@/components/elpis/search-forms"

// /elpis/search/{endf|exfor|cinda|resonances|decay|covariances} (brief 67): JANIS Web's search forms, UI only.
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
  return <ElpisSearch form={form} />
}
