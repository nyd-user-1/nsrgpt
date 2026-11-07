"use client"

import * as React from "react"

// The sidebar rows' view state (2026-11-07): Code/hq's Recents metadata (lib/sessions-meta.ts: favorite, a rename,
// hidden, archived) plus the chats' Pin to top, per page, kept in this browser as pax-trinity's nav favorites were
// (lib/nav-favorites.ts, which this replaces). hq keeps it in a sidecar file; NSRgpt has no per-reader store for
// pages, so it's localStorage, the same on dev and production.

export type NavRow = { favorite?: boolean; pinned?: boolean; hidden?: boolean; archived?: boolean; title?: string }

const KEY = "nsrgpt-nav-rows"
const EVENT = "nsrgpt-nav-rows"

const read = (): Record<string, NavRow> => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, NavRow>
  } catch {
    return {}
  }
}

export function useNavRows() {
  const [rows, setRows] = React.useState<Record<string, NavRow>>({})
  React.useEffect(() => {
    const on = () => setRows(read())
    on()
    window.addEventListener(EVENT, on)
    window.addEventListener("storage", on)
    return () => {
      window.removeEventListener(EVENT, on)
      window.removeEventListener("storage", on)
    }
  }, [])
  /** Merge into one page's row; a blank title clears the rename. */
  const patch = React.useCallback((href: string, p: NavRow) => {
    const all = read()
    const next: NavRow = { ...all[href], ...p }
    if (!next.title) delete next.title
    all[href] = next
    try {
      localStorage.setItem(KEY, JSON.stringify(all))
    } catch {}
    window.dispatchEvent(new Event(EVENT))
  }, [])
  return { rows, patch }
}

export type NavEntry = { href: string; label: string; group: string }

/** hq's arrangement over a set of rows: the pinned lead in their own block, archived ones leave for the Archived
 *  group, hidden ones show only on request. `place` is whether a row still renders where it lives. */
export function arrange(all: NavEntry[], rows: Record<string, NavRow>, showHidden: boolean) {
  const live = all.filter((e) => !rows[e.href]?.archived)
  return {
    pinned: live.filter((e) => rows[e.href]?.pinned && (showHidden || !rows[e.href]?.hidden)),
    archived: all.filter((e) => rows[e.href]?.archived),
    hiddenCount: live.filter((e) => rows[e.href]?.hidden).length,
    place: (href: string) => {
      const r = rows[href]
      return !r?.archived && !r?.pinned && (showHidden || !r?.hidden)
    },
  }
}
