import { PageTitle } from "@/lib/page-title"

// /janis (brief 67): JANIS Web's pages in NSRgpt's style, UI only. The header says JANIS on every page under it. JANIS
// Web's own nav strip is gone from every page (Brendan, 2026-11-11); the sidebar and the home cards are the way around.
export default function JanisLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageTitle title="JANIS" />
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
    </div>
  )
}
