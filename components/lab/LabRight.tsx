"use client"

import { ExternalLink } from "lucide-react"
import Link from "next/link"
import { lazy, Suspense, useEffect, useRef, useState } from "react"

import { BlockParams } from "@/components/lab/BlockParams"
import { KIND_ICON, useLabContext } from "@/components/lab/LabContext"
import { ChatInputContainer } from "@/components/chat/ChatInput"
import { INSET, InsetBody, InsetLayers, InsetPanel } from "@/components/nsr/graph/InsetPanel"
import { BackButton } from "@/components/SwitchboardPanel"
import { apiUrl } from "@/lib/api-url"
import type { Block, Dataset, Outputs } from "@/lib/lab/blocks"
import { exforHref } from "@/lib/lab/canvases/plot"
import { KINDS } from "@/lib/lab/kinds"
import { streamChat, type ChatTurn } from "@/lib/chat-stream"
import { DEFAULT_MODEL_ID } from "@/lib/model-options"

const ChatMessage = lazy(() => import("@/components/chat/ChatMessage").then((m) => ({ default: m.ChatMessage })))

// The Lab's right inset panel (brief 52): the selected block's settings and output (a Prompt's follow-up conversation is
// here, under its answer), the EXFOR subentry a Plot point opens, and with nothing selected the copilot, a chat about the
// canvas.

function Header({ onBack, back, children }: { onBack?: () => void; back?: string; children: React.ReactNode }) {
  return (
    <div className={INSET.header}>
      {onBack && <BackButton onClick={onBack} label={back ?? "Back"} />}
      {children}
    </div>
  )
}

function Conversation({ turns, busy, onAsk, onStop }: { turns: ChatTurn[]; busy: boolean; onAsk: (q: string) => void; onStop?: () => void }) {
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => { if (busy) end.current?.scrollIntoView({ block: "end" }) }, [turns, busy])
  const last = turns.length - 1
  return (
    <>
      <InsetBody className="px-3 pt-3">
        <Suspense fallback={null}>
          {turns.map((m, i) => (
            <ChatMessage key={i} role={m.role} content={m.content} size="sm" isStreaming={busy && i === last && m.role === "assistant"} orb={!busy && i === last && m.role === "assistant" ? { messages: turns, onAsk } : undefined} />
          ))}
        </Suspense>
        <div ref={end} />
      </InsetBody>
      <div className="relative shrink-0 p-3 [&_.rounded-2xl]:p-2.5 [&_textarea]:text-sm">
        <ChatInputContainer onSubmit={(t) => t.trim() && onAsk(t.trim())} isLoading={busy} onStop={onStop} />
      </div>
    </>
  )
}

/** What a block's output says beyond its foot: the routes' notes, a Compare window's ratios. */
function notesOf(out: Outputs | undefined): string[] {
  const d = out?.dataset as Dataset | undefined
  const notes = [...((d?.meta?.notes as string[] | undefined) ?? [])]
  const missing = d?.meta?.missing as string[] | undefined
  if (missing?.length) notes.push(`Not in the lake: ${missing.join(", ")}`)
  return notes
}

function BlockView({ block, onBack }: { block: Block; onBack: () => void }) {
  const { lab, ask, asking } = useLabContext()
  const out = lab.outputs[block.id]
  const Icon = KIND_ICON[block.kind]
  const kind = KINDS[block.kind]
  const p = block.params as { prompt?: string; chat?: ChatTurn[] }
  const text = typeof out?.text === "string" ? out.text : ""
  return (
    <>
      <Header onBack={onBack} back="Back to the chat">
        <Icon className={INSET.icon} />
        <h2 className={`${INSET.title} min-w-0 truncate`}>{block.title}</h2>
      </Header>
      {block.kind === "prompt" && text ? (
        <>
          <div className="shrink-0 border-b border-[var(--paper-rule)] p-3">
            <BlockParams block={block} full onParams={(v) => lab.setParams(block.id, v)} />
          </div>
          <Conversation
            turns={[{ role: "assistant", content: text }, ...(p.chat ?? [])]}
            busy={asking === block.id || block.state.status === "running"}
            onAsk={(q) => ask(block.id, q)}
          />
        </>
      ) : (
        <InsetBody className="p-3">
          <BlockParams block={block} full onParams={(v, quiet) => (quiet ? lab.setQuietParams(block.id, v) : lab.setParams(block.id, v))} />
          <div className="mt-4 space-y-1 text-xs text-[var(--paper-muted)]">
            {block.state.status === "failed" && <p className="break-words text-[#b42318] dark:text-[#f97066]">{block.state.error}</p>}
            {out && kind.summary && <p>{kind.summary(out)}</p>}
            {out && kind.note?.(out) && <p>{kind.note(out)}</p>}
            {notesOf(out).map((n) => <p key={n}>{n}</p>)}
          </div>
        </InsetBody>
      )}
    </>
  )
}

type Sub = { datasets?: { dataset: string; code?: string; first_author?: string; n_authors?: number; year?: number; institute?: string; reference?: string; energy_min_ev?: number; energy_max_ev?: number; points?: number }[]; entry_bib?: Record<string, unknown> }

/** The free text of a bibliography field, whichever way the API nests it. */
function bibText(v: unknown): string {
  if (typeof v === "string") return v
  if (Array.isArray(v)) return v.map(bibText).filter(Boolean).join(" ")
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>
    return bibText(o.free_text ?? o.text ?? Object.values(o).filter((x) => typeof x === "string" || Array.isArray(x)))
  }
  return ""
}

function SubentryView({ id, onBack }: { id: string; onBack: () => void }) {
  const [sub, setSub] = useState<Sub | null>(null)
  const [error, setError] = useState("")
  const subent = id.slice(0, 8)
  useEffect(() => {
    setSub(null)
    setError("")
    const ctrl = new AbortController()
    fetch(apiUrl(`/exfor/subentry/${encodeURIComponent(subent)}`), { signal: ctrl.signal })
      .then(async (r) => (r.ok ? setSub(await r.json()) : setError(`The API answered ${r.status}`)))
      .catch((e) => { if ((e as Error).name !== "AbortError") setError("The subentry didn't load") })
    return () => ctrl.abort()
  }, [subent])
  const d = sub?.datasets?.find((x) => x.dataset === id) ?? sub?.datasets?.[0]
  const title = bibText(sub?.entry_bib?.TITLE).replace(/\s+/g, " ").trim()
  const rows: [string, string | number | undefined][] = d
    ? [
        ["Reaction", d.code],
        ["Author", d.first_author ? `${d.first_author}${(d.n_authors ?? 1) > 1 ? " and others" : ""}` : undefined],
        ["Year", d.year],
        ["Institute", d.institute],
        ["Reference", d.reference],
        ["Energy", d.energy_min_ev !== undefined ? `${d.energy_min_ev} to ${d.energy_max_ev} eV` : undefined],
        ["Points", d.points],
      ]
    : []
  return (
    <>
      <Header onBack={onBack} back="Back">
        <h2 className={INSET.title}>EXFOR {id}</h2>
      </Header>
      <InsetBody className="p-3 text-xs">
        {error && <p className="text-[var(--paper-muted)]">{error}</p>}
        {!sub && !error && <p className="text-[var(--paper-muted)]">Loading…</p>}
        {title && <p className="mb-3 text-sm leading-snug text-[var(--paper-text)]">{title}</p>}
        <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1">
          {rows.filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-[var(--paper-muted)]">{k}</dt>
              <dd className="min-w-0 break-words text-[var(--paper-text)]">{v}</dd>
            </div>
          ))}
        </dl>
        <Link href={exforHref(id)} className="mt-3 inline-flex items-center gap-1 text-[var(--paper-text)] underline underline-offset-2">
          Open the subentry page <ExternalLink className="h-3 w-3" />
        </Link>
      </InsetBody>
    </>
  )
}

/** The canvas in words for the copilot: each block, its params, status and output summary. */
function canvasWords(blocks: Block[], outputs: Record<string, Outputs>, edges: { source: string; target: string; sourceHandle: string; targetHandle: string }[]): string {
  const name = new Map(blocks.map((b) => [b.id, b.title]))
  const lines = blocks.map((b) => {
    const k = KINDS[b.kind]
    const out = outputs[b.id]
    return `- ${b.title} (${b.kind}): params ${JSON.stringify(b.params).slice(0, 400)}; ${b.state.status}${b.state.error ? ` (${b.state.error})` : ""}${out && k.summary ? `; output ${k.summary(out)}` : ""}`
  })
  const wires = edges.map((e) => `- ${name.get(e.source)}.${e.sourceHandle} → ${name.get(e.target)}.${e.targetHandle}`)
  return `Blocks:\n${lines.join("\n")}\n\nWires:\n${wires.join("\n") || "(none)"}`
}

function Copilot() {
  const { lab } = useLabContext()
  const [turns, setTurns] = useState<ChatTurn[]>([])
  const [busy, setBusy] = useState(false)
  const ctrl = useRef<AbortController | null>(null)
  const send = async (q: string) => {
    if (busy) return
    const history: ChatTurn[] = [...turns, { role: "user", content: q }]
    setTurns([...history, { role: "assistant", content: "" }])
    setBusy(true)
    ctrl.current = new AbortController()
    try {
      await streamChat(
        {
          messages: history,
          model: DEFAULT_MODEL_ID,
          systemContext: `The user is on the Lab, a canvas of blocks (Data, Process, Compare, Plot, Prompt) that fetch, broaden and compare nuclear data. The canvas "${lab.canvas.name}":\n${canvasWords(lab.canvas.blocks, lab.outputs, lab.canvas.edges)}`,
        },
        (cur) => setTurns([...history, { role: "assistant", content: cur }]),
        ctrl.current.signal,
      )
    } catch (e) {
      if ((e as Error).name !== "AbortError") setTurns([...history, { role: "assistant", content: `Error: ${(e as Error).message}` }])
    } finally {
      setBusy(false)
      ctrl.current = null
    }
  }
  return (
    <>
      <Header>
        <h2 className={INSET.title}>Chat</h2>
      </Header>
      {turns.length ? (
        <Conversation turns={turns} busy={busy} onAsk={send} onStop={() => ctrl.current?.abort()} />
      ) : (
        <>
          <InsetBody>
            <p className={INSET.note}>Ask about the canvas: what a block does, why one failed, what to connect next.</p>
          </InsetBody>
          <div className="relative shrink-0 p-3 [&_.rounded-2xl]:p-2.5 [&_textarea]:text-sm">
            <ChatInputContainer onSubmit={(t) => t.trim() && send(t.trim())} isLoading={busy} />
          </div>
        </>
      )}
    </>
  )
}

export function LabRight({ subentry, onCloseSubentry }: { subentry: string | null; onCloseSubentry: () => void }) {
  const { lab, selected, select } = useLabContext()
  const block = lab.canvas.blocks.find((b) => b.id === selected) ?? null
  const key = subentry ? `sub:${subentry}` : block ? `block:${block.id}` : "copilot"
  return (
    <InsetPanel side="right" storageKey="lab:inset-right-w">
      <InsetLayers layerKey={key} depth={subentry ? 2 : block ? 1 : 0}>
        {subentry ? <SubentryView id={subentry} onBack={onCloseSubentry} /> : block ? <BlockView block={block} onBack={() => select(null)} /> : <Copilot />}
      </InsetLayers>
    </InsetPanel>
  )
}
