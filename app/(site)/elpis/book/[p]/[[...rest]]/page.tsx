import { notFound } from "next/navigation"
import { ElpisBook } from "@/components/elpis/ElpisBook"
import { parseNuclide, PROJECTILES } from "@/lib/janis-tree"

// /elpis/book/{n|g|p|d|t|h|a}/[nuclide]/[mt] (brief 67): JANIS Web's books, the comparison of experimental and evaluated
// cross sections, UI only. Without a nuclide it opens on 5-B-11 MT107, the reference page.
type Props = { params: Promise<{ p: string; rest?: string[] }> }

export function generateStaticParams() {
  return PROJECTILES.map((p) => ({ p: p.key, rest: [] }))
}

export async function generateMetadata({ params }: Props) {
  const { p, rest = [] } = await params
  const proj = PROJECTILES.find((x) => x.key === p)
  return { title: proj ? `Elpis · ${proj.symbol} book${rest[0] ? ` · ${decodeURIComponent(rest[0])}` : ""}` : "Elpis" }
}

export default async function Page({ params }: Props) {
  const { p, rest = [] } = await params
  if (!PROJECTILES.some((x) => x.key === p)) notFound()
  const nuc = parseNuclide(decodeURIComponent(rest[0] ?? "5-B-11"))
  const mt = parseInt(rest[1] ?? "107", 10)
  if (!nuc || !Number.isFinite(mt) || rest.length > 2) notFound()
  return <ElpisBook p={p} z={nuc.z} a={nuc.a} mt={mt} />
}
