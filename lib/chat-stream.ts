// One /api/chat answer, streamed (brief 50): the loop the graph's dock, /search's record chat and the step output's
// chat share. `onText` gets the whole answer so far after each chunk; the promise resolves with the finished answer.
// An abort rejects with the AbortError, as fetch does.

export type ChatTurn = { role: "user" | "assistant"; content: string }

export async function streamChat(
  body: { messages: ChatTurn[]; model?: string; systemContext?: string },
  onText: (text: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok) throw new Error(`chat ${res.status}`)
  const reader = res.body!.getReader()
  const dec = new TextDecoder()
  let acc = ""
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    acc += dec.decode(value, { stream: true })
    onText(acc)
  }
  return acc
}
