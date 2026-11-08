"use client";

import { Activity, Calendar, Grid3x3, ScatterChart as ScatterIcon, TrendingUp } from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, XAxis, YAxis, ZAxis, Cell, ResponsiveContainer, Scatter, ScatterChart, Tooltip,
  Line, LineChart, Area, AreaChart, Pie, PieChart,
} from "recharts";
import { ELEMENTS } from "@/lib/nsr-structure";
import type { NsrRecord } from "@/lib/nsr-types";
import { SHELL_CLS, WIDGET_H, WidgetHeader, type CountEntry } from "@/components/nsr/SearchWidget";

// The /search charts (2026-11-08): recharts and everything drawn with it, split out of SearchPage.tsx so the page
// loads it through next/dynamic only when a chart widget shows.

/** "137Cs" → { z, n, a, symbol } via the ELEMENTS table; null if unparseable. */
function parseNuclide(code: string): { z: number; n: number; a: number; symbol: string } | null {
  const m = /^(\d{1,3})([A-Za-z]{1,2})$/.exec(code);
  if (!m) return null;
  const a = Number(m[1]);
  const symbol = m[2][0].toUpperCase() + m[2].slice(1).toLowerCase();
  const z = ELEMENTS.indexOf(symbol);
  if (z < 0 || a < z) return null;
  return { z, n: a - z, a, symbol };
}

/** The widgets' orange ramp (anchored on the existing #FF9933). */
const RAMP = ["#FF9933", "#E0801F", "#B8641A", "#8B7332", "#6B5A28", "#4A4020", "#333333"];
const decadeOf = (y: number) => `${Math.floor(y / 10) * 10}s`;

/** rows: one per decade, columns: one per series key (stacked area input) */
function seriesByDecade(records: NsrRecord[], getter: (r: NsrRecord) => string[] | null | undefined, topN = 5) {
  const totals = new Map<string, number>();
  for (const r of records) for (const k of getter(r) ?? []) totals.set(k, (totals.get(k) ?? 0) + 1);
  const keys = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, topN).map(([k]) => k);
  const rows = new Map<string, Record<string, number | string>>();
  for (const r of records) {
    if (!r.pub_year) continue;
    const d = decadeOf(r.pub_year);
    const row = rows.get(d) ?? { decade: d, ...Object.fromEntries(keys.map((k) => [k, 0])) };
    for (const k of getter(r) ?? []) if (keys.includes(k)) row[k] = (row[k] as number) + 1;
    rows.set(d, row);
  }
  return { keys, rows: [...rows.values()].sort((a, b) => String(a.decade).localeCompare(String(b.decade))) };
}

/* ------------------------------------------------------------------ */
/*  Year bar chart widget                                               */
/* ------------------------------------------------------------------ */

export function YearBarChart({
  entries,
  activeYears,
  onToggle,
  onClose,
}: {
  entries: CountEntry[];
  activeYears: Set<string>;
  onToggle: (value: string) => void;
  onClose: () => void;
}) {
  if (entries.length === 0) return null;

  const data = entries.map((e) => ({
    year: e.value,
    count: e.count,
    fill: activeYears.size === 0 || activeYears.has(e.value)
      ? "#FF9933"
      : "#333333",
  }));

  return (
    <div className={SHELL_CLS} style={{ height: WIDGET_H }}>
      <WidgetHeader icon={<Calendar className="h-3.5 w-3.5 text-[var(--paper-muted)]" />} title="Year" onClose={onClose} />
      <div className="px-2 py-3 flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#222" />
            <XAxis
              dataKey="year"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10, fill: "#8B7332" }}
              tickMargin={4}
            />
            <YAxis hide />
            <Bar
              dataKey="count"
              radius={[2, 2, 0, 0]}
              onClick={(_data, index) => onToggle(data[index].year)}
              className="cursor-pointer"
            >
              {data.map((entry) => (
                <Cell key={entry.year} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}


/* ------------------------------------------------------------------ */
/*  Nuclide map widget — the result set on the Z–N plane                */
/* ------------------------------------------------------------------ */

export function NuclideMap({
  entries,
  activeNuclides,
  onToggle,
  onClose,
}: {
  entries: CountEntry[];
  activeNuclides: Set<string>;
  onToggle: (value: string) => void;
  onClose: () => void;
}) {
  const points = entries
    .map((e) => {
      const p = parseNuclide(e.value);
      return p ? { code: e.value, z: p.z, n: p.n, a: p.a, symbol: p.symbol, count: e.count } : null;
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);
  if (points.length < 2) return null;
  const anyActive = activeNuclides.size > 0;
  return (
    <div className={SHELL_CLS} style={{ height: WIDGET_H }}>
      <WidgetHeader icon={<Grid3x3 className="h-3.5 w-3.5 text-[var(--paper-muted)]" />} title="Nuclide map" sub="Z vs N · size = papers" onClose={onClose} />
      <div className="px-2 py-3 flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#222" />
            <XAxis type="number" dataKey="n" name="N" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "#8B7332" }} tickMargin={4} domain={["dataMin - 2", "dataMax + 2"]} />
            <YAxis type="number" dataKey="z" name="Z" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "#8B7332" }} width={28} domain={["dataMin - 2", "dataMax + 2"]} />
            <ZAxis type="number" dataKey="count" range={[24, 220]} />
            <Tooltip
              cursor={{ strokeDasharray: "3 3", stroke: "#444" }}
              content={({ payload }) => {
                const p = payload?.[0]?.payload as (typeof points)[number] | undefined;
                if (!p) return null;
                return (
                  <div className="rounded-md border border-[var(--paper-rule)] bg-[var(--paper)] px-2 py-1 text-xs text-[var(--paper-text)] shadow">
                    <span className="font-medium">{p.a}{p.symbol}</span>
                    <span className="text-[var(--paper-muted)]"> · Z={p.z} N={p.n} · {p.count}</span>
                  </div>
                );
              }}
            />
            <Scatter data={points} onClick={(d) => onToggle((d as unknown as { code: string }).code)} className="cursor-pointer">
              {points.map((p) => (
                <Cell key={p.code} fill={!anyActive || activeNuclides.has(p.code) ? "#FF9933" : "#333333"} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Chart shell + the line / area / doughnut / scatter widgets          */
/* ------------------------------------------------------------------ */

function ChartShell({ icon, title, sub, onClose, children }: {
  icon: React.ReactNode; title: string; sub?: string; onClose: () => void; children: React.ReactElement;
}) {
  return (
    <div className={SHELL_CLS} style={{ height: WIDGET_H }}>
      <WidgetHeader icon={icon} title={title} sub={sub} onClose={onClose} />
      <div className="px-2 py-3 flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
      </div>
    </div>
  );
}

const AXIS = { fontSize: 10, fill: "#8B7332" } as const;
const TIP_CLS = "rounded-md border border-[var(--paper-rule)] bg-[var(--paper)] px-2 py-1 text-xs text-[var(--paper-text)] shadow";

/** Line: cumulative papers over publication year. */
export function CumulativeChart({ entries, onClose }: { entries: CountEntry[]; onClose: () => void }) {
  if (entries.length < 3) return null;
  const data = entries.reduce<{ year: string; total: number }[]>((acc, e) => {
    acc.push({ year: e.value, total: (acc.at(-1)?.total ?? 0) + e.count });
    return acc;
  }, []);
  return (
    <ChartShell icon={<TrendingUp className="h-3.5 w-3.5 text-[var(--paper-muted)]" />} title="Cumulative" sub="papers over time" onClose={onClose}>
      <LineChart data={data} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#222" />
        <XAxis dataKey="year" tickLine={false} axisLine={false} tick={AXIS} tickMargin={4} minTickGap={24} />
        <YAxis tickLine={false} axisLine={false} tick={AXIS} width={28} />
        <Tooltip content={({ payload }) => payload?.[0] ? <div className={TIP_CLS}>{String(payload[0].payload.year)} · {String(payload[0].value)} papers</div> : null} />
        <Line type="monotone" dataKey="total" stroke="#FF9933" strokeWidth={2} dot={false} activeDot={{ r: 3, fill: "#FF9933" }} />
      </LineChart>
    </ChartShell>
  );
}

/** Line: relevance score by rank position — how fast the match quality falls off. */
export function RelevanceChart({ records, onClose }: { records: NsrRecord[]; onClose: () => void }) {
  const data = records.filter((r) => r.similarity != null).map((r, i) => ({ rank: i + 1, score: Math.round((r.similarity as number) * 100), key: r.key_number }));
  if (data.length < 5) return null;
  return (
    <ChartShell icon={<Activity className="h-3.5 w-3.5 text-[var(--paper-muted)]" />} title="Relevance" sub="score by rank" onClose={onClose}>
      <LineChart data={data} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#222" />
        <XAxis dataKey="rank" tickLine={false} axisLine={false} tick={AXIS} tickMargin={4} minTickGap={24} />
        <YAxis tickLine={false} axisLine={false} tick={AXIS} width={28} domain={[0, 100]} />
        <Tooltip content={({ payload }) => payload?.[0] ? <div className={TIP_CLS}>#{String(payload[0].payload.rank)} {String(payload[0].payload.key)} · {String(payload[0].value)}%</div> : null} />
        <Line type="monotone" dataKey="score" stroke="#FF9933" strokeWidth={2} dot={false} activeDot={{ r: 3, fill: "#FF9933" }} />
      </LineChart>
    </ChartShell>
  );
}

/** Stacked area: a categorical field across decades (topics, reference types). */
export function DecadeAreaChart({ icon, title, records, getter, label, onClose }: {
  icon: React.ReactNode; title: string; records: NsrRecord[]; getter: (r: NsrRecord) => string[] | null | undefined; label: (v: string) => string; onClose: () => void;
}) {
  const { keys, rows } = seriesByDecade(records, getter);
  if (rows.length < 3 || keys.length === 0) return null;
  return (
    <ChartShell icon={icon} title={title} sub="by decade" onClose={onClose}>
      <AreaChart data={rows} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#222" />
        <XAxis dataKey="decade" tickLine={false} axisLine={false} tick={AXIS} tickMargin={4} />
        <YAxis tickLine={false} axisLine={false} tick={AXIS} width={28} />
        <Tooltip content={({ payload, label: l }) => payload?.length ? (
          <div className={TIP_CLS}>
            <div className="font-medium">{String(l)}</div>
            {payload.map((p) => <div key={String(p.dataKey)}><span style={{ color: p.color as string }}>■</span> {label(String(p.dataKey))}: {String(p.value)}</div>)}
          </div>
        ) : null} />
        {keys.map((k, i) => (
          <Area key={k} type="monotone" dataKey={k} stackId="1" stroke={RAMP[i % RAMP.length]} fill={RAMP[i % RAMP.length]} fillOpacity={0.55} />
        ))}
      </AreaChart>
    </ChartShell>
  );
}

/** Doughnut: share of a categorical field; click a slice to filter. */
export function DoughnutChart({ icon, title, entries, activeValues, onToggle, label, onClose }: {
  icon: React.ReactNode; title: string; entries: CountEntry[]; activeValues: Set<string>; onToggle: (v: string) => void; label: (v: string) => string; onClose: () => void;
}) {
  if (entries.length < 2) return null;
  const top = entries.slice(0, 6);
  const anyActive = activeValues.size > 0;
  return (
    <ChartShell icon={icon} title={title} sub="share" onClose={onClose}>
      <PieChart margin={{ left: 0, right: 0, top: 0, bottom: 0 }}>
        <Tooltip content={({ payload }) => payload?.[0] ? <div className={TIP_CLS}>{label(String(payload[0].name))} · {String(payload[0].value)}</div> : null} />
        <Pie data={top} dataKey="count" nameKey="value" innerRadius={58} outerRadius={88} paddingAngle={2} stroke="none"
          onClick={(d) => onToggle((d as unknown as { value: string }).value)} className="cursor-pointer"
          label={({ name, percent }) => (percent && percent > 0.08 ? `${label(String(name)).slice(0, 14)} ${Math.round(percent * 100)}%` : "")}
          labelLine={false} fontSize={10}>
          {top.map((e, i) => (
            <Cell key={e.value} fill={!anyActive || activeValues.has(e.value) ? RAMP[i % RAMP.length] : "#333333"} />
          ))}
        </Pie>
      </PieChart>
    </ChartShell>
  );
}

/** Scatter: publication year vs citations; click a point to open the record. */
export function CitationScatter({ records, onOpen, onClose }: { records: NsrRecord[]; onOpen: (key: string) => void; onClose: () => void }) {
  const pts = records.filter((r) => r.pub_year && (r.citation_count ?? 0) > 0).map((r) => ({ year: r.pub_year, cites: r.citation_count as number, key: r.key_number, title: r.title }));
  if (pts.length < 3) return null;
  return (
    <ChartShell icon={<ScatterIcon className="h-3.5 w-3.5 text-[var(--paper-muted)]" />} title="Citations" sub="year vs cites · click opens" onClose={onClose}>
      <ScatterChart margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#222" />
        <XAxis type="number" dataKey="year" name="Year" tickLine={false} axisLine={false} tick={AXIS} tickMargin={4} domain={["dataMin - 1", "dataMax + 1"]} />
        <YAxis type="number" dataKey="cites" name="Citations" tickLine={false} axisLine={false} tick={AXIS} width={34} />
        <Tooltip cursor={{ strokeDasharray: "3 3", stroke: "#444" }} content={({ payload }) => {
          const p = payload?.[0]?.payload as (typeof pts)[number] | undefined;
          return p ? <div className={TIP_CLS}><span className="font-medium">{p.key}</span> · {p.year} · {p.cites} cites<div className="text-[var(--paper-muted)] max-w-[240px] truncate">{p.title}</div></div> : null;
        }} />
        <Scatter data={pts} fill="#FF9933" onClick={(d) => onOpen((d as unknown as { key: string }).key)} className="cursor-pointer" />
      </ScatterChart>
    </ChartShell>
  );
}
