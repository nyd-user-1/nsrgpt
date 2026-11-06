'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronsUpDown, GripVertical, Megaphone, MessagesSquare, StickyNote, X, type LucideIcon } from 'lucide-react'
import { Extension } from '@tiptap/react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { TaskSurface, TaskToolbar, useTaskEditor } from '@/components/notes/rich-body'

const SERIF = { fontFamily: 'var(--font-display), Georgia, serif' } as const
const SANS = { fontFamily: 'var(--font-sans, "DM Sans"), sans-serif' } as const

/**
 * Shift notes, ported from pax-trinity's drawn notes (draw-notes.tsx /
 * floating-note.tsx, 2026-10-31) in the paper dress: hold Shift and drag
 * across any surface that isn't a control, a field or a picture, and a dashed
 * outline follows the pointer. Let go and the outline holds for a beat, a
 * skeleton fills it, and a note card opens there, as large as drawn. A
 * Shift-click still extends a selection — the drawing starts only once the
 * pointer has moved — and Escape while drawing lets it go. Notes are kept in
 * this browser (localStorage) until closed: the card's X discards it.
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
type Mode = 'note' | 'chat' | 'comment'
type Turn = { role: 'user' | 'assistant'; content: string }
type Note = { id: string; rect: Rect; text: string; ready: boolean; mode?: Mode; chat?: Turn[]; comment?: string }

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
    localStorage.setItem(STORE, JSON.stringify(notes.map(({ id, rect, text, mode, chat, comment }) => ({ id, rect, text, mode, chat, comment }))))
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
      {notes.map(n =>
        n.ready ? (
          <NoteCard
            key={n.id}
            note={n}
            onChange={(id, patch) => change(all => all.map(x => (x.id === id ? { ...x, ...patch } : x)))}
            onClose={id => change(all => all.filter(x => x.id !== id))}
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


/** The card's three shapes, switched from its title (Brendan, 2026-11-06): a note is a note, a chat is a chat, a
 *  comment is a comment, as in pax-trinity's floating note. */
const MODES: { mode: Mode; label: string; icon: LucideIcon; hint?: string }[] = [
  { mode: 'note', label: 'Note', icon: StickyNote },
  { mode: 'chat', label: 'Chat', icon: MessagesSquare, hint: 'Shift Enter sends. The note goes with it.' },
  { mode: 'comment', label: 'Comment', icon: Megaphone, hint: "Shift Enter posts to Slack and Discord, with this page's link." },
]

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
 * The note card: the panel's chrome at hand size. The grip moves it, the corner resizes it, the X discards it. The
 * title switches it between Note, Chat and Comment; each writes in pax-trinity's TipTap editor (components/notes/
 * rich-body.tsx, markdown in and out) under its toolbar along the foot. Kept in this browser as it's written.
 */
function NoteCard({
  note,
  onChange,
  onClose,
}: {
  note: Note
  onChange: (id: string, patch: Partial<Note>) => void
  onClose: (id: string) => void
}) {
  const [rect, setRect] = useState(note.rect)
  const drag = useRef<{ dx: number; dy: number } | null>(null)
  const size = useRef<{ x: number; y: number; w: number; h: number } | null>(null)
  const [mode, setMode] = useState<Mode>(note.mode ?? 'note')
  const [menu, setMenu] = useState(false)
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<string | null>(null)
  const latest = useRef(note)
  latest.current = note
  const scroller = useRef<HTMLDivElement>(null)

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
    setMenu(false)
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

  const settle = (r: Rect) => {
    setRect(r)
    onChange(note.id, { rect: r })
  }
  const grip = {
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
      drag.current = { dx: e.clientX - rect.x, dy: e.clientY - rect.y }
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (!drag.current) return
      settle(fit({ x: e.clientX - drag.current.dx, y: e.clientY - drag.current.dy, w: rect.w, h: rect.h }))
    },
    onPointerUp: () => (drag.current = null),
  }
  const corner = {
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
      size.current = { x: e.clientX, y: e.clientY, w: rect.w, h: rect.h }
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (!size.current) return
      settle(fit({ x: rect.x, y: rect.y, w: size.current.w + (e.clientX - size.current.x), h: size.current.h + (e.clientY - size.current.y) }))
    },
    onPointerUp: () => (size.current = null),
  }

  const current = MODES.find((m) => m.mode === mode) ?? MODES[0]
  const surface = 'min-h-0 flex-1 overflow-y-auto px-4 py-3 text-[14px] leading-[1.6] text-[var(--paper-text)] [&_.rich-body]:min-h-full'

  return createPortal(
    <div
      data-note
      role="dialog"
      aria-label={current.label}
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
      className="nysgpt-app fixed z-[55] flex flex-col overflow-hidden rounded-2xl border border-[var(--paper-rule)] bg-[var(--paper)] shadow-[0_4px_32px_rgba(0,0,0,0.18)]"
    >
      <div className="relative flex shrink-0 items-center gap-1.5 border-b border-[var(--paper-rule)] py-2 pr-2 pl-2.5">
        <span {...grip} aria-label="Move" title="Move" className="flex size-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-[var(--paper-faint)] active:cursor-grabbing">
          <GripVertical className="h-4 w-4" />
        </span>
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={menu}
          onClick={() => setMenu((v) => !v)}
          className="flex min-w-0 items-center gap-1.5 rounded-lg px-2 py-1 transition-colors hover:bg-[var(--paper-quiet)]"
        >
          <span className="truncate text-[15px] text-[var(--paper-text)]" style={SERIF}>
            {current.label}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-[var(--paper-faint)]" />
        </button>
        <span className="flex-1" />
        <button onClick={() => onClose(note.id)} aria-label="Discard the note" className="shrink-0 rounded-lg p-1.5 text-[var(--paper-faint)] transition-colors hover:bg-[var(--paper-quiet)] hover:text-[var(--paper-text)]">
          <X className="h-4 w-4" />
        </button>
        {menu && (
          <div role="menu" className="absolute top-full left-10 z-10 mt-1 w-44 overflow-hidden rounded-xl border border-[var(--paper-rule)] bg-[var(--paper)] py-1 shadow-lg" style={SANS}>
            {MODES.map((m) => (
              <button
                key={m.mode}
                role="menuitemradio"
                aria-checked={m.mode === mode}
                onClick={() => choose(m.mode)}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-colors hover:bg-[var(--paper-quiet)] ${m.mode === mode ? 'text-[var(--paper-text)]' : 'text-[var(--paper-muted)]'}`}
              >
                <m.icon className="h-4 w-4" />
                <span className="flex-1">{m.label}</span>
                {m.mode === mode && <Check className="h-3.5 w-3.5" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {mode === 'chat' ? (
        <div ref={scroller} className="flex min-h-0 flex-1 flex-col overflow-y-auto" style={SANS}>
          {(note.chat ?? []).map((t, i) => (
            <div key={i} className={`border-b border-[var(--paper-rule-soft)] px-4 py-2.5 text-[13px] leading-[1.6] ${t.role === 'user' ? 'text-[var(--paper-text)]' : 'bg-[var(--paper-quiet)] text-[var(--paper-text)]'}`}>
              <div className="mb-0.5 text-[10px] uppercase tracking-[0.14em] text-[var(--paper-faint)]">{t.role === 'user' ? 'You' : 'NSRgpt'}</div>
              <div className="prose prose-sm max-w-none text-[var(--paper-text)] [&_p]:my-1">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{t.content}</ReactMarkdown>
              </div>
            </div>
          ))}
          <div className="px-4 py-3 text-[14px] leading-[1.6] text-[var(--paper-text)]">
            <TaskSurface editor={chatEditor} className="min-h-16 [&_.ProseMirror]:min-h-16" />
          </div>
        </div>
      ) : (
        <div className={surface} style={SANS}>
          <TaskSurface editor={editor} />
        </div>
      )}

      <div className="flex shrink-0 flex-col gap-1 border-t border-[var(--paper-rule)] px-2 py-1.5" style={SANS}>
        <TaskToolbar editor={editor} className="flex-wrap" />
        {(current.hint || said || busy) && (
          <span role="status" className="truncate px-1 text-[11px] text-[var(--paper-faint)]" title={said ?? current.hint}>
            {busy ? (mode === 'chat' ? 'Answering…' : 'Posting…') : (said ?? current.hint)}
          </span>
        )}
      </div>
      <span {...corner} aria-label="Resize" className="absolute right-0 bottom-0 h-5 w-5 cursor-nwse-resize touch-none" />
    </div>,
    document.body,
  )
}
