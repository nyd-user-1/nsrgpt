"use client"

import * as React from "react"
import { ChevronDown, ChevronUp } from "lucide-react"

import { BRANCH, ROW_HOVER } from "@/components/sidebar/SideBarMenuItem"
import { cn } from "@/lib/utils"

// SideBarFold (2026-11-07): SideBarMenuGroup's fold (components/sidebar/SideBarMenuItem.tsx), its row, chevron and
// branch lines exactly, for children that aren't nav links: /pipeline's Sources tree (an org, then Datasets,
// Formats, Codes, then the items). SideBarFoldItem is a leaf on the branch.

export function SideBarFold({ label, hint, open: start = false, children }: { label: string; hint?: React.ReactNode; open?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(start)
  const Chevron = open ? ChevronUp : ChevronDown
  const items = React.Children.toArray(children)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn("group/item flex w-full items-center gap-3 rounded-xl px-3 py-1.5 text-left text-[13px] text-[var(--paper-muted)] outline-none transition-[color,background-color,box-shadow]", ROW_HOVER)}
      >
        <span className="flex-1">{label}</span>
        {hint && <span className="text-[11px] text-[var(--paper-faint)]">{hint}</span>}
        <Chevron className="size-4 shrink-0 text-[var(--paper-faint)] transition-colors group-hover/item:text-[var(--paper-strong)]" />
      </button>
      {open && (
        <div className="flex flex-col">
          {items.map((c, k) => (
            <div key={k} className="relative pl-8">
              {k < items.length - 1 && <span aria-hidden className="absolute bottom-0 left-[21px] top-0 w-px" style={{ background: BRANCH }} />}
              <span aria-hidden className="absolute left-[21px] top-0 h-4 w-5 rounded-bl-[10px] border-b-[1.5px] border-l-[1.5px]" style={{ borderColor: BRANCH }} />
              {c}
            </div>
          ))}
        </div>
      )}
    </>
  )
}

/** A leaf: a mark (a status icon), the name, and a pill on the right. */
export function SideBarFoldItem({ mark, label, pill }: { mark?: React.ReactNode; label: React.ReactNode; pill?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-lg px-2.5 py-1 text-[13px] text-[var(--paper-text)]">
      {mark}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {pill && <span className="shrink-0 text-[11px] text-[var(--paper-faint)]">{pill}</span>}
    </div>
  )
}
