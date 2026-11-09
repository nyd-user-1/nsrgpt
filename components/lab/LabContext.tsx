"use client"

import { createContext, useContext } from "react"
import { ChartLine, Cpu, Database, MessageSquareText, Scale, type LucideIcon } from "lucide-react"

import type { Lab } from "@/components/lab/useLab"
import type { BlockKind, Port } from "@/lib/lab/blocks"

/** What the blocks reach: the Lab's state and engine, the selection, and the right panel's EXFOR view. */
export type LabContextValue = {
  lab: Lab
  selected: string | null
  select: (id: string | null) => void
  openSubentry: (datasetId: string) => void
  ask: (blockId: string, q: string) => void
  asking: string | null
}

export const LabContext = createContext<LabContextValue | null>(null)

export function useLabContext(): LabContextValue {
  const v = useContext(LabContext)
  if (!v) throw new Error("useLabContext outside the Lab")
  return v
}

export const KIND_ICON: Record<BlockKind, LucideIcon> = { data: Database, process: Cpu, compare: Scale, plot: ChartLine, prompt: MessageSquareText }

/** A port's colour: the dataviz palette's first three slots. */
export const PORT_COLOR: Record<Port, string> = { dataset: "#2a78d6", series: "#1baf7a", text: "#eda100" }
