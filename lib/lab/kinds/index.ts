import { idleState, newId, type Block, type BlockKind, type KindDef } from "@/lib/lab/blocks"
import { compare } from "@/lib/lab/kinds/compare"
import { data } from "@/lib/lab/kinds/data"
import { plot } from "@/lib/lab/kinds/plot"
import { process } from "@/lib/lab/kinds/process"
import { prompt } from "@/lib/lab/kinds/prompt"

/** The five kinds, in the order the left rail lists them. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const KINDS: Record<BlockKind, KindDef<any>> = { data, process, compare, plot, prompt }
export const KIND_ORDER: BlockKind[] = ["data", "process", "compare", "plot", "prompt"]

/** A new block of a kind at a place, with the kind's ports and default params. */
export function newBlock(kind: BlockKind, position: { x: number; y: number }): Block {
  const k = KINDS[kind]
  return { id: newId(kind), kind, title: k.title, params: structuredClone(k.defaults), position, inputs: { ...k.inputs }, outputs: { ...k.outputs }, state: idleState() }
}
