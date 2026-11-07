"use server"

import { currentUser } from "@/lib/auth"
import { listChats, patchChat, readChat, writeChat, type ChatMessage, type ChatMeta } from "@/lib/chats"
import { CHAT_SEEDS, seedChat } from "@/lib/chat-seeds"

// The reader's saved /chat conversations, kept for the chat ported from the old nsr app (2026-11-07). Signed
// out, nothing is kept. Where the chats' store (the nysgpt-ledger DynamoDB table, lib/ledger.ts)
// can't be reached — it does not exist yet — each action answers as if nothing were kept, quietly,
// instead of a 500 on every page.

async function reader(): Promise<string | null> {
  const u = await currentUser()
  return u ? u.email : null
}

const ID = /^[\w-]{8,64}$/

const quiet = <T, E>(work: Promise<T>, empty: E): Promise<T | E> => work.catch(() => empty)

/** The reader's chats, newest first; with none saved (or no store yet), the starter chats (lib/chat-seeds.ts). */
export async function myChats(): Promise<ChatMeta[]> {
  const who = await reader()
  const saved = who ? await quiet(listChats(who), []) : []
  return saved.length ? saved : CHAT_SEEDS.map((s) => s.meta)
}

export async function saveChat(id: string, messages: ChatMessage[]): Promise<ChatMeta | null> {
  const who = await reader()
  if (!who || !ID.test(id) || messages.length === 0) return null
  const clean = messages.map((m) => ({ id: String(m.id), role: m.role === "user" ? ("user" as const) : ("assistant" as const), content: String(m.content ?? ""), ...(m.model ? { model: String(m.model) } : {}) }))
  return quiet(writeChat(who, id, clean), null)
}

export async function updateChat(id: string, patch: { title?: string; favorite?: boolean; pinned?: boolean; hidden?: boolean; archived?: boolean }): Promise<ChatMeta | null> {
  const who = await reader()
  if (!who || !ID.test(id)) return null
  const p: typeof patch = {}
  if (typeof patch.title === "string") p.title = patch.title.slice(0, 120)
  for (const k of ["favorite", "pinned", "hidden", "archived"] as const) if (typeof patch[k] === "boolean") p[k] = patch[k]
  return quiet(patchChat(who, id, p), null)
}

/** For the /chat page's server render. */
export async function openChat(id: string) {
  const seed = seedChat(id)
  if (seed) return seed
  const who = await reader()
  return who && ID.test(id) ? quiet(readChat(who, id), null) : null
}
