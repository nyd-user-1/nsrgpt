"use client"

import { useEffect, useSyncExternalStore } from "react"

// A page's own name for AppLayout's header when the path alone can't give it (brief 38): a /docs article's title lives in
// lib/docs, too large to load into the shell, so the article renders <PageTitle title=… /> and the header reads it. The
// path's own name (HEADER_TITLES and AppLayout's resolution) shows until it mounts.

let current: string | null = null
const listeners = new Set<() => void>()
const set = (t: string | null) => { current = t; listeners.forEach((f) => f()) }

/** The name a page has set, or null. */
export function usePageTitle(): string | null {
  return useSyncExternalStore((f) => { listeners.add(f); return () => { listeners.delete(f) } }, () => current, () => null)
}

/** Names the page in the header while it is mounted. */
export function PageTitle({ title }: { title: string }) {
  useEffect(() => {
    set(title)
    return () => { if (current === title) set(null) }
  }, [title])
  return null
}
