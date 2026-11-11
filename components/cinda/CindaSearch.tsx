"use client";
// /cinda (brief 65, Part C): CINDA's search in the IAEA form's shape (nds.iaea.org/exfor/cinda.htm): target, reaction,
// quantity, energy range, work type, first author, laboratory, publication year and where the line came from; the
// lines nsr-api's /cinda returns beneath, 100 a page, each linking its NSR record and EXFOR entry where they resolve
// here. A row opens its whole CINDA block (/cinda/block/{id}). The search lives in the URL, so a list can be linked.
import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/nova/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/nova/table";
import { apiJson, short } from "@/lib/datasets";
import { ApiErrorNote } from "@/components/datasets/DatasetParts";
import { cn } from "@/lib/utils";

type Line = {
  block_id: number; line_no: number; target: string; reaction: string; quantity: string; quantity_word: string;
  old_quantity: string; e_min_ev: number | null; e_max_ev: number | null; energy_text: string; lab: string; lab_name: string;
  work_type: string; origin: string; reference_text: string; year: number | null; author: string; comment: string;
  nsr_key: string | null; nsr_resolved: boolean; exfor_entry: string | null; exfor_resolved: boolean;
};
type Page = { total: number; page: number; pages: number; rows: Line[] };
type Pick = { code: string; word?: string; name?: string; lines: number };

const FIELDS = ["target", "reaction", "quantity", "emin", "emax", "unit", "type", "author", "lab", "year", "origin"] as const;
type Field = (typeof FIELDS)[number];
type Form = Record<Field, string>;
const UNITS: Record<string, number> = { eV: 1, keV: 1e3, MeV: 1e6 };
const ORIGINS = [["cinda", "Lines from the old CINDA"], ["exfor", "Lines imported from EXFOR"], ["nsr", "Lines imported from NSR"]] as const;
const ALL_ORIGINS = "cinda,exfor,nsr";
const EXAMPLE = "/cinda?target=U-235&quantity=CS&emin=1&emax=20&unit=MeV";
const SELECT = "h-10 rounded-md border border-[var(--paper-rule)] bg-[var(--paper)] px-2 text-sm text-[var(--paper-text)]";
const LINK = "text-[var(--paper-strong)] hover:underline";

const empty = (): Form => ({ target: "", reaction: "", quantity: "", emin: "", emax: "", unit: "MeV", type: "", author: "", lab: "", year: "", origin: ALL_ORIGINS });

/** The API path for a search, or null when no field is set. */
function pathOf(f: Form, page: string): string | null {
  const p = new URLSearchParams();
  for (const k of ["target", "reaction", "quantity", "type", "author", "lab", "year"] as const) if (f[k].trim()) p.set(k, f[k].trim());
  const scale = UNITS[f.unit] ?? 1;
  for (const k of ["emin", "emax"] as const) {
    const v = parseFloat(f[k]);
    if (f[k].trim() && Number.isFinite(v)) p.set(k, String(v * scale));
  }
  if (f.origin && f.origin !== ALL_ORIGINS) p.set("origin", f.origin || "none");
  if (![...p.keys()].length) return null;
  if (page !== "1") p.set("page", page);
  return `/cinda?${p}`;
}

/** 19200000 -> 19.2 MeV; three figures at most. */
function ev(v: number): string {
  const [d, u] = Math.abs(v) >= 1e6 ? [1e6, "MeV"] : Math.abs(v) >= 1e3 ? [1e3, "keV"] : [1, "eV"];
  return `${Number((v / d).toPrecision(3))} ${u}`;
}

function energy(l: Line): string {
  if (l.e_min_ev === null) return l.energy_text;
  if (l.e_max_ev === null || l.e_max_ev === l.e_min_ev) return ev(l.e_min_ev);
  return `${ev(l.e_min_ev)} to ${ev(l.e_max_ev)}`;
}

/** The laboratory's name to its first comma; the code where it has no name, nothing for the placeholder codes (9/…/) of
 *  the lines imported from NSR. */
const labShort = (l: Line) => (l.lab_name ? l.lab_name.split(",")[0] : l.lab.startsWith("9/") ? "" : l.lab);

export function CindaSearch() {
  const router = useRouter();
  const sp = useSearchParams();
  const applied = useMemo(() => {
    const f = empty();
    for (const k of FIELDS) {
      const v = sp.get(k);
      if (v !== null) f[k] = v;
    }
    return f;
  }, [sp]);
  const page = sp.get("page") ?? "1";
  const [draft, setDraft] = useState(applied);
  useEffect(() => setDraft(applied), [applied]);
  const [open, setOpen] = useState<number | null>(null);

  const path = pathOf(applied, page);
  const q = useQuery({ queryKey: ["cinda", path], queryFn: () => apiJson(path as string) as Promise<Page>, enabled: !!path, staleTime: 10 * 60_000, retry: false });
  const pick = (name: string) => ({ queryKey: ["cinda-pick", name], queryFn: async () => ((await apiJson(`/cinda/pickers/${name}`)) as { rows: Pick[] }).rows, staleTime: Infinity, retry: false });
  const quantities = useQuery(pick("quantities"));
  const types = useQuery(pick("types"));
  const labs = useQuery(pick("labs"));

  const go = (f: Form, pg = "1") => {
    const p = new URLSearchParams();
    for (const k of FIELDS) if (f[k] && !(k === "unit" && f[k] === "MeV") && !(k === "origin" && f[k] === ALL_ORIGINS)) p.set(k, f[k]);
    if (pg !== "1") p.set("page", pg);
    setOpen(null);
    router.replace(`/cinda${p.toString() ? `?${p}` : ""}`);
  };
  const set = (k: Field, v: string) => setDraft({ ...draft, [k]: v });
  const origins = draft.origin.split(",").filter(Boolean);
  const toggleOrigin = (o: string) => set("origin", ORIGINS.map(([k]) => k).filter((k) => (k === o ? !origins.includes(k) : origins.includes(k))).join(","));
  const data = q.data;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
      <form className="max-w-[1100px]" onSubmit={(e) => { e.preventDefault(); go(draft); }}>
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Target"><Input value={draft.target} placeholder="U-235; Pu-*" onChange={(e) => set("target", e.target.value)} className="text-[var(--paper-text)]" /></Field>
          <Field label="Reaction"><Input value={draft.reaction} placeholder="N,F" onChange={(e) => set("reaction", e.target.value)} className="text-[var(--paper-text)]" /></Field>
          <Field label="Quantity">
            <select value={draft.quantity} onChange={(e) => set("quantity", e.target.value)} className={SELECT}>
              <option value="">Any</option>
              {(quantities.data ?? []).map((x) => <option key={x.code} value={x.code}>{x.code}{x.word ? `: ${x.word}` : ""}</option>)}
            </select>
          </Field>
          <Field label="Work type">
            <select value={draft.type} onChange={(e) => set("type", e.target.value)} className={SELECT}>
              <option value="">Any</option>
              {(types.data ?? []).filter((x) => x.code).map((x) => <option key={x.code} value={x.word}>{x.word}</option>)}
            </select>
          </Field>
          <Field label="Energy">
            <div className="flex gap-2">
              <Input value={draft.emin} placeholder="from" inputMode="decimal" onChange={(e) => set("emin", e.target.value)} className="min-w-0 text-[var(--paper-text)]" />
              <Input value={draft.emax} placeholder="to" inputMode="decimal" onChange={(e) => set("emax", e.target.value)} className="min-w-0 text-[var(--paper-text)]" />
              <select value={draft.unit} onChange={(e) => set("unit", e.target.value)} className={cn(SELECT, "shrink-0")} aria-label="Energy unit">
                {Object.keys(UNITS).map((u) => <option key={u}>{u}</option>)}
              </select>
            </div>
          </Field>
          <Field label="First author"><Input value={draft.author} placeholder="Smith" onChange={(e) => set("author", e.target.value)} className="text-[var(--paper-text)]" /></Field>
          <Field label="Laboratory">
            <Input value={draft.lab} list="cinda-labs" placeholder="1USAORL or Oak Ridge" onChange={(e) => set("lab", e.target.value)} className="text-[var(--paper-text)]" />
            <datalist id="cinda-labs">{(labs.data ?? []).map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}</datalist>
          </Field>
          <Field label="Publication year"><Input value={draft.year} placeholder="1990..2000" onChange={(e) => set("year", e.target.value)} className="text-[var(--paper-text)]" /></Field>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
          {ORIGINS.map(([k, label]) => (
            <label key={k} className="inline-flex items-center gap-2 text-sm text-[var(--paper-text)]">
              <input type="checkbox" checked={origins.includes(k)} onChange={() => toggleOrigin(k)} className="h-4 w-4 accent-[var(--paper-strong)]" />
              {label}
            </label>
          ))}
          <div className="ml-auto flex gap-2">
            <Button type="button" variant="ghost" className="h-10 rounded-full px-4 text-[var(--paper-muted)]" onClick={() => { setDraft(empty()); go(empty()); }}>Clear</Button>
            <Button type="submit" variant="outline" className="h-10 rounded-full px-5">Search</Button>
          </div>
        </div>
      </form>

      <div className="mt-6">
        {!path && (
          <p className="text-sm text-[var(--paper-muted)]">
            Enter a target or any other field, or try <Link href={EXAMPLE} className={LINK}>U-235 cross sections from 1 to 20 MeV</Link>.
          </p>
        )}
        {path && q.isPending && <div className="space-y-2">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-8 w-full rounded-md" />)}</div>}
        {q.isError && <ApiErrorNote error={q.error} />}
        {data && (
          <>
            <p className="mb-2 text-sm text-[var(--paper-text)]">
              {data.total === 1 ? "1 line" : `${short(data.total)} lines`}
              {data.pages > 1 && <span className="text-[var(--paper-muted)]"> · page {data.page} of {short(data.pages)}</span>}
            </p>
            {data.rows.length ? <Lines rows={data.rows} open={open} setOpen={setOpen} /> : <p className="text-sm text-[var(--paper-muted)]">No lines match.</p>}
            {data.pages > 1 && (
              <div className="mt-3 flex items-center gap-2 text-sm">
                <PageButton disabled={data.page <= 1} onClick={() => go(applied, String(data.page - 1))}>Previous</PageButton>
                <PageButton disabled={data.page >= data.pages} onClick={() => go(applied, String(data.page + 1))}>Next</PageButton>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex min-w-0 flex-col gap-1 text-xs text-[var(--paper-muted)]">{label}{children}</label>;
}

function PageButton({ disabled, onClick, children }: { disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn("rounded-full border px-3 py-1", disabled ? "border-[var(--paper-rule-soft,var(--paper-rule))] text-[var(--paper-faint)]" : "border-[var(--paper-rule)] text-[var(--paper-text)] hover:bg-[var(--paper-quiet)]")}
    >
      {children}
    </button>
  );
}

const HEAD = ["Target", "Reaction", "Quantity", "Energy", "Laboratory", "Type", "Reference", "Year", "First author", "Comment", "Records"];
const CELL = "py-1.5 text-[13px] text-[var(--paper-text)]";

function Lines({ rows, open, setOpen }: { rows: Line[]; open: number | null; setOpen: (b: number | null) => void }) {
  return (
    <div className="overflow-auto rounded-lg border border-[var(--paper-rule-soft,var(--paper-rule))]">
      <Table>
        <TableHeader className="sticky top-0 z-[1] bg-[var(--paper)]">
          <TableRow className="border-[var(--paper-rule-soft,var(--paper-rule))] bg-[var(--paper-quiet)] hover:bg-[var(--paper-quiet)]">
            {HEAD.map((h) => <TableHead key={h} className={cn("h-9 text-xs text-[var(--paper-muted)]", h === "Year" && "text-right")}>{h}</TableHead>)}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((l) => (
            <Fragment key={`${l.block_id}-${l.line_no}`}>
              <TableRow
                onClick={() => setOpen(open === l.block_id ? null : l.block_id)}
                className={cn("cursor-pointer border-[var(--paper-rule-soft,var(--paper-rule))] hover:bg-[var(--paper-quiet)]", open === l.block_id && "bg-[var(--paper-quiet)]")}
                title="Show the whole CINDA block"
              >
                <Row l={l} />
              </TableRow>
              {open === l.block_id && rows.findIndex((r) => r.block_id === l.block_id) === rows.indexOf(l) && (
                <TableRow className="border-[var(--paper-rule-soft,var(--paper-rule))] hover:bg-transparent">
                  <TableCell colSpan={HEAD.length} className="bg-[var(--paper-quiet)] p-0"><Block id={l.block_id} /></TableCell>
                </TableRow>
              )}
            </Fragment>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function Row({ l }: { l: Line }) {
  return (
    <>
      <TableCell className={cn(CELL, "whitespace-nowrap font-medium")}>{l.target}</TableCell>
      <TableCell className={cn(CELL, "font-mono text-xs")}>{l.reaction}</TableCell>
      <TableCell className={CELL} title={l.quantity_word || (l.old_quantity ? `old CINDA quantity ${l.old_quantity}` : "")}>{l.quantity || l.old_quantity}</TableCell>
      <TableCell className={cn(CELL, "whitespace-nowrap tabular-nums")}>{energy(l)}</TableCell>
      <TableCell className={CELL} title={`${l.lab_name ? `${l.lab_name} · ` : ""}${l.lab}`}>{labShort(l)}</TableCell>
      <TableCell className={CELL}>{l.work_type}</TableCell>
      <TableCell className={cn(CELL, "font-mono text-xs")}>{l.reference_text}</TableCell>
      <TableCell className={cn(CELL, "text-right tabular-nums")}>{l.year ?? ""}</TableCell>
      <TableCell className={CELL}>{l.author}</TableCell>
      <TableCell className={cn(CELL, "min-w-[220px] whitespace-normal text-[var(--paper-muted)]")}>{l.comment}</TableCell>
      <TableCell className={cn(CELL, "whitespace-nowrap")} onClick={(e) => e.stopPropagation()}>
        {l.nsr_resolved && l.nsr_key && <Link href={`/datasets/nsr/${encodeURIComponent(l.nsr_key)}`} className={LINK}>NSR {l.nsr_key}</Link>}
        {l.nsr_resolved && l.exfor_resolved && <span className="text-[var(--paper-faint)]"> · </span>}
        {l.exfor_resolved && l.exfor_entry && <Link href={`/datasets/exfor/${encodeURIComponent(l.exfor_entry)}`} className={LINK}>EXFOR {l.exfor_entry}</Link>}
      </TableCell>
    </>
  );
}

function Block({ id }: { id: number }) {
  const q = useQuery({ queryKey: ["cinda-block", id], queryFn: () => apiJson(`/cinda/block/${id}`) as Promise<{ rows: Line[] }>, staleTime: Infinity, retry: false });
  if (q.isPending) return <div className="p-3"><Skeleton className="h-6 w-full rounded-md" /></div>;
  if (q.isError) return <div className="p-3"><ApiErrorNote error={q.error} /></div>;
  return (
    <div className="px-3 py-2">
      <p className="mb-1 text-xs text-[var(--paper-muted)]">Block {id}</p>
      <table className="w-full text-[12px]">
        <tbody>
          {q.data.rows.map((l) => (
            <tr key={l.line_no} className="align-top">
              <td className="py-0.5 pr-3 tabular-nums text-[var(--paper-faint)]">{l.line_no}</td>
              <td className="py-0.5 pr-3 font-mono">{l.reaction}</td>
              <td className="py-0.5 pr-3">{l.quantity || l.old_quantity}</td>
              <td className="whitespace-nowrap py-0.5 pr-3 tabular-nums">{energy(l)}</td>
              <td className="py-0.5 pr-3 font-mono">{l.reference_text}</td>
              <td className="py-0.5 pr-3 tabular-nums">{l.year ?? ""}</td>
              <td className="py-0.5 pr-3">{l.author}</td>
              <td className="py-0.5 text-[var(--paper-muted)]">{l.comment}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
