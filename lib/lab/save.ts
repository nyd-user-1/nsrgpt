import type { Canvas } from "@/lib/lab/blocks"

// Saved canvases (brief 52): rows in the store behind /api/community (brief 34) with state { kind: "lab", canvas }, which
// the store files as kind "lab", so they stay out of /graph's lists. Outputs aren't saved: a block saved done reruns when
// the canvas opens.

export type SavedCanvas = { id: string; name: string; saved_by: string; created_at: string }

type View = SavedCanvas & { state: { kind?: string; canvas?: Canvas } }

export async function listCanvases(): Promise<SavedCanvas[]> {
  const r = await fetch("/api/community?tab=views&kind=lab", { cache: "no-store" })
  const j = (await r.json().catch(() => ({}))) as { views?: View[] }
  return (j.views ?? []).filter((v) => v.state?.kind === "lab").map(({ id, name, saved_by, created_at }) => ({ id, name, saved_by, created_at }))
}

export async function loadCanvas(id: string): Promise<Canvas> {
  const r = await fetch(`/api/community?tab=view&id=${encodeURIComponent(id)}`, { cache: "no-store" })
  const j = (await r.json().catch(() => ({}))) as { view?: View; error?: string }
  const c = j.view?.state?.canvas
  if (!r.ok || !c) throw new Error(j.error ?? "That canvas isn't there.")
  return { ...c, id }
}

/** The canvas as it saves: no run detail, a running or failed block saved idle. */
export function savable(c: Canvas): Canvas {
  return {
    ...c,
    blocks: c.blocks.map((b) => ({ ...b, state: { status: b.state.status === "done" ? "done" : "idle" } })),
    updated_at: new Date().toISOString(),
  }
}

/** Saves the canvas as a new row; returns its id. */
export async function saveCanvas(c: Canvas): Promise<string> {
  const r = await fetch("/api/community", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: c.name, state: { kind: "lab", canvas: savable(c) } }),
  })
  const j = (await r.json().catch(() => ({}))) as { view?: { id: string }; error?: string }
  if (!r.ok || !j.view) throw new Error(j.error ?? `Saving answered ${r.status}`)
  return j.view.id
}
