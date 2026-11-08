import Link from "next/link"
import { Check, Loader2, Minus, X } from "lucide-react"

import { Group, Row, Section } from "@/components/pipeline/pipeline-flow"
import { ProductionMap, type MapNode } from "@/components/pipeline/production-map"
import { DiagramBlock } from "@/components/blocks"
import { SideBarFold, SideBarFoldItem } from "@/components/sidebar/SideBarFold"
import { CORE, LAKE, NUCLIDE, SOURCES, SURFACES, type Status } from "@/lib/pipeline-map"
import { cn } from "@/lib/utils"

// pax2's /pipeline (src/app/pipeline/page.tsx, its production map), ported 2026-11-07 with NSRgpt's content: the
// sources on the left (each org's Datasets, Formats, Codes and Frameworks, held or to get), the NSR lake in the
// middle with the five core datasets and the keys that join them (the ERD), and what reads the lake on the right,
// built and planned (the roadmap; planned cards and their connectors draw dashed). Dropped from pax2's page: its
// admin gate, the pax2-worker video table and the block order around it.

export const metadata = { title: "Pipeline" }

type StepState = "done" | "failed" | "running" | "queued" | "partly"

function State({ s }: { s: StepState }) {
  const base = "flex size-5 shrink-0 items-center justify-center rounded-full"
  if (s === "done") return <span className={cn(base, "bg-pax2-lavender text-pax2-light-blue")}><Check className="size-3" /></span>
  if (s === "partly") return <span className={cn(base, "bg-slate-100 text-slate-500")}><Check className="size-3" /></span>
  if (s === "failed") return <span className={cn(base, "bg-pax2-red-soft text-pax2-red-deep")}><X className="size-3" /></span>
  if (s === "running") return <span className={cn(base, "text-pax2-light-blue")}><Loader2 className="size-4 animate-spin" /></span>
  return <span className={cn(base, "border border-dashed border-slate-300 text-slate-300")}><Minus className="size-3" /></span>
}

const STATE: Record<Status, StepState> = { held: "done", partly: "partly", toget: "queued", blocked: "failed" }

/** Links read as links: the house's light-blue underline. */
function Lk({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-sm text-slate-800 underline decoration-pax2-light-blue underline-offset-4 hover:text-pax2-blue">
      {children}
    </Link>
  )
}

/** The pipeline: where the data comes from, the lake it lands in, and what reads it. */
export default function PipelinePage() {
  const sources: MapNode[] = SOURCES.map((s) => ({
    id: s.id,
    title: s.title,
    count: s.count,
    planned: s.planned,
    edge: s.edge,
    body: (
      <>
        <section className="px-1 py-1.5">
          {s.folds.map((f) => (
            <SideBarFold key={f.label} label={f.label} hint={`${f.items.filter((i) => i.status === "held").length} of ${f.items.length}`} open={!s.planned}>
              {f.items.map((i) => (
                <SideBarFoldItem key={i.name} mark={<State s={STATE[i.status]} />} label={i.name} pill={i.pill} />
              ))}
            </SideBarFold>
          ))}
        </section>
        {s.note && (
          <Section>
            <p className="text-xs text-slate-500">{s.note}</p>
          </Section>
        )}
      </>
    ),
  }))

  const store = (
    <>
      <Section title={LAKE.bucket}>
        <div className="flex flex-col gap-1.5">
          <Row left="Size" pill={LAKE.size} />
          <Row left="Files" pill={LAKE.files} />
          <Row left="Records" pill={LAKE.records} />
        </div>
      </Section>
      <Section title="Core datasets">
        <div className="flex flex-col gap-2">
          {CORE.map((d) => (
            <Group key={d.id} title={d.name} count={d.count} width="w-full">
              <Section>
                <p className="text-sm text-slate-800">{d.what}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {d.count} {d.record} · {d.keys}
                </p>
              </Section>
              <Section title="Inside">
                <div className="flex flex-col gap-1.5">
                  {d.inside.map(([l, p]) => (
                    <Row key={l} left={l} pill={p} />
                  ))}
                </div>
              </Section>
              <Section title="Joins">
                <div className="flex flex-col gap-1.5">
                  {d.links.map(([l, p]) => (
                    <Row key={l} left={l} pill={p} />
                  ))}
                </div>
              </Section>
            </Group>
          ))}
        </div>
      </Section>
      <Section title="Shared key">
        <Row left={NUCLIDE.name} pill={`${NUCLIDE.keys} · ${NUCLIDE.count}`} />
      </Section>
      <Section>
        <p className="text-xs text-slate-400">Counts as of {LAKE.asOf}, from the lake&apos;s own files (docs/sketches/2026-11-07-data-index.html).</p>
      </Section>
    </>
  )

  const surfaces: MapNode[] = SURFACES.map((s) => ({
    id: s.id,
    title: s.title,
    count: s.count,
    planned: s.planned,
    edge: s.edge,
    body: (
      <Section>
        <div className="flex flex-col gap-1.5">
          {s.rows.map(([l, p]) => (
            <Row key={l} left={l} pill={p} />
          ))}
          {s.note && <p className="rounded border border-dashed border-slate-300 px-2 py-1 text-xs text-slate-500">{s.note}</p>}
          {s.href && s.open && <Lk href={s.href}>{s.open}</Lk>}
        </div>
      </Section>
    ),
  }))

  return (
    <div className="flex flex-col">
      <DiagramBlock title="Pipeline" height="auto">
        <ProductionMap left={sources} mid={{ title: "NSR lake", body: store }} right={surfaces} />
      </DiagramBlock>
    </div>
  )
}
