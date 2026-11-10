"use client"

import { Handle, Position, type NodeProps } from "@xyflow/react"
import { Copy, CopyPlus, EllipsisVertical, GripVertical, Info, LoaderCircle, Play, Square, Trash2 } from "lucide-react"
import { setRail } from "@/components/rail-toggle"
import { lazy, memo, Suspense, useMemo, type PointerEvent as ReactPointerEvent } from "react"
import { toast } from "sonner"

import { BlockParams } from "@/components/lab/BlockParams"
import { PORT_COLOR, useLabContext } from "@/components/lab/LabContext"
import { PlotChart } from "@/components/lab/PlotChart"
import { KebabMenu, MenuRow, MenuSeparator } from "@/components/kebab-menu"
import { copyText } from "@/lib/canvas-png"
import { inputsFor, isDataset, seriesList, type Block, type Dataset, type Outputs, type Port } from "@/lib/lab/blocks"
import type { PlotMode } from "@/lib/lab/canvases/plot"
import { KINDS } from "@/lib/lab/kinds"
import type { ChatTurn } from "@/lib/chat-stream"
import { cn } from "@/lib/utils"

const ChatMessage = lazy(() => import("@/components/chat/ChatMessage").then((m) => ({ default: m.ChatMessage })))

// One block on the Lab canvas (brief 52): header (grip, kind icon, title, Run, kebab: Duplicate, Delete, Copy output),
// input ports on the left and outputs on the right, a body of its params (the Plot draws, the Prompt streams its answer),
// and a foot with its status and output summary.

const WIDTH: Record<Block["kind"], number> = { data: 300, process: 300, compare: 300, plot: 560, prompt: 420 }

/** The ports as dots on the block's edges (Brendan, 2026-11-10): inputs down the left edge, outputs down the right,
 *  spaced evenly below the header, no labels; the colour says the type (the canvas's legend names them) and the hover
 *  title says the port. */
function Ports({ ports, side }: { ports: Record<string, Port>; side: "in" | "out" }) {
  const list = Object.entries(ports)
  return (
    <>
      {list.map(([handle, port], i) => (
        <Handle
          key={handle}
          type={side === "in" ? "target" : "source"}
          id={handle}
          position={side === "in" ? Position.Left : Position.Right}
          style={{ background: PORT_COLOR[port], width: 12, height: 12, border: "2px solid var(--paper)", top: 52 + i * 22, [side === "in" ? "left" : "right"]: -6 }}
          title={`${handle}: ${port}`}
        />
      ))}
    </>
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
  if (s.status === "failed") return <span title={s.error} className="line-clamp-2 min-w-0 break-words text-[#b42318] dark:text-[#f97066]">{s.error}</span>
  if (s.status === "done")
    return <span className="truncate">{[summary, s.ms !== undefined ? `${s.ms < 1000 ? `${s.ms} ms` : `${(s.ms / 1000).toFixed(1)} s`}` : ""].filter(Boolean).join(" · ")}</span>
  return <span className="truncate">{summary ? `${summary} · not run since its change` : "Not run"}</span>
}

function BlockNodeInner({ id }: NodeProps) {
  const { lab, selected, select, openSubentry, ask, asking } = useLabContext()
  const block = lab.canvas.blocks.find((b) => b.id === id)
  const out: Outputs | undefined = lab.outputs[id]
  const inputs = useMemo(() => (block?.kind === "plot" ? inputsFor(block, lab.canvas.edges, lab.outputs) : null), [block, lab.canvas.edges, lab.outputs])
  // The plot's data, memoized with its inputs: built fresh on every render, the arrays changed identity on each drag
  // frame and PlotChart rebuilt its 38K-point chart every frame, which is what made the blocks feel heavy to drag
  // (Brendan, 2026-11-09).
  const plotData = useMemo(() => inputs ? {
    points: (inputs.points ?? []).find(isDataset) as Dataset | undefined,
    series: (inputs.series ?? []).flatMap(seriesList),
    ratio: (inputs.ratio ?? []).flatMap(seriesList),
  } : null, [inputs])
  if (!block) return null
  const kind = KINDS[block.kind]
  const running = block.state.status === "running"
  const summary = out ? kind.summary?.(out) ?? "" : ""
  const note = out ? kind.note?.(out) : undefined
  const copyOutput = async () => {
    if (!out) return toast.info("Run the block first")
    const vals = Object.values(out).filter((v) => v !== undefined)
    await copyText(vals.length === 1 && typeof vals[0] === "string" ? vals[0] : JSON.stringify(out, null, 1))
    toast.success("Output copied")
  }

  let body
  if (block.kind === "plot" && inputs && plotData) {
    const { points, series, ratio } = plotData
    const p = block.params as { mode?: PlotMode; highlight?: [number, number] }
    body = (
      <>
        <BlockParams block={block} onParams={(v) => lab.setQuietParams(id, v)} />
        {points || series.length || ratio.length ? (
          <PlotChart className="mt-2" style={{ height: block.size ? Math.max(160, block.size.h - 230) : 340 }} points={points} series={series} ratio={ratio} mode={p.mode ?? "both"} highlight={p.highlight} title={block.title} onPoint={openSubentry} />
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

  // The bottom-right corner resizes the block as the ShiftNote's does (Brendan, 2026-11-10): right for width, down for
  // height, both together; no smaller than 240 by 160. The size is the block's, saved with the canvas.
  const corner = {
    onPointerDown: (e: ReactPointerEvent<HTMLSpanElement>) => {
      e.preventDefault()
      e.stopPropagation()
      const frame = e.currentTarget.parentElement
      if (!frame) return
      const from = { x: e.clientX, y: e.clientY, w: frame.offsetWidth, h: frame.offsetHeight }
      const zoom = Number(getComputedStyle(frame.closest(".react-flow__viewport") ?? frame).transform.match(/matrix\(([^,]+)/)?.[1] ?? 1) || 1
      e.currentTarget.setPointerCapture(e.pointerId)
      const move = (ev: PointerEvent) => {
        lab.resize(id, { w: Math.max(240, Math.round(from.w + (ev.clientX - from.x) / zoom)), h: Math.max(160, Math.round(from.h + (ev.clientY - from.y) / zoom)) })
      }
      const up = () => {
        window.removeEventListener("pointermove", move)
        window.removeEventListener("pointerup", up)
      }
      window.addEventListener("pointermove", move)
      window.addEventListener("pointerup", up)
    },
  }
  const size = block.size
  return (
    <div
      style={{ width: size?.w ?? WIDTH[block.kind], height: size?.h }}
      className={cn(
        "relative flex flex-col rounded-xl border bg-[var(--paper)] text-[var(--paper-text)] shadow-sm transition-shadow",
        selected === id ? "border-[var(--paper-strong)] shadow-md" : "border-[var(--paper-rule)]",
      )}
    >
      <div className="lab-grip flex cursor-grab items-center gap-1.5 border-b border-[var(--paper-rule)] px-2 py-1.5 active:cursor-grabbing">
        <GripVertical className="h-3.5 w-3.5 shrink-0 text-[var(--paper-faint)]" />
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
          className="nodrag flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[var(--paper-muted)] hover:bg-[var(--paper-quiet)] hover:text-[var(--paper-text)]"
        >
          {running ? <Square className="h-3 w-3" /> : <Play className="h-3.5 w-3.5" />}
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
      <Ports ports={block.inputs} side="in" />
      <Ports ports={block.outputs} side="out" />
      <div className={cn("px-2.5 pb-2 pt-3", size && "nowheel min-h-0 flex-1 overflow-y-auto")}>{body}</div>
      {/* The foot: the status and its time; the summary and the notes (what a Data block left out and why) read in the
          right panel, which the info circle at the right end opens (Brendan, 2026-11-10). */}
      <div className="flex min-h-7 shrink-0 items-center gap-2 border-t border-[var(--paper-rule)] px-2.5 py-1 text-[11px] text-[var(--paper-muted)]">
        <Status block={block} summary="" />
        <button
          type="button"
          aria-label="About this block"
          title={[summary, note].filter(Boolean).join(" · ") || "About this block"}
          onClick={() => { select(id); setRail("right", false) }}
          className="nodrag ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[var(--paper-faint)] hover:bg-[var(--paper-quiet)] hover:text-[var(--paper-text)]"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </div>
      <span {...corner} aria-label="Resize" title="Resize" className="nodrag absolute right-0 bottom-0 h-4 w-4 cursor-nwse-resize touch-none" />
    </div>
  )
}

export const BlockNode = memo(BlockNodeInner)
