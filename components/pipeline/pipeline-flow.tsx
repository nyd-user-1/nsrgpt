"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowRight, ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"

// The production map's parts, ported from pax2 (src/components/pipeline-flow.tsx, 2026-11-07): Count, Section,
// Group and Row. pax2's own PipelineFlow diagram (its render-and-check run) is dropped.

export function Count({ n, on }: { n: number | string; on: boolean }) {
  return <span className={cn("ml-1 flex h-[18px] min-w-[18px] items-center justify-center rounded px-1 text-xs", on ? "bg-pax2-lavender text-pax2-light-blue" : "bg-slate-100 text-slate-500")}>{n}</span>
}

export function Section({ title, children, href }: { title?: string; children: React.ReactNode; href?: string }) {
  const body = (
    <section className="px-3 py-2.5">
      {title && (
        <header className="relative mb-1 flex items-center">
          <h3 className="text-sm font-medium text-slate-500">{title}</h3>
          {href && <ArrowRight data-arrow className="absolute right-0 size-3.5 translate-x-1 text-slate-400 opacity-0 transition-all duration-200" />}
        </header>
      )}
      {children}
    </section>
  )
  return href ? (
    <Link href={href} className="block hover:bg-slate-50 hover:[&_[data-arrow]]:translate-x-0 hover:[&_[data-arrow]]:opacity-100">
      {body}
    </Link>
  ) : (
    body
  )
}

/** A titled card that opens to its sections. `planned` draws it dashed: it is not built yet. */
export function Group({ title, count, open: start = false, headRef, width = "w-[280px]", planned = false, children }: { title: string; count: number | string; open?: boolean; headRef?: (el: HTMLButtonElement | null) => void; width?: string; planned?: boolean; children?: React.ReactNode }) {
  const [open, setOpen] = React.useState(start)
  const on = !planned && (typeof count === "string" || count > 0)
  return (
    <div className={cn("rounded-xl border bg-slate-50 p-1", planned ? "border-dashed border-slate-400" : "border-black/15", open && children ? "pb-0" : "", width)}>
      <button ref={headRef} type="button" onClick={() => setOpen(!open)} className={cn("flex h-10 w-full items-center rounded-lg px-3 font-medium", planned ? "border border-dashed border-slate-300 bg-white/60 text-slate-500 hover:bg-white" : "bg-white text-slate-900 shadow-md shadow-black/[0.07] ring-1 ring-black/15 hover:bg-slate-50")}>
        {title}
        <Count n={count} on={on} />
        <ChevronDown className={cn("ml-auto size-4 text-slate-600 transition-transform", open && "rotate-180")} />
      </button>
      {open && children && <div className="-mx-1 -mb-0.5 divide-y divide-slate-200 pt-0.5">{children}</div>}
    </div>
  )
}

export function Row({ left, pill }: { left: React.ReactNode; pill: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <p className="text-sm text-slate-800">{left}</p>
      <div className="grow border-b border-slate-200" />
      <span className="inline-flex shrink-0 items-center rounded-full bg-white px-2 py-0.5 text-xs font-medium whitespace-nowrap text-slate-500 ring-1 ring-slate-200">{pill}</span>
    </div>
  )
}

