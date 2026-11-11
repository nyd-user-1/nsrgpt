import { JanisBrowse } from "@/components/janis/JanisBrowse"

// /janis/browse[/...path] (brief 67): JANIS Web's "Browse database", the tree walked one level a page
// (lib/janis-tree.ts), so the back button walks back up it.
export const metadata = { title: "JANIS · Browse database" }

type Props = { params: Promise<{ path?: string[] }> }

export default async function Page({ params }: Props) {
  const { path = [] } = await params
  return <JanisBrowse path={path.map((p) => decodeURIComponent(p))} />
}
