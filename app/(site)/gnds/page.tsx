import { Toaster } from "sonner"
import { GndsPage } from "@/components/gnds/GndsPage"

// /gnds, the GNDS 2.0 compiler (Brendan, 2026-11-10; components/gnds/GndsPage.tsx). A static shell: the examples' sizes
// and the coverage load after it paints.

export const metadata = { title: "GNDS 2.0 compiler" }

export default function Page() {
  return (
    <>
      <GndsPage />
      <Toaster position="bottom-center" />
    </>
  )
}
