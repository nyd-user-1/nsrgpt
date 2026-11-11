"use client";
// /datasets/{source}, the index (brief 33, Part 1): a filter by nuclide or mass (ENSDF, XUNDL), target and reaction
// (EXFOR), material and release (ENDF/B), key or author (NSR), and the rows the API's list route returns, each opening
// its record. The filter lives in the URL, so a list can be linked; the rows load after the page paints. ENDF/B's index
// compiles a reader's own ENDF-6 file to GNDS 2.0 (Brendan, 2026-11-10; lib/gnds.ts): upload, the job, the download.
import { useEffect, useMemo, useRef, useState } from "react";
import { FileUp } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MenuSelect } from "@/components/viz/MenuSelect";
import { Skeleton } from "@/components/ui/nova/skeleton";
import { apiJson, isSource, short, SOURCES, type SourceDef } from "@/lib/datasets";
import { compileUpload } from "@/lib/gnds";
import { ApiErrorNote, DataTable, UnknownSource } from "./DatasetParts";

export function DatasetIndex() {
  const { source } = useParams<{ source: string }>();
  if (!isSource(source)) return <UnknownSource name={source} />;
  return <Index key={source} def={SOURCES[source]} />;
}

function Index({ def }: { def: SourceDef }) {
  const router = useRouter();
  const sp = useSearchParams();
  const applied = useMemo(() => {
    const f: Record<string, string> = Object.fromEntries(def.filters.map((x) => [x.key, sp.get(x.key) ?? x.initial]));
    f.page = sp.get("page") ?? "1";
    return f;
  }, [def, sp]);
  const [draft, setDraft] = useState(applied);
  useEffect(() => setDraft(applied), [applied]);

  const path = def.listPath(applied);
  const q = useQuery({ queryKey: ["dataset-list", path], queryFn: () => apiJson(path as string), enabled: !!path, staleTime: 10 * 60_000, retry: false });
  const list = q.data ? def.readList(q.data, applied) : null;
  // a filter whose choices are the values the rows carry (ENDF/B's release)
  const releases = def.key === "endf" && q.data ? [...new Set(def.readList(q.data, { ...applied, release: "" }).rows.map((r) => String(r.cells.release ?? "")))].filter(Boolean).sort().reverse() : [];

  const go = (f: Record<string, string>) => {
    const p = new URLSearchParams();
    for (const x of def.filters) if (f[x.key]) p.set(x.key, f[x.key]);
    if (f.page && f.page !== "1") p.set("page", f.page);
    const qs = p.toString();
    router.replace(`/datasets/${def.key}${qs ? `?${qs}` : ""}`);
  };
  const [one, many] = def.noun;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-[var(--paper-muted)]">{def.name}</p>
        {def.key === "endf" && <CompileGnds />}
      </div>
      <form
        className="mt-4 flex flex-wrap items-end gap-3"
        onSubmit={(e) => { e.preventDefault(); go({ ...draft, page: "1" }); }}
      >
        {def.filters.map((f) => (
          <label key={f.key} className="flex min-w-[180px] flex-col gap-1 text-xs text-[var(--paper-muted)]">
            {f.label}
            {f.key === "release" ? (
              // No browser dropdowns (Brendan's rule): the house menu.
              <MenuSelect
                label={f.label}
                value={draft.release ?? ""}
                onChange={(v) => { const next = { ...draft, release: v }; setDraft(next); go(next); }}
                options={[{ value: "", label: f.placeholder ?? "Any" }, ...releases.map((r) => ({ value: r, label: r }))]}
                className="h-10 text-sm"
              />
            ) : (
              <Input value={draft[f.key] ?? ""} placeholder={f.placeholder} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} className="text-[var(--paper-text)]" />
            )}
          </label>
        ))}
        <Button type="submit" variant="outline" className="h-10 rounded-full px-5">Show</Button>
      </form>

      <div className="mt-6">
        {!path && <p className="text-sm text-[var(--paper-muted)]">Enter a {def.filters[0].label.toLowerCase()} to list its {many}.</p>}
        {path && q.isPending && (
          <div className="space-y-2">
            {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-8 w-full rounded-md" />)}
          </div>
        )}
        {q.isError && <ApiErrorNote error={q.error} />}
        {list && (
          <>
            <p className="mb-2 text-sm text-[var(--paper-text)]">
              {/* a search capped below its total (NSR's 50) says how many of how many */}
              {list.total === 1 ? `1 ${one}` : !(list.pages && list.pages > 1) && list.total && list.rows.length < list.total ? `${list.rows.length} of ${short(list.total)} ${many}` : `${short(list.total ?? list.rows.length)} ${many}`}
              {list.pages && list.pages > 1 ? <span className="text-[var(--paper-muted)]"> · page {list.page} of {list.pages}</span> : null}
            </p>
            {list.rows.length ? (
              <DataTable columns={def.columns} rows={list.rows.map((r) => def.columns.map((c) => r.cells[c.key]))} hrefs={list.rows.map((r) => r.href)} limit={1000} />
            ) : (
              <p className="text-sm text-[var(--paper-muted)]">No {many} match.</p>
            )}
            {list.pages && list.pages > 1 && (
              <div className="mt-3 flex items-center gap-2 text-sm">
                <PageLink def={def} f={applied} page={(list.page ?? 1) - 1} disabled={(list.page ?? 1) <= 1}>Previous</PageLink>
                <PageLink def={def} f={applied} page={(list.page ?? 1) + 1} disabled={(list.page ?? 1) >= list.pages}>Next</PageLink>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function PageLink({ def, f, page, disabled, children }: { def: SourceDef; f: Record<string, string>; page: number; disabled: boolean; children: React.ReactNode }) {
  if (disabled) return <span className="rounded-full border border-[var(--paper-rule-soft,var(--paper-rule))] px-3 py-1 text-[var(--paper-faint)]">{children}</span>;
  const p = new URLSearchParams();
  for (const x of def.filters) if (f[x.key]) p.set(x.key, f[x.key]);
  p.set("page", String(page));
  return <Link href={`/datasets/${def.key}?${p}`} className="rounded-full border border-[var(--paper-rule)] px-3 py-1 text-[var(--paper-text)] hover:bg-[var(--paper-quiet)]">{children}</Link>;
}

/** Compile to GNDS 2.0: a signed-in reader's ENDF-6 file (one material, 50 MB at most) goes up and comes back as the
 *  GNDS 2.0 reactionSuite, its covariances one click away in the toast. */
function CompileGnds() {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const run = async (file: File) => {
    setBusy(true);
    const t = toast.loading(`GNDS 2.0: ${file.name}`);
    try {
      const f = await compileUpload(file, (s) => toast.loading(`GNDS 2.0, ${file.name}: ${s}`, { id: t }));
      if (!f.url) throw new Error("no file came back");
      const cov = f.cov_url;
      toast.success(`GNDS 2.0: ${file.name} is downloading`, { id: t, ...(cov ? { action: { label: "Covariances", onClick: () => window.location.assign(cov) } } : {}) });
      window.location.assign(f.url);
    } catch (e) {
      toast.error(`GNDS 2.0: ${(e as Error).message}`, { id: t });
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <input
        ref={input}
        type="file"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void run(file);
        }}
      />
      <Button variant="outline" aria-label="Compile to GNDS 2.0" title="Compile an ENDF-6 file to GNDS 2.0" disabled={busy} className="h-8 w-8 shrink-0 rounded-full p-0" onClick={() => input.current?.click()}>
        <FileUp className="h-4 w-4" />
      </Button>
    </>
  );
}
