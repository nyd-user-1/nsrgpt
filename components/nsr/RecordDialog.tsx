"use client";

import { ExternalLink } from "lucide-react";
import { Dialog, DialogPopup, DialogHeader, DialogTitle, DialogDescription } from "@/components/animate-ui/components/base/dialog";
import { TexText } from "@/components/chat/TexText";
import type { NsrRecord } from "@/lib/nsr-types";

/** Record detail in a dialog — the stand-in until a /record/:key page exists. */
export function RecordDialog({ record, open, onOpenChange }: { record: NsrRecord | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  if (!record) return null;
  const rows: [string, React.ReactNode][] = [];
  if (record.authors) rows.push(["Authors", record.authors]);
  if (record.reference) rows.push(["Reference", record.reference]);
  if (record.pub_year) rows.push(["Year", String(record.pub_year)]);
  if (record.reference_type) rows.push(["Type", record.reference_type]);
  if (record.doi) rows.push(["DOI", <a key="doi" href={`https://doi.org/${record.doi}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-nuclear hover:underline"><ExternalLink className="h-3 w-3" />{record.doi}</a>]);
  if (record.nuclides?.length) rows.push(["Nuclides", record.nuclides.join(", ")]);
  if (record.reactions?.length) rows.push(["Reactions", record.reactions.join(", ")]);
  if (record.subjects?.length) rows.push(["Measured", record.subjects.join(", ")]);
  if (record.topics?.length) rows.push(["Topics", record.topics.join(", ")]);
  if (record.exfor_keys) rows.push(["EXFOR", record.exfor_keys]);
  if (record.citation_count != null) rows.push(["Citations", String(record.citation_count)]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-2xl nysgpt-app border border-[var(--paper-rule)] bg-[var(--paper)] text-[var(--paper-text)]">
        <DialogHeader>
          <DialogTitle className="font-mono text-sm text-[var(--paper-muted)]">{record.key_number}</DialogTitle>
          <DialogDescription className="text-base text-[var(--paper-text)] leading-snug"><TexText text={record.title ?? ""} /></DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-5 space-y-5">
          <dl className="grid grid-cols-[96px_1fr] gap-x-4 gap-y-2.5 text-sm">
            {rows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-xs uppercase tracking-wide text-[var(--paper-muted)] pt-0.5">{k}</dt>
                <dd className="min-w-0 break-words text-[var(--paper-text)]">{v}</dd>
              </div>
            ))}
          </dl>
          {record.keywords && (
            <section className="text-sm">
              <h3 className="mb-1.5 text-xs uppercase tracking-wide text-[var(--paper-muted)]">Keyword abstract</h3>
              <p className="leading-relaxed text-[var(--paper-text)]"><TexText text={record.keywords} /></p>
            </section>
          )}
          {record.abstract && (
            <section className="text-sm">
              <h3 className="mb-1.5 text-xs uppercase tracking-wide text-[var(--paper-muted)]">Abstract</h3>
              <p className="leading-relaxed text-[var(--paper-text)]"><TexText text={record.abstract} /></p>
            </section>
          )}
        </div>
      </DialogPopup>
    </Dialog>
  );
}
