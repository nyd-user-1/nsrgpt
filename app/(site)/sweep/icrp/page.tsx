import { IcrpPage } from "@/components/sweep/IcrpPage"

// /sweep/icrp (brief 58, item E, 2026-11-10): ICRP 107's half-lives against ENSDF's (components/sweep/IcrpPage.tsx).
// A static shell: the table loads after it paints.

export const metadata = { title: "ICRP 107 half-lives against ENSDF" }

export default function Page() {
  return <IcrpPage />
}
