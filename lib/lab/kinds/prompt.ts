import { isDataset, seriesList, type Dataset, type Inputs, type KindDef } from "@/lib/lab/blocks"
import { compareContext } from "@/lib/lab/canvases/compare"
import { describe, num } from "@/lib/lab/format"
import { streamChat, type ChatTurn } from "@/lib/chat-stream"

// Prompt (brief 52): the prompt with the inputs' summaries as context, to /api/chat with systemContext; the answer streams
// into the block (ctx.partial) and is the block's `text`. A Compare table with the EXFOR points beside it goes in as
// compareContext (lib/lab/canvases/compare.ts) words it; any other dataset as its columns and first rows, a series as its
// name and range, text whole. Follow-ups live on the block (`chat`) and run in the right panel (components/nsr/graph/
// StepChat.tsx).

export type PromptParams = { prompt: string; chat?: ChatTurn[] }

const FIRST_ROWS = 20
const MAX_CONTEXT = 20_000

/** The inputs as the words the model reads. */
export function contextOf(inputs: Inputs): string {
  const parts: string[] = []
  const datasets = (inputs.dataset ?? []).filter(isDataset) as Dataset[]
  const bins = datasets.find((d) => d.columns.includes("mean_ratio"))
  const exfor = datasets.find((d) => Array.isArray(d.meta?.datasets))
  if (bins) parts.push(`Measured against evaluated (the Compare block):\n${compareContext(bins, exfor)}`)
  for (const d of datasets) {
    if (d === bins || (bins && d === exfor)) continue
    const head = d.rows.slice(0, FIRST_ROWS).map((r) => d.columns.map((c) => (typeof r[c] === "number" ? num(r[c] as number) : String(r[c] ?? ""))).join("\t"))
    parts.push(`A table of ${d.rows.length} rows. Columns: ${d.columns.join(", ")}.\n${[d.columns.join("\t"), ...head].join("\n")}`)
  }
  for (const s of (inputs.series ?? []).flatMap(seriesList)) {
    const xs = s.x.filter(Number.isFinite), ys = s.y.filter(Number.isFinite)
    const range = (a: number[]) => (a.length ? `${num(Math.min(...a))} to ${num(Math.max(...a))}` : "empty")
    parts.push(`Series "${s.name}": ${s.x.length} points, x ${range(xs)} ${s.unit_x}, y ${range(ys)} ${s.unit_y}.`)
  }
  for (const t of inputs.text ?? []) if (typeof t === "string" && t.trim()) parts.push(`Text:\n${t}`)
  return parts.join("\n\n").slice(0, MAX_CONTEXT)
}

// /api/chat streams every round of its tool loop as plain text, so an answer can open with the model narrating its lookups
// ("Let me pull the EXFOR records…", "The NSR lookups returned nothing…"), each round a paragraph. The route has no
// answer-only flag; the block drops those leading paragraphs: short, plain (no heading, list, table or quote) and worded
// as a lookup. While streaming the newest paragraph may go too, so narration never shows; a finished answer keeps its
// text when nothing else is left.
const NARRATION =
  /^(let me|let's|i'll|i will|i'm going to|i am going to|(now|first|next|okay|ok),? (let me|i'll))\b|\b(let me|i'll|i will) (search|look|pull|check|fetch|try|find|query|run|use)\b|\b(lookups?|searches?|queries?|tools?) (returned|found|came back|gave)\b/i
const LOOKS_LIKE_ANSWER = /^(#|[-*+] |\d+\. |\||>|```)/

export function answerOnly(text: string, streaming = false): string {
  const paras = text.split(/\n{2,}/)
  let i = 0
  while (i < paras.length - (streaming ? 0 : 1)) {
    const p = paras[i].trim()
    if (!p || /^(-{3,}|\*{3,}|_{3,})$/.test(p)) { i++; continue }
    if (p.length < 500 && !LOOKS_LIKE_ANSWER.test(p) && NARRATION.test(p)) { i++; continue }
    break
  }
  const rest = paras.slice(i).join("\n\n").trimStart()
  return rest || (streaming ? "" : text)
}

export const prompt: KindDef<PromptParams> = {
  kind: "prompt",
  title: "Prompt",
  inputs: { dataset: "dataset", series: "series", text: "text" },
  outputs: { text: "text" },
  defaults: { prompt: "" },
  async run(p, inputs, ctx) {
    if (!p.prompt?.trim()) throw new Error("Write a prompt.")
    const context = contextOf(inputs)
    const text = await streamChat(
      {
        messages: [{ role: "user", content: p.prompt }],
        systemContext: `The user is on the Lab, a canvas of blocks that fetch and compare nuclear data. This prompt block's inputs:\n\n${context || "(none connected)"}`,
      },
      (cur) => ctx.partial({ text: answerOnly(cur, true) }),
      ctx.signal,
    )
    if (!text.trim()) throw new Error("No answer came back. Try again.")
    return { text: answerOnly(text) }
  },
  summary: (o) => describe(o.text),
}
