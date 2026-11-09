import { FactoryClient } from "@/components/nsr/factory/FactoryClient"

// /factory (brief 32): pax-trinity's factory canvas, ported whole, drawing NSRgpt's lake from the sources to the pages.
// A static shell; the diagram is in the bundle. Content in components/nsr/factory/FactoryCanvas.tsx.

export const metadata = { title: "Factory" }

export default function Page() {
  return (
    <div className="h-full min-h-0">
      <FactoryClient />
    </div>
  )
}
