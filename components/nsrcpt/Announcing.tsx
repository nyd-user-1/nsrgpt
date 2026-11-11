"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Minus, X } from "lucide-react";
import { BOX_CLASS, SANS, SERIF } from "@/app/(site)/(plate)/viz/box-style";
import { short } from "@/lib/datasets";
import { HF_MODELS, type HomeCardData } from "@/lib/home-data";

/* ------------------------------------------------------------------ *
 *  /nsrcpt, rewritten for v2 and the reranker (brief 63, 2026-11-10)
 *  from Brendan's inspector edits of the brief 58 port: a one-line hero,
 *  one chart (v2 by record type, brief 61's Result table), a Model,
 *  Search, Benchmarks tab rail in place of the four claims, then Try it,
 *  the model cards and the fine print.
 *
 *  Every v1 number is the NSR-CPT report's (docs/NSR-CPT-REPORT.md and
 *  the lane logs it cites). Every v2 number is brief 61's Result
 *  (docs/briefs/61-nsr-encoder-v2-cross-source.md), measured on the box,
 *  not rounded. The program ran no significance tests, so the page never
 *  says "significant".
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
  { key: "v1", label: "NSRcpt v1", fill: "var(--chart-v1)" },
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
                      <tspan dx={8} className="fill-[var(--paper-muted)]" style={{ fontWeight: 400, fontSize: 10 }}>
                        {`${g.n.toLocaleString("en-US")} queries`}
                      </tspan>
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
                      <text x={labelW - 14} y={top + rowH / 2 + 12} textAnchor="end" className="fill-[var(--paper-muted)]" style={{ fontSize: 10 }}>
                        {`${g.n.toLocaleString("en-US")} queries`}
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
                    <tspan dx={6} className="fill-[var(--paper-muted)]" style={{ fontSize: 10.5 }}>{pair}</tspan>
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

function Tile({ value, label }: { value: string; label: string }) {
  const long = value.length > 8;
  return (
    <div className={`rounded-lg border ${RULE} bg-[var(--paper-quiet)] p-5`}>
      <div className={`whitespace-nowrap font-bold tracking-tight tabular-nums text-[var(--pax2-red)] ${long ? "text-2xl" : "text-3xl"}`}>{value}</div>
      <div className="mt-2 text-xs leading-relaxed text-[var(--paper-muted)]">{label}</div>
    </div>
  );
}

function Card({ label, body }: { label: string; body: string }) {
  return (
    <div className={`rounded-lg border ${RULE} bg-[var(--paper-quiet)] p-5`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--paper-muted)]">{label}</div>
      <div className="mt-2 text-sm leading-relaxed text-[var(--paper-text)]">{body}</div>
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
      <div className="space-y-3 md:pt-9">{aside}</div>
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
        {/* Hero */}
        <header>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--pax2-red)]">NSRcpt · v2 · 10 November 2026</p>
          <p className="mt-5 text-3xl font-bold leading-tight tracking-tight md:text-[34px]">
            Retrieval trained exclusively on nuclear physics.
          </p>
        </header>

        {/* The chart */}
        <section className={`mt-12 border-t ${RULE} pt-10 md:mt-16`}>
          <h2 className="text-2xl font-bold tracking-tight md:text-3xl">A needle in a nuclear haystack</h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--paper-muted)]">Find the right record right away.</p>
          <div className="mt-6">
            <Legend />
          </div>
          <div className="mt-5">
            <GroupedChart data={CROSS} label="Recall@10 on the cross-source benchmark, 10,000 queries, by record type: NSRcpt v2, NSRcpt v1 and stock bge-m3." />
          </div>
          <p className="mt-3 text-xs leading-relaxed text-[var(--paper-muted)]">
            Recall@10: how often the right record is in the top ten, on 10,000 queries frozen before v2 was trained.
          </p>
        </section>

        {/* The tab rail */}
        <section className={`mt-14 border-t ${RULE} pt-10`}>
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
                kicker="Better model?"
                title="Better approach"
                aside={
                  <>
                    <Card label="Compute" body="Supplied by AWS through AWS Startup" />
                    <Card label="Eval" body="Evals, benchmarks and training data by NYSgpt" />
                  </>
                }
              >
                <p>
                  Every record in NSR carries a keyword abstract: an indexer at the National Nuclear Data Center describing that
                  specific paper in the canonical vocabulary of nuclear physics. Alongside them sit EXFOR&apos;s experiment records,
                  each already linked by hand to the paper that reported it, and ENSDF&apos;s datasets and ENDF&apos;s materials, each
                  citing its sources. Between them, hundreds of thousands of real questions with known right answers formed the basis
                  of my experiment and training designs.
                </p>
                <p className={`border-t ${RULE} pt-3 text-xs`}>
                  v1: 152K pairs built, 39K trained. v2: 46K cross-source pairs built, 32K trained, from v1&apos;s weights. One pass
                  each. No synthetic queries.
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
                      <Tile value="+262%" label="Papers with no abstract" />
                      <Tile value="+307%" label="Papers from before 1970" />
                      <Tile value="42×" label="ENDF material to its papers" />
                    </>
                  }
                >
                  <p>
                    NSRgpt used to search with a general-purpose model that had never seen a nuclear physics paper. It now searches
                    with one trained on this corpus, and the gain is largest exactly where the corpus is hardest: papers with no
                    abstract, where the model has a title and nothing else, went up 262%. Papers from before 1970 went up 307%. v2
                    adds the records themselves: an ENDF material now finds the papers it cites 42 times as often.
                  </p>
                </Panel>
                <div className={`mt-10 border-t ${RULE} pt-8`}>
                  <h3 className="text-lg font-bold tracking-tight">The reranker</h3>
                  <p className="mt-1 text-sm text-[var(--paper-muted)]">Reads the top fifty and reorders them</p>
                  <div className="mt-5">
                    <LiftChart data={RERANK} label="The reranker's relative lift over stock bge-m3's order of its top fifty." />
                  </div>
                </div>
              </>
            )}

            {tab === "benchmarks" && (
              <Panel
                kicker="Better benchmarks?"
                title="Better overall"
                aside={
                  <>
                    <Tile value="16 / 16" label="Benchmarks cleared" />
                    <Tile value="20×" label="The bar, cleared" />
                    <Tile value="0.673 → 0.870" label="Cross-source recall, v1 to v2" />
                  </>
                }
              >
                <p>
                  A headline average can hide a model that got much better at easy questions and worse at hard ones. So the benchmark
                  was cut sixteen ways before the numbers were produced, and the bar was set in advance: beat the stock model in every
                  segment, on both metrics, by at least 10% on the blended keyword family. It cleared that bar by nearly twenty times,
                  and it cleared it everywhere; the weakest segment still improved by 65%. The reranker was gated the same way and
                  passed in all eight of its segments.
                </p>
                <p>
                  v2 was gated on a frozen cross-source benchmark of 10,000 queries and on v1&apos;s paper benchmark: it had to win the
                  first and hold the second within a point. It did both.
                </p>
              </Panel>
            )}
          </div>
        </section>

        {/* Try it */}
        <section className={`mt-14 border-t ${RULE} py-12 text-center md:py-16`}>
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

        <Models />

        <FinePrint />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  The model cards (brief 58, Part A.2; v2 since brief 63)            */
/* ------------------------------------------------------------------ */

const V2 = "https://huggingface.co/NYSgpt/nsr-encoder-v2";
/** v2, which every search here runs on (the search Lambda's SEARCH_PREFIX, brief 61 Part D). Not in lib/home-data.ts. */
const V2_CARD: HomeCardData = {
  href: V2,
  title: "NSR Encoder v2",
  tag: "Model",
  accent: "#7c3aed",
  body: "The NSR Encoder trained one more pass on pairs joined across NSR, EXFOR, ENSDF and ENDF, so a record finds the papers behind it.",
  value: 567_800_000,
  unit: "Parameters",
  sources: "NNDC · ENSDF · EXFOR · ENDF",
};
const SERVED = new Set([V2]);
/** v2 first, then the rest of the family as lib/home-data.ts lists it, less v1 (v2 replaced it) and the two that failed
 *  their gates and are published only for the record: they are not coming. */
const MODELS = [
  V2_CARD,
  ...HF_MODELS.filter((m) => m.href.includes("/nsr-") && !m.href.endsWith("/nsr-encoder")),
  ...HF_MODELS.filter((m) => !m.href.includes("/nsr-") && !m.body.includes("Failed its gate")),
];

function Models() {
  return (
    <section className={`border-t ${RULE} pt-10`}>
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

/* ------------------------------------------------------------------ */
/*  The fine print                                                     */
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
    <section className={`mt-12 border-t ${RULE} pt-10 text-xs leading-relaxed text-[var(--paper-muted)]`}>
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--paper-text)]">The fine print</h2>

      <div className="mt-6 grid gap-8 md:grid-cols-2">
        <div className="space-y-4">
          <div>
            <p className="font-semibold text-[var(--paper-text)]">The v1 benchmark</p>
            <p className="mt-1">
              <span className="font-mono">nsr-eval-v1</span>, frozen before training: 4,998 keyword-abstract queries and 4,997 EXFOR
              queries, one gold paper each, retrieved against the full 277,068-record corpus. Papers are held out by the first
              quartile of <span className="font-mono">md5(&apos;holdout:&apos; || key_number)</span>, so a paper&apos;s queries cannot
              straddle the split. Queries are stratified over era, richness and reference type with a floor of 100 per bucket, so
              every segment reported is one the sample can actually support. A leak audit found zero query texts inside their own
              documents.
            </p>
          </div>
          <div>
            <p className="font-semibold text-[var(--paper-text)]">The v2 benchmark</p>
            <p className="mt-1">
              10,000 cross-source queries, frozen before v2 was trained: an ENDF material looking for the papers its file cites
              (364), an ENSDF dataset for its reference papers (2,500), an EXFOR dataset for its paper (3,136), a nuclide for its
              records (2,000) and a reaction in words for its EXFOR datasets (2,000). Every model embedded the same texts the same
              way and searched the whole corpus exactly: 277,068 papers, 190,430 EXFOR datasets and 10,110 record lines.
            </p>
          </div>
          <div>
            <p className="font-semibold text-[var(--paper-text)]">The metrics</p>
            <p className="mt-1">
              R@1 and R@10: the share of queries whose answer is first, or in the top ten. nDCG@10 for the quality of the whole
              ordering, MRR for the rank of the first right answer. Every arm ran on the same corpus, the same queries and the same
              scoring code.
            </p>
          </div>
          <div>
            <p className="font-semibold text-[var(--paper-text)]">No significance testing</p>
            <p className="mt-1">
              This program ran no McNemar tests and no bootstrap confidence intervals. Nothing on this page is described as
              statistically significant, because that was not measured. What was set in advance instead: v1 had to beat the stock
              model on R@10 and nDCG@10 in every segment, by at least 10% relative on the blended keyword family; v2 had to win the
              cross-source benchmark and hold v1&apos;s paper benchmark within a point. Both passed.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <p className="font-semibold text-[var(--paper-text)]">Every claim on this page, scored</p>
            <ul className="mt-2 space-y-2">
              <FootRow verdict="win">
                v2, cross-source R@10: 0.673 → 0.870 against v1 (stock bge-m3 0.636). ENDF material to its papers 0.019 → 0.802,
                ENSDF dataset to its papers 0.138 → 0.563, reaction in words to EXFOR 0.677 → 0.980.
              </FootRow>
              <FootRow verdict="tie">
                v2 on v1&apos;s paper benchmark: R@10 0.746 → 0.747, MRR 0.648 → 0.646, inside the one-point bar.
              </FootRow>
              <FootRow verdict="loss">
                EXFOR dataset to its paper keeps its R@10 under v2 (0.970 → 0.969) but its MRR drops 0.919 → 0.891. As served
                (int8, a 1,000-query sample), keyword queries lose 1.2 points of R@10 against v1, inside that sample&apos;s error of
                about 1.6 points.
              </FootRow>
              <FootRow verdict="win">
                v1, keyword family R@10: 0.171 → 0.487 (+186%); nDCG@10 0.121 → 0.363 (+200%); R@1 0.080 → 0.252.
              </FootRow>
              <FootRow verdict="win">
                Title-only papers +262%, pre-1970 papers +307%, non-journal references +271%: the thinnest slices of the corpus
                gained the most.
              </FootRow>
              <FootRow verdict="tie">
                v1, EXFOR family: 0.958 → 0.966 R@10, 0.8 of a point. Dense retrieval was already near the ceiling; the
                fine-tune&apos;s real gain there is on the has-abstract segment (+9%).
              </FootRow>
              <FootRow verdict="loss">
                Full-text search alone still beats the stock dense model at R@1 on keyword queries (0.161 vs 0.080), and beats my
                encoder on nothing, but the best arm measured is the fusion of the two (0.344 R@1), not my encoder alone (0.252).
              </FootRow>
              <FootRow verdict="win">
                Reranker, keyword family: R@1 0.080 → 0.180, R@10 0.171 → 0.241, nDCG@10 +76%, better in all eight segments. EXFOR
                R@1 0.871 → 0.927. It reordered stock bge-m3&apos;s top fifty; reordering NSRcpt&apos;s has not been measured.
              </FootRow>
              <FootRow verdict="loss">
                The reranker is <em>not</em> served here yet. On a CPU box it costs about 0.13 s per candidate, 6.6 s for fifty.
                Always-on reranking needs a GPU that is not currently rented.
              </FootRow>
            </ul>
          </div>
        </div>
      </div>

      <div className={`mt-8 space-y-4 border-t ${RULE} pt-6`}>
        <div>
          <p className="font-semibold text-[var(--paper-text)]">The caveat the model cards carry</p>
          <p className="mt-1">
            v1 and the reranker were trained on a partial mining sweep in which held-out benchmark papers could appear as{" "}
            <em>negatives</em> for other queries, 24.7% of negative slots. Query and positive were strictly disjoint from the
            held-out set, and this is the standard full-corpus mining setup used by DPR and MedCPT, but it is a real caveat and it
            is not rounded off here. A clean re-swept training set with zero held-out papers anywhere has been built and published;
            the retrain on it has not been run. v2 starts from v1&apos;s weights, so the model serving today carries the caveat.
          </p>
        </div>
        <div>
          <p className="font-semibold text-[var(--paper-text)]">Other things worth knowing</p>
          <p className="mt-1">
            181 of the 4,998 keyword positives (3.6%) have an exact-text twin elsewhere in the corpus, and a twin hit is scored as
            correct. v1 trained on 39,568 of 121,649 available pairs for one epoch, a 60-minute budget decision, not a quality one.
            v2 trained on 31,998 rows (24,000 cross-source pairs and 7,998 rows replayed from v1&apos;s clean set) at batch 8, because
            no larger GPU was available. More data and more epochs are untested. A commercial embedding arm was killed at 6% on
            throughput, so there is no paid-API column in any table. Only 93,579 of the 277,068 records carry a publisher
            abstract, which is why the title-only segment is the one that matters most here. v1 scores higher on the v2 benchmark
            than in its own report (keyword R@10 0.512 against 0.487) because the v2 measure embeds every model at 256 tokens with
            sentence-transformers; the chart&apos;s three models are measured alike.
          </p>
        </div>
        <div>
          <p className="font-semibold text-[var(--paper-text)]">What is and is not deployed</p>
          <p className="mt-1">
            Live: NSRcpt v2, int8 on AWS Lambda, serving every semantic search, the Hybrid mode&apos;s dense half, chat retrieval
            and graph similarity; v1 is one setting away. Not yet served: the reranker, per the latency above. The models are
            published privately, pending confirmation of redistribution terms for NNDC-authored keyword-abstract text.
          </p>
        </div>
        <div>
          <p className="font-semibold text-[var(--paper-text)]">Sources</p>
          <p className="mt-1">
            The v1 numbers are from its training report and the logs it cites; the v2 numbers are from the v2 run&apos;s own
            evaluation. Corpus: 277,068 embeddable NSR records, sourced from nndc.bnl.gov/nsr; coverage verified at 277,068 of
            277,068 with zero orphans.
          </p>
        </div>
        <p className="pt-2">
          NSRgpt is an independent project and is not affiliated with, endorsed by, or sponsored by Brookhaven National
          Laboratory, the National Nuclear Data Center, or the U.S. Department of Energy. NSR data is publicly available and
          sourced from nndc.bnl.gov/nsr.
        </p>
      </div>
    </section>
  );
}
