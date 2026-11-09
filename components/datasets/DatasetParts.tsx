"use client";
// Parts both dataset pages use (brief 33): the API's answer when it isn't data, a page for a source that doesn't exist,
// and the table every list and record draws, in the paper palette.
import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/nova/table";
import { ApiError, SOURCE_KEYS, SOURCES, type Cell, type Column } from "@/lib/datasets";
import { cn } from "@/lib/utils";

/** The route, its status and the API's own words, so a route that isn't live yet says so plainly. */
export function ApiErrorNote({ error }: { error: unknown }) {
  const e = error instanceof ApiError ? error : null;
  return (
    <div className="rounded-lg border border-[var(--paper-rule-soft,var(--paper-rule))] bg-[var(--paper-quiet)] p-4 text-sm text-[var(--paper-text)]">
      <p>
        {e ? (e.status ? `The API answered ${e.status}` : "The API didn't answer") : "Something went wrong"}
        {e && <> for <code className="font-mono text-[13px]">GET {e.path}</code></>}
      </p>
      <p className="mt-1 break-words font-mono text-xs leading-relaxed text-[var(--paper-muted)]">{e ? e.detail : String((error as Error)?.message ?? error)}</p>
    </div>
  );
}

export function UnknownSource({ name }: { name: string }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
      <p className="text-sm text-[var(--paper-text)]">
        There is no dataset named <span className="font-mono">{name}</span>. The five:{" "}
        {SOURCE_KEYS.map((k, i) => (
          <span key={k}>
            {i > 0 && ", "}
            <Link href={`/datasets/${k}`} className="text-[var(--paper-strong)] hover:underline">{SOURCES[k].label}</Link>
          </span>
        ))}
        .
      </p>
    </div>
  );
}

/** A cell as text: numbers to six significant figures, lists joined, nothing as a dash. */
export function cellText(v: Cell): string {
  if (v === null || v === undefined || v === "") return "–";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(Number(v.toPrecision(6)));
  if (typeof v === "boolean") return v ? "yes" : "no";
  return v;
}

/** The table every dataset page draws: a header row, mono where the column is a code or a number, the first column's
 *  cell a link where `hrefs` gives one. `limit` caps the rows drawn; the line under the table says how many there are. */
export function DataTable({ columns, rows, hrefs, limit = 500, className }: { columns: Column[]; rows: Cell[][]; hrefs?: (string | null)[]; limit?: number; className?: string }) {
  const shown = rows.slice(0, limit);
  return (
    <div className={className}>
      <div className="max-h-[560px] overflow-auto rounded-lg border border-[var(--paper-rule-soft,var(--paper-rule))]">
        <Table>
          <TableHeader className="sticky top-0 z-[1] bg-[var(--paper)]">
            <TableRow className="border-[var(--paper-rule-soft,var(--paper-rule))] bg-[var(--paper-quiet)] hover:bg-[var(--paper-quiet)]">
              {columns.map((c) => (
                <TableHead key={c.key} className={cn("h-9 text-xs text-[var(--paper-muted)]", c.num && "text-right")}>{c.label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((r, i) => (
              <TableRow key={i} className="border-[var(--paper-rule-soft,var(--paper-rule))] hover:bg-[var(--paper-quiet)]">
                {columns.map((c, j) => {
                  const text = cellText(r[j]);
                  const href = j === 0 ? hrefs?.[i] : null;
                  return (
                    <TableCell key={c.key} className={cn("py-1.5 text-[13px] text-[var(--paper-text)]", c.mono && "font-mono text-xs", c.num && "text-right tabular-nums", text.length > 60 && "min-w-[320px] whitespace-normal")}>
                      {href ? <Link href={href} className="text-[var(--paper-strong)] hover:underline">{text}</Link> : text}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {rows.length > shown.length && (
        <p className="mt-1.5 text-xs text-[var(--paper-muted)]">{shown.length.toLocaleString()} of {rows.length.toLocaleString()} rows shown; Text and Markdown carry them all.</p>
      )}
    </div>
  );
}
