import { Suspense } from "react"
import { Toaster } from "sonner"

import { ChatPage } from "@/components/chat/ChatPage"

export const metadata = { title: "Chat" }

// The chat, ported from the old nsr app's /chat (2026-11-07). ?c=<id> reopens a saved chat;
// ?prompt=…&context=…&url=… starts one from a record.
export default function Page() {
  return (
    <div className="h-full min-h-0">
      <Suspense>
        <ChatPage />
      </Suspense>
      <Toaster position="bottom-center" />
    </div>
  )
}
