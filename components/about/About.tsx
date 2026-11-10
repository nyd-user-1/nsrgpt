"use client"

import * as React from "react"
import Link from "next/link"
import { apiUrl } from "@/lib/api-url"
import { short } from "@/lib/datasets"
import { CORE, LAKE } from "@/lib/pipeline-map"

// /about (brief 58, Part B, 2026-11-10): who I am for, what I hold, what I do, how I am built and who made me, in the
// first person, one short paragraph or list each, no headings that rename what sits under them. NSR, ENSDF and XUNDL
// read the pipeline page's counts (lib/pipeline-map.ts); EXFOR and the evaluated libraries are counted live from the API
// after the page paints (the EXFOR targets picker, and ENDF materials across every release, neutron sublibrary).

const SANS = { fontFamily: 'var(--font-sans, "DM Sans"), sans-serif' } as const
const MONO = { fontFamily: "var(--font-mono), ui-monospace, monospace" } as const
const SECTION = "border-t border-[var(--paper-rule)]/15 py-8"
const LINK = "text-[var(--paper-text)] underline decoration-[var(--paper-rule)]/30 underline-offset-2 hover:decoration-[var(--paper-text)]"

/** The libraries in the order a reader knows them: ENDF/B's nine releases, then the four others. */
const LIBRARIES = ["B-II", "B-III", "B-IV", "B-V", "B-VI.8", "B-VII.0", "B-VII.1", "B-VIII.0", "B-VIII.1", "JEFF-3.3", "JENDL-5", "TENDL-2023", "CENDL-3.2"]

type Library = { release: string; materials: number; sections: number; points: number }
type Live = { exfor: { datasets: number; points: number } | null; libraries: Library[] | null }

const core = (id: string) => CORE.find((c) => c.id === id)
const inside = (id: string, label: string) => core(id)?.inside.find(([l]) => l === label)?.[1] ?? "—"

function useLive(): Live {
  const [live, setLive] = React.useState<Live>({ exfor: null, libraries: null })
  React.useEffect(() => {
    let on = true
    fetch(apiUrl("/exfor/pickers/targets"))
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { rows?: { datasets?: number; points?: number }[] } | null) => {
        if (!on || !j?.rows) return
        const sum = (k: "datasets" | "points") => j.rows!.reduce((n, r) => n + (r[k] ?? 0), 0)
        setLive((l) => ({ ...l, exfor: { datasets: sum("datasets"), points: sum("points") } }))
      })
      .catch(() => {})
    fetch(apiUrl("/endf/materials?release=all&sublibrary=neutrons"))
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { rows?: { release: string; n_mf3_sections?: number | null; n_points?: number | null }[] } | null) => {
        if (!on || !j?.rows) return
        const by = new Map<string, Library>()
        for (const r of j.rows) {
          const l = by.get(r.release) ?? { release: r.release, materials: 0, sections: 0, points: 0 }
          l.materials += 1
          l.sections += r.n_mf3_sections ?? 0
          l.points += r.n_points ?? 0
          by.set(r.release, l)
        }
        setLive((s) => ({ ...s, libraries: LIBRARIES.map((name) => by.get(name)).filter((l): l is Library => !!l) }))
      })
      .catch(() => {})
    return () => {
      on = false
    }
  }, [])
  return live
}

export function About() {
  const live = useLive()
  const pending = <span className="text-[var(--paper-faint)]">…</span>
  return (
    <div className="min-h-0 flex-1 overflow-y-auto text-[var(--paper-text)]" style={SANS}>
      <div className="mx-auto max-w-[760px] px-5 pb-20 pt-10 text-[15px] leading-relaxed md:px-8">
        <p className="m-0 pb-8 text-[var(--paper-muted)]">
          I am for the people who make and use nuclear data: evaluators and the USNDP, NNDC and IAEA-NDS community;
          experimenters compiling their measurements to EXFOR; reactor, shielding and medical physicists; and students.
        </p>

        <section className={SECTION}>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            <li>
              <b>NSR</b>, the Nuclear Science References: {core("nsr")?.count} papers from 1857 to 2026, each linked to the nuclides
              and reactions it covers.
            </li>
            <li>
              <b>ENSDF</b>, evaluated structure and decay data: {core("ensdf")?.count} datasets, {inside("ensdf", "Levels")} levels,{" "}
              {inside("ensdf", "Gammas")} γ rays.
            </li>
            <li>
              <b>XUNDL</b>, structure data as published, before evaluation: {core("xundl")?.count} datasets.
            </li>
            <li>
              <b>EXFOR</b>, measured reaction data: {live.exfor ? short(live.exfor.datasets) : pending} datasets,{" "}
              {live.exfor ? short(live.exfor.points) : pending} data points.
            </li>
            <li>
              <b>The evaluated libraries</b>: ENDF/B&apos;s nine releases, JEFF-3.3, JENDL-5, TENDL-2023 and CENDL-3.2, their
              neutron sublibraries counted here.
              <table className="mt-3 w-full border-collapse text-[13px]" style={MONO}>
                <thead>
                  <tr className="text-left text-[11px] text-[var(--paper-faint)]">
                    <th className="pb-1.5 font-normal">Library</th>
                    <th className="pb-1.5 text-right font-normal">Materials</th>
                    <th className="pb-1.5 text-right font-normal">Sections</th>
                    <th className="pb-1.5 text-right font-normal">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {(live.libraries ?? LIBRARIES.map((release) => ({ release, materials: -1, sections: -1, points: -1 }))).map((l) => (
                    <tr key={l.release} className="border-t border-[var(--paper-rule)]/10">
                      <td className="py-1">{l.release}</td>
                      {[l.materials, l.sections, l.points].map((v, i) => (
                        <td key={i} className="py-1 text-right tabular-nums">{v < 0 ? pending : short(v)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </li>
            <li>
              <b>ICRP 107</b>, the decay data internal dosimetry uses: 1,252 radionuclides, its half-lives checked against
              ENSDF&apos;s.
            </li>
            <li>
              <b>The decay chains</b>: every ENSDF ground state&apos;s decay modes and branchings, on the{" "}
              <Link href="/viz/chart" className={LINK}>chart of nuclides</Link> and the <Link href="/graph" className={LINK}>graph</Link>.
            </li>
            <li>
              <b>The models</b>: <Link href="/nsrcpt" className={LINK}>NSR-CPT</Link>, the retrieval model trained on the references.
            </li>
          </ul>
        </section>

        <section className={SECTION}>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            <li>
              I <Link href="/search" className={LINK}>search</Link> the literature by meaning and cite what I find.
            </li>
            <li>
              I draw the <Link href="/viz/chart" className={LINK}>chart of nuclides</Link> and the <Link href="/" className={LINK}>charts</Link> behind it.
            </li>
            <li>
              I lay out the <Link href="/graph" className={LINK}>graph</Link>: decay series, process chains and production routes, each
              diagram editable.
            </li>
            <li>
              I run the <Link href="/lab" className={LINK}>Lab</Link>: blocks that fetch, broaden, compare and plot nuclear data, and ask
              about it.
            </li>
            <li>
              I run the <Link href="/sweep" className={LINK}>sweep</Link>: every measured cross section against every evaluation, ranked,
              rerun the day a library changes.
            </li>
            <li>
              I answer in <Link href="/chat" className={LINK}>chat</Link>, citing the record I read.
            </li>
          </ul>
        </section>

        <section className={SECTION}>
          <p className="m-0">
            The data sits in a lake in S3 ({LAKE.size}, {LAKE.files} files), Athena tables read it, an API serves it, and these
            pages draw it. The <Link href="/pipeline" className={LINK}>pipeline</Link>, the <Link href="/factory" className={LINK}>factory</Link>, the{" "}
            <Link href="/schema" className={LINK}>schema</Link> and the <Link href="/data-dictionary" className={LINK}>data dictionary</Link> show
            each part. The <Link href="/docs/sources-overview" className={LINK}>sources</Link> credit who keeps each database.
          </p>
        </section>

        <section className={SECTION}>
          <p className="m-0">
            Brendan Stanton made me, at NYSgpt.{" "}
            <a href="mailto:brendan@nysgpt.com" className={LINK}>
              brendan@nysgpt.com
            </a>
          </p>
        </section>
      </div>
    </div>
  )
}
