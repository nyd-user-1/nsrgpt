"use client";

import { Dialog, DialogPopup, DialogHeader, DialogTitle, DialogDescription } from "@/components/animate-ui/components/base/dialog";

/** The full story behind the % badge on /search results. */
export function ScoreInfoDialog({ open, onOpenChange, mode = "hybrid" }: { open: boolean; onOpenChange: (o: boolean) => void; mode?: "hybrid" | "semantic" | "keyword" }) {
  if (mode === "semantic") {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogPopup className="max-w-lg nysgpt-app border border-[var(--paper-rule)] bg-[var(--paper)] text-[var(--paper-text)]">
          <DialogHeader>
            <DialogTitle>What is semantic score?</DialogTitle>
            <DialogDescription className="sr-only">How the percentage badge on semantic results is computed.</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto p-5 space-y-3 text-sm leading-relaxed text-[var(--paper-text)]">
            <h3 className="text-xs uppercase tracking-wide text-[var(--paper-muted)]">Cosine similarity, from the NSR-CPT encoder</h3>
            <p>
              Semantic mode encodes your query with <strong>nsr-encoder-bge-m3</strong> — the encoder fine-tuned on NSR&apos;s own
              keyword abstracts — and finds the nearest papers in the same vector space. The badge is the
              <strong> cosine similarity</strong> between your query and that paper (×100): a real similarity, comparable across
              queries. Papers above roughly 80 are close paraphrases of the query; the low 60s are same-topic neighbours.
            </p>
            <p className="text-[var(--paper-muted)]">
              Hybrid mode adds keyword search and rank-fuses the two lists; on the frozen NSR benchmark that fusion is best-or-tied
              on every measured segment, which is why it is the default.
            </p>
          </div>
        </DialogPopup>
      </Dialog>
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-lg nysgpt-app border border-[var(--paper-rule)] bg-[var(--paper)] text-[var(--paper-text)]">
        <DialogHeader>
          <DialogTitle>What is hybrid score?</DialogTitle>
          <DialogDescription className="sr-only">How the percentage badge on hybrid results is computed.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-5 space-y-3 text-sm leading-relaxed text-[var(--paper-text)]">
          <h3 className="text-xs uppercase tracking-wide text-[var(--paper-muted)]">Relative rank, not a probability</h3>
          <p>
            Hybrid search runs two retrievers over the full corpus and fuses them: a <strong>dense</strong> arm
            (NSR-CPT&apos;s fine-tuned encoder, nearest neighbours in vector space) and a <strong>lexical</strong> arm
            (Postgres full-text search on title, keywords and abstract). The lists are merged with reciprocal-rank
            fusion — a paper scores well if it ranks high in either list, best if it ranks high in both.
          </p>
          <p>
            The badge is that fused score <strong>scaled so the top result is 100%</strong>. So 95% means &quot;almost as
            strongly matched as the best hit for this query&quot; — it does not mean a 95% probability of relevance, and
            scores are not comparable across different queries.
          </p>
          <p className="text-[var(--paper-muted)]">
            Add <code className="rounded bg-[var(--paper-quiet)] px-1">&amp;arm=dense</code> or <code className="rounded bg-[var(--paper-quiet)] px-1">&amp;arm=fts</code> to the API URL
            to see either arm alone; on the frozen NSR benchmark the fusion is best-or-tied on every measured segment.
          </p>
        </div>
      </DialogPopup>
    </Dialog>
  );
}
