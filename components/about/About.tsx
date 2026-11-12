"use client"

import * as React from "react"
import Link from "next/link"
import { apiUrl } from "@/lib/api-url"
import { short } from "@/lib/datasets"
import { LAKE } from "@/lib/pipeline-map"

// /about (brief 58, Part B, 2026-11-10): who I am for, what I hold, what I do, how I am built and who made me, in the
// first person, one short paragraph or list each, no headings that rename what sits under them. Every count is live from
// GET /counts (worker-1, b569999; cached an hour), read after the page paints; a count that fails reads "—". The lake's
// size is the pipeline page's (lib/pipeline-map.ts).

const SANS = { fontFamily: 'var(--font-sans, "DM Sans"), sans-serif' } as const
const MONO = { fontFamily: "var(--font-mono), ui-monospace, monospace" } as const
const SECTION = "border-t border-[var(--paper-rule)]/15 py-8"
const LINK = "text-[var(--paper-text)] underline decoration-[var(--paper-rule)]/30 underline-offset-2 hover:decoration-[var(--paper-text)]"

/** The libraries in the order a reader knows them: ENDF/B's nine releases, then the four others. */
const LIBRARIES = ["B-II", "B-III", "B-IV", "B-V", "B-VI.8", "B-VII.0", "B-VII.1", "B-VIII.0", "B-VIII.1", "JEFF-3.3", "JENDL-5", "TENDL-2023", "CENDL-3.2"]

type Library = { release: string; materials: unknown; sections: unknown; points: unknown }
type Counts = { counts: Record<string, unknown>; endf: Record<string, Record<string, unknown>> }

/** GET /counts, once, after the page paints; null until it answers. */
function useCounts(): Counts | null {
  const [c, setC] = React.useState<Counts | null>(null)
  React.useEffect(() => {
    let on = true
    fetch(apiUrl("/counts"))
      .then((r) => (r.ok ? r.json() : null))
      .then((j: Partial<Counts> | null) => {
        if (on && j) setC({ counts: j.counts ?? {}, endf: j.endf ?? {} })
      })
      .catch(() => {})
    return () => {
      on = false
    }
  }, [])
  return c
}

export function About() {
  const live = useCounts()
  const pending = <span className="text-[var(--paper-faint)]">…</span>
  // A count as the page-wide formatter writes it; "…" until /counts answers, "—" where its count failed.
  const n = (v: unknown) => (live === null ? pending : typeof v === "number" ? short(v) : "—")
  const c = (k: string) => n(live?.counts[k])
  const libraries: Library[] = LIBRARIES.map((release) => ({ release, materials: live?.endf[release]?.materials, sections: live?.endf[release]?.sections, points: live?.endf[release]?.points }))
  return (
    <div className="min-h-0 flex-1 overflow-y-auto text-[var(--paper-text)]" style={SANS}>
      <div className="mx-auto max-w-[760px] px-5 pb-20 pt-10 text-[15px] leading-relaxed md:px-8">
        <p className="m-0 pb-4">
          I am NSRgpt, a display program for viewing and working with nuclear data. I give numerical values and
          charts without requiring any knowledge of the storage format, and I compare different data sets side by side.
        </p>
        <p className="m-0 pb-4">
          I am useful to engineers and physicists who use nuclear data in their applications, and my navigation suits
          teaching.
        </p>
        <p className="m-0 pb-8 text-[var(--paper-muted)]">
          I am for the people who make and use nuclear data: evaluators and the USNDP, NNDC and IAEA-NDS community;
          experimenters compiling their measurements to EXFOR; reactor, shielding and medical physicists; and students.
        </p>

        <section className={SECTION}>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            <li>
              <b>NSR</b>, the Nuclear Science References: {c("nsr_papers")} papers from 1857 to 2026, each linked to the nuclides
              and reactions it covers.
            </li>
            <li>
              <b>ENSDF</b>, evaluated structure and decay data: {c("ensdf_datasets")} datasets over {c("ensdf_nuclides")} nuclides.
            </li>
            <li>
              <b>XUNDL</b>, structure data as published, before evaluation: {c("xundl_datasets")} datasets.
            </li>
            <li>
              <b>EXFOR</b>, measured reaction data: {c("exfor_entries")} entries, {c("exfor_datasets")} datasets, {c("exfor_points")} data
              points.
            </li>
            <li>
              <b>The evaluated libraries</b>: ENDF/B&apos;s nine releases, JEFF-3.3, JENDL-5, TENDL-2023 and CENDL-3.2.
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
                  {libraries.map((l) => (
                    <tr key={l.release} className="border-t border-[var(--paper-rule)]/10">
                      <td className="py-1">{l.release}</td>
                      {[l.materials, l.sections, l.points].map((v, i) => (
                        <td key={i} className="py-1 text-right tabular-nums">{n(v)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </li>
            <li>
              <b>ICRP 107</b>, the decay data internal dosimetry uses: {c("icrp_nuclides")} radionuclides, their half-lives{" "}
              <Link href="/sweep/icrp" className={LINK}>checked against ENSDF&apos;s</Link>.
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
          <h2 className="m-0 mb-3 text-sm font-medium text-[var(--paper-muted)]">For reference</h2>
          <p className="m-0">
            JANIS, the NEA viewer, shows one library and one reaction at a time. I compare every measured cross section
            against six libraries at once, rank the disagreements, flag the datasets that do not belong, test the ranking
            against the next release, compute production yields for the medical isotopes, compile any material to GNDS 2.0,
            and search NSR, ENSDF, XUNDL, EXFOR and ICRP 107 together, with a chat that cites what it read. JANIS has the
            compiler checker; I do not, yet. <Link href="/elpis" className={LINK}>Elpis</Link>, my viewer, follows JANIS Web&apos;s browse tree,
            searches and books page for page, reading the lake.
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
