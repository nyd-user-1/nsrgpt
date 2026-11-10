"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Minus, X } from "lucide-react";
import { BOX_CLASS, SANS, SERIF } from "@/app/(site)/(plate)/viz/box-style";
import { short } from "@/lib/datasets";
import { HF_MODELS } from "@/lib/home-data";

/* ------------------------------------------------------------------ *
 *  /nsrcpt (brief 58, Part A, 2026-11-10): the old nsr app's
 *  src/pages/Announcing.tsx ported whole. Every number is the source's.
 *  Changed only where this app forces it: the paper palette for the
 *  shadcn tokens, the house red for text-[var(--pax2-red)], the app shell's
 *  header for the page's own h1, the first person singular for "we",
 *  and the sentences about "this site", which described the nsr app
 *  (Postgres full-text fusion, a rollback switch, an opt-in reranker)
 *  and here say what this site runs: the encoder on Lambda, a Hybrid
 *  mode that fuses it with a keyword match, no reranker yet. A foot of
 *  model cards (lib/home-data.ts HF_MODELS) follows the fine print.
 *
 *  ANNOUNCING NSR-CPT — the model launch page.
 *
 *  Every number comes from docs/NSR-CPT-REPORT.md or the lane logs it
 *  cites (docs/prompts/LANE-EVAL.md, LANE-TRAIN.md, LANE-RERANK.md,
 *  LANE-TRIPLETS.md). Nothing is rounded up. The places the fine-tune
 *  barely moved the needle, and the caveat the model cards carry, are
 *  on the page rather than only in the repo.
 *
 *  This program ran no significance tests — no McNemar, no bootstrap
 *  intervals. The page therefore never says "significant"; it says
 *  what was pre-registered and measured: every one of 16 segments.
 *
 *  Chart colors are --chart-ours and --chart-base on the page's root
 *  (CHART_VARS) so the SVGs theme with the paper. The source's two
 *  fills, checked again with the dataviz validator on this app's
 *  papers (2026-11-10): #3d93f5 / #6b6b78 on #ffffff, CVD dE 18.9,
 *  normal-vision 19.7; #0d9ed6 / #9a8340 on #15120d, 20.8 / 21.8; all
 *  >= 3:1 contrast. Both fail only the chroma floor, on the neutral,
 *  which is the source's choice — "not mine" is a de-emphasis, not a
 *  competing hue.
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Data — frozen benchmark nsr-eval-v1, 9,995 held-out queries        */
/* ------------------------------------------------------------------ */

type Kind = "ours" | "fusion" | "base";

interface Arm {
  label: string;
  sub: string;
  kw: number;
  ex: number;
  kind: Kind;
  note: string;
}

/** Retrieval R@10 over the 277,068-record corpus. */
const ARMS: Arm[] = [
  {
    label: "NSR-CPT + full-text",
    sub: "fusion — the best arm measured",
    kw: 0.542,
    ex: 0.967,
    kind: "fusion",
    note: "Reciprocal-rank fusion of my encoder with Postgres full-text search. The best arm measured; this site's Hybrid search fuses the encoder with its own keyword match the same way.",
  },
  {
    label: "NSR-CPT",
    sub: "mine — the fine-tuned encoder",
    kw: 0.487,
    ex: 0.966,
    kind: "ours",
    note: "bge-m3 fine-tuned on NSR's own keyword abstracts and EXFOR links. 33.5 minutes of training on one GPU.",
  },
  {
    label: "bge-m3 + full-text",
    sub: "fusion — the previous best",
    kw: 0.282,
    ex: 0.959,
    kind: "base",
    note: "What NSR search served before: the stock encoder fused with full-text search.",
  },
  {
    label: "BAAI/bge-m3",
    sub: "stock, untrained",
    kw: 0.171,
    ex: 0.958,
    kind: "base",
    note: "The general multilingual model I fine-tuned from. Strong on EXFOR queries, weak on keyword queries — and keyword queries are what a search box gets.",
  },
  {
    label: "Postgres full-text",
    sub: "keyword baseline",
    kw: 0.165,
    ex: 0.018,
    kind: "base",
    note: "Weighted tsquery over title, keywords and abstract. Competitive on exact phrasing, almost useless on EXFOR reaction codes.",
  },
];

/** Reranking: the same top-50, reordered. KW family, blended. */
interface CompareRow {
  label: string;
  sub: string;
  before: number;
  value: number;
  kind: Kind;
  note: string;
}

const RERANK: CompareRow[] = [
  {
    label: "Recall@1",
    sub: "right paper ranked first",
    before: 0.08,
    value: 0.18,
    kind: "ours",
    note: "The share of queries whose answer is the very first result: 2.25x the stock order.",
  },
  {
    label: "Recall@10",
    sub: "right paper in the top ten",
    before: 0.171,
    value: 0.241,
    kind: "ours",
    note: "Reranking cannot add papers the retrieval missed — it can only reorder the fifty it was given, which is why this moves less than Recall@1.",
  },
  {
    label: "nDCG@10",
    sub: "quality of the whole ordering",
    before: 0.121,
    value: 0.213,
    kind: "ours",
    note: "+76% on the blended keyword family, and better in every one of eight segments.",
  },
];

/** The page's rules: the paper's ink, faint. */
const RULE = "border-[var(--paper-rule)]/15";
/** The two chart fills per paper (see the header). */
const CHART_VARS = "[--chart-ours:#3d93f5] [--chart-base:#6b6b78] dark:[--chart-ours:#0d9ed6] dark:[--chart-base:#9a8340]";

/* ------------------------------------------------------------------ */
/*  Chart primitives — inline SVG, measured width, no chart library    */
/* ------------------------------------------------------------------ */

/** Element width, live. Charts need real pixels: a viewBox that scales
 *  would shrink the axis text to nothing on a phone. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setW(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

const fillOf = (kind: Kind) =>
  kind === "base" ? "var(--chart-base)" : "var(--chart-ours)";

/** A bar with a 4px rounded data-end and a square baseline. */
function barPath(x0: number, y: number, len: number, h: number) {
  const r = Math.min(4, Math.max(0, len));
  const x1 = x0 + Math.max(len, 0.5);
  return `M${x0},${y} H${x1 - r} A${r},${r} 0 0 1 ${x1},${y + r} V${y + h - r} A${r},${r} 0 0 1 ${x1 - r},${y + h} H${x0} Z`;
}

interface BarDatum {
  label: string;
  sub: string;
  value: number;
  kind: Kind;
  note: string;
  /** When present the row draws two bars: this one (neutral) under the value. */
  before?: number;
}

function BarChart({
  data,
  max,
  ticks,
  caption,
}: {
  data: BarDatum[];
  max: number;
  ticks: number[];
  caption: string;
}) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const paired = data.some((d) => d.before !== undefined);
  const stacked = w > 0 && w < 620;
  const rowH = stacked ? (paired ? 76 : 58) : paired ? 62 : 44;
  const barH = paired ? 14 : stacked ? 16 : 18;
  const labelW = stacked ? 0 : 246;
  const valueW = stacked ? 0 : 58;
  const padTop = stacked ? 20 : 26;
  const height = padTop + data.length * rowH + 6;
  const x0 = labelW;
  const x1 = Math.max(x0 + 40, w - valueW);
  const innerW = x1 - x0;
  const scale = (v: number) => (v / max) * innerW;

  return (
    <figure className="m-0">
      <div ref={ref} className="relative w-full">
        {w > 0 && (
          <svg
            width={w}
            height={height}
            role="img"
            aria-label={caption}
            className="block"
            onMouseLeave={() => setHover(null)}
          >
            <defs>
              {/* Fusion arms contain one of ours and one baseline — hatched so
                  identity never rests on hue alone. */}
              <pattern id="fusionHatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="6" height="6" fill="var(--chart-ours)" opacity="0.28" />
                <rect width="2.5" height="6" fill="var(--chart-ours)" />
              </pattern>
            </defs>

            {/* Gridlines + tick labels — hairline, one step off the surface */}
            {ticks.map((t) => (
              <g key={t}>
                <line
                  x1={x0 + scale(t)}
                  x2={x0 + scale(t)}
                  y1={padTop - 8}
                  y2={height - 6}
                  stroke="color-mix(in oklab, var(--paper-text) 12%, transparent)"
                  strokeWidth={1}
                />
                <text
                  x={x0 + scale(t)}
                  y={padTop - 14}
                  textAnchor={t === 0 ? "start" : t === ticks[ticks.length - 1] ? "end" : "middle"}
                  className="fill-[var(--paper-muted)]"
                  style={{ fontSize: 10, fontVariantNumeric: "tabular-nums" }}
                >
                  {String(+t.toFixed(2))}
                </text>
              </g>
            ))}

            {data.map((d, i) => {
              const top = padTop + i * rowH;
              const len = scale(d.value);
              const active = hover === i;
              const dim = hover !== null && !active;
              // paired rows stack two bars with a 2px surface gap between them
              const firstY = stacked
                ? top + (paired ? 34 : 30)
                : top + (rowH - (paired ? barH * 2 + 2 : barH)) / 2;
              const mainY = paired ? firstY + barH + 2 : firstY;
              return (
                <g
                  key={d.label}
                  onMouseEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  tabIndex={0}
                  style={{ outline: "none" }}
                >
                  <title>{`${d.label} — ${d.value.toFixed(3)}`}</title>
                  <rect x={0} y={top} width={Math.max(w, 1)} height={rowH} fill="transparent" />

                  {stacked ? (
                    <>
                      <text x={0} y={top + 13} className="fill-[var(--paper-text)]" style={{ fontSize: 12, fontWeight: 600 }}>
                        {d.label}
                      </text>
                      <text x={0} y={top + 25} className="fill-[var(--paper-muted)]" style={{ fontSize: 10 }}>
                        {d.sub}
                      </text>
                      <text
                        x={w}
                        y={top + 13}
                        textAnchor="end"
                        className="fill-[var(--paper-text)]"
                        style={{ fontSize: 12, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}
                      >
                        {d.before !== undefined ? `${d.before.toFixed(3)} → ${d.value.toFixed(3)}` : d.value.toFixed(3)}
                      </text>
                    </>
                  ) : (
                    <>
                      <text
                        x={labelW - 14}
                        y={top + rowH / 2 - 1}
                        textAnchor="end"
                        className="fill-[var(--paper-text)]"
                        style={{ fontSize: 12.5, fontWeight: d.kind === "base" ? 400 : 600 }}
                      >
                        {d.label}
                      </text>
                      <text
                        x={labelW - 14}
                        y={top + rowH / 2 + 12}
                        textAnchor="end"
                        className="fill-[var(--paper-muted)]"
                        style={{ fontSize: 10 }}
                      >
                        {d.sub}
                      </text>
                      <text
                        x={x0 + len + 8}
                        y={mainY + barH - 2}
                        className="fill-[var(--paper-text)]"
                        style={{ fontSize: 12, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}
                      >
                        {d.value.toFixed(3)}
                      </text>
                      {d.before !== undefined && (
                        <text
                          x={x0 + scale(d.before) + 8}
                          y={firstY + barH - 2}
                          className="fill-[var(--paper-muted)]"
                          style={{ fontSize: 11, fontVariantNumeric: "tabular-nums" }}
                        >
                          {d.before.toFixed(3)}
                        </text>
                      )}
                    </>
                  )}

                  {d.before !== undefined && (
                    <path
                      d={barPath(x0, firstY, scale(d.before), barH)}
                      fill="var(--chart-base)"
                      opacity={dim ? 0.55 : 1}
                      style={{ transition: "opacity 120ms ease" }}
                    />
                  )}
                  <path
                    d={barPath(x0, mainY, len, barH)}
                    fill={d.kind === "fusion" ? "url(#fusionHatch)" : fillOf(d.kind)}
                    opacity={dim ? 0.55 : 1}
                    style={{ transition: "opacity 120ms ease" }}
                  />
                </g>
              );
            })}
          </svg>
        )}

        {hover !== null && (
          <div
            className="pointer-events-none absolute z-20 max-w-[300px] rounded-lg border ${RULE} bg-[var(--paper)] px-3 py-2 text-xs leading-relaxed text-[var(--paper-muted)] shadow-lg"
            style={{
              top: padTop + hover * rowH + rowH + 2,
              left: stacked ? 0 : Math.min(labelW, Math.max(0, w - 300)),
            }}
          >
            <span className="block font-semibold text-[var(--paper-text)]">{data[hover].label}</span>
            {data[hover].note}
          </div>
        )}
      </div>

      <figcaption className="mt-3 text-xs leading-relaxed text-[var(--paper-muted)]">{caption}</figcaption>
    </figure>
  );
}

function Legend({ items }: { items: ("ours" | "fusion" | "base" | "before" | "after")[] }) {
  const swatch = {
    ours: { label: "Mine", style: { background: "var(--chart-ours)" } },
    fusion: {
      label: "Fusion — mine + full-text",
      style: {
        backgroundImage:
          "repeating-linear-gradient(45deg, var(--chart-ours) 0 2.5px, color-mix(in oklab, var(--chart-ours) 28%, transparent) 2.5px 6px)",
      },
    },
    base: { label: "Baselines", style: { background: "var(--chart-base)" } },
    before: { label: "Before — the stock ordering", style: { background: "var(--chart-base)" } },
    after: { label: "After — reordered by NSR-CPT", style: { background: "var(--chart-ours)" } },
  } as const;
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[var(--paper-muted)]">
      {items.map((k) => (
        <span key={k} className="inline-flex items-center gap-2">
          <span className="h-2.5 w-6 rounded-[2px]" style={swatch[k].style} />
          {swatch[k].label}
        </span>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page pieces                                                        */
/* ------------------------------------------------------------------ */

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className={`border-t ${RULE} pt-4`}>
      <div className="text-2xl font-bold tracking-tight tabular-nums md:text-3xl">{value}</div>
      <div className="mt-1 text-xs leading-relaxed text-[var(--paper-muted)]">{label}</div>
    </div>
  );
}

function Claim({
  kicker,
  title,
  stat,
  statLabel,
  children,
}: {
  kicker: string;
  title: string;
  stat: string;
  statLabel: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`grid gap-6 border-t ${RULE} py-10 md:grid-cols-[1fr_230px] md:gap-12 md:py-14`}>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--paper-muted)]">{kicker}</p>
        <h2 className="mt-3 text-2xl font-bold leading-tight tracking-tight md:text-3xl">{title}</h2>
        <div className="mt-4 space-y-3 text-[15px] leading-relaxed text-[var(--paper-muted)]">{children}</div>
      </div>
      <div className="md:pt-9">
        <div className="rounded-lg border ${RULE} bg-[var(--paper-quiet)] p-5">
          <div className="text-3xl font-bold tracking-tight tabular-nums text-[var(--pax2-red)]">{stat}</div>
          <div className="mt-2 text-xs leading-relaxed text-[var(--paper-muted)]">{statLabel}</div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export function Announcing() {
  const [family, setFamily] = useState<"kw" | "ex">("kw");

  const retrieval: BarDatum[] = ARMS.map((a) => ({
    label: a.label,
    sub: a.sub,
    value: family === "kw" ? a.kw : a.ex,
    kind: a.kind,
    note: a.note,
  }));

  return (
    <div className={`min-h-0 flex-1 overflow-y-auto text-[var(--paper-text)] ${CHART_VARS}`}>
      <div className="mx-auto max-w-[1000px] px-5 py-10 md:px-8 md:py-16">
        {/* ---------------- Hero ---------------- */}
        <header>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--pax2-red)]">
            Model release · 17 August 2026
          </p>
          <p className="mt-5 max-w-[660px] text-lg leading-relaxed text-[var(--paper-muted)] md:text-xl">
            A retrieval model trained on 277,068 nuclear-physics references — on the papers that are
            nothing but a title, it finds the right one three and a half times as often as the model
            it replaced.
          </p>
          <p className="mt-5 flex flex-wrap items-center gap-2 text-sm">
            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-[var(--pax2-red)]" />
            <span className="font-medium">Live on this site:</span>
            <span className="text-[var(--paper-muted)]">every search runs on it.</span>
          </p>

          <div className="mt-10 grid grid-cols-2 gap-5 md:grid-cols-4 md:gap-8">
            <Stat value="277,068" label="references indexed, every embeddable one of them embedded" />
            <Stat value="+186%" label="better at finding the right paper from an expert topic description" />
            <Stat value="33.5 min" label="of training on one rented GPU, a single pass over the data" />
            <Stat value="≈ $9" label="the entire night: benchmark, encoder, reranker, and the runs that failed" />
          </div>
        </header>

        {/* ---------------- Chart 1 ---------------- */}
        <section className={`mt-14 border-t ${RULE} pt-10 md:mt-20`}>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold tracking-tight md:text-3xl">Finding one paper in 277,068</h2>
              <p className="mt-2 max-w-[620px] text-sm leading-relaxed text-[var(--paper-muted)]">
                How often the right paper lands in the top ten, on 9,995 queries held out before any
                model was trained. Higher is better.
              </p>
            </div>
            <div className={`inline-flex rounded-lg border ${RULE} p-0.5 text-xs`}>
              {(
                [
                  ["kw", "Topic descriptions"],
                  ["ex", "Experiment records"],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setFamily(k)}
                  className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                    family === k ? "bg-[var(--paper-text)] text-[var(--paper)]" : "text-[var(--paper-muted)] hover:text-[var(--paper-text)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6">
            <Legend items={["ours", "fusion", "base"]} />
          </div>
          <div className="mt-5">
            <BarChart
              data={retrieval}
              max={family === "kw" ? 0.6 : 1.0}
              ticks={family === "kw" ? [0, 0.2, 0.4, 0.6] : [0, 0.25, 0.5, 0.75, 1.0]}
              caption={
                family === "kw"
                  ? "Recall@10 on 4,998 keyword-abstract queries — an NSR indexer's own description of a paper, in the canonical terms of the field. 4,141 of those papers have no abstract at all: a title and nothing else."
                  : "Recall@10 on 4,997 EXFOR queries — an experiment record looking for the paper that reported it. Dense retrieval was already near the ceiling here; the fine-tune adds about a point, and full-text search cannot do this task at all."
              }
            />
          </div>
        </section>

        {/* ---------------- Chart 2 ---------------- */}
        <section className={`mt-14 border-t ${RULE} pt-10`}>
          <h2 className="text-2xl font-bold tracking-tight md:text-3xl">And a second model that rereads</h2>
          <p className="mt-2 max-w-[620px] text-sm leading-relaxed text-[var(--paper-muted)]">
            A cross-encoder reads the query against each of the top fifty candidates and reorders them.
            I trained one of those too. It is not on this site yet — the reason is below.
          </p>
          <div className="mt-6">
            <Legend items={["before", "after"]} />
          </div>
          <div className="mt-5">
            <BarChart
              data={RERANK}
              max={0.28}
              ticks={[0, 0.1, 0.2]}
              caption="Keyword-abstract family, 4,998 queries: the same fifty candidates, reordered. Better in every one of eight segments. On EXFOR queries Recall@1 goes 0.871 → 0.927. The candidate pool here is the stock encoder's top fifty, not NSR-CPT's — the two models were measured separately and have not been measured stacked."
            />
          </div>
        </section>

        {/* ---------------- Claims ---------------- */}
        <Claim
          kicker="How it was made"
          title="Trained on the science itself"
          stat="$1.45"
          statLabel="one GPU for 33.5 minutes. The whole night — benchmark, encoder, reranker, corpus embeddings and four failed boots — came to about $9."
        >
          <p>
            Nobody else has this supervision signal. Every record in NSR carries a keyword abstract:
            an indexer at the National Nuclear Data Center describing that specific paper in the
            canonical vocabulary of nuclear physics. Alongside them sit EXFOR's experiment records,
            each already linked by hand to the paper that reported it. Between them, hundreds of
            thousands of real questions with known right answers.
          </p>
          <p>
            I mined 152,006 of those into training pairs and trained on 39,568 — one epoch, half an
            hour, one rented GPU. No click logs, no annotators, no synthetic queries. The signal was
            already in the database, written by the people who curate it.
          </p>
        </Claim>

        <Claim
          kicker="What changed"
          title="Search got better"
          stat="+186%"
          statLabel="Recall@10 on keyword-abstract queries, 0.171 → 0.487, against the off-the-shelf encoder this site used to search with."
        >
          <p>
            NSRgpt used to search with a general-purpose model that had never seen a nuclear-physics
            paper. It now searches with one trained on this corpus, and the gain is largest exactly
            where the corpus is hardest: papers with no abstract, where the model has a title and
            nothing else, went up 262%. Papers from before 1970 went up 307%.
          </p>
          <p>
            This is live rather than staged. Every semantic search here runs my encoder over its own
            277,068 vectors, the Hybrid mode fuses it with a keyword match, and the chat's sources and
            the graph's "similar papers" read the same vectors.
          </p>
        </Claim>

        <Claim
          kicker="How thoroughly"
          title="Better everywhere I looked"
          stat="16 / 16"
          statLabel="segments — by era, by whether the paper has an abstract, by publication type, across both query families — where the fine-tune beat the stock model on Recall@10 and nDCG@10."
        >
          <p>
            A headline average can hide a model that got much better at easy questions and worse at
            hard ones. So the benchmark was cut sixteen ways before the numbers were produced, and the
            bar was set in advance: beat the stock model in every segment, on both metrics, by at
            least 10% on the blended keyword family.
          </p>
          <p>
            It cleared that bar by nearly twenty times, and it cleared it everywhere — the weakest
            segment still improved by 65%. The reranker was gated the same way and passed in all eight
            of its segments.
          </p>
        </Claim>

        <Claim
          kicker="How I know"
          title="An honest scoreboard"
          stat="9,995"
          statLabel="held-out queries, frozen before training, with a leak audit that found zero query texts inside their own documents."
        >
          <p>
            No public benchmark existed for nuclear-literature retrieval, so I built one: 9,995
            queries, held out by paper so no model is tested on something it studied, stratified so
            that thin slices of the corpus are still measurable, and audited for leakage three
            separate ways before a single arm was scored.
          </p>
          <p>
            Where the old tools still win: plain full-text search beats the stock dense model outright
            at putting the right paper first on keyword queries (0.161 against 0.080), which is why
            the best arm measured is a fusion of the two rather than my encoder alone. And on
            EXFOR experiment records the stock model was already at 0.958 — my fine-tune adds about a
            point there, not a revolution.
          </p>
          <p>
            One thing this program did not do, and the fine print says so plainly: it ran no
            statistical significance tests. The gains are large and they hold in every segment, but
            "significant" is a word that has to be earned by a test that was not run here.
          </p>
        </Claim>

        {/* ---------------- CTA ---------------- */}
        <section className={`border-t ${RULE} py-12 text-center md:py-16`}>
          <h2 className="text-2xl font-bold tracking-tight md:text-4xl">Try it</h2>
          <p className="mx-auto mt-3 max-w-[540px] text-sm leading-relaxed text-[var(--paper-muted)]">
            Describe what you are looking for the way you would to a colleague — a reaction, a
            technique, a nuclide. Every search on this site is retrieved by the model above.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/search"
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--paper-text)] px-5 py-2.5 text-sm font-medium text-[var(--paper)] transition-opacity hover:opacity-85"
            >
              Search NSR
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/chat"
              className={`inline-flex items-center gap-2 rounded-lg border ${RULE} px-5 py-2.5 text-sm font-medium transition-colors hover:bg-[var(--paper-quiet)]`}
            >
              Ask NSRgpt
            </Link>
          </div>
        </section>

        {/* ---------------- Fine print ---------------- */}
        <FinePrint />

        {/* ---------------- The models next ---------------- */}
        <Models />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Fine print — the receipts                                          */
/* ------------------------------------------------------------------ */

function FootRow({ verdict, children }: { verdict: "win" | "tie" | "loss"; children: React.ReactNode }) {
  const Icon = verdict === "win" ? Check : verdict === "tie" ? Minus : X;
  return (
    <li className="flex items-start gap-2.5">
      <Icon className="mt-[3px] h-3.5 w-3.5 shrink-0 text-[var(--paper-muted)]" />
      <span>{children}</span>
    </li>
  );
}

function FinePrint() {
  return (
    <section className={`border-t ${RULE} pt-10 text-xs leading-relaxed text-[var(--paper-muted)]`}>
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--paper-text)]">The fine print</h2>

      <div className="mt-6 grid gap-8 md:grid-cols-2">
        <div className="space-y-4">
          <div>
            <p className="font-semibold text-[var(--paper-text)]">The benchmark</p>
            <p className="mt-1">
              <span className="font-mono">nsr-eval-v1</span>, frozen before training: 4,998
              keyword-abstract queries and 4,997 EXFOR queries, one gold paper each, retrieved against
              the full 277,068-record corpus. Papers are held out by the first quartile of{" "}
              <span className="font-mono">md5('holdout:' || key_number)</span>, so a paper's queries
              cannot straddle the split. Queries are stratified over era × richness × reference type
              with a floor of 100 per bucket, so every segment reported is one the sample can actually
              support.
            </p>
          </div>
          <div>
            <p className="font-semibold text-[var(--paper-text)]">The metrics</p>
            <p className="mt-1">
              R@1 and R@10 — with one gold paper per query, the share of queries whose answer is
              first, or in the top ten. nDCG@10 for ordering quality. Every arm ran on the same
              corpus, the same queries and the same scoring code.
            </p>
          </div>
          <div>
            <p className="font-semibold text-[var(--paper-text)]">No significance testing</p>
            <p className="mt-1">
              This program ran no McNemar tests and no bootstrap confidence intervals. Nothing on this
              page is described as statistically significant, because that was not measured. What was
              pre-registered instead: beat the stock model on R@10 and nDCG@10 in every segment, by
              ≥10% relative on the blended keyword family. Both models passed.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <p className="font-semibold text-[var(--paper-text)]">Every claim on this page, scored</p>
            <ul className="mt-2 space-y-2">
              <FootRow verdict="win">
                Keyword family, R@10: 0.171 → 0.487 (+186%); nDCG@10 0.121 → 0.363 (+200%); R@1 0.080
                → 0.252.
              </FootRow>
              <FootRow verdict="win">
                Title-only papers +262%, pre-1970 papers +307%, non-journal references +271% — the
                thinnest slices of the corpus gained the most.
              </FootRow>
              <FootRow verdict="tie">
                EXFOR family: 0.958 → 0.966 R@10, about +1%. Dense retrieval was already near the
                ceiling; the fine-tune's real gain there is on the has-abstract segment (+9%).
              </FootRow>
              <FootRow verdict="loss">
                Full-text search alone still beats the stock dense model at R@1 on keyword queries
                (0.161 vs 0.080), and beats my encoder on nothing — but the best arm is the fusion of
                the two (0.344 R@1), not my encoder alone (0.252).
              </FootRow>
              <FootRow verdict="win">
                Reranker, keyword family: R@1 0.080 → 0.180, R@10 0.171 → 0.241, nDCG@10 +76%, better
                in all eight segments. EXFOR R@1 0.871 → 0.927.
              </FootRow>
              <FootRow verdict="loss">
                The reranker is <em>not</em> served here yet. On a CPU box it costs ~0.13 s per
                candidate — 6.6 s for fifty. Always-on reranking needs a GPU that is not currently
                rented.
              </FootRow>
            </ul>
          </div>
        </div>
      </div>

      <div className={`mt-8 space-y-4 border-t ${RULE} pt-6`}>
        <div>
          <p className="font-semibold text-[var(--paper-text)]">The caveat the model cards carry</p>
          <p className="mt-1">
            Both models were trained on a partial mining sweep in which held-out benchmark papers
            could appear as <em>negatives</em> for other queries — 24.7% of negative slots. Query and
            positive were strictly disjoint from the held-out set, and this is the standard full-corpus
            mining setup used by DPR and MedCPT, but it is a real caveat and it is not rounded off
            here. A clean re-swept training set with zero held-out papers anywhere has been built and
            published; the retrain on it has not been run, so the model serving today is the one with
            the caveat.
          </p>
        </div>
        <div>
          <p className="font-semibold text-[var(--paper-text)]">Other things worth knowing</p>
          <p className="mt-1">
            181 of the 4,998 keyword positives (3.6%) have an exact-text twin elsewhere in the corpus,
            and a twin hit is scored as correct. The encoder trained on 39,568 of 121,649 available
            pairs for one epoch — a 60-minute budget decision, not a quality one; more data and more
            epochs are untested. A commercial embedding arm was killed at 6% on throughput, so there
            is no paid-API column in any table. Only 93,579 of the 277,068 records carry a publisher
            abstract, which is why the title-only segment is the one that matters most here.
          </p>
        </div>
        <div>
          <p className="font-semibold text-[var(--paper-text)]">What is and is not deployed</p>
          <p className="mt-1">
            Live: the encoder, int8 on AWS Lambda, serving every semantic search, the Hybrid mode's
            dense half, chat retrieval and graph similarity. Not yet served: the reranker, per the
            latency above. Both models are published privately, pending confirmation of
            redistribution terms for NNDC-authored keyword-abstract text.
          </p>
        </div>
        <div>
          <p className="font-semibold text-[var(--paper-text)]">Sources</p>
          <p className="mt-1">
            Every number above is from <span className="font-mono">docs/NSR-CPT-REPORT.md</span> and
            the lane logs it cites. Corpus: 277,068 embeddable NSR records, sourced from
            nndc.bnl.gov/nsr; coverage verified at 277,068 of 277,068 with zero orphans.
          </p>
        </div>
        <p className="pt-2">
          NSRgpt is an independent project and is not affiliated with, endorsed by, or sponsored by
          Brookhaven National Laboratory, the National Nuclear Data Center, or the U.S. Department of
          Energy. NSR data is publicly available and sourced from nndc.bnl.gov/nsr.
        </p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  The models next (brief 58, Part A.2) — lib/home-data.ts HF_MODELS  */
/* ------------------------------------------------------------------ */

/** The ones this site uses. The search runs the encoder (lib/nsr-search.ts); nothing here runs the reranker yet. */
const SERVED = new Set(["https://huggingface.co/NYSgpt/nsr-encoder"]);
/** The NSR pair first, then the rest of the family as lib/home-data.ts lists it. */
const MODELS = [
  ...HF_MODELS.filter((m) => m.href.includes("/nsr-")),
  ...HF_MODELS.filter((m) => !m.href.includes("/nsr-")),
];

function Models() {
  return (
    <section className={`mt-12 border-t ${RULE} pt-10`}>
      <p className="m-0 text-sm text-[var(--paper-muted)]">The models I will serve next, trained the same way.</p>
      <div className="mt-6 grid grid-cols-1 border-l border-t border-[var(--paper-rule)] sm:grid-cols-2 lg:grid-cols-3">
        {MODELS.map((m) => {
          const served = SERVED.has(m.href);
          return (
            <a key={m.href} href={m.href} target="_blank" rel="noopener noreferrer" className={`${BOX_CLASS} min-h-[200px]`}>
              <h3 className="m-0 text-[20px] leading-[1.1] text-[var(--paper-text)]" style={SERIF}>
                {m.title}
              </h3>
              <p className="m-0 mt-2 line-clamp-4 flex-1 text-[12px] leading-[1.5] text-[var(--paper-muted)]" style={SANS}>
                {m.body}
              </p>
              <div className="mt-3 flex items-center justify-between gap-3 text-[11px]" style={SANS}>
                <span
                  className={`rounded-full border px-2 py-0.5 ${served ? "border-[var(--pax2-red)] text-[var(--pax2-red)]" : "border-[var(--paper-rule)]/30 text-[var(--paper-muted)]"}`}
                >
                  {served ? "Served" : "Coming soon"}
                </span>
                <span className="tabular-nums text-[var(--paper-faint)]">
                  {short(m.value)} {m.unit.toLowerCase()}
                </span>
              </div>
            </a>
          );
        })}
      </div>
    </section>
  );
}
