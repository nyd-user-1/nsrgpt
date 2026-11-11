import { ComparisonTable } from "@/components/comparison/ComparisonTable"

// /comparison (brief 66): NSRgpt beside NNDC, IAEA-NDS and the NEA Data Bank, feature by feature. Static: the matrix is
// lib/comparison.ts. The header title is the page's name (lib/header-titles.ts); no h1 here.
export const metadata = { title: "Comparison" }

export default function Page() {
  return <ComparisonTable />
}
