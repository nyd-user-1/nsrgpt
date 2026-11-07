"use client"

import * as React from "react"
import dynamic from "next/dynamic"

// pax-trinity's components/command/command-k-host.tsx (2026-11-06): ⌘K from anywhere opens the search
// (CommandPalette); so does the SearchBar and anything that dispatches "pax:command-k". The palette's code loads the
// first time it opens, not with every page.
const CommandPalette = dynamic(() => import("./CommandPalette").then((m) => m.CommandPalette), { ssr: false })

export const openCommandK = () => window.dispatchEvent(new Event("pax:command-k"))

export function CommandKHost() {
  const [open, setOpen] = React.useState(false)
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k" && !open) {
        e.preventDefault()
        setOpen(true)
      }
    }
    const onAsk = () => setOpen(true)
    window.addEventListener("keydown", onKey)
    window.addEventListener("pax:command-k", onAsk)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("pax:command-k", onAsk)
    }
  }, [open])
  return open ? <CommandPalette onClose={() => setOpen(false)} /> : null
}
