import { Activity } from "@/components/animate-ui/icons/activity"
import { BookOpen } from "@/components/animate-ui/icons/book-open"
import { Database } from "@/components/animate-ui/icons/database"
import { Layers } from "@/components/animate-ui/icons/layers"
import { LayoutDashboard } from "@/components/animate-ui/icons/layout-dashboard"
import { MessagesSquare } from "@/components/animate-ui/icons/messages-square"
import { Newspaper } from "@/components/animate-ui/icons/newspaper"
import { NotebookPen } from "@/components/animate-ui/icons/notebook-pen"
import { Radar } from "@/components/animate-ui/icons/radar"
import { ScrollText } from "@/components/animate-ui/icons/scroll-text"
import { SquarePlay } from "@/components/animate-ui/icons/square-play"
import type { SideBarIcon } from "@/components/sidebar/SideBarMenuItem"
import type { DocCategory } from "@/lib/docs"

/** Each help center category's icon: govblock's animate-ui icons, each with its own motion on hover. */
export const ICONS: Record<DocCategory, SideBarIcon> = {
  "get-started": BookOpen,
  charts: Activity,
  atlas: Layers,
  data: LayoutDashboard,
  sources: Database,
  navigation: Radar,
  panels: NotebookPen,
  chat: MessagesSquare,
  faq: ScrollText,
  releases: Newspaper,
  guides: SquarePlay,
}
