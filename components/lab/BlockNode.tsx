"use client"

import { Handle, Position, type NodeProps } from "@xyflow/react"
import { Copy, CopyPlus, EllipsisVertical, GripVertical, LoaderCircle, Play, Square, Trash2 } from "lucide-react"
import { lazy, memo, Suspense, useMemo } from "react"
import { toast } from "sonner"

import { BlockParams } from "@/components/lab/BlockParams"
import { KIND_ICON, PORT_COLOR, useLabContext } from "@/components/lab/LabContext"
import { PlotChart } from "@/components/lab/PlotChart"
import { KebabMenu, MenuRow, MenuSeparator } from "@/components/kebab-menu"
import { copyText } from "@/lib/canvas-png"
import { inputsFor, isDataset, seriesList, type Block, type Dataset, type Outputs, type Port } from "@/lib/lab/blocks"
import type { PlotMode } from "@/lib/lab/canvases/plot"
import { KINDS } from "@/lib/lab/kinds"
import { plotSummary } from "@/lib/lab/kinds/plot"
import type { ChatTurn } from "@/lib/chat-stream"
import { cn } from "@/lib/utils"

const ChatMessage = lazy(() => import("@/components/chat/ChatMessage").then((m) => ({ default: m.ChatMessage })))

// One block on the Lab canvas (brief 52): header (grip, kind icon, title, Run, kebab: Duplicate, Delete, Copy output),
// input ports on the left and outputs on the right, a body of its params (the Plot draws, the Prompt streams its answer),
// and a foot with its status and output summary.

const WIDTH: Record<Block["kind"], number> = { data: 300, process: 300, compare: 300, plot: 560, prompt: 420 }

function Ports({ ports, side }: { ports: Record<string, Port>; side: "in" | "out" }) {
  const list = Object.entries(ports)
  if (!list.length) return <div />
  return (
    <div className={cn("flex flex-col gap-1", side === "out" && "items-end")}>
      {list.map(([handle, port]) => (
        <div key={handle} className={cn("relative flex items-center gap-1.5 text-[10px] text-[var(--paper-muted)]", side === "in" ? "pl-2.5" : "pr-2.5")}>
          <Handle
            type={side === "in" ? "target" : "source"}
            id={handle}
            position={side === "in" ? Position.Left : Position.Right}
            style={{ background: PORT_COLOR[port], width: 9, height: 9, border: "2px solid var(--paper)", [side === "in" ? "left" : "right"]: -5 }}
            title={`${handle}: ${port}`}
          />
          <span>{handle}</span>
        </div>
      ))}
    </div>
  )
}

function Status({ block, summary }: { block: Block; summary: string }) {
  const s = block.state
  if (s.status === "running")
    return (
      <span className="flex min-w-0 items-center gap-1.5">
        <LoaderCircle className="h-3 w-3 shrink-0 animate-spin" />
        <span className="truncate">{s.detail || "Running"}</span>
      </span>
    )
  if (s.status === "failed") return <span className="min-w-0 break-words text-[#b42318] dark:text-[#f97066]">{s.error}</span>
  if (s.status === "done")
    return <span className="truncate">{[summary, s.ms !== undefined ? `${s.ms < 1000 ? `${s.ms} ms` : `${(s.ms / 1000).toFixed(1)} s`}` : ""].filter(Boolean).join(" · ")}</span>
  return <span className="truncate">{summary ? `${summary} · not run since its change` : "Not run"}</span>
}

function BlockNodeInner({ id }: NodeProps) {
  const { lab, selected, select, openSubentry, ask, asking } = useLabContext()
  const block = lab.canvas.blocks.find((b) => b.id === id)
  const out: Outputs | undefined = lab.outputs[id]
  const inputs = useMemo(() => (block?.kind === "plot" ? inputsFor(block, lab.canvas.edges, lab.outputs) : null), [block, lab.canvas.edges, lab.outputs])
  if (!block) return null
  const kind = KINDS[block.kind]
  const Icon = KIND_ICON[block.kind]
  const running = block.state.status === "running"
  const summary = out ? kind.summary?.(out) ?? "" : ""
  const copyOutput = async () => {
    if (!out) return toast.info("Run the block first")
    const vals = Object.values(out).filter((v) => v !== undefined)
    await copyText(vals.length === 1 && typeof vals[0] === "string" ? vals[0] : JSON.stringify(out, null, 1))
    toast.success("Output copied")
  }

  let body
  if (block.kind === "plot" && inputs) {
    const points = (inputs.points ?? []).find(isDataset) as Dataset | undefined
    const series = (inputs.series ?? []).flatMap(seriesList)
    const ratio = (inputs.ratio ?? []).flatMap(seriesList)
    const p = block.params as { mode?: PlotMode; highlight?: [number, number] }
    body = (
      <>
        <BlockParams block={block} onParams={(v) => lab.setQuietParams(id, v)} />
        {points || series.length || ratio.length ? (
          <PlotChart className="mt-2 h-[340px]" points={points} series={series} ratio={ratio} mode={p.mode ?? "both"} highlight={p.highlight} title={block.title} onPoint={openSubentry} />
        ) : (
          <p className="mt-2 flex h-24 items-center justify-center rounded-md border border-dashed border-[var(--paper-rule)] text-[11px] text-[var(--paper-muted)]">Connect points or series</p>
        )}
      </>
    )
  } else if (block.kind === "prompt") {
    const text = typeof out?.text === "string" ? out.text : ""
    const p = block.params as { prompt?: string; chat?: ChatTurn[] }
    body = (
      <>
        <BlockParams block={block} onParams={(v, quiet) => (quiet ? lab.setQuietParams(id, v) : lab.setParams(id, v))} />
        {(text || running) && (
          <div className="nowheel nodrag mt-2 max-h-[320px] overflow-y-auto rounded-md border border-[var(--paper-rule)] px-2.5 py-2">
            <Suspense fallback={<p className="whitespace-pre-wrap text-xs">{text}</p>}>
              <ChatMessage
                role="assistant"
                content={text}
                size="sm"
                isStreaming={running}
                orb={!running && text && !p.chat?.length && asking !== id ? { messages: [{ role: "user", content: p.prompt ?? "" }, { role: "assistant", content: text }], onAsk: (q) => { select(id); ask(id, q) } } : undefined}
              />
            </Suspense>
          </div>
        )}
      </>
    )
  } else {
    body = <BlockParams block={block} onParams={(v, quiet) => (quiet ? lab.setQuietParams(id, v) : lab.setParams(id, v))} />
  }

  return (
    <div
      style={{ width: WIDTH[block.kind] }}
      className={cn(
        "rounded-xl border bg-[var(--paper)] text-[var(--paper-text)] shadow-sm transition-shadow",
        selected === id ? "border-[var(--paper-strong)] shadow-md" : "border-[var(--paper-rule)]",
      )}
    >
      <div className="lab-grip flex cursor-grab items-center gap-1.5 border-b border-[var(--paper-rule)] px-2 py-1.5 active:cursor-grabbing">
        <GripVertical className="h-3.5 w-3.5 shrink-0 text-[var(--paper-faint)]" />
        <Icon className="h-3.5 w-3.5 shrink-0 text-[var(--paper-muted)]" />
        <input
          className="nodrag min-w-0 flex-1 bg-transparent text-[13px] font-medium outline-none"
          defaultValue={block.title}
          key={block.title}
          aria-label="Block title"
          onBlur={(e) => e.target.value.trim() && e.target.value !== block.title && lab.rename(id, e.target.value.trim())}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur() }}
        />
        <button
          type="button"
          title={running ? "Stop" : "Run"}
          aria-label={running ? "Stop the block" : "Run the block"}
          onClick={() => (running ? lab.stop(id) : void lab.run(id))}
          className="nodrag flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--paper-rule)] text-[var(--paper-muted)] hover:bg-[var(--paper-quiet)] hover:text-[var(--paper-text)]"
        >
          {running ? <Square className="h-3 w-3" /> : <Play className="h-3 w-3" />}
        </button>
        <div className="nodrag">
          <KebabMenu label="Block menu" width="w-44" trigger={<EllipsisVertical className="h-3.5 w-3.5" />} triggerClassName="flex h-6 w-6 items-center justify-center rounded-full text-[var(--paper-muted)] hover:bg-[var(--paper-quiet)]">
            <MenuRow icon={<CopyPlus />} label="Duplicate" onClick={() => { const c = lab.duplicate(id); if (c) select(c) }} />
            <MenuRow icon={<Copy />} label="Copy output" onClick={copyOutput} disabled={!out} />
            <MenuSeparator />
            <MenuRow icon={<Trash2 />} label="Delete" danger onClick={() => { lab.remove(id); if (selected === id) select(null) }} />
          </KebabMenu>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 px-0 pt-2">
        <Ports ports={block.inputs} side="in" />
        <Ports ports={block.outputs} side="out" />
      </div>
      <div className="px-2.5 pb-2 pt-2">{body}</div>
      <div className="flex min-h-7 items-center border-t border-[var(--paper-rule)] px-2.5 py-1 text-[11px] text-[var(--paper-muted)]">
        <Status block={block} summary={block.kind === "plot" && inputs ? plotSummary(((inputs.points ?? []).find(isDataset) as Dataset | undefined)?.rows.length ?? 0, [...(inputs.series ?? []), ...(inputs.ratio ?? [])].flatMap(seriesList).length) : summary} />
      </div>
    </div>
  )
}

export const BlockNode = memo(BlockNodeInner)
