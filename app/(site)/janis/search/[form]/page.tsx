import { notFound } from "next/navigation"
import { JanisSearch } from "@/components/janis/JanisSearch"
import { FORMS } from "@/components/janis/search-forms"

// /janis/search/{endf|exfor|cinda|resonances|decay|covariances} (brief 67): JANIS Web's search forms, UI only.
type Props = { params: Promise<{ form: string }> }

export function generateStaticParams() {
  return Object.keys(FORMS).map((form) => ({ form }))
}

export async function generateMetadata({ params }: Props) {
  const f = FORMS[(await params).form]
  return { title: f ? `JANIS · Search ${f.title}` : "JANIS" }
}

export default async function Page({ params }: Props) {
  const { form } = await params
  if (!FORMS[form]) notFound()
  return <JanisSearch form={form} />
}
