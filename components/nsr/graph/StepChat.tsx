"use client";

import { lazy, Suspense, useRef, useState } from "react";
import { ChatInputContainer } from "@/components/chat/ChatInput";
import { InsetBody } from "@/components/nsr/graph/InsetPanel";
import { streamChat, type ChatTurn } from "@/lib/chat-stream";

const ChatMessage = lazy(() => import("@/components/chat/ChatMessage").then((m) => ({ default: m.ChatMessage })));

// The step output in the right inset panel (brief 50): the output as /chat renders it, then a conversation about it, the
// ChatInputContainer at the panel's foot. Each message goes to /api/chat with the step's prompt and output as its system
// context, and the answer streams in beneath. The conversation lives on the prompt node (`chat`, beside `output`), so a
// saved view carries it.
export function StepChat({ prompt, output, chat, onChat }: { prompt: string; output: string; chat: ChatTurn[]; onChat: (chat: ChatTurn[]) => void }) {
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const send = async (text: string, modelId: string) => {
    if (!text || busy) return;
    const history: ChatTurn[] = [...chat, { role: "user", content: text }];
    const put = (content: string) => onChat([...history, { role: "assistant", content }]);
    put("");
    setBusy(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let last = "";
    try {
      const acc = await streamChat(
        {
          messages: history,
          model: modelId,
          systemContext: `The user's /graph canvas has a prompt step. Its prompt:\n${prompt}\n\nIts output, which the user is asking about:\n${output}`,
        },
        (cur) => {
          last = cur;
          put(cur);
          endRef.current?.scrollIntoView({ block: "end" });
        },
        ctrl.signal,
      );
      if (!acc) put("(no answer came back — try again)");
    } catch (e) {
      const aborted = (e as Error).name === "AbortError";
      if (!(aborted && last)) put(aborted ? "(stopped)" : `Error: ${(e as Error).message}`);
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  };

  return (
    <>
      <InsetBody className="px-3 pt-3">
        <Suspense fallback={<p className="whitespace-pre-wrap text-xs leading-relaxed text-[var(--paper-text)]">{output}</p>}>
          <ChatMessage role="assistant" content={output} size="sm" />
          {chat.map((m, i) => (
            <ChatMessage key={i} role={m.role} content={m.content} size="sm" isStreaming={busy && i === chat.length - 1 && m.role === "assistant"} />
          ))}
        </Suspense>
        <div ref={endRef} />
      </InsetBody>
      <div className="relative shrink-0 px-2 pb-2 pt-1 [&_.rounded-2xl]:p-2.5 [&_textarea]:text-sm">
        <ChatInputContainer onSubmit={send} isLoading={busy} onStop={() => abortRef.current?.abort()} />
      </div>
    </>
  );
}
