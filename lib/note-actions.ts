"use client"

// A reader's notes, the store behind the note card (components/notes/floating-note.tsx). The functions are
// pax-trinity's app/note-actions.ts, name for name and shape for shape (ported 2026-11-09), so the card's code is
// pax-trinity's unchanged. pax-trinity keeps notes in its DynamoDB ledger; NSRgpt's ledger table (nysgpt-ledger)
// doesn't exist yet, so these keep them in this browser (localStorage) until it does. When it does, port
// pax-trinity's lib/notes.ts and app/note-actions.ts over this file and nothing else changes.

export type Note = { id: string; videoId: string; title: string; bodyMd: string; chatMd?: string; createdAt: string; updatedAt: string }

const KEY = "nsrgpt-notes"
const ID = /^[\w-]{8,64}$/
/** The reader's own notes carry no video, as pax-trinity's drawn notes do (its Inbox lists them under My notes). */
const MINE = ""
// pax-trinity's cap, DynamoDB's 400 KB item less headroom; localStorage holds about 5 MB in all.
const MAX_BYTES = 350_000

/** First non-empty line of the markdown, its syntax stripped: the note's title. */
const titleOf = (md: string) =>
  (md.split("\n").map((l) => l.replace(/<[^>]+>/g, "").replace(/^[#>\-*+\s]+|\d+\.\s+/g, "").replace(/[*_`]/g, "").trim()).find(Boolean) ?? "Untitled note").slice(0, 120)

const read = (): Note[] => {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? "[]") as Note[]
    return Array.isArray(all) ? all : []
  } catch {
    return []
  }
}
const write = (all: Note[]) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {}
}

/** The reader's own notes, newest edit first. kept is false when nothing can be kept. */
export async function myNotes(): Promise<{ notes: Note[]; kept: boolean }> {
  if (typeof localStorage === "undefined") return { notes: [], kept: false }
  return { notes: read().filter((n) => n.videoId === MINE).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), kept: true }
}

/** A drawn note's first save: it is kept once there is something in it, the note or its chat. A note with nothing
 *  written takes its title from the chat. */
export async function createMyNote(bodyMd: string, chatMd = ""): Promise<Note | null> {
  const body = String(bodyMd)
  const chat = String(chatMd)
  if (!(body.trim() || chat.trim())) return null
  const at = new Date().toISOString()
  const note: Note = { id: crypto.randomUUID(), videoId: MINE, title: titleOf(body.trim() ? body : chat), bodyMd: body.slice(0, MAX_BYTES), chatMd: chat.slice(0, MAX_BYTES - body.length), createdAt: at, updatedAt: at }
  write([...read(), note])
  return note
}

export async function openNote(id: string): Promise<Note | null> {
  if (!ID.test(id)) return null
  return read().find((n) => n.id === id) ?? null
}

/** chatMd is a drawn note's chat; left out, the chat there is stays. */
export async function saveNote(id: string, bodyMd: string, chatMd?: string): Promise<Note | null> {
  if (!ID.test(id)) return null
  const all = read()
  const prev = all.find((n) => n.id === id)
  if (!prev) return null
  const body = String(bodyMd)
  const chat = chatMd === undefined ? prev.chatMd : String(chatMd)
  const next: Note = { ...prev, title: titleOf(body.trim() ? body : (chat ?? "")), bodyMd: body.slice(0, MAX_BYTES), chatMd: chat?.slice(0, MAX_BYTES - body.length), updatedAt: new Date().toISOString() }
  write(all.map((n) => (n.id === id ? next : n)))
  return next
}

export async function removeNote(id: string): Promise<boolean> {
  if (!ID.test(id)) return false
  write(read().filter((n) => n.id !== id))
  return true
}
