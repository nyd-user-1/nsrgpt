"use client"

import * as React from "react"
import { usePathname, useRouter } from "next/navigation"
import { CheckIcon, ChevronsDownUpIcon, CopyIcon, DownloadIcon, EllipsisVerticalIcon, LayoutGridIcon, LayoutListIcon, MessagesSquareIcon, RectangleHorizontalIcon, RectangleVerticalIcon, RefreshCwIcon, Trash2Icon } from "lucide-react"

import { CardTitle } from "@/components/ui/nova/card"
import { KebabMenu, MenuFlyout, MenuFoot, MenuRow, MenuSeparator } from "@/components/kebab-menu"
import { useShellPanel } from "@/components/shell"
import { useHiddenBlocks, useShelf } from "@/lib/home-blocks"
import { cn } from "@/lib/utils"

// Ported from pax2 (src/components/dash/card-tools.tsx, 2026-11-07) for the block frame in components/blocks.tsx.
// Dropped, having no NSRgpt counterpart: Pin to top (pax2's ordered block columns), Favorite (pax2's nav
// favorites) and the PAX/AI chip's white button; the Ask chip reads "Ask" in NSRgpt's tokens.

// Two things every Admin card carries (Brendan, 2026-09-06): a title that
// copies its own address when clicked — the page's URL with the card's
// anchor — and the standard three-dot menu in the top right, with whatever
// control the card already had sitting to its left.

export const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")

export function CardAnchor({ children, id, className }: { children: string; id?: string; className?: string }) {
  const anchor = id ?? slug(children)
  const [copied, setCopied] = React.useState(false)
  const copy = () => {
    void navigator.clipboard?.writeText(`${window.location.origin}${window.location.pathname}${window.location.search}#${anchor}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <CardTitle id={anchor} className={cn("scroll-mt-20", className)}>
      {/* hq's copy chip (app/ui/copy-code.tsx), reworked as Brendan asked on 2026-10-19: plain at
          rest; on hover the title keeps its own color on the muted ground and the copy icon
          surfaces where the check lands once copied, as lucide.dev's icon titles do. */}
      <button
        type="button"
        onClick={copy}
        title="Copy link to this card"
        className={cn(
          "group/anchor inline-flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-0.5 text-left transition-colors select-none focus-visible:outline-1 focus-visible:outline-ring",
          copied ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300" : "text-foreground hover:bg-muted"
        )}
      >
        {children}
        {copied ? <CheckIcon className="size-3.5 text-green-600" /> : <CopyIcon className="size-3.5 opacity-0 transition-opacity group-hover/anchor:opacity-100" />}
      </button>
    </CardTitle>
  )
}

/** Opens the side panel's chat with the block around `from` as its context: the block's content, read off
 *  the screen at the click. */
function useAskBlock(from: React.RefObject<HTMLElement | null>, title?: string) {
  const { askAbout } = useShellPanel()
  const path = usePathname()
  return () => {
    const card = from.current?.closest<HTMLElement>('[data-slot="card"]')
    const name = title ?? card?.querySelector('[data-slot="card-title"]')?.textContent ?? "this block"
    const text = (card?.innerText ?? "").replace(/\n{3,}/g, "\n\n").slice(0, 8000)
    askAbout({ context: () => `ACTIVE CONTEXT — the user is asking about the block "${name}" on ${path}. What the block shows on screen:\n${text}` })
  }
}

/** Every block's Ask chip (pax2's PAX/AI chip, Brendan, 2026-10-23), in the header just before the chevron. It opens
 *  the side panel's chat with the block as its context. */
export function AskChip({ title }: { title?: string }) {
  const self = React.useRef<HTMLButtonElement>(null)
  const ask = useAskBlock(self, title)
  return (
    <button ref={self} type="button" onClick={ask} aria-label={`Ask about ${title ?? "this block"}`} className="inline-flex h-7 items-center rounded-full bg-white px-3 text-xs font-semibold text-pax2-blue ring-1 ring-slate-200 transition-shadow hover:shadow-md">
      Ask
    </button>
  )
}

/** A refresh icon: re-reads the page's data on the server. */
export function RefreshButton() {
  const router = useRouter()
  const [pending, start] = React.useTransition()
  return (
    <button type="button" aria-label="Refresh" title="Refresh" onClick={() => start(() => router.refresh())} className="inline-flex size-8 items-center justify-center rounded-md text-slate-800 hover:bg-muted hover:text-foreground">
      <RefreshCwIcon className={cn("size-3.5", pending && "animate-spin")} />
    </button>
  )
}

function download(rows: readonly Record<string, unknown>[], name: string, kind: "csv" | "json") {
  const body =
    kind === "json"
      ? JSON.stringify(rows, null, 2)
      : [Object.keys(rows[0] ?? {}), ...rows.map((r) => Object.values(r))].map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, "\"\"")}"`).join(",")).join("\n")
  const a = document.createElement("a")
  a.href = URL.createObjectURL(new Blob([body], { type: kind === "json" ? "application/json" : "text/csv" }))
  a.download = `${name}.${kind}`
  a.click()
  URL.revokeObjectURL(a.href)
}

/** The card's controls: whatever it had, then the standard three-dot menu (Brendan, 2026-10-23), the same
 *  rows on every block in this order: Add to Blocks, Ask, Refresh, then the
 *  three sizes: Collapse, Half View, Full View.
 *  A block's own entries (View, Download, extras) follow below a separator. */
export function CardTools({
  children,
  className,
  views,
  view,
  onView,
  rows,
  name = "card",
  size,
  onSize,
  menuItems,
  title,
  anchor,
}: {
  children?: React.ReactNode
  /** Extra entries for the three-dot menu (a Narrative, an Explain), after the standard ones. */
  menuItems?: React.ReactNode
  className?: string
  /** The views the card's slot can hold; the menu switches between them. */
  views?: readonly { value: string; label: string }[]
  view?: string
  onView?: (value: string) => void
  /** What Download writes. */
  rows?: readonly Record<string, unknown>[]
  name?: string
  /** The block's size: collapsed (header only), half (420px) or full (840px). */
  size?: "collapsed" | "half" | "full"
  onSize?: (size: "collapsed" | "half" | "full") => void
  /** The block's title and anchor: Favorite and Add to Blocks key on them, the foot shows the title. */
  title?: string
  anchor?: string
}) {
  const router = useRouter()
  const path = usePathname()
  const shelf = useShelf()
  const { hide } = useHiddenBlocks()
  const root = React.useRef<HTMLDivElement>(null)
  const key = anchor ? `${path}#${anchor}` : null
  const onShelf = !!key && shelf.has(key)
  // Ask: the side panel's chat opens with the block's content, read off the screen at the click.
  const ask = useAskBlock(root, title)
  const extras = (views && views.length > 1) || !!menuItems || (rows && rows.length > 0)
  return (
    <div ref={root} className={cn("flex items-center gap-1", className)}>
      {children}
      {/* Code/hq's row kebab, in the light dress (components/kebab-menu.tsx). */}
      <KebabMenu label="Block options" trigger={<EllipsisVerticalIcon className="size-4" />} triggerClassName="inline-flex size-8 items-center justify-center rounded-md text-slate-800 outline-none hover:bg-muted hover:text-foreground aria-expanded:bg-muted">
        <MenuRow icon={<LayoutGridIcon />} label={onShelf ? "Remove from Blocks" : "Add to Blocks"} checked={onShelf} disabled={!key || !title} onClick={() => key && title && anchor && (onShelf ? shelf.remove(key) : shelf.add({ key, title, path, anchor }))} />
        <MenuRow icon={<MessagesSquareIcon />} label="Ask" onClick={ask} />
        <MenuRow icon={<RefreshCwIcon />} label="Refresh" onClick={() => router.refresh()} />
        <MenuSeparator />
        <MenuRow icon={<ChevronsDownUpIcon />} label="Collapse" checked={size === "collapsed"} disabled={!onSize} onClick={() => onSize?.("collapsed")} />
        <MenuRow icon={<RectangleHorizontalIcon />} label="Half View" checked={size === "half"} disabled={!onSize} onClick={() => onSize?.("half")} />
        <MenuRow icon={<RectangleVerticalIcon />} label="Full View" checked={size === "full"} disabled={!onSize} onClick={() => onSize?.("full")} />
        {extras && <MenuSeparator />}
        {views && views.length > 1 && (
          <MenuFlyout id="view" icon={<LayoutListIcon />} label="View" hint={views.find((v) => v.value === view)?.label}>
            {views.map((v) => (
              <MenuRow key={v.value} label={v.label} checked={v.value === view} onClick={() => onView?.(v.value)} />
            ))}
          </MenuFlyout>
        )}
        {menuItems}
        {rows && rows.length > 0 && (
          <MenuFlyout id="download" icon={<DownloadIcon />} label="Download" hint={`${rows.length} rows`}>
            <MenuRow label="CSV" onClick={() => download(rows, name, "csv")} />
            <MenuRow label="JSON" onClick={() => download(rows, name, "json")} />
          </MenuFlyout>
        )}
        <MenuSeparator />
        {/* Delete: off this page, onto the Blocks shelf, where opening it puts it back. */}
        <MenuRow icon={<Trash2Icon />} label="Delete" danger disabled={!key || !title} onClick={() => key && title && anchor && (shelf.add({ key, title, path, anchor }), hide(key))} />
        {title && (
          <>
            <MenuSeparator />
            <MenuFoot title={title} sub={path} />
          </>
        )}
      </KebabMenu>
    </div>
  )
}
