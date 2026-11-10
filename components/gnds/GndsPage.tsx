"use client"

import * as React from "react"
import { Download, FileUp, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { apiUrl } from "@/lib/api-url"
import { compileUpload, gndsByName, type GndsFiles } from "@/lib/gnds"

// /gnds, the GNDS 2.0 compiler (Brendan, 2026-11-10): the walkthrough of ~/Code/tariffs' /form-7501 (what it does, a
// drop zone, sample cards, numbered steps, a footnote), in my words and the paper palette. Try one: six materials,
// downloaded at once where precompiled. Compile your own: three steps, the drop zone (lib/gnds.ts compileUpload, the
// /datasets/endf circle's flow) and a sample ENDF-6 file, H-1 from ENDF/B-VIII.1, assembled in the browser from the
// API's sections. Coverage from GET /gnds/releases, one line a release.

const SERIF = { fontFamily: "var(--font-display), Georgia, serif" } as const
const MONO = { fontFamily: "var(--font-mono), ui-monospace, monospace" } as const
const SECTION = "border-t border-[var(--paper-rule)]/15 pt-8 mt-10"
const CAPTION = "text-[11px] uppercase tracking-[0.16em] text-[var(--paper-faint)]"

/** Bytes as a reader reads them. */
const sizeText = (b: number | null | undefined) =>
  b == null ? "" : b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : b >= 1e3 ? `${Math.round(b / 1e3)} KB` : `${b} B`

const EXAMPLES = [
  { name: "U-235", release: "B-VIII.1", sub: "neutrons", note: "fission, the reactor's fuel" },
  { name: "Pu-239", release: "B-VIII.1", sub: "neutrons", note: "fission, bred from U-238" },
  { name: "Fe-56", release: "B-VIII.1", sub: "neutrons", note: "structural steel" },
  { name: "Lu-176", release: "B-VIII.1", sub: "neutrons", note: "capture to Lu-177, a therapy isotope" },
  { name: "Mo-100", release: "TENDL-2023", sub: "protons", note: "(p,2n) to Tc-99m, the cyclotron route" },
  { name: "Ra-226", release: "B-VIII.1", sub: "neutrons", note: "the start of the Ac-225 routes" },
]

/** Downloads a compiled pair: the reactionSuite now, the covarianceSuite one click away in the toast. */
function deliver(f: GndsFiles, what: string, t: string | number) {
  if (!f.url) throw new Error("no file came back")
  const cov = f.cov_url
  toast.success(`GNDS 2.0: ${what} is downloading`, { id: t, ...(cov ? { action: { label: "Covariances", onClick: () => window.location.assign(cov) } } : {}) })
  window.location.assign(f.url)
}

type Held = { url?: string; cov_url?: string | null; bytes?: number; cov_bytes?: number; error?: string }

function Example({ e }: { e: (typeof EXAMPLES)[number] }) {
  const [held, setHeld] = React.useState<Held | null>(null)
  const [busy, setBusy] = React.useState(false)
  React.useEffect(() => {
    let on = true
    fetch(apiUrl(`/gnds?${new URLSearchParams({ release: e.release, name: e.name, sub: e.sub }).toString()}`))
      .then(async (r) => ({ ok: r.ok, j: (await r.json().catch(() => ({}))) as Held }))
      .then(({ ok, j }) => on && setHeld(ok ? j : { error: "compiled when you ask" }))
      .catch(() => on && setHeld({ error: "compiled when you ask" }))
    return () => {
      on = false
    }
  }, [e])
  const go = async () => {
    setBusy(true)
    const t = toast.loading(`GNDS 2.0: ${e.name}`)
    try {
      const f = held?.url ? held : await gndsByName(e.release, e.name, e.sub, (s) => toast.loading(`GNDS 2.0, ${e.name}: ${s}`, { id: t }))
      deliver(f, `${e.name}, ${e.release}`, t)
    } catch (err) {
      toast.error(`GNDS 2.0: ${(err as Error).message}`, { id: t })
    } finally {
      setBusy(false)
    }
  }
  return (
    <button
      type="button"
      onClick={go}
      disabled={busy}
      className="group flex flex-col items-start gap-1 border-b border-r border-[var(--paper-rule)] px-5 py-5 text-left transition-colors hover:bg-[var(--paper-quiet)] disabled:opacity-60"
    >
      <span className="flex w-full items-start justify-between gap-3">
        <span className="text-[22px] leading-none text-[var(--paper-text)]" style={SERIF}>{e.name}</span>
        {busy ? <Loader2 className="h-4 w-4 animate-spin text-[var(--paper-muted)]" /> : <Download className="h-4 w-4 text-[var(--paper-faint)] group-hover:text-[var(--paper-text)]" />}
      </span>
      <span className="text-[11px] text-[var(--paper-faint)]" style={MONO}>
        {e.release} · {e.sub}
      </span>
      <span className="mt-2 text-[12px] leading-relaxed text-[var(--paper-muted)]">{e.note}</span>
      <span className="mt-2 text-[11px] text-[var(--paper-muted)]" style={MONO}>
        {!held ? "…" : held.url ? `${sizeText(held.bytes)}${held.cov_bytes ? ` · covariances ${sizeText(held.cov_bytes)}` : ""}` : "compiled when you ask, about 30 s"}
      </span>
    </button>
  )
}

/** The drop zone: click or drop an ENDF-6 file; it compiles and downloads. */
function DropZone() {
  const input = React.useRef<HTMLInputElement>(null)
  const [over, setOver] = React.useState(false)
  const [status, setStatus] = React.useState<string | null>(null)
  const run = async (file: File) => {
    setStatus("uploading")
    const t = toast.loading(`GNDS 2.0: ${file.name}`)
    try {
      const f = await compileUpload(file, (s) => {
        setStatus(s)
        toast.loading(`GNDS 2.0, ${file.name}: ${s}`, { id: t })
      })
      deliver(f, file.name, t)
    } catch (err) {
      toast.error(`GNDS 2.0: ${(err as Error).message}`, { id: t })
    } finally {
      setStatus(null)
    }
  }
  return (
    <label
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        const f = e.dataTransfer.files?.[0]
        if (f && !status) void run(f)
      }}
      className={`mt-6 flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-12 text-center transition-colors ${over ? "border-[var(--paper-text)] bg-[var(--paper-quiet)]" : "border-[var(--paper-rule)]/30 hover:border-[var(--paper-text)]"}`}
    >
      <input
        ref={input}
        type="file"
        className="hidden"
        disabled={!!status}
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ""
          if (f) void run(f)
        }}
      />
      {status ? (
        <>
          <Loader2 className="h-6 w-6 animate-spin text-[var(--paper-muted)]" />
          <span className="text-[14px] text-[var(--paper-muted)]">{status}</span>
        </>
      ) : (
        <>
          <FileUp className="h-7 w-7 text-[var(--paper-faint)]" />
          <span className="text-[15px] font-medium text-[var(--paper-text)]">Drop an ENDF-6 file here, or click to choose one</span>
          <span className="text-[12px] text-[var(--paper-faint)]">One material, up to 50 MB. Signed in.</span>
        </>
      )}
    </label>
  )
}

/** One ENDF-6 record line: its 66 columns of data, then MAT, MF, MT and the line's sequence number. */
const line = (data: string, mat: number, mf: number, mt: number, seq: number) =>
  `${data.padEnd(66).slice(0, 66)}${String(mat).padStart(4)}${String(mf).padStart(2)}${String(mt).padStart(3)}${String(seq).padStart(5)}`
const ZERO = " 0.000000+0 0.000000+0          0          0          0          0"

/** H-1 from ENDF/B-VIII.1 (MAT 125) as an ENDF-6 tape: the API serves a material a section at a time, so its sections
 *  are joined here with the SEND, FEND, MEND and TEND records between them. */
async function sampleTape(): Promise<Blob> {
  const base = "/endf/material/B-VIII.1/125"
  const meta = (await (await fetch(apiUrl(`${base}?sub=neutrons`))).json()) as { sections?: { mf: number; mt: number }[] }
  const sections = meta.sections ?? []
  const out: string[] = [line(" ENDF/B-VIII.1 H-1, MAT 125, joined from NSRgpt's sections", 1, 0, 0, 0)]
  let lastMf = -1
  for (const s of sections) {
    if (lastMf !== -1 && s.mf !== lastMf) out.push(line(ZERO, 125, 0, 0, 0))
    lastMf = s.mf
    const text = await (await fetch(apiUrl(`${base}/text?sub=neutrons&mf=${s.mf}&mt=${s.mt}`))).text()
    let seq = 1
    for (const raw of text.split("\n")) if (raw.trim()) out.push(line(raw.slice(0, 66), 125, s.mf, s.mt, seq++))
    out.push(line(ZERO, 125, s.mf, 0, 99999))
  }
  out.push(line(ZERO, 125, 0, 0, 0), line(ZERO, 0, 0, 0, 0), line(ZERO, -1, 0, 0, 0))
  return new Blob([out.join("\n") + "\n"], { type: "text/plain" })
}

function Sample() {
  const [busy, setBusy] = React.useState(false)
  const go = async () => {
    setBusy(true)
    try {
      const blob = await sampleTape()
      const a = document.createElement("a")
      a.href = URL.createObjectURL(blob)
      a.download = "n-001_H_001.endf"
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 1000)
      toast.success(`H-1, ENDF/B-VIII.1: ${sizeText(blob.size)}`)
    } catch (err) {
      toast.error(`The sample: ${(err as Error).message}`)
    } finally {
      setBusy(false)
    }
  }
  return (
    <button type="button" onClick={go} disabled={busy} className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-[var(--paper-rule)]/30 px-2.5 py-0.5 text-[12px] text-[var(--paper-muted)] transition-colors hover:bg-[var(--paper-quiet)] disabled:opacity-60">
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
      A sample: H-1, ENDF/B-VIII.1
    </button>
  )
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="m-0 text-[22px] leading-none text-[var(--paper-faint)]" style={SERIF}>{n}</p>
      <p className="m-0 mt-2 text-[15px] font-semibold text-[var(--paper-text)]">{title}</p>
      <div className="mt-1.5 text-[14px] leading-relaxed text-[var(--paper-muted)]">{children}</div>
    </div>
  )
}

type Releases = { releases?: Record<string, { materials?: number; converted?: number; failed?: number; bytes?: number }>; fudge?: { version?: string } }

function Coverage() {
  const [r, setR] = React.useState<Releases | null>(null)
  React.useEffect(() => {
    let on = true
    fetch(apiUrl("/gnds/releases"))
      .then((res) => (res.ok ? res.json() : null))
      .then((j) => on && setR(j))
      .catch(() => {})
    return () => {
      on = false
    }
  }, [])
  const rows = Object.entries(r?.releases ?? {}).sort((a, b) => b[0].localeCompare(a[0], "en", { numeric: true }))
  if (!r) return <p className="text-[13px] text-[var(--paper-faint)]">…</p>
  return (
    <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[13px]" style={MONO}>
      {rows.map(([rel, v]) => (
        <li key={rel}>
          {rel}: {(v.converted ?? 0).toLocaleString("en")} of {(v.materials ?? 0).toLocaleString("en")} materials compiled
          {v.failed ? `, ${v.failed} failed` : ""}, {sizeText(v.bytes)}
        </li>
      ))}
    </ul>
  )
}

export function GndsPage() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto text-[var(--paper-text)]">
      <div className="mx-auto max-w-[900px] px-5 pb-20 pt-10 md:px-8">
        <p className="m-0 max-w-[62ch] text-[17px] leading-relaxed text-[var(--paper-muted)]">
          I compile evaluated nuclear data from ENDF-6 into GNDS 2.0, the XML format that replaces it: an ENDF-6 material goes in,
          its reactionSuite and, where it has covariances, its covarianceSuite come out, written by LLNL&apos;s FUDGE 6.14.0. I am
          compiling every release the lake holds, as far as the list below says, and I compile your own file the same way.
        </p>

        <section className={SECTION}>
          <p className={CAPTION}>Try one</p>
          <div className="mt-4 grid grid-cols-1 border-l border-t border-[var(--paper-rule)] sm:grid-cols-2 lg:grid-cols-3">
            {EXAMPLES.map((e) => (
              <Example key={`${e.release}-${e.name}-${e.sub}`} e={e} />
            ))}
          </div>
        </section>

        <section className={SECTION}>
          <p className={CAPTION}>Compile your own</p>
          <div className="mt-5 grid gap-x-10 gap-y-8 sm:grid-cols-3">
            <Step n="01" title="Pick an ENDF-6 file">
              One material, as a library distributes it, up to 50 MB.
              <br />
              <Sample />
            </Step>
            <Step n="02" title="I compile it">
              FUDGE turns it into GNDS 2.0 on a box of mine, in about 30 seconds for a large actinide.
            </Step>
            <Step n="03" title="Download">
              The reactionSuite downloads by itself; the covarianceSuite is one click away.
            </Step>
          </div>
          <DropZone />
        </section>

        <section className={SECTION}>
          <p className={CAPTION}>What I have compiled</p>
          <div className="mt-4">
            <Coverage />
          </div>
        </section>

        <p className="mt-12 text-[12px] leading-relaxed text-[var(--paper-faint)]">
          FUDGE&apos;s endf2gnds with --continuumSpectraFix and --formatVersion 2.0. A thermal-scattering file is read by its
          name, so keep the name the library gave it.
        </p>
      </div>
    </div>
  )
}
