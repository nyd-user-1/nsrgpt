import { SchemaClient } from "@/components/nsr/schema/SchemaClient"

// /schema (brief 32): pax-trinity's schema canvas, ported whole, drawing the lake tables the API reads, the ENSDF and
// ENDF/B tables they are built from, and the keys between them. A static shell; the tables are in the bundle. Content
// in components/nsr/schema/schema.ts.

export const metadata = { title: "Schema" }

export default function Page() {
  return (
    <div className="h-full min-h-0">
      <SchemaClient />
    </div>
  )
}
