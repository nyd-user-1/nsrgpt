import { currentUser } from "@/lib/auth"
import { converseStream, docBytes } from "@/lib/chat-data/bedrock"
import { streamWithTools } from "@/lib/chat-data/converse-loop"
import { dataToolSpecs, isDataTool, nsrPrompt, nsrWired, runDataTool } from "@/lib/chat-data/tools"
import { MODEL_IDS } from "@/lib/model-options"
import { searchPapers, type NsrHit } from "@/lib/nsr-search"
import { isSearchBackend } from "@/lib/search-backends"
import { listTemplates } from "@/video/specs"

// The /chat answer, trinity's mechanics on NYSgpt's stack (2026-11-04): a system prompt, then the
// reply streamed back as plain text — the picker's model id when it is on the list, a PDF as a
// document block on the last user message, the caller's systemContext after the base prompt, the
// first chunk read before the response goes out so a call that fails at once still answers 500.
// With the NSR corpus wired (the Athena key, lib/chat-data/athena.ts) and an Anthropic model, the answer runs the tool
// loop: the model may look the corpus up mid-answer, a few rounds at most, one visible answer.
// Bedrock itself rides lib/chat-data/bedrock.ts: a bearer token on the worker, the SDK elsewhere.

const MODEL = () => process.env.NYSGPT_CHAT_MODEL ?? "us.anthropic.claude-sonnet-4-6"

// The charts an answer may draw (Brendan, 2026-11-19; brief 78): NSRgpt's own charts as Remotion templates in a
// ```nsr-video block (video/specs.ts), as trinity's chat fills ```pax-video blocks from its video guide. A template the page
// fills from the cached API takes the data to fetch, never the numbers (video/queries.ts); the trend takes props filled
// from this conversation's tool rows. An ECharts option in a ```nsr-chart block is the fallback for a shape no
// template covers. The page draws both (components/chat/ChartBlocks.tsx). The same for every request.
const CHART_GUIDE = `=== CHARTS ===
I can show a chart in my answer, played in as a short animation. I show one when the answer has a shape worth seeing: a cross section across energy, a decay chain, half-lives side by side, a count across years. Never for a single number.

The chart goes in a \`\`\`nsr-video code block holding one JSON object and nothing else. Before the block, one sentence says what the chart shows; I never describe the JSON.
- For a template marked "data", I write {"templateId": "<id>", "title": "<optional, a few words>", "data": {<what to fetch>}}. The page fetches the numbers from the evaluated and measured libraries itself; I name the nuclide, reaction, libraries or nuclides, and write no numbers.
- For a template marked "props", I write {"templateId": "<id>", "title": "<a few words>", "props": {<the template's props>}}, filled only from rows my tools returned in this conversation, never from memory, with "source" naming where the rows came from. When the rows are not in the conversation, I run the tool first, or write no block.
- What I write must fit the template's JSON Schema exactly; a block that does not fit shows an error in its place.

Only when no template fits the shape, a \`\`\`nsr-chart code block holding one ECharts option as JSON (no functions, no comments): a title, both axes named with their units, the data inline in "series", "type": "log" on an axis that spans orders of magnitude. Filled the same way, from tool rows only.

Templates:
${listTemplates()
  .map((t) => `- ${t.id} (${t.name}, writes ${t.fills}): ${t.description}\n  ${t.fills === "data" ? "Data" : "Props"} JSON Schema: ${JSON.stringify(t.schema)}`)
  .join("\n")}
=== END CHARTS ===`

const BASE_SYSTEM_PROMPT = `You are the assistant inside NSRgpt — nuclear data: the Nuclear Science References (NSR) bibliography and the NNDC databases ENSDF, XUNDL and EXFOR. Answer from the conversation and the tools you actually have, and when a question needs records this deployment does not carry, say so rather than estimating.

Speak as I, in the first person singular: "I", "me", "my". Never "we" or "our", never "NSRgpt" or "the platform" as a stand-in for I, and never name the model behind the answers.

Every figure carries its scope: say what the number counts and where it is from. When the record has a number, use that exact number; when it does not, say so plainly.

Math goes in LaTeX: $…$ inline, $$…$$ for display. Cite NSR papers by key number (e.g. 2019AB12); the page turns each key number into a link to its record.

When the user's message carries a PDF, answer from it: quote its numbers, cite its pages as (p. N), and say plainly what it does not cover.`

export async function POST(req: Request) {
  // NYSGPT_CHAT_OPEN=1 (the workers.dev build): the chat answers without a session, so the page
  // works where Cognito sign-in is not wired. Unset it to require sign-in again.
  if (process.env.NYSGPT_CHAT_OPEN !== "1" && !(await currentUser())) {
    return new Response(JSON.stringify({ error: "Sign in to chat." }), { status: 402, headers: { "Content-Type": "application/json" } })
  }
  const { messages, systemContext, model, document, searchBackend } = (await req.json()) as { messages: { role: "user" | "assistant"; content: string }[]; systemContext?: string; model?: string; record?: boolean; document?: { name?: string; data?: string }; searchBackend?: string }
  // A PDF the user attached in /chat: read by the model itself, as a document block on the last
  // user message, re-sent with every question in that conversation. Capped at 3.5 MB.
  const pdf = document?.data ? Buffer.from(document.data, "base64") : null
  if (pdf && (pdf.length > 3_700_000 || pdf.subarray(0, 4).toString() !== "%PDF")) return new Response(JSON.stringify({ error: "That file is not a PDF under 3.5 MB." }), { status: 400 })
  const pdfName = (document?.name ?? "document").replace(/\.pdf$/i, "").replace(/[^A-Za-z0-9()[\] -]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 100) || "document"
  const lastUserAt = messages.map((m) => m.role).lastIndexOf("user")
  // The picker's choice when it is one of the models this account answers on (lib/model-options); else the default.
  const modelId = model && MODEL_IDS.has(model) ? model : MODEL()
  // Extra context from the caller: record mode's guide, the onboarding, a skill, a mention.
  const extra = typeof systemContext === "string" && systemContext.trim() ? `\n\n${systemContext.slice(0, 80_000)}` : ""
  // The data tools ride Anthropic models alone (the loop's tool_use protocol).
  const tools = nsrWired() && modelId.includes("anthropic.")
  // The paper search runs first (the composer's backend, the other as fallback): its papers go to the
  // model with the question and to the page in a header, as the Sources list under the answer.
  const question = lastUserAt >= 0 ? messages[lastUserAt].content : ""
  const found = isSearchBackend(searchBackend) && question.trim() ? await searchPapers(question.slice(0, 500), searchBackend) : null
  const papers = found ? `\n\nPapers my NSR search found closest to this question (key number, year, title), most similar first. Lean on them where they answer it, cite them by key number, and say plainly when they don't:\n${found.hits.map((h: NsrHit) => `${h.key_number} (${h.year ?? "n.d."}) ${h.title}`).join("\n")}` : ""
  const system = BASE_SYSTEM_PROMPT + (tools ? `\n\n${nsrPrompt()}` : "") + `\n\n${CHART_GUIDE}` + papers + extra
  const turns = messages
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => m.content.trim())
    .map(({ m, i }) => ({ role: m.role, content: pdf && i === lastUserAt ? [{ document: { format: "pdf", name: pdfName, source: { bytes: docBytes(pdf) } } }, { text: m.content }] : [{ text: m.content }] }))
  const inferenceConfig = { maxTokens: 3000, temperature: 0.3 }
  const texts: AsyncIterable<string> = tools
    ? streamWithTools({
        modelId,
        system,
        messages: turns,
        tools: dataToolSpecs(),
        run: async (name, input) => {
          if (!isDataTool(name)) return { ok: false, payload: { error: `No tool is called ${name}.` } }
          const started = Date.now()
          const out = await runDataTool(name, input)
          // One line per lookup: which tool, its input, how long, and whether it found anything.
          console.info(`chat tool ${name} ${JSON.stringify(input).slice(0, 160)} ${Date.now() - started}ms ${out.ok ? "ok" : "miss"} ${JSON.stringify(out.payload).length}c`)
          return out
        },
        inferenceConfig,
      })
    : (async function* () {
        for await (const ev of converseStream({ modelId, system: [{ text: system }], messages: turns, inferenceConfig })) {
          const text = ev.contentBlockDelta?.delta?.text
          if (text) yield text
        }
      })()
  // The first piece is read before the response goes out, so a call that fails at once still answers 500.
  const it = texts[Symbol.asyncIterator]()
  const first = await it.next()
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      try {
        if (!first.done) controller.enqueue(encoder.encode(first.value as string))
        for (let r = first.done ? first : await it.next(); !r.done; r = await it.next()) controller.enqueue(encoder.encode(r.value as string))
      } finally {
        controller.close()
      }
    },
  })
  const sourceHeaders: Record<string, string> = found
    ? { "x-nsr-backend": found.backend, "x-nsr-sources": encodeURIComponent(JSON.stringify(found.hits.map((h) => ({ key_number: h.key_number, title: h.title, doi: h.doi, similarity: h.similarity })))) }
    : {}
  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache", ...sourceHeaders } })
}
