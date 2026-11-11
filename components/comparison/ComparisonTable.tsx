"use client";
// /comparison (brief 66): shadcn's grouped comparison table (shadcn.io/view/pricing/grouped-comparison-table) ported in
// its row heights and expand-collapse behaviour, re-dressed in the paper tokens. One tbody per group: the group row is a
// 44 px ghost button (chevron, name, row count) with each site's "n of m"; a feature row is 40 px (label px-4 py-2.5,
// cells px-3 md:px-4, a check, a dash or a short value). NSRgpt's column is tinted, as the reference's recommended plan
// is. Each name has its logo before it (lib/comparison.ts `src`; a neutral circle until set). Under md the table shows
// one site at a time, as the reference does. The matrix and where each cell was checked are lib/comparison.ts.
import { Fragment, useState } from "react";
import { Check, ChevronDown, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SERIF } from "@/app/(site)/(plate)/viz/box-style";
import { CHECKED, countOf, GROUPS, SITES, type Cell, type Site, type SiteKey } from "@/lib/comparison";
import { cn } from "@/lib/utils";

const LINE = "border-[var(--paper-rule)]/15";
const TINT = "bg-[var(--paper-quiet)]";
const HOVER = "hover:bg-[color-mix(in_oklab,var(--paper-text)_6%,var(--paper))]";
const DATE = new Date(`${CHECKED}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export function ComparisonTable() {
  const [open, setOpen] = useState<Record<string, boolean>>(() => Object.fromEntries(GROUPS.map((g) => [g.name, true])));
  const [one, setOne] = useState<SiteKey>("nsrgpt");
  const allOpen = GROUPS.every((g) => open[g.name]);
  const toggle = (name: string) => setOpen((o) => ({ ...o, [name]: !o[name] }));
  const setAll = (v: boolean) => setOpen(Object.fromEntries(GROUPS.map((g) => [g.name, v])));

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-[1180px] px-4 py-6 sm:px-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-[var(--paper-muted)]">What each site holds and does, verified on the date shown.</p>
          <div className="flex items-center gap-3">
            <span className="text-xs tabular-nums text-[var(--paper-muted)]">{DATE}</span>
            <Button variant="ghost" className={cn("h-8 rounded-full px-3 text-xs text-[var(--paper-text)]", HOVER)} onClick={() => setAll(!allOpen)}>
              {allOpen ? "Collapse all" : "Expand all"}
            </Button>
          </div>
        </div>

        <div className="mb-3 flex flex-wrap gap-1 md:hidden" role="tablist" aria-label="Site">
          {SITES.map((s) => (
            <button
              key={s.key}
              role="tab"
              aria-selected={one === s.key}
              onClick={() => setOne(s.key)}
              className={cn("rounded-full border px-3 py-1 text-xs", LINE, one === s.key ? "bg-[var(--paper-text)] text-[var(--paper)]" : cn("text-[var(--paper-muted)]", HOVER))}
            >
              {s.name}
            </button>
          ))}
        </div>

        <div className={cn("border-y border-[var(--paper-rule)]")}>
          <div className="relative w-full overflow-x-auto">
            <Matrix sites={SITES} open={open} toggle={toggle} className="max-md:hidden" />
            <Matrix sites={SITES.filter((s) => s.key === one)} open={open} toggle={toggle} className="md:hidden" />
          </div>
        </div>
      </div>
    </div>
  );
}

function Matrix({ sites, open, toggle, className }: { sites: Site[]; open: Record<string, boolean>; toggle: (name: string) => void; className?: string }) {
  const col = (s: Site, i: number) => cn(i > 0 && "border-s", LINE, s.tinted && TINT);
  return (
    <table className={cn("w-full table-fixed caption-bottom text-sm text-[var(--paper-text)] [&_tbody:last-of-type_tr:last-child]:border-b-0", className)}>
      <thead>
        <tr className="border-0">
          <th scope="col" className="w-[38%] md:w-56 lg:w-64"><span className="sr-only">Feature</span></th>
          {sites.map((s, i) => (
            <th key={s.key} scope="col" className={cn("h-auto whitespace-normal px-3 py-5 text-center align-bottom font-normal md:px-4", col(s, i))}>
              <span className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xl leading-tight tracking-tight" style={SERIF}>
                <Logo src={s.src} />
                {s.name}
              </span>
            </th>
          ))}
        </tr>
      </thead>
      {GROUPS.map((g) => {
        const isOpen = open[g.name];
        return (
          <tbody key={g.name}>
            <tr className={cn("border-y", LINE, TINT)}>
              <th scope="rowgroup" className="h-auto p-0 text-start font-normal">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => toggle(g.name)}
                  className={cn("inline-flex h-auto w-full items-center justify-start gap-2 whitespace-normal px-4 py-3 text-start outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--paper-strong)]", HOVER)}
                >
                  <ChevronDown className={cn("size-4 shrink-0 text-[var(--paper-muted)] transition-transform motion-reduce:transition-none", !isOpen && "-rotate-90")} aria-hidden="true" />
                  <span className="text-sm font-semibold">{g.name}</span>
                  <span className="font-mono text-xs tabular-nums text-[var(--paper-muted)]">{g.rows.length}</span>
                </button>
              </th>
              {sites.map((s, i) => (
                <td key={s.key} className={cn("px-3 text-center font-mono text-xs tabular-nums text-[var(--paper-muted)] md:px-4", i > 0 && "border-s", LINE)}>
                  <span aria-hidden="true">{countOf(g, s.key)} of {g.rows.length}</span>
                  <span className="sr-only">{`${s.name} has ${countOf(g, s.key)} of ${g.rows.length} ${g.name} features`}</span>
                </td>
              ))}
            </tr>
            {isOpen &&
              g.rows.map((r) => (
                <Fragment key={r.label}>
                  <tr className={cn("border-b transition-colors", LINE, HOVER)}>
                    <th scope="row" className="h-auto whitespace-normal px-4 py-2.5 text-start font-normal" title={`checked ${r.checked}`}>{r.label}</th>
                    {sites.map((s, i) => (
                      <td key={s.key} className={cn("whitespace-normal px-3 text-center align-middle md:px-4", col(s, i))} title={r.cells[s.key].title}>
                        <Value c={r.cells[s.key]} />
                      </td>
                    ))}
                  </tr>
                </Fragment>
              ))}
          </tbody>
        );
      })}
    </table>
  );
}

/** The organisation's logo, 20 px; a neutral circle while `src` is empty. */
function Logo({ src }: { src: string }) {
  if (!src) return <span aria-hidden="true" className="inline-block size-5 shrink-0 rounded-full border border-[var(--paper-rule)]/20 bg-[var(--paper-quiet)]" />;
  // eslint-disable-next-line @next/next/no-img-element -- a 20 px logo from any host, set by hand in lib/comparison.ts
  return <img src={src} alt="" width={20} height={20} className="size-5 shrink-0 rounded-full object-contain" />;
}

function Value({ c }: { c: Cell }) {
  if (c.v === true) return <span className="inline-flex align-middle"><Check className="size-4 text-[var(--paper-text)]" aria-label="yes" /></span>;
  if (c.v === null) return <span className="inline-flex align-middle"><Minus className="size-4 text-[var(--paper-muted)]" aria-label={c.title.startsWith("not on NSRgpt") ? "no" : "not found"} /></span>;
  return <span className="font-mono text-xs font-medium tabular-nums">{c.v}</span>;
}
