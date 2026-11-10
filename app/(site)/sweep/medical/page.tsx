import { MedicalPage } from "@/components/sweep/MedicalPage"

// /sweep/medical (brief 58, Part D, 2026-11-10): the medical isotopes' production routes, each route's yield from every
// evaluation and from the data (components/sweep/MedicalPage.tsx). A static shell: the routes load after it paints.

export const metadata = { title: "Medical isotope routes" }

export default function Page() {
  return <MedicalPage />
}
