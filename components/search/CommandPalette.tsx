"use client"

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import { Activity, ArrowUpRight, BookOpen, Database, FileText, MessagesSquare } from "lucide-react"

import { myChats } from "@/app/chat-actions"
import { useShellPanel } from "@/components/shell"
import { SCOPES, SCOPE_ALIASES, STATIC_ITEMS, type SearchItem, type SearchKind } from "@/components/search/search-corpus"
import { chartForward } from "@/lib/viz-grow"

// CommandPalette (2026-11-06): Code/hq's ⌘K (app/ui/command-palette.tsx), the top-anchored search over a blurred
// backdrop, carried over with its keys and ranking: ↑ ↓ and Tab move, ← → at the field's edges step the scope
// chips, a typed "/chart " narrows the scope, Backspace on an empty field clears it, Enter opens, Esc closes. hq
// searches its disk through a server route; here the corpus is the site's own (search-corpus.ts) plus the reader's
// chats, ranked in the browser. The UpRight Arrow on a row opens it in Panel 2. Colours are the paper tokens.

type Scope = "all" | SearchKind

const SECTION: Record<SearchKind, string> = { chart: "Charts", data: "Data", doc: "Docs", chat: "Chats", page: "Pages" }
const ORDER: SearchKind[] = ["chart", "data", "doc", "chat", "page"]

const ICON: Record<SearchKind, ReactNode> = {
  chart: <Activity className="size-[15px]" />,
  data: <Database className="size-[15px]" />,
  doc: <BookOpen className="size-[15px]" />,
  chat: <MessagesSquare className="size-[15px]" />,
  page: <FileText className="size-[15px]" />,
}

const SELECTED = "bg-[color-mix(in_oklab,var(--paper-text)_8%,var(--paper))]"
const RULE = "border-[var(--paper-rule-soft)]"

// hq's substring/token ranking: predictable, no fuzzy surprises. 0 = hidden.
function rank(item: SearchItem, q: string): number {
  if (!q) return 1
  const hay = `${item.title} ${item.meta ?? ""} ${item.keywords ?? ""} ${item.snippet ?? ""}`.toLowerCase()
  const tokens = q.split(/\s+/).filter(Boolean)
  if (!tokens.every((t) => hay.includes(t))) return 0
  const title = item.title.toLowerCase()
  if (title === q) return 100
  if (title.startsWith(q)) return 80
  if (title.includes(q)) return 60
  if (title.split(/\s+/).some((w) => w.startsWith(tokens[0]))) return 50
  return 30 // matched only via the snippet, meta or keywords
}

// Wrap the query's terms in the snippet so the matched word shows.
function highlight(text: string, query: string): ReactNode {
  const toks = query.trim().toLowerCase().split(/\s+/).filter((t) => t.length >= 2)
  if (!toks.length) return text
  const esc = toks.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  const parts = text.split(new RegExp(`(${esc.join("|")})`, "ig"))
  return parts.map((p, i) =>
    toks.includes(p.toLowerCase()) ? (
      <mark key={i} className="rounded-sm bg-[color-mix(in_oklab,var(--paper-strong)_18%,transparent)] px-0.5 text-[var(--paper-text)]">
        {p}
      </mark>
    ) : (
      <Fragment key={i}>{p}</Fragment>
    ),
  )
}

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const { openPane } = useShellPanel()
  const [q, setQ] = useState("")
  const [scope, setScope] = useState<Scope>("all")
  const [sel, setSel] = useState(0)
  const [chats, setChats] = useState<SearchItem[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // The reader's chats, once per opening; signed out there are none.
  useEffect(() => {
    let alive = true
    myChats()
      .then((xs) => {
        if (alive) setChats(xs.filter((c) => !c.archived).map((c) => ({ kind: "chat", href: `/chat?c=${c.id}`, title: c.title, meta: new Date(c.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) })))
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  // Rank everything in scope, keep the sections in order; flat = the selection order over what's rendered.
  const { groups, flat } = useMemo(() => {
    const query = q.trim().toLowerCase()
    const scored = [...STATIC_ITEMS, ...chats]
      .filter((i) => scope === "all" || i.kind === scope)
      .map((i) => ({ i, s: rank(i, query) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
    const grouped = ORDER.map((kind) => ({ kind, items: scored.filter((x) => x.i.kind === kind).map((x) => x.i) })).filter((g) => g.items.length)
    return { groups: grouped, flat: grouped.flatMap((g) => g.items) }
  }, [q, scope, chats])

  const selIdx = Math.min(sel, Math.max(0, flat.length - 1))

  const cycleScope = useCallback(
    (dir: 1 | -1) => {
      const order = SCOPES.map((c) => c.scope)
      const i = order.indexOf(scope)
      setScope(order[(i + dir + order.length) % order.length])
      setSel(0)
      inputRef.current?.focus()
    },
    [scope],
  )

  const open = useCallback(
    (item?: SearchItem) => {
      if (!item) return
      onClose()
      // / runs ChartRoot as it arrives; every other page goes with ChartForward, as a link does.
      if (item.href === "/") router.push("/")
      else chartForward(() => router.push(item.href), item.href)
    },
    [onClose, router],
  )

  const toPanel = useCallback(
    (item: SearchItem) => {
      onClose()
      openPane(item.href)
    },
    [onClose, openPane],
  )

  // hq's cmdk-backdrop-in and cmdk-pop-in, played once as the search opens.
  const backdropRef = useRef<HTMLDivElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    backdropRef.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 130, easing: "ease-out" })
    boxRef.current?.animate(
      [
        { opacity: 0, transform: "translateY(-10px) scale(0.97)" },
        { opacity: 1, transform: "translateY(0) scale(1)" },
      ],
      { duration: 170, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
    )
  }, [])

  // Focus on open; keep the selected row in view as it moves; lock the page's scroll while open.
  useEffect(() => {
    const id = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(id)
  }, [])
  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${selIdx}"]`)?.scrollIntoView({ block: "nearest" })
  }, [selIdx])
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const el = e.currentTarget
    // ← → step the scope chips, but only at the caret's edges, so they still move the caret mid-query.
    if (e.key === "ArrowRight" && el.selectionStart === q.length && el.selectionEnd === q.length) {
      e.preventDefault()
      cycleScope(1)
    } else if (e.key === "ArrowLeft" && el.selectionStart === 0 && el.selectionEnd === 0) {
      e.preventDefault()
      cycleScope(-1)
    } else if (e.key === "Backspace" && !q && scope !== "all") {
      e.preventDefault()
      setScope("all")
    } else if (e.key === "ArrowDown") {
      e.preventDefault()
      setSel((s) => Math.min(s + 1, flat.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setSel((s) => Math.max(s - 1, 0))
    } else if (e.key === "Tab") {
      e.preventDefault()
      const dir = e.shiftKey ? flat.length - 1 : 1
      setSel((s) => (flat.length ? (s + dir) % flat.length : 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      open(flat[selIdx])
    } else if (e.key === "Escape") {
      e.preventDefault()
      onClose()
    }
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Search"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      ref={backdropRef}
      className="nysgpt-app fixed inset-0 z-[70] flex items-start justify-center bg-black/30 px-4 pt-[11vh] backdrop-blur-[2px]"
    >
      <div
        ref={boxRef}
        style={{ width: 756, maxWidth: "94vw", height: 489, maxHeight: "85vh" }}
        className="relative flex flex-col gap-3 rounded-xl border border-[var(--paper-rule)] bg-[var(--paper)] p-4 text-[var(--paper-text)] shadow-2xl"
      >
        {/* search row */}
        <div className={`flex items-center gap-3 border-b pb-3 ${RULE}`}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[var(--paper-faint)]">
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              const v = e.target.value
              const m = v.match(/^\/([a-z]+)\s([\s\S]*)$/i)
              const sc = m && SCOPE_ALIASES[m[1].toLowerCase()]
              if (sc) {
                setScope(sc)
                setQ(m![2])
              } else setQ(v)
              setSel(0)
            }}
            onKeyDown={onKeyDown}
            placeholder={scope === "all" ? "Search charts, data, docs, chats and pages…" : `Search ${SCOPES.find((s) => s.scope === scope)?.label.toLowerCase()}…`}
            spellCheck={false}
            className="w-full bg-transparent text-[14px] text-[var(--paper-text)] placeholder:text-[var(--paper-faint)] focus:outline-none"
          />
          {q && (
            <button
              type="button"
              onClick={() => {
                setQ("")
                inputRef.current?.focus()
              }}
              aria-label="Clear search"
              title="Clear"
              className="flex shrink-0 items-center rounded p-0.5 text-[var(--paper-faint)] transition-colors hover:text-[var(--paper-text)]"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          )}
          <kbd className={`shrink-0 rounded border bg-[var(--paper-quiet)] px-1.5 py-0.5 font-mono text-[9px] text-[var(--paper-faint)] ${RULE}`}>esc</kbd>
        </div>

        {/* scope chips */}
        <div className="flex flex-wrap items-center gap-1">
          {SCOPES.map((s) => (
            <button
              key={s.scope}
              type="button"
              onClick={() => {
                setScope(s.scope)
                setSel(0)
                inputRef.current?.focus()
              }}
              className={`rounded-md px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide transition-colors ${
                scope === s.scope
                  ? "bg-[color-mix(in_oklab,var(--paper-strong)_16%,var(--paper))] text-[var(--paper-strong)]"
                  : "text-[var(--paper-faint)] hover:bg-[var(--paper-quiet)] hover:text-[var(--paper-text)]"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* results */}
        <div ref={listRef} className="no-scrollbar -mr-2 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-2">
          {flat.length === 0 ? (
            <p className="px-1 py-10 text-center text-[12px] text-[var(--paper-faint)]">{q.trim() ? `No results for “${q.trim()}”` : "Nothing here yet"}</p>
          ) : (
            groups.map((g, gi) => (
              <Fragment key={g.kind}>
                {gi > 0 && <div className={`mx-1 border-t ${RULE}`} />}
                <div className="flex flex-col gap-0.5">
                  <div className="px-2.5 pb-1 pt-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--paper-faint)]">{SECTION[g.kind]}</div>
                  {g.items.map((item) => {
                    const idx = flat.indexOf(item)
                    const isSel = idx === selIdx
                    return (
                      <div
                        key={`${item.kind}:${item.href}`}
                        data-idx={idx}
                        role="option"
                        aria-selected={isSel}
                        onMouseMove={() => setSel(idx)}
                        onClick={() => open(item)}
                        className={`group/hit flex cursor-pointer items-start gap-3 rounded-md px-2.5 py-2 text-left transition-colors ${isSel ? SELECTED : "hover:bg-[var(--paper-quiet)]"}`}
                      >
                        <span className={`mt-0.5 shrink-0 ${isSel ? "text-[var(--paper-strong)]" : "text-[var(--paper-faint)]"}`}>{ICON[item.kind]}</span>
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="truncate text-[13px]">{item.title}</span>
                          {item.snippet && <span className="line-clamp-2 text-[12px] leading-relaxed text-[var(--paper-muted)]">{highlight(item.snippet, q)}</span>}
                          <span className="truncate font-mono text-[10px] text-[var(--paper-faint)]">{[item.href, item.meta].filter(Boolean).join("  ·  ")}</span>
                        </span>
                        <button
                          type="button"
                          aria-label={`Open ${item.title} in Panel 2`}
                          title="Panel 2"
                          onClick={(e) => {
                            e.stopPropagation()
                            toPanel(item)
                          }}
                          className={`flex size-7 shrink-0 items-center justify-center rounded-lg text-[var(--paper-faint)] transition-opacity hover:bg-[var(--paper)] hover:text-[var(--paper-strong)] ${isSel ? "opacity-100" : "opacity-0 group-hover/hit:opacity-100"}`}
                        >
                          <ArrowUpRight className="size-4" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              </Fragment>
            ))
          )}
        </div>

        {/* footer */}
        <div className={`flex items-center justify-between border-t pt-2.5 font-mono text-[10px] text-[var(--paper-faint)] ${RULE}`}>
          <span>{`${flat.length} result${flat.length === 1 ? "" : "s"}`}</span>
          <span className="hidden sm:inline">↑↓ navigate · ←→ scope · ↵ open · esc close</span>
        </div>
      </div>
    </div>,
    document.body,
  )
}
