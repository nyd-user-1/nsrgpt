'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import dynamic from 'next/dynamic'
import { usePathname, useRouter } from 'next/navigation'
import { Loader2, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { setDragEntity } from '@/lib/nsr-drag-entity'
import { GRAPH_CENTER, graphHref, keyOf, useMostStudied, type Entity } from './entities'

// The entity search (brief 36, Part 5, 2026-11-09), lifted from /graph into the app header, on every page. At rest a
// circle; a click opens it to full width over 500 ms without focusing it, as the sidebar opens (Brendan, 2026-11-08);
// a click into the field opens the list, the most studied first and, from two letters, the corpus matches
// (/api/graph?op=search). The list is portaled to <body> above everything under the header (the plate, the canvases, the
// panels). A pick centres the graph: in place on /graph, which listens for GRAPH_CENTER; elsewhere it opens /graph on it.
// A row can also be dragged onto the canvas.

// Some paper titles carry inline TeX; KaTeX loads only for those, the first time the list shows one.
const TexText = dynamic(() => import('@/components/chat/TexText').then((m) => m.TexText), { ssr: false, loading: () => null })
const Title = ({ text }: { text: string }) => (text.includes('$') ? <TexText text={text} /> : <>{text}</>)

const BADGE = 'inline-flex w-16 shrink-0 items-center justify-center rounded-md border border-[var(--paper-rule)]/40 px-1 py-0.5 text-[9px] text-[var(--paper-muted)]'

export function EntitySearch({ className = '' }: { className?: string }) {
  const path = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [focused, setFocused] = useState(false)
  const [results, setResults] = useState<Entity[]>([])
  const [searching, setSearching] = useState(false)
  const [visible, setVisible] = useState(15)
  const [at, setAt] = useState<{ left: number; top: number } | null>(null)
  const bar = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  // the catalog loads the first time the field is focused
  const [wanted, setWanted] = useState(false)
  const mostStudied = useMostStudied(wanted)
  const typed = q.trim().length >= 2
  const suggestions = typed ? results : mostStudied.slice(0, visible)
  const [failed, setFailed] = useState(false)
  const showList = focused && (suggestions.length > 0 || searching || typed)

  useEffect(() => {
    if (!typed) { setResults([]); return }
    const t = setTimeout(async () => {
      setSearching(true)
      try {
        const r = await fetch(`/api/graph?op=search&q=${encodeURIComponent(q)}`)
        const json = await r.json()
        setFailed(!r.ok)
        setResults((json.results ?? []).map((x: Entity) => (x.type === 'nuclide' && x.code ? { ...x, id: x.code } : x)))
      } catch {
        setFailed(true)
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 250)
    return () => clearTimeout(t)
  }, [q, typed])

  // The list hangs under the bar, wherever the header puts it; it follows a resize or a scroll.
  useLayoutEffect(() => {
    if (!showList) return
    const place = () => {
      const r = bar.current?.getBoundingClientRect()
      if (r) setAt({ left: r.left, top: r.bottom + 8 })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [showList, open])

  const pick = (g: Entity) => {
    setQ('')
    setResults([])
    setOpen(false)
    input.current?.blur()
    if (path === '/graph') window.dispatchEvent(new CustomEvent(GRAPH_CENTER, { detail: g }))
    else router.push(graphHref(g))
  }

  return (
    // A click on the bar is the bar's, not the header's (the header opens the Nav on a click in its empty space).
    <div className={`relative hidden shrink-0 sm:block ${className}`} onClick={(e) => e.stopPropagation()}>
      {/* The canvas tools' dress (GraphPage's plus and Config; Brendan, 2026-11-09): the same pill, the circle a Button in it. */}
      <div ref={bar} className={`flex h-10 items-center overflow-hidden rounded-full border bg-[var(--paper)] p-1 shadow-sm backdrop-blur-sm transition-[width,gap,padding] duration-[500ms] ease-in-out ${open ? 'w-96 gap-2 pr-3' : 'w-10 gap-0'}`}>
          {/* The circle opens the bar without focusing it; open and empty, it closes it again. */}
          <Button variant="outline" aria-label="Search" aria-expanded={open} onClick={() => setOpen((v) => !(v && !q.trim()))} className="h-8 w-8 shrink-0 rounded-full p-0">
            <Search className="h-4 w-4 shrink-0" />
          </Button>
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => { setFocused(true); setWanted(true) }}
            onBlur={(e) => {
              const empty = !e.currentTarget.value.trim()
              setTimeout(() => { setFocused(false); setVisible(15); if (empty) setOpen(false) }, 150)
            }}
            onKeyDown={(e) => { if (e.key === 'Escape') { setQ(''); setOpen(false); e.currentTarget.blur() } }}
            placeholder="Center an author, paper, nuclide, reaction…"
            tabIndex={open ? 0 : -1}
            aria-label="Search the corpus"
            className={`h-full min-w-0 border-0 bg-transparent p-0 text-[13px] text-[var(--paper-text)] outline-none transition-opacity duration-[500ms] placeholder:text-[var(--paper-faint)] ${open ? 'flex-1 opacity-100' : 'w-0 flex-none opacity-0'}`}
          />
          {searching && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--paper-muted)]" />}
      </div>
      {showList && at && createPortal(
        <div
          role="listbox"
          aria-label="Search results"
          onClick={(e) => e.stopPropagation()}
          onScroll={(e) => {
            const el = e.currentTarget
            if (!typed && el.scrollTop + el.clientHeight >= el.scrollHeight - 40) setVisible((v) => v + 15)
          }}
          style={{ left: at.left, top: at.top }}
          className="nysgpt-app fixed z-[1000] max-h-80 w-96 overflow-y-auto rounded-lg border border-[var(--paper-rule)] bg-[var(--paper)] text-[var(--paper-text)] shadow-md"
        >
          {!typed && <p className="m-0 px-2.5 pb-1 pt-2 text-[10px] uppercase tracking-wide text-[var(--paper-muted)]">Most studied</p>}
          {searching && suggestions.length === 0 && <p className="m-0 px-2.5 py-2 text-xs text-[var(--paper-muted)]">Searching…</p>}
          {typed && !searching && suggestions.length === 0 && (
            <p className="m-0 px-2.5 py-2 text-xs text-[var(--paper-muted)]">{failed ? 'The search could not reach the corpus.' : 'No matches.'}</p>
          )}
          {suggestions.map((r) => (
            <button
              key={keyOf(r)}
              type="button"
              role="option"
              aria-selected={false}
              onClick={() => pick(r)}
              draggable
              onDragStart={(e) => setDragEntity(e.dataTransfer, r)}
              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-[var(--paper-quiet)]"
            >
              <span className={BADGE}>{r.type}</span>
              <span className="truncate font-medium">{r.title ? <Title text={String(r.title)} /> : r.label}</span>
              <span className="ml-auto shrink-0 text-[10px] text-[var(--paper-muted)]">{r.sub}</span>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  )
}
