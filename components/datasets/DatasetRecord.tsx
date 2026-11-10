"use client";
// /datasets/{source}/{id}, the record (brief 33, Part 1): the header, the tables the record has (levels, gammas, other
// records; a subentry's data columns; a material's sections; a reference's abstract and keywords), the comments, the
// references with their NSR links, then the raw text in a mono block, folded. Four icon circles as /graph's: Text (the
// raw record as held, the API's /text route), Markdown (its /md route), PDF (its /pdf route for ENSDF and XUNDL; for the
// others the browser's print of this page, ./print.css leaving the record alone on the paper) and Open in Graph (the record's own graph node, centred).
// An ENDF/B material adds GNDS 2.0 (brief 60): the precompiled file from GET /gnds, or, when the material isn't
// precompiled, a gnds job through app/api/jobs, its wait shown as the Lab's Broaden shows it, then the file. The record
// loads after the page paints; a route that isn't live shows the API's answer.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Atom, FileCode2, FileText, Printer, Waypoints } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/nova/skeleton";
import {
  ApiError, apiBlob, apiJson, apiText, fileBase, graphNodeOf, idFromSegments, isSource, recordView, SOURCES,
  type RecordQuery, type RecordView, type SourceKey,
} from "@/lib/datasets";
import { gndsFiles } from "@/lib/gnds";
import { datasetTitle } from "@/lib/header-titles";
import { ApiErrorNote, cellText, DataTable, UnknownSource } from "./DatasetParts";
import "./print.css";

export function DatasetRecord() {
  const params = useParams<{ source: string; id: string[] }>();
  if (!isSource(params.source)) return <UnknownSource name={params.source} />;
  const id = idFromSegments(params.id);
  return <RecordPage key={`${params.source}:${id}`} source={params.source} id={id} />;
}

function download(body: string | Blob, name: string, type: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(typeof body === "string" ? new Blob([body], { type }) : body);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const failed = (what: string, e: unknown) =>
  toast.error(e instanceof ApiError ? `${what}: the API answered ${e.status || "nothing"} for ${e.path}. ${e.detail}` : `${what}: ${(e as Error).message}`);

/** /graph centred on a node: `?center=<type>:<id>`, a dataset's id being source:NUCID:DSID. */
export const graphHref = (type: string, id: string) => `/graph?center=${encodeURIComponent(`${type}:${id}`)}`;

function RecordPage({ source, id }: { source: SourceKey; id: string }) {
  const def = SOURCES[source];
  const router = useRouter();
  const sp = useSearchParams();
  const query: RecordQuery = useMemo(() => Object.fromEntries(["sub", "mf", "mt"].filter((k) => sp.get(k)).map((k) => [k, sp.get(k) as string])), [sp]);
  const path = def.recordPath(id, query);
  const q = useQuery({ queryKey: ["dataset-record", path], queryFn: () => apiJson(path), staleTime: 10 * 60_000, retry: false });
  const view: RecordView | null = q.data ? recordView(source, id, q.data, query) : null;
  const base = fileBase(source, id, query);

  // /graph's Papers view links here with ?print=1 for a source without a PDF of its own: print once the record is on the page
  const printNow = sp.get("print") === "1";
  useEffect(() => {
    if (printNow && view) { const t = setTimeout(() => window.print(), 400); return () => clearTimeout(t); }
  }, [printNow, view]);

  /** The raw record as held: what the record carries, else its /text route. */
  const rawText = async (): Promise<string> => view?.text ?? apiText(def.textPath(id, query));
  const saveText = async () => {
    try { download(await rawText(), `${base}.txt`, "text/plain;charset=utf-8"); } catch (e) { failed("Text", e); }
  };
  const saveMd = async () => {
    try { download(await apiText(def.mdPath(id, query)), `${base}.md`, "text/markdown;charset=utf-8"); } catch (e) { failed("Markdown", e); }
  };
  const savePdf = async () => {
    if (!def.pdfPath) { window.print(); return; }
    try { download(await apiBlob(def.pdfPath(id, query)), `${base}.pdf`, "application/pdf"); } catch (e) { failed("PDF", e); }
  };
  const saveGnds = async () => {
    const [release, mat] = id.split("/");
    const t = toast.loading("GNDS 2.0");
    try {
      const f = await gndsFiles(release, mat, query.sub ?? "neutrons", (s) => toast.loading(`GNDS 2.0: ${s}`, { id: t }));
      if (!f.url) throw new Error("no file came back");
      const cov = f.cov_url;
      toast.success("GNDS 2.0: the reactionSuite is downloading", { id: t, ...(cov ? { action: { label: "Covariances", onClick: () => window.location.assign(cov) } } : {}) });
      // CloudFront serves it as an attachment, so the page stays.
      window.location.assign(f.url);
    } catch (e) {
      toast.error(`GNDS 2.0: ${(e as Error).message}`, { id: t });
    }
  };
  const node = view?.graph.node ?? graphNodeOf(source, id);

  return (
    <div className="dataset-print min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          {/* back to the index; the header already names the source */}
          <Link href={`/datasets/${source}`} aria-label={`${def.label} index`} title={`${def.label} index`} className="inline-flex text-[var(--paper-muted)] hover:text-[var(--paper-text)] print:hidden">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          {/* The header names the record (brief 38, lib/header-titles.ts datasetTitle); printed, the page carries it, since
              the header doesn't print. An EXFOR entry's, a material's or a paper's own title is information the header's
              name doesn't carry, so it stays as the first row, with the line under it. */}
          <p className="hidden text-xl font-semibold print:block">{datasetTitle(`/datasets/${source}/${id}`)}</p>
          {view && (
            <>
              {source !== "ensdf" && source !== "xundl" && <p className="mt-1 text-base leading-snug text-[var(--paper-text)]">{view.title}</p>}
              {view.sub && <p className="mt-0.5 font-mono text-xs text-[var(--paper-muted)]">{view.sub}</p>}
            </>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5 print:hidden">
          <Circle label="Text" onClick={saveText}><FileText className="h-4 w-4" /></Circle>
          {source === "endf" && <Circle label="GNDS 2.0" onClick={saveGnds}><Atom className="h-4 w-4" /></Circle>}
          <Circle label="Markdown" onClick={saveMd}><FileCode2 className="h-4 w-4" /></Circle>
          <Circle label={def.pdfPath ? "PDF" : "Print to PDF"} onClick={savePdf}><Printer className="h-4 w-4" /></Circle>
          <Circle label="Open in Graph" onClick={() => router.push(graphHref(node.type, node.id))}><Waypoints className="h-4 w-4" /></Circle>
        </div>
      </div>

      <div className="mt-6 space-y-8">
        {q.isPending && (
          <div className="space-y-2">
            {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-6 w-full rounded-md" />)}
          </div>
        )}
        {q.isError && <ApiErrorNote error={q.error} />}
        {view && <RecordBody view={view} rawText={rawText} />}
      </div>
    </div>
  );
}

function Circle({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button variant="outline" aria-label={label} title={label} className="h-8 w-8 shrink-0 rounded-full p-0" onClick={onClick}>
      {children}
    </Button>
  );
}

const H2 = "mb-1.5 text-sm font-semibold text-[var(--paper-text)]";

function RecordBody({ view, rawText }: { view: RecordView; rawText: () => Promise<string> }) {
  return (
    <>
      {view.header.length > 0 && (
        <dl className="grid grid-cols-[minmax(110px,max-content)_1fr] gap-x-6 gap-y-1.5 text-sm">
          {view.header.map((h) => (
            <div key={h.label} className="contents">
              <dt className="text-[var(--paper-muted)]">{h.label}</dt>
              <dd className="min-w-0 break-words text-[var(--paper-text)]">
                {h.href
                  ? <Link href={h.href} target={h.href.startsWith("http") ? "_blank" : undefined} className="text-[var(--paper-strong)] hover:underline">{cellText(h.value)}</Link>
                  : cellText(h.value)}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {view.paragraphs.map((p) => (
        <section key={p.label}>
          <h2 className={H2}>{p.label}</h2>
          {p.pre
            ? <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-[var(--paper-text)]">{p.text}</pre>
            : <p className="max-w-3xl text-sm leading-relaxed text-[var(--paper-text)]">{p.text}</p>}
        </section>
      ))}

      {view.tables.map((t) => (
        <section key={t.name}>
          <h2 className={H2}>{t.name} <span className="font-normal text-[var(--paper-muted)]">{t.rows.length.toLocaleString()}</span></h2>
          <DataTable columns={t.columns} rows={t.rows} hrefs={t.hrefs} />
        </section>
      ))}

      {view.comments.length > 0 && (
        <section>
          <h2 className={H2}>Comments <span className="font-normal text-[var(--paper-muted)]">{view.comments.length}</span></h2>
          <div className="max-w-3xl space-y-2">
            {view.comments.map((c, i) => (
              <blockquote key={i} className="border-l-2 border-[var(--paper-rule-soft,var(--paper-rule))] pl-3 text-sm leading-relaxed text-[var(--paper-text)]">
                {c.label && <span className="mr-1.5 font-mono text-xs text-[var(--paper-muted)]">{c.label}</span>}
                {c.text}
              </blockquote>
            ))}
          </div>
        </section>
      )}

      {view.references.length > 0 && (
        <section>
          <h2 className={H2}>References <span className="font-normal text-[var(--paper-muted)]">{view.references.length}</span></h2>
          <ul className="columns-1 gap-8 text-sm sm:columns-2">
            {view.references.map((r) => (
              <li key={r.key} className="break-inside-avoid py-0.5">
                <Link href={`/datasets/nsr/${encodeURIComponent(r.key)}`} className="font-mono text-[13px] text-[var(--paper-strong)] hover:underline">{r.key}</Link>
                {r.text && <span className="text-[var(--paper-muted)]"> {r.text}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {view.exfor.length > 0 && (
        <section>
          <h2 className={H2}>EXFOR entries</h2>
          <p className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[13px]">
            {view.exfor.map((e) => <Link key={e} href={`/datasets/exfor/${encodeURIComponent(e)}`} className="text-[var(--paper-strong)] hover:underline">{e}</Link>)}
          </p>
        </section>
      )}

      <RawText key={view.textName} name={view.textName} initial={view.text} load={rawText} />
    </>
  );
}

/** The raw record in a mono block, folded; fetched on first open when the record doesn't carry it. */
function RawText({ name, initial, load }: { name: string; initial: string | null; load: () => Promise<string> }) {
  const [text, setText] = useState<string | null>(initial);
  const [error, setError] = useState<unknown>(null);
  return (
    <details
      className="print:hidden"
      onToggle={(e) => {
        if (!(e.currentTarget as HTMLDetailsElement).open || text !== null || error) return;
        load().then(setText).catch(setError);
      }}
    >
      <summary className="cursor-pointer select-none text-sm font-semibold text-[var(--paper-text)] marker:text-[var(--paper-muted)]">{name}</summary>
      <div className="mt-2">
        {error ? <ApiErrorNote error={error} /> : text === null ? (
          <Skeleton className="h-24 w-full rounded-md" />
        ) : (
          <pre className="max-h-[640px] overflow-auto rounded-lg border border-[var(--paper-rule-soft,var(--paper-rule))] bg-[var(--paper-quiet)] p-3 font-mono text-xs leading-[1.45] text-[var(--paper-text)]">{text}</pre>
        )}
      </div>
    </details>
  );
}
