"use client";
// /datasets/{source}, the index (brief 33, Part 1): a filter by nuclide or mass (ENSDF, XUNDL), target and reaction
// (EXFOR), material and release (ENDF/B), key or author (NSR), and the rows the API's list route returns, each opening
// its record. The filter lives in the URL, so a list can be linked; the rows load after the page paints.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/nova/skeleton";
import { apiJson, isSource, short, SOURCES, type SourceDef } from "@/lib/datasets";
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
      <p className="text-sm text-[var(--paper-muted)]">{def.name}</p>
      <form
        className="mt-4 flex flex-wrap items-end gap-3"
        onSubmit={(e) => { e.preventDefault(); go({ ...draft, page: "1" }); }}
      >
        {def.filters.map((f) => (
          <label key={f.key} className="flex min-w-[180px] flex-col gap-1 text-xs text-[var(--paper-muted)]">
            {f.label}
            {f.key === "release" ? (
              <select
                value={draft.release ?? ""}
                onChange={(e) => { const next = { ...draft, release: e.target.value }; setDraft(next); go(next); }}
                className="h-10 rounded-md border border-[var(--paper-rule)] bg-[var(--paper)] px-2 text-sm text-[var(--paper-text)]"
              >
                <option value="">{f.placeholder}</option>
                {releases.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
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
              {list.total === 1 ? `1 ${one}` : `${short(list.total ?? list.rows.length)} ${many}`}
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
