import { Activity } from "@/components/animate-ui/icons/activity"
import { Atom } from "@/components/animate-ui/icons/atom"
import { FlaskConical } from "@/components/animate-ui/icons/flask-conical"
import { Blocks } from "@/components/animate-ui/icons/blocks"
import { BookOpen } from "@/components/animate-ui/icons/book-open"
import { Boxes } from "@/components/animate-ui/icons/boxes"
import { Database } from "@/components/animate-ui/icons/database"
import { FileText } from "@/components/animate-ui/icons/file-text"
import { Layers } from "@/components/animate-ui/icons/layers"
import { ListOrdered } from "@/components/animate-ui/icons/list-ordered"
import { LayoutDashboard } from "@/components/animate-ui/icons/layout-dashboard"
import { MessagesSquare } from "@/components/animate-ui/icons/messages-square"
import { NotebookPen } from "@/components/animate-ui/icons/notebook-pen"
import { Radar } from "@/components/animate-ui/icons/radar"
import { ScrollText } from "@/components/animate-ui/icons/scroll-text"
import type { SideBarIcon } from "@/components/sidebar/SideBarMenuItem"

// Each page's icon, on its sidebar row and its box on the contents plate alike (brief 46). The dataset pages' rows are in
// /graph's rail, under Datasets.
export const PAGE_ICONS: Record<string, SideBarIcon> = {
  "/about": FileText,
  "/chat": MessagesSquare,
  "/comparison": LayoutDashboard,
  "/data-dictionary": ScrollText,
  "/docs": BookOpen,
  "/factory": Boxes,
  "/glossary": NotebookPen,
  "/graph": Blocks,
  "/lab": FlaskConical,
  "/elpis": Layers,
  "/nsrcpt": Atom,
  "/pipeline": Layers,
  "/schema": LayoutDashboard,
  "/search": Radar,
  "/sweep": ListOrdered,
  "/sweep/medical": FlaskConical,
  "/sweep/icrp": Atom,
  "/gnds": Boxes,
  "/cinda": ScrollText,
  "/datasets/endf": Activity,
  "/datasets/ensdf": Layers,
  "/datasets/exfor": Database,
  "/datasets/nsr": BookOpen,
  "/datasets/xundl": Boxes,
}
