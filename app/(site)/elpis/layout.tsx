import { PageTitle } from "@/lib/page-title"

// /elpis (briefs 67, 69): Elpis, my viewer on JANIS Web's pages, reading the lake. The header says Elpis on every page under it. JANIS
// Web's own nav strip is gone from every page (Brendan, 2026-11-11); the sidebar and the home cards are the way around.
export default function ElpisLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageTitle title="Elpis" />
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
    </div>
  )
}
