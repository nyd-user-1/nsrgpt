"use client"

import { FilePlus } from "lucide-react"

import { KIND_ICON } from "@/components/lab/LabContext"
import { INSET, InsetBody, InsetPanel } from "@/components/nsr/graph/InsetPanel"
import { SideBarMenuItem } from "@/components/sidebar/SideBarMenuItem"
import type { BlockKind } from "@/lib/lab/blocks"
import { DEFAULT_CANVAS } from "@/lib/lab/default"
import { KIND_ORDER, KINDS } from "@/lib/lab/kinds"
import type { SavedCanvas } from "@/lib/lab/save"

// The Lab's left inset rail (brief 52): the five kinds (a click adds one in the middle of the view, a drag drops one where
// it lands) and the saved canvases, the default first.

export const KIND_DRAG = "application/x-lab-kind"

export function LabRail({ saved, current, onAdd, onOpen, onNew }: {
  saved: SavedCanvas[] | null
  current: string
  onAdd: (kind: BlockKind) => void
  onOpen: (id: string | null) => void
  onNew: () => void
}) {
  return (
    <InsetPanel side="left" storageKey="lab:inset-left-w">
      <InsetBody>
        <p className={INSET.section}>Blocks</p>
        <div className="px-1.5">
          {KIND_ORDER.map((k) => (
            <div key={k} draggable onDragStart={(e) => { e.dataTransfer.setData(KIND_DRAG, k); e.dataTransfer.effectAllowed = "copy" }}>
              <SideBarMenuItem href={`/lab?add=${k}`} label={KINDS[k].title} icon={KIND_ICON[k]} on={false} small group="Lab" onSelect={() => onAdd(k)} />
            </div>
          ))}
        </div>
        <p className={INSET.section}>Saved</p>
        <div className="px-1.5">
          <SideBarMenuItem href="/lab?new=1" label="New canvas" icon={FilePlus} on={false} small group="Lab" onSelect={onNew} />
          <SideBarMenuItem href="/lab" label={DEFAULT_CANVAS.name} on={current === DEFAULT_CANVAS.id} small group="Lab" onSelect={() => onOpen(null)} />
          {saved?.map((s) => (
            <SideBarMenuItem key={s.id} href={`/lab?canvas=${s.id}`} label={s.name} sub={s.saved_by} on={current === s.id} small group="Lab" onSelect={() => onOpen(s.id)} />
          ))}
          {saved === null && <p className={INSET.note}>Loading…</p>}
        </div>
      </InsetBody>
    </InsetPanel>
  )
}
