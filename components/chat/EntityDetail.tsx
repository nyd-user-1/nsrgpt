"use client";

import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TexText } from "./TexText";

/** Entity detail body shared by the graph side panel and chat citations. */

export type EntityType = "paper" | "author" | "nuclide" | "reaction" | "exfor" | "prompt" | "file";

function Field({ k, v }: { k: string; v: React.ReactNode }) {
  if (v === null || v === undefined || v === "") return null;
  return (
    <div className="mt-1.5">
      <p className="text-[10px] uppercase tracking-wide text-[var(--paper-muted)]">{k}</p>
      <p className="text-xs text-[var(--paper-text)]">{v}</p>
    </div>
  );
}

export function DetailBody({ type, detail, navigate, onCanvas }: {
  type: EntityType;
  detail: Record<string, unknown>;
  navigate: (p: string) => void;
  /** On /graph: expand onto the canvas instead of leaving the page. */
  onCanvas?: (g: { type: EntityType; id: string; label: string; sub?: string }) => void;
}) {
  const node = (detail.node ?? {}) as Record<string, unknown>;
  const counts = (detail.counts ?? {}) as Record<string, unknown>;
  if (type === "paper") {
    return (
      <div>
        {node.title != null && <p className="mt-2 text-sm font-medium leading-snug text-[var(--paper-text)]"><TexText text={String(node.title)} /></p>}
        <Field k="Authors" v={node.authors as string} />
        <Field k="Year" v={node.pub_year as number} />
        <Field k="Reference" v={node.reference as string} />
        {node.abstract != null && <Field k="Abstract" v={<span className="line-clamp-6">{String(node.abstract)}</span>} />}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {node.is_nsr ? <Badge variant="secondary" className="text-[10px]">NSR</Badge> : <Badge variant="outline" className="text-[10px]">addition</Badge>}
          {node.pdf_stored != null && <Badge variant="secondary" className="text-[10px]">PDF held</Badge>}
          {node.oa_status != null && <Badge variant="outline" className="text-[10px]">{String(node.oa_status)}</Badge>}
        </div>
        <div className="mt-3 rounded-md border bg-[var(--paper-quiet)] p-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--paper-muted)]">Provenance</p>
          <Field k="Source" v={(node.ingest_source as string) ?? (node.is_nsr ? "NNDC NSR dump" : "external feed")} />
          <Field k="NSR entry date" v={node.entry_date as string} />
          <Field k="Ingested" v={node.created_at ? String(node.created_at).slice(0, 10) : null} />
          <Field k="S2 enriched" v={node.s2_looked_up_at ? String(node.s2_looked_up_at).slice(0, 10) : node.s2_lookup_status as string} />
          <Field k="Links" v={`${counts.authors ?? 0} authors · ${counts.nuclides ?? 0} nuclides · ${counts.reactions ?? 0} reactions · ${counts.exfor ?? 0} EXFOR`} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => navigate(`/chat?prompt=${encodeURIComponent(`Tell me about ${node.key_number}: ${node.title ?? ""}`)}`)}>
            Ask NSRgpt
          </Button>
          {node.doi != null && (
            <a href={`https://doi.org/${node.doi}`} target="_blank" rel="noopener noreferrer" className="inline-flex h-7 items-center rounded-md border px-2 text-xs text-nuclear hover:bg-[var(--paper-quiet)]">
              DOI
            </a>
          )}
        </div>
      </div>
    );
  }
  if (type === "nuclide") {
    const a = node.a as number;
    return (
      <div>
        <Field k="Z / N / A" v={`${node.z} / ${node.n} / ${a}`} />
        <Field k="Element" v={node.element as string} />
        <Field k="Papers in corpus" v={Number(counts.papers ?? 0).toLocaleString()} />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {onCanvas ? (
            <>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onCanvas({ type: "nuclide", id: String(node.nuclide_code), label: `${a}${node.element ?? ""}`, sub: `Z=${node.z} N=${node.n}` })}>
                Papers on canvas
              </Button>
              <a href={`/ensdf/${a}`} target="_blank" rel="noopener noreferrer" className="text-[10px] text-[var(--paper-muted)] hover:text-[var(--paper-text)] hover:underline">
                mass chain A={a} ↗
              </a>
            </>
          ) : (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => navigate(`/ensdf/${a}`)}>
              Open mass chain A={a}
            </Button>
          )}
        </div>
      </div>
    );
  }
  if (type === "author") {
    return <Field k="Papers in corpus" v={Number(counts.papers ?? 0).toLocaleString()} />;
  }
  if (type === "reaction") {
    return (
      <div>
        <Field k="Incident" v={node.incident_particle as string} />
        <Field k="Outgoing" v={Array.isArray(node.outgoing_particles) ? (node.outgoing_particles as string[]).join(", ") : null} />
        <Field k="ΔZ / ΔN / ΔA" v={node.delta_z != null ? `${node.delta_z} / ${node.delta_n} / ${node.delta_a}` : null} />
        <Field k="Papers in corpus" v={Number(counts.papers ?? 0).toLocaleString()} />
      </div>
    );
  }
  return (
    <div>
      {node.title != null && <p className="mt-2 text-sm leading-snug text-[var(--paper-text)]">{String(node.title)}</p>}
      <Field k="Year" v={node.year as number} />
      <Field k="Authors" v={node.authors as string} />
      <Field k="Subentries" v={node.num_subentries as number} />
      <Field k="Linked papers" v={Number(counts.papers ?? 0).toLocaleString()} />
    </div>
  );
}
