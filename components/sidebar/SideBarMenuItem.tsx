"use client"

import * as React from "react"
import Link from "next/link"
import { Archive, ArchiveRestore, ArrowUpRight, ChevronDown, ChevronRight, ChevronUp, EllipsisVertical, Eye, EyeOff, Link2, PanelRight, Pencil, Pin, PinOff, Star } from "lucide-react"

import { AnimateIcon } from "@/components/animate-ui/icons/icon"
import { RowTip, type RowTipSide } from "@/components/sidebar/RowTip"
import { KebabMenu, MenuFoot, MenuHeader, MenuRow, MenuSeparator } from "@/components/kebab-menu"
import { useShellPanel } from "@/components/shell"
import { useNavRows, type NavEntry } from "@/lib/nav-rows"
import { cn } from "@/lib/utils"

// SideBarMenuItem and SideBarMenuGroup (2026-11-06): pax-trinity's sidebar rows (components/shell.tsx item() and
// its group fold), which carry Code/hq's row affordances: the UpRight Arrow that opens the row's page in Panel 2
// and the Kebab, hq's row menu (2026-11-07: Open in panel, Favorite, Pin to top, Rename, Copy link, Hide, Archive). The icon is govblock's animate-ui icon, played
// on the row's hover, in pax-trinity's two tones. Colours are the paper tokens.

/** The icon a row takes: one of govblock's animate-ui icons (components/animate-ui/icons/*). */
export type SideBarIcon = React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>

// The paper's two tones and the row states, in one place for the menu's rows, groups and the chats below.
export const ROW_ON = "bg-[color-mix(in_oklab,var(--paper-text)_8%,var(--paper))] font-semibold text-[var(--paper-strong)] shadow-e1"
export const ROW_HOVER = "hover:bg-[color-mix(in_oklab,var(--paper-text)_8%,var(--paper))] hover:text-[var(--paper-text)] hover:shadow-e1"
export const ICON_ON = "fill-[color-mix(in_oklab,var(--paper-strong)_18%,var(--paper))] text-[var(--paper-strong)]"
export const ICON_REST =
  "fill-[var(--paper)] group-hover/item:fill-[color-mix(in_oklab,var(--paper-strong)_18%,var(--paper))] group-hover/item:text-[var(--paper-strong)]"
export const MARK = "absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-[var(--paper-strong)]"
export const ROW_BUTTON =
  "flex size-7 items-center justify-center rounded-lg text-[var(--paper-faint)] opacity-0 transition-opacity hover:bg-[var(--paper)] hover:text-[var(--paper-strong)] focus-visible:opacity-100 group-hover/item:opacity-100"
/** The paper's middle rule: the branch lines, hairlines inside a card, the SearchBar's border. */
export const BRANCH = "color-mix(in oklab, var(--paper-text) 18%, var(--paper))"

/** onSelect: the row acts instead of navigating (an inset rail's row loads something onto a canvas); `href` stays its identity for the
 *  menu, Open in panel and Copy link. tip: the row's tooltip, its name (RowTip). sub: the line under the name in the kebab's
 *  header, the row's type where it has one (a diagram's subtype), else its group. Brendan, 2026-11-08. */
export function SideBarMenuItem({ href, label, icon: Icon, on, small = false, group = "Main", onSelect, tip, sub }: { href: string; label: string; icon?: SideBarIcon; on: boolean; small?: boolean; group?: string; onSelect?: () => void; tip?: { name: string; side: RowTipSide }; sub?: string }) {
  const { openPane } = useShellPanel()
  const { rows, patch } = useNavRows()
  const row = rows[href] ?? {}
  const name = row.title || label
  const [editing, setEditing] = React.useState(false)
  const [value, setValue] = React.useState("")
  const url = () => `${window.location.origin}${href}`
  const commit = () => {
    patch(href, { title: value.trim() === label ? "" : value.trim() })
    setEditing(false)
  }
  // hq's inline editor (app/ui/sidebar-recents.tsx): the row becomes its name's field; Enter keeps it, Esc lets it go.
  const rowClass = cn(
    "relative flex w-full items-center gap-3 rounded-xl px-3 pr-16 text-left outline-none transition-[color,background-color,box-shadow]",
    small ? "py-1.5 text-[13px]" : "py-2 text-sm",
    on ? ROW_ON : cn("text-[var(--paper-muted)]", ROW_HOVER),
  )
  const inner = (
    <>
      {on && <span aria-hidden className={MARK} />}
      {Icon && <Icon size={small ? 14 : 18} className={cn("shrink-0 transition-colors", on ? ICON_ON : ICON_REST)} strokeWidth={on ? 2.25 : 1.75} />}
      <span className="min-w-0 truncate">{name}</span>
    </>
  )
  const main = onSelect ? (
    <button type="button" onClick={onSelect} className={rowClass}>
      {inner}
    </button>
  ) : (
    <Link href={href} aria-current={on ? "page" : undefined} className={rowClass}>
      {inner}
    </Link>
  )
  if (editing)
    return (
      <div className={cn("flex items-center rounded-xl", ROW_ON)}>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit()
            if (e.key === "Escape") setEditing(false)
          }}
          onBlur={() => setEditing(false)}
          placeholder={`Rename ${label}: ↵ save · esc cancel`}
          aria-label={`Rename ${label}`}
          className={cn("min-w-0 flex-1 bg-transparent px-3 text-[var(--paper-text)] outline-none placeholder:text-[var(--paper-faint)]", small ? "py-1.5 text-[13px]" : "py-2 text-sm")}
        />
      </div>
    )
  return (
    <AnimateIcon asChild animateOnHover>
      <div className={cn("group/item relative", row.hidden && "opacity-50")}>
        {tip ? <RowTip name={tip.name} side={tip.side}>{main}</RowTip> : main}
        <span className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center">
          {row.favorite && <Star aria-label="Favorite" className="size-3 fill-amber-400 text-amber-400" />}
          {/* On hover, the row's page opens in Panel 2, as the Kebab's Open in panel does. */}
          <button type="button" aria-label={`Open ${name} in Panel 2`} title="Panel 2" onClick={() => openPane(href)} className={ROW_BUTTON}>
            <ArrowUpRight className="size-4" />
          </button>
          {/* hq's row menu: its name with its type or group beneath leads (Brendan, 2026-11-08), then where it opens,
              Favorite, Rename, Hide and Archive, the chats' Pin to top and pax-trinity's Copy link; the path, which a
              click copies, at the foot. */}
          <KebabMenu
            label={`${name} options`}
            align="left"
            width="w-56"
            trigger={<EllipsisVertical className="size-4" />}
            triggerClassName={cn(ROW_BUTTON, "aria-expanded:bg-[var(--paper)] aria-expanded:opacity-100")}
          >
            <MenuFoot title={row.title ? `${name} (${label})` : name} sub={sub ?? group} />
            <MenuSeparator />
            <MenuRow icon={<PanelRight />} label="Open in panel" onClick={() => openPane(href)} />
            <MenuRow icon={<Star className={row.favorite ? "fill-amber-400 text-amber-400" : undefined} />} label={row.favorite ? "Unfavorite" : "Favorite"} onClick={() => patch(href, { favorite: !row.favorite })} />
            <MenuRow icon={row.pinned ? <PinOff /> : <Pin />} label={row.pinned ? "Unpin" : "Pin to top"} onClick={() => patch(href, { pinned: !row.pinned })} />
            <MenuRow
              icon={<Pencil />}
              label="Rename"
              onClick={() => {
                setValue(name)
                setEditing(true)
              }}
            />
            <MenuRow icon={<Link2 />} label="Copy link" onClick={() => navigator.clipboard.writeText(url())} />
            <MenuRow icon={row.hidden ? <Eye /> : <EyeOff />} label={row.hidden ? "Unhide" : "Hide"} onClick={() => patch(href, { hidden: !row.hidden })} />
            <MenuRow icon={row.archived ? <ArchiveRestore /> : <Archive />} label={row.archived ? "Unarchive" : "Archive"} onClick={() => patch(href, { archived: !row.archived })} />
            <MenuSeparator />
            <MenuHeader text={href} copy={href} />
          </KebabMenu>
        </span>
      </div>
    </AnimateIcon>
  )
}

/** A group's header row: the sidebar's hover and type, its icon if it has one, and the chevron (up when open, down when
 *  shut). SideBarMenuGroup and SideBarSection share it, so a section header in an inset rail is a sidebar group header. */
export function SideBarGroupHeader({ label, icon: Icon, open, onToggle, holds = false }: { label: string; icon?: SideBarIcon; open: boolean; onToggle: () => void; holds?: boolean }) {
  const Chevron = open ? ChevronUp : ChevronDown
  return (
    <AnimateIcon asChild animateOnHover>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={cn(
          "group/item flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm outline-none transition-[color,background-color,box-shadow]",
          ROW_HOVER,
          holds ? "font-semibold text-[var(--paper-strong)]" : "text-[var(--paper-muted)]",
        )}
      >
        {Icon && <Icon size={18} className={cn("shrink-0 transition-colors", holds ? ICON_ON : ICON_REST)} strokeWidth={holds ? 2.25 : 1.75} />}
        <span className="flex-1">{label}</span>
        <Chevron className="size-4 shrink-0 text-[var(--paper-faint)] transition-colors group-hover/item:text-[var(--paper-strong)]" />
      </button>
    </AnimateIcon>
  )
}

/** Open or shut, remembered in this browser under `key`; `initial` until something is stored. */
export function useRememberedOpen(key: string, initial = true): [boolean, (open: boolean) => void] {
  const [open, setOpen] = React.useState(initial)
  React.useEffect(() => {
    try {
      const v = localStorage.getItem(key)
      if (v === "open" || v === "shut") setOpen(v === "open")
    } catch {}
  }, [key])
  const set = React.useCallback(
    (v: boolean) => {
      setOpen(v)
      try {
        localStorage.setItem(key, v ? "open" : "shut")
      } catch {}
    },
    [key],
  )
  return [open, set]
}

/** A section of rows under a group header that folds them open and shut, remembered per section under `storageKey`; open
 *  until folded (Brendan, 2026-11-08: the left inset rail's sections on /graph). */
export function SideBarSection({ label, storageKey, children }: { label: string; storageKey: string; children: React.ReactNode }) {
  const [open, setOpen] = useRememberedOpen(storageKey)
  return (
    <>
      <SideBarGroupHeader label={label} open={open} onToggle={() => setOpen(!open)} />
      {open && <div className="flex flex-col">{children}</div>}
    </>
  )
}

/** A group row folds its pages open and shut; open, they hang off it on tree lines: the trunk down from the
 *  group's icon, a rounded elbow turning into each page. Every load starts shut, unless `openWhenHolding` and the
 *  page in view is one of its own (the docs' nav opens the article's category itself). */
export function SideBarMenuGroup({ label, icon: Icon, items: all, isOn, openWhenHolding = false, place = () => true }: { label: string; icon?: SideBarIcon; items: { href: string; label: string }[]; isOn: (href: string) => boolean; openWhenHolding?: boolean; place?: (href: string) => boolean }) {
  // Pinned, archived and (unless shown) hidden pages leave the group for their own places (lib/nav-rows.ts arrange).
  const items = all.filter((c) => place(c.href))
  const inside = items.some((c) => isOn(c.href))
  const [open, setOpen] = React.useState(openWhenHolding && inside)
  React.useEffect(() => {
    if (openWhenHolding && inside) setOpen(true)
  }, [openWhenHolding, inside])
  // Shut, the row still says the page in view lives under it.
  const holds = !open && inside
  return (
    <>
      <SideBarGroupHeader label={label} icon={Icon} open={open} onToggle={() => setOpen((v) => !v)} holds={holds} />
      {open && (
        <div className="flex flex-col">
          {items.map((c, k) => (
            <div key={c.href} className="relative pl-8">
              {k < items.length - 1 && <span aria-hidden className="absolute bottom-0 left-[21px] top-0 w-px" style={{ background: BRANCH }} />}
              <span aria-hidden className="absolute left-[21px] top-0 h-4 w-5 rounded-bl-[10px] border-b-[1.5px] border-l-[1.5px]" style={{ borderColor: BRANCH }} />
              <SideBarMenuItem href={c.href} label={c.label} on={isOn(c.href)} small group={label} />
            </div>
          ))}
        </div>
      )}
    </>
  )
}

const FOOT_LABEL = "text-[11px] font-semibold uppercase tracking-wider text-[var(--paper-faint)]"

/** hq's Recents foot (app/ui/sidebar-recents.tsx): Show hidden (n), then the Archived group, folded, holding the
 *  same rows. Pinned rows lead the menu in their own block; this sits at its foot. */
export function SideBarMenuFoot({ archived, hiddenCount, showHidden, onShowHidden, isOn }: { archived: NavEntry[]; hiddenCount: number; showHidden: boolean; onShowHidden: (v: boolean) => void; isOn: (href: string) => boolean }) {
  const [open, setOpen] = React.useState(false)
  if (!hiddenCount && !archived.length) return null
  return (
    <div className="mt-1 flex flex-col gap-0.5">
      {hiddenCount > 0 && (
        <button type="button" onClick={() => onShowHidden(!showHidden)} className={cn(FOOT_LABEL, "px-3 pt-1 text-left transition-colors hover:text-[var(--paper-strong)]")}>
          {showHidden ? "Hide hidden" : `Show hidden (${hiddenCount})`}
        </button>
      )}
      {archived.length > 0 && (
        <div className="mt-1 flex flex-col gap-0.5 border-t border-[var(--paper-rule-soft)] pt-1">
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className={cn(FOOT_LABEL, "flex items-center gap-1.5 px-3 py-1 text-left transition-colors hover:text-[var(--paper-strong)]")}>
            {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
            <Archive className="size-3" />
            Archived · {archived.length}
          </button>
          {open && archived.map((e) => <SideBarMenuItem key={e.href} href={e.href} label={e.label} on={isOn(e.href)} small group={e.group} />)}
        </div>
      )}
    </div>
  )
}

/** The pinned block that leads a menu: the pages pinned to the top, wherever they live. */
export function SideBarMenuPinned({ pinned, isOn }: { pinned: NavEntry[]; isOn: (href: string) => boolean }) {
  if (!pinned.length) return null
  return (
    <div className="mb-1 flex flex-col gap-0.5 border-b border-[var(--paper-rule-soft)] pb-1.5">
      <span className={cn(FOOT_LABEL, "px-3 pb-0.5 pt-0.5")}>Pinned</span>
      {pinned.map((e) => (
        <SideBarMenuItem key={e.href} href={e.href} label={e.label} on={isOn(e.href)} small group={e.group} />
      ))}
    </div>
  )
}
