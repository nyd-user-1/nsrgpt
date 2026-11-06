'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronsUpDown, Copy, Download, EllipsisVertical, GripVertical, LayoutGrid, Megaphone, MessagesSquare, Star, StickyNote, Trash2, X, type LucideIcon } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { Extension } from '@tiptap/react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { TaskSurface, TaskToolbar, useTaskEditor } from '@/components/notes/rich-body'
import { KebabMenu, MenuFlyout, MenuFoot, MenuRow, MenuSeparator } from '@/components/kebab-menu'
import { useShellPanel } from '@/components/shell'
import { useShelf } from '@/lib/home-blocks'
import { NOTE_OPEN, readDefaultShape, useDefaultShape, useNoteFavorites } from '@/lib/drawn-notes'

const SANS = { fontFamily: 'var(--font-sans, "DM Sans"), sans-serif' } as const

/**
 * Shift notes, ported from pax-trinity's drawn notes (draw-notes.tsx /
 * floating-note.tsx, 2026-10-31) in the paper dress: hold Shift and drag
 * across any surface that isn't a control, a field or a picture, and a dashed
 * outline follows the pointer. Let go and the outline holds for a beat, a
 * skeleton fills it, and a note card opens there, as large as drawn. A
 * Shift-click still extends a selection — the drawing starts only once the
 * pointer has moved — and Escape while drawing lets it go. Notes are kept in
 * this browser (localStorage): the card's menu closes one (kept; a Blocks tile
 * reopens it) or deletes it.
 */

/** What a drag can't start on: controls, fields, links, pictures and frames keep their own Shift. */
const KEEP =
  "a, button, input, textarea, select, [contenteditable='true'], [draggable='true'], img, video, iframe, [role=slider], [role=dialog], [data-note]"
const MIN = { w: 260, h: 200 }
/** The skeleton reads for at least this long, so the card arrives as the shape it was drawn. */
const SKELETON_MS = 450
/** The outline holds this long before the skeleton fills it. */
const HOLD_MS = 160
const STORE = 'nysgpt-shift-notes'

export type Rect = { x: number; y: number; w: number; h: number }
type Mode = 'note' | 'chat' | 'team'
type Turn = { role: 'user' | 'assistant'; content: string }
type Note = { id: string; rect: Rect; text: string; ready: boolean; open?: boolean; mode?: Mode; chat?: Turn[]; comment?: string }

const rectOf = (a: { x: number; y: number }, b: { x: number; y: number }): Rect => ({
  x: Math.min(a.x, b.x),
  y: Math.min(a.y, b.y),
  w: Math.abs(b.x - a.x),
  h: Math.abs(b.y - a.y),
})

/** A drawn shape at the card's least size, inside the window. */
function fit(r: Rect): Rect {
  const w = Math.min(Math.max(r.w, MIN.w), window.innerWidth - 16)
  const h = Math.min(Math.max(r.h, MIN.h), window.innerHeight - 16)
  return {
    x: Math.max(8, Math.min(r.x, window.innerWidth - w - 8)),
    y: Math.max(8, Math.min(r.y, window.innerHeight - h - 8)),
    w,
    h,
  }
}

function load(): Note[] {
  try {
    const kept = JSON.parse(localStorage.getItem(STORE) ?? '[]') as Omit<Note, 'ready'>[]
    return kept.map(n => ({ ...n, ready: true }))
  } catch {
    return []
  }
}

function save(notes: Note[]) {
  try {
    localStorage.setItem(STORE, JSON.stringify(notes.map(({ id, rect, text, open, mode, chat, comment }) => ({ id, rect, text, open, mode, chat, comment }))))
  } catch {
    /* a full or blocked store loses nothing but persistence */
  }
}

export function ShiftNotes() {
  const [outline, setOutline] = useState<Rect | null>(null)
  const [notes, setNotes] = useState<Note[]>([])
  const [mounted, setMounted] = useState(false)

  // Kept notes come back where they were left.
  useEffect(() => {
    setNotes(load())
    setMounted(true)
  }, [])

  const change = useCallback((fn: (all: Note[]) => Note[]) => {
    setNotes(all => {
      const next = fn(all)
      save(next)
      return next
    })
  }, [])

  // A Blocks tile reopens a closed note (pax-trinity's openDrawnNote, lib/drawn-notes.ts).
  useEffect(() => {
    const on = (e: Event) => {
      const id = (e as CustomEvent<{ id: string }>).detail?.id
      if (id) change((all) => all.map((n) => (n.id === id ? { ...n, open: true } : n)))
    }
    window.addEventListener(NOTE_OPEN, on)
    return () => window.removeEventListener(NOTE_OPEN, on)
  }, [change])

  const open = useCallback(
    (rect: Rect) => {
      const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
      change(all => [...all, { id, rect, text: '', ready: false }])
      window.setTimeout(() => change(all => all.map(n => (n.id === id ? { ...n, ready: true } : n))), SKELETON_MS)
    },
    [change],
  )

  useEffect(() => {
    let start: { x: number; y: number } | null = null
    let drawing = false
    const stop = () => {
      start = null
      drawing = false
      document.body.style.removeProperty('user-select')
      document.body.style.removeProperty('-webkit-user-select')
    }
    const down = (e: PointerEvent) => {
      if (!e.shiftKey || e.button !== 0 || (e.target as Element | null)?.closest?.(KEEP)) return
      start = { x: e.clientX, y: e.clientY }
    }
    const move = (e: PointerEvent) => {
      if (!start) return
      // While Shift is held for a note, the page under it stays put (Brendan, 2026-11-06): the moves stop here, in the
      // capture phase, so a chart never orbits, pans or drags under the outline. A Shift-click still reaches it.
      e.stopPropagation()
      if (!drawing) {
        if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < 6) return
        drawing = true
        document.body.style.setProperty('user-select', 'none')
        document.body.style.setProperty('-webkit-user-select', 'none')
        window.getSelection()?.removeAllRanges()
      }
      e.preventDefault()
      setOutline(rectOf(start, { x: e.clientX, y: e.clientY }))
    }
    const up = (e: PointerEvent) => {
      if (!start) return
      const from = start
      const was = drawing
      stop()
      if (!was) return
      window.getSelection()?.removeAllRanges()
      const r = rectOf(from, { x: e.clientX, y: e.clientY })
      // A stroke too small to mean a shape is let go.
      if (r.w < 40 || r.h < 40) return setOutline(null)
      const card = fit(r)
      setOutline(card)
      window.setTimeout(() => {
        setOutline(null)
        open(card)
      }, HOLD_MS)
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && drawing) {
        stop()
        setOutline(null)
      }
    }
    document.addEventListener('pointerdown', down, true)
    document.addEventListener('pointermove', move, true)
    document.addEventListener('pointerup', up, true)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('pointerdown', down, true)
      document.removeEventListener('pointermove', move, true)
      document.removeEventListener('pointerup', up, true)
      document.removeEventListener('keydown', key)
      stop()
    }
  }, [open])

  if (!mounted) return null
  return (
    <>
      {outline &&
        createPortal(
          // `nysgpt-app` on every portaled root: the paper tokens are scoped to
          // it, and these portals render into document.body, outside the div
          // that carries the class (SwitchboardPanel learned this the hard way).
          <div
            aria-hidden
            style={{ left: outline.x, top: outline.y, width: outline.w, height: outline.h }}
            className="nysgpt-app pointer-events-none fixed z-[55] rounded-2xl border-2 border-dashed border-[var(--paper-strong)] bg-[var(--paper-quiet)]"
          />,
          document.body,
        )}
      {notes.filter(n => n.open !== false).map(n =>
        n.ready ? (
          <NoteCard
            key={n.id}
            note={n}
            onChange={(id, patch) => change(all => all.map(x => (x.id === id ? { ...x, ...patch } : x)))}
            onClose={id => change(all => all.map(x => (x.id === id ? { ...x, open: false } : x)))}
            onDelete={id => change(all => all.filter(x => x.id !== id))}
          />
        ) : (
          <Skeleton key={n.id} rect={n.rect} />
        ),
      )}
    </>
  )
}

/** The paper skeleton in the drawn shape: a title bar and a few resting lines. */
function Skeleton({ rect }: { rect: Rect }) {
  const bar = 'animate-pulse rounded bg-[var(--paper-rule-soft)]'
  return createPortal(
    <div
      aria-hidden
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
      className="nysgpt-app fixed z-[55] flex flex-col rounded-2xl border border-[var(--paper-rule)] bg-[var(--paper)] shadow-[0_4px_32px_rgba(0,0,0,0.18)]"
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--paper-rule)] px-4 py-3">
        <span className={`${bar} h-4 w-4`} />
        <span className={`${bar} h-3.5 w-16`} />
        <span className={`${bar} ml-auto h-4 w-4`} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
        <span className={`${bar} h-3 w-1/3`} />
        <span className={`${bar} h-3 w-5/6`} />
        <span className={`${bar} h-3 w-2/3`} />
      </div>
    </div>,
    document.body,
  )
}


/** A note's title: its first line, the markdown's marks and tags taken off (pax-trinity's floating-note.tsx). */
const titleOf = (md: string) => md.split('\n').map((l) => l.replace(/<[^>]+>/g, '').replace(/^[#>\-*+\s]+|\d+\.\s+/g, '').replace(/[*_`]/g, '').trim()).find(Boolean) ?? 'Note'

/** The card's shapes, switched from its title as pax-trinity's floating note switches its own (Brendan, 2026-11-06):
 *  a note, a chat beside it, and a comment posted to the team. The star beside each makes it the reader's default. */
const MODES: { mode: Mode; label: string; icon: LucideIcon }[] = [
  { mode: 'note', label: 'Note', icon: StickyNote },
  { mode: 'chat', label: 'Chat', icon: MessagesSquare },
  { mode: 'team', label: 'Comment', icon: Megaphone },
]
const modeOf = (m: string | null | undefined): Mode => (m === 'comment' ? 'team' : MODES.some((x) => x.mode === m) ? (m as Mode) : 'note')

/** Shift Enter, sent to whoever is listening now: the editor is made once, its handler kept in a ref. */
function sendOnShiftEnter(send: React.RefObject<() => void>) {
  return Extension.create({
    name: 'sendOnShiftEnter',
    addKeyboardShortcuts() {
      return {
        'Shift-Enter': () => {
          send.current?.()
          return true
        },
      }
    },
  })
}

/**
 * The note card, pax-trinity's floating note (components/notes/floating-note.tsx) in the paper's colours: a tinted
 * frame, the grip, the title that switches the shape (a star makes one the default) and the three-dot menu opposite;
 * inside, the white card with the editor's toolbar at its top over the writing. The menu holds Favorite, Add to
 * Blocks, Ask, Copy as Markdown, Download, Close and Delete. The bottom-right corner resizes: down for height, right
 * for width, both together. Kept in this browser as it's written; Close keeps it (Blocks reopens it), Delete doesn't.
 */
function NoteCard({
  note,
  onChange,
  onClose,
  onDelete,
}: {
  note: Note
  onChange: (id: string, patch: Partial<Note>) => void
  onClose: (id: string) => void
  onDelete: (id: string) => void
}) {
  const [rect, setRect] = useState(note.rect)
  const drag = useRef<{ dx: number; dy: number } | null>(null)
  const from = useRef<{ x: number; y: number; w: number; h: number } | null>(null)
  const { shape: preferred, choose: chooseDefault } = useDefaultShape()
  const mine = modeOf(preferred)
  const [mode, setMode] = useState<Mode>(() => modeOf(note.mode ?? readDefaultShape()))
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<string | null>(null)
  const latest = useRef(note)
  latest.current = note
  const scroller = useRef<HTMLDivElement>(null)
  const { askAbout } = useShellPanel()
  const { favs, toggle: toggleFav } = useNoteFavorites()
  const shelf = useShelf()
  const path = usePathname()

  const sendChat = useRef<() => void>(() => {})
  const sendComment = useRef<() => void>(() => {})
  const [chatExt] = useState(() => [sendOnShiftEnter(sendChat)])
  const [commentExt] = useState(() => [sendOnShiftEnter(sendComment)])
  const [draft, setDraft] = useState('')
  const noteEditor = useTaskEditor({ value: note.text, onChange: (md) => onChange(note.id, { text: md }), placeholder: 'Write a note…', headings: true })
  const chatEditor = useTaskEditor({ value: draft, onChange: setDraft, placeholder: 'Ask about this page. Shift Enter sends.', extensions: chatExt })
  const commentEditor = useTaskEditor({ value: note.comment ?? '', onChange: (md) => onChange(note.id, { comment: md }), placeholder: 'Write a comment. Shift Enter posts.', extensions: commentExt })
  const editor = mode === 'note' ? noteEditor : mode === 'chat' ? chatEditor : commentEditor

  // The shape it's switched to takes the pen.
  useEffect(() => {
    editor?.commands.focus('end')
  }, [mode, editor])

  const choose = (m: Mode) => {
    setMode(m)
    setSaid(null)
    onChange(note.id, { mode: m })
  }

  /** Chat: the draft and the turns before it to /api/chat, the note as context; the answer streams into the card. */
  sendChat.current = async () => {
    const text = draft.trim()
    if (!text || busy) return
    const turns: Turn[] = [...(latest.current.chat ?? []), { role: 'user', content: text }]
    onChange(note.id, { chat: turns })
    chatEditor?.commands.clearContent()
    setDraft('')
    setBusy(true)
    const body = latest.current.text.trim()
    let answer = ''
    const put = () => onChange(note.id, { chat: [...turns, { role: 'assistant', content: answer || '…' }] })
    put()
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: turns, ...(body ? { systemContext: `The reader's note, which this chat sits beside:\n\n${body}` } : {}) }),
      })
      if (!res.ok || !res.body) answer = (await res.json().catch(() => ({ error: '' })) as { error?: string }).error || 'Something went wrong. Please try again.'
      else {
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          answer += decoder.decode(value, { stream: true })
          put()
          scroller.current?.scrollTo({ top: scroller.current.scrollHeight })
        }
      }
    } catch {
      answer = "The server can't be reached."
    }
    put()
    setBusy(false)
  }

  /** Comment: the comment and this page's link, to Slack and Discord (app/api/notes/team), place by place. */
  sendComment.current = async () => {
    const text = (latest.current.comment ?? '').trim()
    if (!text || busy) return
    setBusy(true)
    setSaid(null)
    try {
      const res = await fetch('/api/notes/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, url: window.location.href }),
      })
      const out = (await res.json().catch(() => ({}))) as { error?: string; results?: { place: string; ok: boolean; error?: string }[] }
      const name = (p: string) => (p === 'slack' ? 'Slack' : 'Discord')
      setSaid(out.results ? out.results.map((r) => (r.ok ? `Posted to ${name(r.place)}` : `${name(r.place)}: ${r.error}`)).join(' · ') : (out.error ?? `It answered ${res.status}.`))
    } catch {
      setSaid("The server can't be reached.")
    }
    setBusy(false)
  }

  const download = (ext: 'md' | 'txt') => {
    const body = note.text
    const text = ext === 'md' ? body : body.replace(/\*\*|__|`/g, '').replace(/^(#+|>)\s?/gm, '')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([text], { type: ext === 'md' ? 'text/markdown' : 'text/plain' }))
    a.download = `${titleOf(body).replace(/[^\w -]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'note'}.${ext}`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const settle = (r: Rect) => {
    setRect(r)
    onChange(note.id, { rect: r })
  }
  // The grip moves the card, held inside the window.
  const grip = {
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
      drag.current = { dx: e.clientX - rect.x, dy: e.clientY - rect.y }
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (!drag.current) return
      settle({ ...rect, x: Math.max(8, Math.min(e.clientX - drag.current.dx, window.innerWidth - rect.w - 8)), y: Math.max(8, Math.min(e.clientY - drag.current.dy, window.innerHeight - rect.h - 8)) })
    },
    onPointerUp: () => void (drag.current = null),
  }
  // The bottom-right corner resizes the card (pax-trinity, 2026-10-31): down for height, right for width, down and
  // right for both, no smaller than 300 by 240 and no larger than the window has room for.
  const corner = {
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
      from.current = { x: e.clientX, y: e.clientY, w: rect.w, h: rect.h }
    },
    onPointerMove: (e: React.PointerEvent) => {
      const f = from.current
      if (!f) return
      const w = Math.max(300, Math.min(f.w + e.clientX - f.x, window.innerWidth - 8 - rect.x))
      const h = Math.max(240, Math.min(f.h + e.clientY - f.y, window.innerHeight - 8 - rect.y))
      settle({ ...rect, w: Math.round(w), h: Math.round(h) })
    },
    onPointerUp: () => void (from.current = null),
  }

  const current = MODES.find((m) => m.mode === mode) ?? MODES[0]
  const key = `note:${note.id}`
  const fav = favs.includes(note.id)

  return createPortal(
    <div
      data-note
      role="dialog"
      aria-label={current.label}
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h, ...SANS }}
      className="nysgpt-app fixed z-[55] flex flex-col rounded-[18px] border border-[var(--paper-rule)] bg-[var(--paper-quiet)] p-1 shadow-[0_4px_32px_rgba(0,0,0,0.18)]"
    >
      <div className="flex shrink-0 items-center gap-1.5 pt-1.5 pr-1.5 pb-2 pl-2">
        <span {...grip} aria-label="Move" title="Move" className="flex size-6 shrink-0 cursor-grab touch-none items-center justify-center text-[var(--paper-faint)] active:cursor-grabbing">
          <GripVertical className="size-4" />
        </span>
        {/* The title, as pax-trinity's: the muted ground on hover, and at its end the up-down mark, which opens the
            shapes. */}
        <div className="min-w-0 flex-1">
          <KebabMenu
            label="Shape"
            align="left"
            width="w-56"
            trigger={
              <>
                {current.label}
                <ChevronsUpDown className="size-3.5 text-[var(--paper-faint)] opacity-0 transition-opacity group-hover/anchor:opacity-100 group-aria-expanded/anchor:opacity-100" />
              </>
            }
            triggerClassName="group/anchor inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[15px] font-semibold text-[var(--paper-text)] outline-none transition-colors select-none hover:bg-[var(--paper-quiet)] aria-expanded:bg-[var(--paper-quiet)] focus-visible:outline-1"
          >
            {MODES.map(({ mode: m, label, icon: Icon }) => (
              <div key={m} className="flex items-center gap-0.5">
                <div className="min-w-0 flex-1">
                  <MenuRow icon={<Icon />} label={label} checked={mode === m} onClick={() => choose(m)} />
                </div>
                {/* The reader's default: the shape every card opens on. */}
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={mine === m}
                  aria-label={mine === m ? `${label} is my default` : `Make ${label} my default`}
                  title={mine === m ? 'My default' : 'Make this my default'}
                  onClick={(e) => {
                    e.stopPropagation()
                    chooseDefault(m)
                  }}
                  className="flex size-7 shrink-0 items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-500"
                >
                  <Star className={mine === m ? 'size-3.5 fill-amber-400 text-amber-400' : 'size-3.5'} />
                </button>
              </div>
            ))}
          </KebabMenu>
        </div>
        <KebabMenu label="Note options" width="w-52" trigger={<EllipsisVertical className="size-4" />} triggerClassName="inline-flex size-8 items-center justify-center rounded-md text-[var(--paper-text)] outline-none hover:bg-[var(--paper-quiet)] aria-expanded:bg-[var(--paper-quiet)]">
          {/* pax-trinity's note menu: Favorite, Add to Blocks (the shelf's tile reopens the card), Ask, Copy as
              Markdown, Download, Close and Delete. */}
          <MenuRow icon={<Star className={fav ? 'fill-amber-400 text-amber-400' : undefined} />} label={fav ? 'Unfavorite' : 'Favorite'} onClick={() => toggleFav(note.id)} />
          <MenuRow
            icon={<LayoutGrid />}
            label={shelf.has(key) ? 'Remove from Blocks' : 'Add to Blocks'}
            checked={shelf.has(key)}
            onClick={() => {
              if (shelf.has(key)) shelf.remove(key)
              else shelf.add({ key, title: titleOf(note.text.trim() ? note.text : (note.comment ?? '')), path: path ?? '/', anchor: `note-${note.id}` })
            }}
          />
          <MenuRow icon={<MessagesSquare />} label="Ask NSRgpt" onClick={() => askAbout({ context: () => `My note, "${titleOf(note.text)}":\n\n${note.text}` })} />
          <MenuSeparator />
          <MenuRow icon={<Copy />} label="Copy as Markdown" onClick={() => void navigator.clipboard.writeText(note.text)} />
          <MenuFlyout id="download" icon={<Download />} label="Download">
            <MenuRow label="Markdown" onClick={() => download('md')} />
            <MenuRow label="Text" onClick={() => download('txt')} />
          </MenuFlyout>
          <MenuRow icon={<X />} label="Close" onClick={() => onClose(note.id)} />
          <MenuSeparator />
          <MenuRow
            icon={<Trash2 />}
            label="Delete note"
            danger
            onClick={() => {
              if (shelf.has(key)) shelf.remove(key)
              onDelete(note.id)
            }}
          />
          <MenuSeparator />
          <MenuFoot title="My notes" sub="Kept in this browser" />
        </KebabMenu>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[14px] border border-[var(--paper-rule)] bg-[var(--paper)]">
        <TaskToolbar editor={editor} className="shrink-0 border-b border-[var(--paper-rule)] px-2 py-1" />
        {mode === 'chat' ? (
          <div ref={scroller} className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            {(note.chat ?? []).map((t, i) => (
              <div key={i} className={`border-b border-[var(--paper-rule-soft)] px-4 py-2.5 text-[13px] leading-[1.6] ${t.role === 'user' ? 'text-[var(--paper-text)]' : 'bg-[var(--paper-quiet)] text-[var(--paper-text)]'}`}>
                <div className="mb-0.5 text-[10px] uppercase tracking-[0.14em] text-[var(--paper-faint)]">{t.role === 'user' ? 'You' : 'NSRgpt'}</div>
                <div className="prose prose-sm max-w-none text-[var(--paper-text)] [&_p]:my-1">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{t.content}</ReactMarkdown>
                </div>
              </div>
            ))}
            <div className="cursor-text px-4 py-3 text-[14px] leading-[1.6] text-[var(--paper-text)]" onClick={() => chatEditor?.commands.focus()}>
              <TaskSurface editor={chatEditor} className="min-h-16 [&_.ProseMirror]:min-h-16" />
            </div>
          </div>
        ) : (
          <div className="min-h-0 flex-1 cursor-text overflow-y-auto px-4 py-3 text-[14px] leading-[1.6] text-[var(--paper-text)]" onClick={() => editor?.commands.focus()}>
            <TaskSurface editor={editor} className="min-h-full [&_.ProseMirror]:min-h-full" />
          </div>
        )}
        {(said || busy) && (
          <span role="status" className="shrink-0 truncate border-t border-[var(--paper-rule)] px-3 py-1 text-[11px] text-[var(--paper-faint)]" title={said ?? undefined}>
            {busy ? (mode === 'chat' ? 'Answering…' : 'Posting…') : said}
          </span>
        )}
      </div>
      <span {...corner} aria-label="Resize" className="absolute right-0 bottom-0 size-4 cursor-nwse-resize touch-none" />
    </div>,
    document.body,
  )
}
