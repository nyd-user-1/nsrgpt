import { TemplateGallery } from "@/components/video/TemplateGallery"

// /chat/charts (brief 78): the chart templates the chat answers with, each drawn as an answer draws it.

export const metadata = { title: "Chat charts" }

export default function ChatChartsPage() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <TemplateGallery />
    </div>
  )
}
