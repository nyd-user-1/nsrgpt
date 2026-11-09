import { Activity } from "@/components/animate-ui/icons/activity"
import { Blocks } from "@/components/animate-ui/icons/blocks"
import { BookOpen } from "@/components/animate-ui/icons/book-open"
import { Boxes } from "@/components/animate-ui/icons/boxes"
import { Database } from "@/components/animate-ui/icons/database"
import { Layers } from "@/components/animate-ui/icons/layers"
import { LayoutDashboard } from "@/components/animate-ui/icons/layout-dashboard"
import { MessagesSquare } from "@/components/animate-ui/icons/messages-square"
import { NotebookPen } from "@/components/animate-ui/icons/notebook-pen"
import { Radar } from "@/components/animate-ui/icons/radar"
import { ScrollText } from "@/components/animate-ui/icons/scroll-text"
import type { SideBarIcon } from "@/components/sidebar/SideBarMenuItem"

// Each page's icon, on its sidebar row and its box on the contents plate alike (brief 46). The dataset pages' rows are in
// /graph's rail, under Datasets.
export const PAGE_ICONS: Record<string, SideBarIcon> = {
  "/chat": MessagesSquare,
  "/data-dictionary": ScrollText,
  "/docs": BookOpen,
  "/factory": Boxes,
  "/glossary": NotebookPen,
  "/graph": Blocks,
  "/pipeline": Layers,
  "/schema": LayoutDashboard,
  "/search": Radar,
  "/datasets/endf": Activity,
  "/datasets/ensdf": Layers,
  "/datasets/exfor": Database,
  "/datasets/nsr": BookOpen,
  "/datasets/xundl": Boxes,
}
