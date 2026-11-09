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

const ORDER = "nsrgpt-plate-order"

const readOrder = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(ORDER) ?? "[]")
    return Array.isArray(v) ? (v as string[]) : []
  } catch {
    return []
  }
}

/** The contents plate's dragged order (brief 46), kept in this browser beside the marks: every box's address as last
 *  arranged. A box the saved order doesn't hold (one added since) takes its place after its neighbour in `base`. */
export function usePlateOrder(base: string[]) {
  const [saved, setSaved] = React.useState<string[]>([])
  React.useEffect(() => {
    const on = () => setSaved(readOrder())
    on()
    window.addEventListener(EVENT, on)
    window.addEventListener("storage", on)
    return () => {
      window.removeEventListener(EVENT, on)
      window.removeEventListener("storage", on)
    }
  }, [])
  const order = React.useMemo(() => {
    const known = new Set(base)
    const out = saved.filter((h) => known.has(h))
    const have = new Set(out)
    base.forEach((h, i) => {
      if (have.has(h)) return
      out.splice(i === 0 ? 0 : out.indexOf(base[i - 1]) + 1, 0, h)
      have.add(h)
    })
    return out
  }, [base, saved])
  /** `from` takes the place where `to` sits: after it moving forward, before it moving back. */
  const move = React.useCallback(
    (from: string, to: string) => {
      if (from === to) return
      const next = order.filter((h) => h !== from)
      next.splice(next.indexOf(to) + (order.indexOf(from) < order.indexOf(to) ? 1 : 0), 0, from)
      try {
        localStorage.setItem(ORDER, JSON.stringify(next))
      } catch {}
      window.dispatchEvent(new Event(EVENT))
    },
    [order],
  )
  return { order, move }
}
