"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

/* ------------------------------------------------------------------ *
 *  /nsrcpt (brief 63 and its follow-up, 2026-11-10): Brendan's edited
 *  page (his inspector edits, saved as "nsrcpt v1.html") word for word
 *  in copy, order and spacing, with three changes on top: the v2 chart
 *  in place of the v1 arms chart and the reranker as a lift chart in the
 *  Search tab; a Model, Search, Benchmarks rail over his three sections;
 *  NSRcpt naming and the V2 eyebrow date. Fixed in his copy: three typos
 *  and "our" for "my". He removed the model cards and the fine print.
 *
 *  Every v1 number is the NSR-CPT report's (docs/NSR-CPT-REPORT.md and
 *  the lane logs it cites). Every v2 number is brief 61's Result
 *  (docs/briefs/61-nsr-encoder-v2-cross-source.md), measured on the box,
 *  not rounded.
 *
 *  Chart fills (--chart-v2, --chart-v1, --chart-base on the page root),
 *  checked with the dataviz validator on both papers (2026-11-10):
 *  light #2563eb / #7cb4f7 / #a8842a on #ffffff, adjacent CVD dE 22.5,
 *  normal 23.6; v1's light blue is 2.16:1 on white, so every bar carries
 *  its value. Dark #155fbd / #3f9ce2 / #a8893a on #15120d, CVD 17.7,
 *  normal 17.6, all >= 3:1, every check passes.
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

type Series = "v2" | "v1" | "base";

const SERIES: { key: Series; label: string; fill: string }[] = [
  { key: "v2", label: "NSRcpt v2", fill: "var(--chart-v2)" },
  { key: "base", label: "Stock bge-m3", fill: "var(--chart-base)" },
];

interface Group {
  label: string;
  n: number;
  /** R@10 and MRR per model. */
  r10: Record<Series, number>;
  mrr: Record<Series, number>;
  /** The summary row: drawn last, under a rule. */
  all?: boolean;
}

/** The cross-source benchmark, R@10 by record type (brief 61's Result). Record types in order of v2's gain over v1;
 *  All last. */
const CROSS: Group[] = [
  { label: "ENDF material to its papers", n: 364, r10: { v2: 0.802, v1: 0.019, base: 0.014 }, mrr: { v2: 0.512, v1: 0.009, base: 0.007 } },
  { label: "ENSDF dataset to its papers", n: 2500, r10: { v2: 0.563, v1: 0.138, base: 0.166 }, mrr: { v2: 0.33, v1: 0.063, base: 0.087 } },
  { label: "Reaction in words to EXFOR", n: 2000, r10: { v2: 0.98, v1: 0.677, base: 0.558 }, mrr: { v2: 0.918, v1: 0.481, base: 0.378 } },
  { label: "Nuclide to its records", n: 2000, r10: { v2: 1.0, v1: 0.993, base: 0.972 }, mrr: { v2: 0.996, v1: 0.922, base: 0.876 } },
  { label: "EXFOR dataset to its paper", n: 3136, r10: { v2: 0.969, v1: 0.97, base: 0.917 }, mrr: { v2: 0.891, v1: 0.919, base: 0.82 } },
  { label: "All", n: 10000, r10: { v2: 0.87, v1: 0.673, base: 0.636 }, mrr: { v2: 0.763, v1: 0.585, base: 0.53 }, all: true },
];

interface Lift {
  label: string;
  sub: string;
  before: number;
  after: number;
}

/** The reranker reading stock bge-m3's top fifty (the NSR-CPT report). */
const RERANK: Lift[] = [
  { label: "Recall@1", sub: "Topic queries", before: 0.08, after: 0.18 },
  { label: "nDCG@10", sub: "Topic queries", before: 0.121, after: 0.213 },
  { label: "Recall@10", sub: "Topic queries", before: 0.171, after: 0.241 },
  { label: "Recall@1", sub: "Record queries", before: 0.871, after: 0.927 },
];

/** The page's rules: the paper's ink, faint. */
const RULE = "border-[var(--paper-rule)]/15";
/** The three chart fills per paper (see the header). */
const CHART_VARS =
  "[--chart-v2:#2563eb] [--chart-v1:#7cb4f7] [--chart-base:#a8842a] dark:[--chart-v2:#155fbd] dark:[--chart-v1:#3f9ce2] dark:[--chart-base:#a8893a]";
const GRID = "color-mix(in oklab, var(--paper-text) 12%, transparent)";

/* ------------------------------------------------------------------ */
/*  Chart primitives: inline SVG, measured width, no chart library     */
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

/** A bar with a 4px rounded data-end and a square baseline. */
function barPath(x0: number, y: number, len: number, h: number) {
  const r = Math.min(4, h / 2, Math.max(0, len));
  const x1 = x0 + Math.max(len, 0.5);
  return `M${x0},${y} H${x1 - r} A${r},${r} 0 0 1 ${x1},${y + r} V${y + h - r} A${r},${r} 0 0 1 ${x1 - r},${y + h} H${x0} Z`;
}

function Ticks({ ticks, x, top, bottom, fmt }: { ticks: number[]; x: (v: number) => number; top: number; bottom: number; fmt: (v: number) => string }) {
  return (
    <>
      {ticks.map((t, i) => (
        <g key={t}>
          <line x1={x(t)} x2={x(t)} y1={top} y2={bottom} stroke={GRID} strokeWidth={1} />
          <text
            x={x(t)}
            y={top - 6}
            textAnchor={i === 0 ? "start" : i === ticks.length - 1 ? "end" : "middle"}
            className="fill-[var(--paper-muted)]"
            style={{ fontSize: 10, fontVariantNumeric: "tabular-nums" }}
          >
            {fmt(t)}
          </text>
        </g>
      ))}
    </>
  );
}

/** Grouped horizontal bars: one row a record type, three bars a row (v2, v1, stock), values at the bar ends. */
function GroupedChart({ data, label }: { data: Group[]; label: string }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const stacked = w > 0 && w < 620;
  const barH = 12;
  const gap = 2;
  const bars = SERIES.length * barH + (SERIES.length - 1) * gap;
  const head = stacked ? 22 : 0;
  const rowH = head + bars + (stacked ? 18 : 22);
  const labelW = stacked ? 0 : 236;
  const valueW = 46;
  const padTop = 22;
  const allGap = 10;
  const height = padTop + data.length * rowH + allGap + 4;
  const x0 = labelW;
  const innerW = Math.max(40, w - x0 - valueW);
  const x = (v: number) => x0 + v * innerW;
  const rowTop = (i: number) => padTop + i * rowH + (data[i].all ? allGap : 0);

  return (
    <figure className="m-0">
      <div ref={ref} className="relative w-full">
        {w > 0 && (
          <svg width={w} height={height} role="img" aria-label={label} className="block" onMouseLeave={() => setHover(null)}>
            <Ticks ticks={[0, 0.25, 0.5, 0.75, 1]} x={x} top={padTop - 6} bottom={height - 4} fmt={(t) => String(t)} />
            {data.map((g, i) => {
              const top = rowTop(i);
              const barsTop = top + head + (rowH - head - bars) / 2;
              const dim = hover !== null && hover !== i;
              return (
                <g
                  key={g.label}
                  onMouseEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  tabIndex={0}
                  style={{ outline: "none" }}
                >
                  <rect x={0} y={top} width={w} height={rowH} fill="transparent" />
                  {g.all && <line x1={0} x2={w} y1={top - allGap / 2} y2={top - allGap / 2} stroke={GRID} strokeWidth={1} />}
                  {stacked ? (
                    <text x={0} y={top + 14} className="fill-[var(--paper-text)]" style={{ fontSize: 12, fontWeight: 600 }}>
                      {g.label}
                    </text>
                  ) : (
                    <>
                      <text
                        x={labelW - 14}
                        y={top + rowH / 2 - 1}
                        textAnchor="end"
                        className="fill-[var(--paper-text)]"
                        style={{ fontSize: 12.5, fontWeight: 600 }}
                      >
                        {g.label}
                      </text>
                    </>
                  )}
                  {SERIES.map((s, k) => {
                    const v = g.r10[s.key];
                    const y = barsTop + k * (barH + gap);
                    return (
                      <g key={s.key}>
                        <path
                          d={barPath(x0, y, v * innerW, barH)}
                          fill={s.fill}
                          opacity={dim ? 0.5 : 1}
                          style={{ transition: "opacity 120ms ease" }}
                        />
                        <text
                          x={x(v) + 6}
                          y={y + barH - 2}
                          className={s.key === "v2" ? "fill-[var(--paper-text)]" : "fill-[var(--paper-muted)]"}
                          style={{ fontSize: 10.5, fontWeight: s.key === "v2" ? 600 : 400, fontVariantNumeric: "tabular-nums" }}
                        >
                          {v.toFixed(3)}
                        </text>
                      </g>
                    );
                  })}
                </g>
              );
            })}
          </svg>
        )}

        {hover !== null && (
          <div
            className={`pointer-events-none absolute z-20 w-[230px] rounded-lg border ${RULE} bg-[var(--paper)] px-3 py-2 text-xs leading-relaxed text-[var(--paper-muted)] shadow-lg`}
            style={{ top: rowTop(hover) + rowH, left: stacked ? 0 : Math.min(labelW, Math.max(0, w - 230)) }}
          >
            <span className="block font-semibold text-[var(--paper-text)]">{data[hover].label}</span>
            <span className="mt-1 grid grid-cols-[1fr_auto_auto] gap-x-3 tabular-nums">
              <span />
              <span>R@10</span>
              <span>MRR</span>
              {SERIES.map((s) => (
                <span key={s.key} className="contents">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-[2px]" style={{ background: s.fill }} />
                    {s.label}
                  </span>
                  <span className="text-[var(--paper-text)]">{data[hover].r10[s.key].toFixed(3)}</span>
                  <span>{data[hover].mrr[s.key].toFixed(3)}</span>
                </span>
              ))}
            </span>
          </div>
        )}
      </div>

      <table className="sr-only">
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col">Record type</th>
            <th scope="col">Queries</th>
            {SERIES.map((s) => (
              <th key={s.key} scope="col">{`${s.label} R@10`}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((g) => (
            <tr key={g.label}>
              <th scope="row">{g.label}</th>
              <td>{g.n}</td>
              {SERIES.map((s) => (
                <td key={s.key}>{g.r10[s.key].toFixed(3)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** One series of relative lift: the percent at the bar end, the before/after pair after it and in the hover title. */
function LiftChart({ data, label }: { data: Lift[]; label: string }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const stacked = w > 0 && w < 620;
  const barH = 16;
  const head = stacked ? 20 : 0;
  const rowH = head + barH + 22;
  const labelW = stacked ? 0 : 236;
  const valueW = 150;
  const padTop = 22;
  const max = 1.5;
  const height = padTop + data.length * rowH + 4;
  const x0 = labelW;
  const innerW = Math.max(40, w - x0 - valueW);
  const x = (v: number) => x0 + (v / max) * innerW;

  return (
    <figure className="m-0">
      <div ref={ref} className="w-full">
        {w > 0 && (
          <svg width={w} height={height} role="img" aria-label={label} className="block" onMouseLeave={() => setHover(null)}>
            <Ticks ticks={[0, 0.5, 1, 1.5]} x={x} top={padTop - 6} bottom={height - 4} fmt={(t) => (t === 0 ? "0%" : `+${Math.round(t * 100)}%`)} />
            {data.map((d, i) => {
              const top = padTop + i * rowH;
              const lift = d.after / d.before - 1;
              const y = top + head + (rowH - head - barH) / 2;
              const pair = `${d.before.toFixed(3)} → ${d.after.toFixed(3)}`;
              return (
                <g key={`${d.label}-${d.sub}`} onMouseEnter={() => setHover(i)} tabIndex={0} style={{ outline: "none" }}>
                  <title>{`${d.label}, ${d.sub.toLowerCase()}: ${pair}`}</title>
                  <rect x={0} y={top} width={w} height={rowH} fill="transparent" />
                  {stacked ? (
                    <text x={0} y={top + 14} className="fill-[var(--paper-text)]" style={{ fontSize: 12, fontWeight: 600 }}>
                      {d.label}
                      <tspan dx={8} className="fill-[var(--paper-muted)]" style={{ fontWeight: 400, fontSize: 10 }}>{d.sub}</tspan>
                    </text>
                  ) : (
                    <>
                      <text x={labelW - 14} y={top + rowH / 2 - 1} textAnchor="end" className="fill-[var(--paper-text)]" style={{ fontSize: 12.5, fontWeight: 600 }}>
                        {d.label}
                      </text>
                      <text x={labelW - 14} y={top + rowH / 2 + 12} textAnchor="end" className="fill-[var(--paper-muted)]" style={{ fontSize: 10 }}>
                        {d.sub}
                      </text>
                    </>
                  )}
                  <path
                    d={barPath(x0, y, (lift / max) * innerW, barH)}
                    fill="var(--chart-v2)"
                    opacity={hover !== null && hover !== i ? 0.5 : 1}
                    style={{ transition: "opacity 120ms ease" }}
                  />
                  <text x={x(lift) + 8} y={y + barH - 3} className="fill-[var(--paper-text)]" style={{ fontVariantNumeric: "tabular-nums" }}>
                    <tspan style={{ fontSize: 12, fontWeight: 600 }}>{`+${Math.round(lift * 100)}%`}</tspan>
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </div>
    </figure>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[var(--paper-muted)]">
      {SERIES.map((s) => (
        <span key={s.key} className="inline-flex items-center gap-2">
          <span className="h-2.5 w-6 rounded-[2px]" style={{ background: s.fill }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page pieces                                                        */
/* ------------------------------------------------------------------ */

/** His tiles and cards: a red figure or word, a line under it. The bare `border` he saw draws in the ink. */
function Tile({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-lg border border-[var(--paper-rule)] bg-[var(--paper-quiet)] p-5">
      <div className="text-3xl font-bold tracking-tight tabular-nums text-[var(--pax2-red)]">{value}</div>
      <div className="mt-2 text-xs leading-relaxed text-[var(--paper-muted)]">{label}</div>
    </div>
  );
}

function Panel({ kicker, title, aside, children }: { kicker: string; title: string; aside: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid gap-6 md:grid-cols-[1fr_230px] md:gap-12">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--paper-muted)]">{kicker}</p>
        <h2 className="mt-3 text-2xl font-bold leading-tight tracking-tight md:text-3xl">{title}</h2>
        <div className="mt-4 space-y-3 text-[15px] leading-relaxed text-[var(--paper-muted)]">{children}</div>
      </div>
      <div className="space-y-5 md:pt-9">{aside}</div>
    </div>
  );
}

const TABS = [
  ["model", "Model"],
  ["search", "Search"],
  ["benchmarks", "Benchmarks"],
] as const;
type Tab = (typeof TABS)[number][0];
const isTab = (s: string): s is Tab => TABS.some(([k]) => k === s);

/** The tab from the URL hash, so a tab is linkable; Model when there is none. */
function useTab() {
  const [tab, setTab] = useState<Tab>("model");
  const railRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const read = () => {
      const h = window.location.hash.slice(1);
      if (isTab(h)) setTab(h);
    };
    const h = window.location.hash.slice(1);
    if (isTab(h)) {
      setTab(h);
      railRef.current?.scrollIntoView({ block: "start" });
    }
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  const choose = (t: Tab) => {
    setTab(t);
    window.history.replaceState(window.history.state, "", `#${t}`);
  };
  return { tab, choose, railRef };
}

/** A 200 ms fade each time the shown tab changes. */
function useFade(key: string) {
  const ref = useRef<HTMLDivElement | null>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    ref.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: "ease-out" });
  }, [key]);
  return ref;
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export function Announcing() {
  const { tab, choose, railRef } = useTab();
  const fadeRef = useFade(tab);

  return (
    <div className={`min-h-0 flex-1 overflow-y-auto text-[var(--paper-text)] ${CHART_VARS}`}>
      <div className="mx-auto max-w-[1000px] px-5 py-10 md:px-8 md:py-16">
        <header>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--pax2-red)]">NSRcpt · V2 · 10 November 2026</p>
          <p className="mt-5 max-w-[660px] text-lg leading-relaxed text-[var(--paper-muted)] md:text-xl">
            Retrieval trained exclusively on nuclear-physics.
          </p>
        </header>

        <section className={`mt-10 border-t ${RULE} pt-10`}>
          <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold tracking-tight md:text-3xl">A needle in a nuclear haystack</h2>
              <p className="mt-2 max-w-[620px] text-sm leading-relaxed text-[var(--paper-muted)]">Find the right paper right away</p>
            </div>
          </div>
          <div className="mt-6">
            <Legend />
          </div>
          <div className="mt-5">
            <GroupedChart
              data={CROSS}
              label="Recall@10 on the cross-source benchmark, 10,000 queries, by record type: NSRcpt v2 and stock bge-m3."
            />
          </div>
          <div className="mt-10">
            <h3 className="text-2xl font-bold tracking-tight md:text-3xl">A fast reader</h3>
            <p className="mt-2 max-w-[620px] text-sm leading-relaxed text-[var(--paper-muted)]">Reads results against the top fifty and reorders them</p>
            <div className="mt-5">
              <LiftChart data={RERANK} label="The reranker's relative lift over stock bge-m3's order of its top fifty." />
            </div>
          </div>
        </section>

        <section className={`border-t ${RULE} py-10 md:py-14`}>
          <div ref={railRef} className="scroll-mt-6">
            <div role="tablist" aria-label="NSRcpt" className={`inline-flex rounded-lg border ${RULE} p-0.5 text-xs`}>
              {TABS.map(([k, label]) => (
                <button
                  key={k}
                  role="tab"
                  id={`tab-${k}`}
                  aria-selected={tab === k}
                  aria-controls="nsrcpt-panel"
                  onClick={() => choose(k)}
                  className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                    tab === k ? "bg-[var(--paper-text)] text-[var(--paper)]" : "text-[var(--paper-muted)] hover:text-[var(--paper-text)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div ref={fadeRef} id="nsrcpt-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="mt-8 md:mt-10">
            {tab === "model" && (
              <Panel
                kicker="better model?"
                title="Better approach"
                aside={
                  <>
                    <Tile value="Compute" label="Supplied by AWS Cloud services through AWS Startup" />
                    <Tile value="Eval" label="Evals, benchmarks and training data via NYSgpt" />
                  </>
                }
              >
                <p>
                  Every record in NSR carries a keyword abstract: an indexer at the National Nuclear Data Center describing that
                  specific paper in the canonical vocabulary of nuclear physics. Alongside them sit EXFOR&apos;s experiment records,
                  each already linked by hand to the paper that reported it. Between them, hundreds of thousands of real questions with
                  known right answers formed the basis of my experiment and training designs.
                </p>
                <p>
                  *More than 152K training pairs and trained on 39k pairs. v2 added 46K cross-source pairs and trained on 32K pairs
                  from v1&apos;s weights. One epoch. No synthetic queries.
                </p>
              </Panel>
            )}

            {tab === "search" && (
              <>
                <Panel
                  kicker="Better search?"
                  title="Better results"
                  aside={
                    <>
                      <Tile value="+262%" label="Papers with no abstract went up 262%." />
                      <Tile value="+307%" label="Papers from before 1970 went up 307%" />
                    </>
                  }
                >
                  <p>
                    NSRgpt used to search with a general-purpose model that had never seen a nuclear-physics paper. It now searches
                    with one trained on this corpus, and the gain is largest exactly where the corpus is hardest: papers with no
                    abstract, where the model has a title and nothing else, went up 262%. Papers from before 1970 went up 307%.
                  </p>
                </Panel>
              </>
            )}

            {tab === "benchmarks" && (
              <Panel
                kicker="Better benchmarks?"
                title="Better overall"
                aside={
                  <>
                    <Tile value="16 / 16" label="Clearing all 16 pre-set benchmarks." />
                    <Tile value="20x" label="NSRcpt beats stock models by 20x." />
                  </>
                }
              >
                <p>
                  A headline average can hide a model that got much better at easy questions and worse at hard ones. So the benchmark
                  was cut sixteen ways before the numbers were produced, and the bar was set in advance: beat the stock model in every
                  segment, on both metrics, by at least 10% on the blended keyword family.
                </p>
                <p>
                  It cleared that bar by nearly twenty times, and it cleared it everywhere — the weakest segment still improved by 65%.
                  The reranker was gated the same way and passed in all eight of its segments.
                </p>
              </Panel>
            )}
          </div>
        </section>

        <section className={`border-t ${RULE} py-12 text-center md:py-16`}>
          <h2 className="text-2xl font-bold tracking-tight md:text-4xl">Try it</h2>
          <p className="mx-auto mt-3 max-w-[540px] text-sm leading-relaxed text-[var(--paper-muted)]">
            Describe what you are looking for the way you would to a colleague.
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
      </div>
    </div>
  );
}
