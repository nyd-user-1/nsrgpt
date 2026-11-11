"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { createPortal } from "react-dom"
import { Archive, ArchiveRestore, ChevronDown, ChevronRight, EllipsisVertical, Eye, EyeOff, Link2, Pencil, Pin, PinOff, SlidersHorizontal, Star } from "lucide-react"

import { myChats, updateChat } from "@/app/chat-actions"
import { KebabMenu, MenuFlyout, MenuFoot, MenuHeader, MenuRow, MenuSeparator } from "@/components/kebab-menu"
import { RowTip } from "@/components/sidebar/RowTip"
import type { ChatMeta } from "@/lib/chats"
import { cn } from "@/lib/utils"
import { MARK, ROW_BUTTON, ROW_HOVER, ROW_ON } from "@/components/sidebar/SideBarMenuItem"

// SidebarChats (2026-11-06): pax-trinity's components/sidebar-chats.tsx, colours moved to the paper tokens.
// The sidebar's lower half: the reader's saved /chat conversations, newest first. Ported from Code/hq's
// Recents (app/ui/sidebar-recents.tsx) in the sidebar's own dress: rows truncate to one line, the
// whole title and its age show on hover, and each row's actions sit behind its kebab (Favorite, Rename,
// Hide, Archive). Under the Recents header the sliders filter, group and sort the list; hidden chats show on request, and
// archived ones fold into their own group at the foot. Chat sends `pax2:chats` after each save.

// Recents' filter menu (Brendan, 2026-11-08, after Claude's chat sidebar): Status, Last activity, Group by and Sort by, each
// a submenu with its current value beside it. An option the chats can't answer yet (Group by Page) is shown, marked soon.
type Status = "active" | "archived" | "all"
type Activity = "all" | "today" | "7d" | "30d"
type GroupBy = "none" | "date" | "page"
type SortBy = "activity" | "created" | "name"
type Option<T> = { value: T; label: string; soon?: boolean }
const STATUS: Option<Status>[] = [{ value: "active", label: "Active" }, { value: "archived", label: "Archived" }, { value: "all", label: "All" }]
const ACTIVITY: Option<Activity>[] = [{ value: "all", label: "All" }, { value: "today", label: "Today" }, { value: "7d", label: "Last 7 days" }, { value: "30d", label: "Last 30 days" }]
const GROUP_OPTIONS: Option<GroupBy>[] = [{ value: "none", label: "None" }, { value: "date", label: "Date" }, { value: "page", label: "Page", soon: true }]
const SORTS: Option<SortBy>[] = [{ value: "activity", label: "Last activity" }, { value: "created", label: "Created" }, { value: "name", label: "Name" }]
const STORAGE_KEY = "pax2:chats-group"

/** A choice from `options`, remembered in this browser under `key`; `initial` until one is stored. */
function useStoredChoice<T extends string>(key: string, options: Option<T>[], initial: T): [T, (v: T) => void] {
  const [value, setValue] = React.useState<T>(initial)
  React.useEffect(() => {
    try {
      const v = localStorage.getItem(key)
      const o = options.find((x) => x.value === v && !x.soon)
      if (o) setValue(o.value)
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  const choose = (v: T) => {
    setValue(v)
    try {
      localStorage.setItem(key, v)
    } catch {}
  }
  return [value, choose]
}

const labelOf = <T,>(options: Option<T>[], v: T) => options.find((o) => o.value === v)?.label ?? ""

/** The time a chat sorts and buckets by: its last activity, or when it was started. */
const timeOf = (c: ChatMeta, sort: SortBy) => Date.parse(sort === "created" ? c.createdAt : c.updatedAt)

function sortChats(chats: ChatMeta[], sort: SortBy): ChatMeta[] {
  if (sort === "name") return [...chats].sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: "base" }))
  return [...chats].sort((a, b) => timeOf(b, sort) - timeOf(a, sort))
}

/** Last activity at or after this time, or everything. */
function activitySince(a: Activity, now: number): number {
  const d = new Date(now)
  const startOfToday = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  return a === "today" ? startOfToday : a === "7d" ? now - 7 * 86_400_000 : a === "30d" ? now - 30 * 86_400_000 : 0
}

function dateBucket(ts: number, now: number): string {
  const d = new Date(now)
  const startOfToday = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  if (ts >= startOfToday) return "Today"
  if (ts >= startOfToday - 86_400_000) return "Yesterday"
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

/** Buckets the newest-first list. Pinned chats lead either way: ungrouped they come first, then the
 *  favorites; grouped they sit in their own Pinned bucket above the dates, and the star marks the favorites. */
function groupChats(chats: ChatMeta[], mode: GroupBy, sort: SortBy): { label: string; chats: ChatMeta[] }[] {
  if (mode !== "date") return [{ label: "", chats: sortChats(chats, sort).sort((a, b) => Number(b.pinned) - Number(a.pinned) || Number(b.favorite) - Number(a.favorite)) }]
  const map = new Map<string, ChatMeta[]>()
  const pinned = sortChats(chats.filter((c) => c.pinned), sort)
  if (pinned.length) map.set("Pinned", pinned)
  // The date buckets run newest first, by when the chat was started under Sort by Created and by its last activity
  // otherwise; each bucket lists its chats in the sort's order.
  const by: SortBy = sort === "created" ? "created" : "activity"
  for (const c of sortChats(chats.filter((x) => !x.pinned), by)) {
    const k = dateBucket(timeOf(c, by), Date.now())
    map.set(k, [...(map.get(k) ?? []), c])
  }
  return [...map.entries()].map(([label, chats]) => ({ label, chats: label === "Pinned" ? chats : sortChats(chats, sort) }))
}

function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000)
  if (s < 60) return "just now"
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`
  if (s < 30 * 86_400) return `${Math.floor(s / 86_400)}d ago`
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

const LABEL = "text-[11px] font-semibold uppercase tracking-wider text-[var(--paper-faint)]"

export function SidebarChats() {
  const path = usePathname()
  const params = useSearchParams()
  const current = path === "/chat" ? params.get("c") : null
  const [chats, setChats] = React.useState<ChatMeta[]>([])
  const [loaded, setLoaded] = React.useState(false)
  // Recents loads folded on every visit (Brendan, 2026-11-11); the header opens it.
  const [open, setOpen] = React.useState(false)
  const [status, setStatus] = useStoredChoice<Status>("pax2:chats-status", STATUS, "active")
  const [activity, setActivity] = useStoredChoice<Activity>("pax2:chats-activity", ACTIVITY, "all")
  const [groupBy, setGroupBy] = useStoredChoice<GroupBy>(STORAGE_KEY, GROUP_OPTIONS, "date")
  const [sortBy, setSortBy] = useStoredChoice<SortBy>("pax2:chats-sort", SORTS, "activity")
  const [showHidden, setShowHidden] = React.useState(false)
  const [showArchived, setShowArchived] = React.useState(false)
  const [editing, setEditing] = React.useState<string | null>(null)
  const [editValue, setEditValue] = React.useState("")
  const [tip, setTip] = React.useState<{ x: number; y: number; text: string } | null>(null)

  React.useEffect(() => {
    let alive = true
    const load = () =>
      myChats()
        .then((xs) => {
          if (!alive) return
          setChats(xs)
          setLoaded(true)
        })
        .catch(() => {})
    load()
    window.addEventListener("pax2:chats", load)
    window.addEventListener("focus", load)
    return () => {
      alive = false
      window.removeEventListener("pax2:chats", load)
      window.removeEventListener("focus", load)
    }
  }, [])

  // Optimistic local patch, then the write; the next load reconciles with what was stored.
  const patch = (id: string, p: Partial<Pick<ChatMeta, "title" | "favorite" | "pinned" | "hidden" | "archived">>) => {
    setChats((xs) => xs.map((c) => (c.id === id ? { ...c, ...p } : c)))
    updateChat(id, p).catch(() => {})
  }
  const commitEdit = (c: ChatMeta) => {
    const title = editValue.trim()
    if (title && title !== c.title) patch(c.id, { title })
    setEditing(null)
  }

  // Last activity narrows everything; Status picks the active chats, the archived ones, or both (the archived then fold
  // into their own group at the foot, as before).
  const since = activitySince(activity, Date.now())
  const recent = chats.filter((c) => Date.parse(c.updatedAt) >= since)
  const archived = status === "all" ? recent.filter((c) => c.archived) : []
  const live = recent.filter((c) => (status === "archived" ? c.archived : !c.archived))
  const hiddenCount = live.filter((c) => c.hidden).length
  const visible = showHidden ? live : live.filter((c) => !c.hidden)
  const groups = groupChats(visible, groupBy, sortBy)

  const renderRow = (c: ChatMeta) => {
    const on = c.id === current
    const href = `/chat?c=${c.id}`
    if (editing === c.id)
      return (
        <div key={c.id} className={cn("flex items-center rounded-xl", ROW_ON)}>
          <input
            autoFocus
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitEdit(c)
              if (e.key === "Escape") setEditing(null)
            }}
            onBlur={() => setEditing(null)}
            placeholder="Name this chat"
            aria-label="Name this chat"
            className="min-w-0 flex-1 bg-transparent px-3 py-1.5 text-[13px] text-[var(--paper-text)] outline-none placeholder:text-[var(--paper-faint)]"
          />
        </div>
      )
    return (
      <div
        key={c.id}
        onMouseEnter={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          setTip({ x: r.right + 8, y: r.top + r.height / 2, text: `${c.title} · ${ago(c.updatedAt)}` })
        }}
        onMouseLeave={() => setTip(null)}
        className={cn("group/item relative flex items-center rounded-xl transition-[color,background-color,box-shadow]", on ? ROW_ON : ROW_HOVER, c.hidden && "opacity-50")}
      >
        {on && <span aria-hidden className={MARK} />}
        <Link href={href} aria-current={on ? "page" : undefined} onClick={() => setTip(null)} className={cn("min-w-0 flex-1 truncate py-1.5 pl-3 text-[13px] outline-none", on ? "font-semibold text-[var(--paper-strong)]" : "text-[var(--paper-muted)] group-hover/item:text-[var(--paper-text)]")}>
          {c.title}
        </Link>
        {c.favorite && <Star aria-label="Favorite" className="ml-1 size-3 shrink-0 fill-amber-400 text-amber-400" />}
        <KebabMenu
          label={`${c.title} options`}
          align="left"
          width="w-56"
          trigger={<EllipsisVertical className="size-4" />}
          triggerClassName={cn(ROW_BUTTON, "mr-1 shrink-0 aria-expanded:bg-[var(--paper)] aria-expanded:opacity-100")}
        >
          <MenuHeader text={href} copy={href} />
          <MenuSeparator />
          <MenuRow icon={c.pinned ? <PinOff /> : <Pin />} label={c.pinned ? "Unpin" : "Pin to top"} onClick={() => patch(c.id, { pinned: !c.pinned })} />
          <MenuRow icon={<Star className={c.favorite ? "fill-amber-400 text-amber-400" : undefined} />} label={c.favorite ? "Unfavorite" : "Favorite"} onClick={() => patch(c.id, { favorite: !c.favorite })} />
          <MenuRow
            icon={<Pencil />}
            label="Rename"
            onClick={() => {
              setEditValue(c.title)
              setEditing(c.id)
            }}
          />
          <MenuRow icon={<Link2 />} label="Copy link" onClick={() => navigator.clipboard.writeText(`${window.location.origin}${href}`)} />
          <MenuRow icon={c.hidden ? <Eye /> : <EyeOff />} label={c.hidden ? "Unhide" : "Hide"} onClick={() => patch(c.id, { hidden: !c.hidden })} />
          <MenuRow icon={c.archived ? <ArchiveRestore /> : <Archive />} label={c.archived ? "Unarchive" : "Archive"} onClick={() => patch(c.id, { archived: !c.archived })} />
          <MenuSeparator />
          <MenuFoot title={c.title} sub={`Started ${new Date(c.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · ${ago(c.updatedAt)}`} />
        </KebabMenu>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1">
      {/* Recents (Brendan, 2026-11-08, after Claude's chat sidebar): the header folds the whole list, remembered; the
          sliders beside it filter, group and sort it. */}
      <div className="flex items-center gap-1 px-1">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className={cn("flex items-center gap-1 rounded-lg px-2 py-1 text-[13px] font-medium text-[var(--paper-muted)] outline-none transition-[color,background-color,box-shadow]", ROW_HOVER)}
        >
          Recents
          {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        </button>
        <span className="flex-1" />
        <RowTip name="Filter and group recents" side="left">
          <span className="inline-flex">
            <KebabMenu
              label="Filter and group recents"
              align="left"
              width="w-56"
              trigger={<SlidersHorizontal className="size-3.5" />}
              triggerClassName={cn("flex size-7 items-center justify-center rounded-lg text-[var(--paper-muted)] outline-none transition-[color,background-color,box-shadow] aria-expanded:bg-[color-mix(in_oklab,var(--paper-text)_8%,var(--paper))]", ROW_HOVER)}
            >
              <MenuFlyout id="status" label="Status" hint={labelOf(STATUS, status)}>
                {STATUS.map((o) => (
                  <MenuRow key={o.value} label={o.label} checked={status === o.value} onClick={() => setStatus(o.value)} />
                ))}
              </MenuFlyout>
              <MenuFlyout id="activity" label="Last activity" hint={labelOf(ACTIVITY, activity)}>
                {ACTIVITY.map((o) => (
                  <MenuRow key={o.value} label={o.label} checked={activity === o.value} onClick={() => setActivity(o.value)} />
                ))}
              </MenuFlyout>
              <MenuFlyout id="group" label="Group by" hint={labelOf(GROUP_OPTIONS, groupBy)}>
                {GROUP_OPTIONS.map((o) => (
                  <MenuRow key={o.value} label={o.label} checked={groupBy === o.value} disabled={o.soon} hint={o.soon ? "soon" : undefined} onClick={() => setGroupBy(o.value)} />
                ))}
              </MenuFlyout>
              <MenuFlyout id="sort" label="Sort by" hint={labelOf(SORTS, sortBy)}>
                {SORTS.map((o) => (
                  <MenuRow key={o.value} label={o.label} checked={sortBy === o.value} onClick={() => setSortBy(o.value)} />
                ))}
              </MenuFlyout>
              {hiddenCount > 0 && (
                <>
                  <MenuSeparator />
                  <MenuRow icon={showHidden ? <EyeOff /> : <Eye />} label={showHidden ? "Hide hidden" : `Show hidden (${hiddenCount})`} onClick={() => setShowHidden((v) => !v)} />
                </>
              )}
            </KebabMenu>
          </span>
        </RowTip>
      </div>

      {!open ? null : loaded && chats.length === 0 ? (
        <p className="px-3 text-[13px] text-[var(--paper-faint)]">No chats yet.</p>
      ) : (
        <div className="no-scrollbar mt-1 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
          {groups.map((g, gi) => (
            <div key={g.label || `g${gi}`} className="flex flex-col gap-0.5">
              {/* The date groups beneath Recents, only while Group by is Date. */}
              {groupBy === "date" && g.label && <span className={cn(LABEL, "px-3 pb-0.5 pt-1")}>{g.label}</span>}
              {g.chats.map(renderRow)}
            </div>
          ))}
          {archived.length > 0 && (
            <div className="mt-1 flex flex-col gap-0.5 border-t border-[var(--paper-rule-soft)] pt-1">
              <button type="button" onClick={() => setShowArchived((v) => !v)} aria-expanded={showArchived} className={cn(LABEL, "flex items-center gap-1.5 px-3 py-1 text-left transition-colors hover:text-[var(--paper-strong)]")}>
                {showArchived ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                <Archive className="size-3" />
                Archived · {archived.length}
              </button>
              {showArchived && sortChats(archived, sortBy).map(renderRow)}
            </div>
          )}
        </div>
      )}

      {/* The whole title and its age, to the right of the row; portaled so the sidebar can't clip it. */}
      {tip &&
        createPortal(
          <div role="tooltip" style={{ top: tip.y, left: tip.x }} className="nysgpt-app pointer-events-none fixed z-[100] max-w-80 -translate-y-1/2 truncate rounded-lg bg-[var(--paper)] px-2.5 py-1 text-xs text-[var(--paper-text)] shadow-md ring-1 ring-[var(--paper-rule)]">
            {tip.text}
          </div>,
          document.body,
        )}
    </div>
  )
}
