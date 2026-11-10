import { About } from "@/components/about/About"

// /about (brief 58, Part B, 2026-11-10): who I am for, what I hold, what I do, how I am built, who made me
// (components/about/About.tsx). A static shell: the live counts load after it paints.

export const metadata = { title: "About" }

export default function Page() {
  return <About />
}
