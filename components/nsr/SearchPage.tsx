"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import {
  Loader2, Calendar, Atom, Zap, ExternalLink, BookOpen, Users, Tag, Layers, FileText, Quote,
  PieChart as PieIcon, ArrowRight, Sparkles,
} from "lucide-react";
import { useNsrSearch, type SearchMode } from "@/hooks/useNsrSearch";
import { SearchBox } from "@/components/nsr/SearchInput";
import { RecordDrawer } from "@/components/nsr/RecordDrawer";
import { RecordDialog } from "@/components/nsr/RecordDialog";
import { ScoreInfoDialog } from "@/components/nsr/ScoreInfoDialog";
import { PanelChat } from "@/components/nsr/PanelChat";
import { useShellPanel } from "@/components/shell";
import { usePrefetchRecord } from "@/hooks/useS2Enrichment";
import { SHELL_CLS, WIDGET_H, WidgetHeader, type CountEntry } from "@/components/nsr/SearchWidget";
import { ChartSkeleton } from "@/components/ui/chart-skeleton";
import type { NsrRecord } from "@/lib/nsr-types";

// The chart widgets are recharts, loaded only when one shows (2026-11-08); the stat tables need none of it.
const WidgetSkeleton = () => <ChartSkeleton className="h-[280px] flex-none" />;
const YearBarChart = dynamic(() => import("@/components/nsr/SearchCharts").then((m) => m.YearBarChart), { ssr: false, loading: WidgetSkeleton });
const NuclideMap = dynamic(() => import("@/components/nsr/SearchCharts").then((m) => m.NuclideMap), { ssr: false, loading: WidgetSkeleton });
const CumulativeChart = dynamic(() => import("@/components/nsr/SearchCharts").then((m) => m.CumulativeChart), { ssr: false, loading: WidgetSkeleton });
const RelevanceChart = dynamic(() => import("@/components/nsr/SearchCharts").then((m) => m.RelevanceChart), { ssr: false, loading: WidgetSkeleton });
const DecadeAreaChart = dynamic(() => import("@/components/nsr/SearchCharts").then((m) => m.DecadeAreaChart), { ssr: false, loading: WidgetSkeleton });
const DoughnutChart = dynamic(() => import("@/components/nsr/SearchCharts").then((m) => m.DoughnutChart), { ssr: false, loading: WidgetSkeleton });
const CitationScatter = dynamic(() => import("@/components/nsr/SearchCharts").then((m) => m.CitationScatter), { ssr: false, loading: WidgetSkeleton });

/* ------------------------------------------------------------------ */
/*  Stat helpers                                                        */
/* ------------------------------------------------------------------ */

function countField(
  records: NsrRecord[],
  getter: (r: NsrRecord) => string[] | null | undefined,
): CountEntry[] {
  const map = new Map<string, number>();
  for (const r of records) {
    const vals = getter(r);
    if (!vals) continue;
    for (const v of vals) {
      map.set(v, (map.get(v) ?? 0) + 1);
    }
  }
  return Array.from(map, ([value, count]) => ({ value, count })).sort(
    (a, b) => b.count - a.count || a.value.localeCompare(b.value),
  );
}

function countYears(records: NsrRecord[]): CountEntry[] {
  const map = new Map<string, number>();
  for (const r of records) {
    if (r.pub_year) {
      const y = String(r.pub_year);
      map.set(y, (map.get(y) ?? 0) + 1);
    }
  }
  return Array.from(map, ([value, count]) => ({ value, count })).sort(
    (a, b) => Number(a.value) - Number(b.value),
  );
}

/** Extract journal name from reference like "Phys.Rev. C 100, 064319 (2019)" */
function extractJournal(ref: string | null): string | null {
  if (!ref) return null;
  // Strip everything from the first digit-comma or digit-space-( pattern onward
  // to get "Phys.Rev. C" from "Phys.Rev. C 100, 064319 (2019)"
  const cleaned = ref
    .replace(/\s+\d+[\s,].*$/, "")  // strip from " 100, ..." onward
    .replace(/\s*\(.*$/, "")         // strip from " (" onward
    .trim()
    .replace(/[.,;:]+$/, "");        // strip trailing punctuation
  return cleaned.length >= 3 ? cleaned : null;
}

function countJournals(records: NsrRecord[]): CountEntry[] {
  const map = new Map<string, number>();
  for (const r of records) {
    const j = extractJournal(r.reference);
    if (j) map.set(j, (map.get(j) ?? 0) + 1);
  }
  return Array.from(map, ([value, count]) => ({ value, count })).sort(
    (a, b) => b.count - a.count || a.value.localeCompare(b.value),
  );
}


/** "A.B.Smith; C.Doe" → ["A.B.Smith", "C.Doe"] */
function splitAuthors(a: string | null | undefined): string[] {
  if (!a) return [];
  return a.split(";").map((x) => x.trim()).filter(Boolean);
}

const TOPIC_LABEL: Record<string, string> = {
  NUCLEAR_REACTIONS: "Nuclear reactions",
  NUCLEAR_STRUCTURE: "Nuclear structure",
  RADIOACTIVITY: "Radioactivity",
  NUCLEAR_MOMENTS: "Nuclear moments",
  ATOMIC_PHYSICS: "Atomic physics",
  ATOMIC_MASSES: "Atomic masses",
  COMPILATION: "Compilation",
};
const TYPE_LABEL: Record<string, string> = {
  JOURNAL: "Journal", PREPRINT: "Preprint", REPORT: "Report", CONFERENCE: "Conference",
  THESIS: "Thesis", PRIVATE_COMMUNICATION: "Private comm.", BOOK: "Book", UNKNOWN: "Unknown",
};
const typeOf = (r: NsrRecord) => r.reference_type ?? "UNKNOWN";
const labelFor = (map: Record<string, string>) => (v: string) => map[v] ?? v;

/** Ensure every known value appears (count 0 when absent); observed order first, then the rest. */
function withAllValues(entries: CountEntry[], all: string[]): CountEntry[] {
  const seen = new Set(entries.map((e) => e.value));
  return [...entries, ...all.filter((v) => !seen.has(v)).map((v) => ({ value: v, count: 0 }))];
}

/** Top-cited records in the set (key → cites); records without a count are skipped. */
function countCitations(records: NsrRecord[]): CountEntry[] {
  return records
    .filter((r) => (r.citation_count ?? 0) > 0)
    .map((r) => ({ value: r.key_number, count: r.citation_count as number }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);
}

/* ------------------------------------------------------------------ */
/*  Filter types                                                        */
/* ------------------------------------------------------------------ */

interface Filters {
  years: Set<string>;
  nuclides: Set<string>;
  reactions: Set<string>;
  journals: Set<string>;
  authors: Set<string>;
  subjects: Set<string>;
  topics: Set<string>;
  types: Set<string>;
}

const EMPTY_SET: Set<string> = new Set();

const EMPTY_FILTERS: Filters = {
  years: new Set(),
  nuclides: new Set(),
  reactions: new Set(),
  journals: new Set(),
  authors: new Set(),
  subjects: new Set(),
  topics: new Set(),
  types: new Set(),
};

function applyFilters(records: NsrRecord[], filters: Filters): NsrRecord[] {
  return records.filter((r) => {
    if (filters.years.size > 0 && !filters.years.has(String(r.pub_year))) return false;
    if (filters.nuclides.size > 0) {
      if (!r.nuclides || !r.nuclides.some((n) => filters.nuclides.has(n))) return false;
    }
    if (filters.reactions.size > 0) {
      if (!r.reactions || !r.reactions.some((rx) => filters.reactions.has(rx))) return false;
    }
    if (filters.journals.size > 0) {
      const j = extractJournal(r.reference);
      if (!j || !filters.journals.has(j)) return false;
    }
    if (filters.authors.size > 0 && !splitAuthors(r.authors).some((a) => filters.authors.has(a))) return false;
    if (filters.subjects.size > 0 && !(r.subjects ?? []).some((x) => filters.subjects.has(x))) return false;
    if (filters.topics.size > 0 && !(r.topics ?? []).some((x) => filters.topics.has(x))) return false;
    if (filters.types.size > 0 && !filters.types.has(typeOf(r))) return false;
    return true;
  });
}

function hasActiveFilters(f: Filters): boolean {
  return (
    f.years.size > 0 ||
    f.nuclides.size > 0 ||
    f.reactions.size > 0 ||
    f.journals.size > 0 ||
    f.authors.size > 0 ||
    f.subjects.size > 0 ||
    f.topics.size > 0 ||
    f.types.size > 0
  );
}

/* ------------------------------------------------------------------ */
/*  Interactive StatWidget (table with clickable rows)                  */
/* ------------------------------------------------------------------ */

function StatWidget({
  icon,
  title,
  entries,
  activeValues,
  onToggle,
  onClose,
  label,
}: {
  icon: React.ReactNode;
  title: string;
  entries: CountEntry[];
  activeValues: Set<string>;
  onToggle: (value: string) => void;
  onClose: () => void;
  /** optional display label for a value (values stay raw for filtering) */
  label?: (value: string) => string;
}) {
  if (entries.length === 0) return null;

  return (
    <div className={SHELL_CLS} style={{ height: WIDGET_H }}>
      <WidgetHeader
        icon={icon}
        title={title}
        onClose={onClose}
        right={activeValues.size > 0 ? <span className="text-[10px] text-[var(--paper-muted)]">{activeValues.size} selected</span> : undefined}
      />
      <div className="p-1 overflow-y-auto flex-1 min-h-0">
        {entries.map((e) => {
          const isActive = activeValues.has(e.value);
          return (
            <button
              key={e.value}
              onClick={() => onToggle(e.value)}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 transition-colors text-left ${
                isActive
                  ? "bg-[var(--paper-quiet)] font-medium text-[var(--paper-text)]"
                  : "text-[var(--paper-muted)] hover:bg-[var(--paper-quiet)] hover:text-[var(--paper-text)]"
              }`}
            >
              <span className="text-xs truncate mr-2">{label ? label(e.value) : e.value}</span>
              <span className="text-xs text-[var(--paper-muted)] tabular-nums shrink-0">
                {e.count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Result row                                                          */
/* ------------------------------------------------------------------ */

function ResultRow({
  record,
  mode,
  first,
  onClick,
  onDetail,
  onChat,
  onScoreInfo,
  onHover,
}: {
  record: NsrRecord;
  mode: SearchMode;
  first: boolean;
  onClick: () => void;
  onDetail: () => void;
  onChat: () => void;
  onScoreInfo: () => void;
  onHover?: () => void;
}) {
  const meta: string[] = [];
  if (record.pub_year) meta.push(String(record.pub_year));
  if (record.authors) {
    const truncated =
      record.authors.length > 80
        ? record.authors.slice(0, 80) + "…"
        : record.authors;
    meta.push(truncated);
  }
  if (record.reference) meta.push(record.reference);

  const iconBtn = "h-7 w-7 rounded-md flex items-center justify-center text-[var(--paper-muted)] hover:text-[var(--paper-text)] hover:bg-foreground/10 transition-colors";

  return (
    <div
      className={`group px-3 py-3 border-b border-[var(--paper-rule)] cursor-pointer hover:bg-[var(--paper-quiet)] transition-colors ${first ? "border-t" : ""}`}
      onClick={onClick}
      onMouseEnter={onHover}
    >
      <div className="flex items-start gap-2">
        <span className="text-sm font-medium text-[var(--paper-text)] leading-snug hover:underline flex-1 min-w-0">
          {record.key_number}
        </span>
        {mode !== "keyword" && record.similarity != null && (
          <span className="relative group/score shrink-0">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onScoreInfo(); }}
              className="inline-flex items-center rounded-full bg-foreground/10 px-1.5 py-0.5 text-[10px] font-medium text-[var(--paper-muted)] tabular-nums hover:bg-foreground/20 transition-colors"
              aria-label={mode === "semantic" ? "What is semantic score?" : "What is hybrid score?"}
            >
              {(record.similarity * 100).toFixed(0)}%
            </button>
            <span
              role="tooltip"
              className="pointer-events-none absolute right-0 top-full z-20 mt-1.5 hidden whitespace-nowrap rounded-md bg-black px-2 py-1 text-[10px] font-medium text-white shadow group-hover/score:block"
            >
              {mode === "semantic" ? "Semantic Score" : "Hybrid Score"}
            </span>
          </span>
        )}
      </div>
      <p className="text-sm text-[var(--paper-text)] mt-0.5 leading-snug line-clamp-2">
        {record.title}
      </p>
      {meta.length > 0 && (
        <p className="text-xs text-[var(--paper-muted)] mt-0.5 leading-relaxed truncate">
          {meta.join(" · ")}
        </p>
      )}
      <div className="mt-2 flex items-center justify-between gap-2">
        {record.doi ? (
          <a
            href={`https://doi.org/${record.doi}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1.5 text-xs text-[var(--paper-muted)] hover:text-[var(--paper-text)] transition-colors truncate min-w-0"
          >
            <ExternalLink className="h-4 w-4 shrink-0" />
            <span className="truncate">{record.doi}</span>
          </a>
        ) : <span />}
        {/* bottom-right actions: → (↗ on hover) opens the record; ✦ opens chat about it in the side panel */}
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDetail(); }}
            className={`${iconBtn} group/arrow`}
            aria-label="Open record"
            title="Open record"
          >
            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover/arrow:-rotate-45" />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onChat(); }}
            className={`${iconBtn} group/spark hover:text-yellow-500`}
            aria-label="Chat about this record"
            title="Chat about this record"
          >
            <Sparkles className="h-4 w-4 transition-transform duration-200 group-hover/spark:-rotate-12" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Search page                                                         */
/* ------------------------------------------------------------------ */

// One query cache for the page (the old app's App-level QueryClientProvider).
const queryClient = new QueryClient();

export function SearchPage() {
  return (
    <QueryClientProvider client={queryClient}>
      <Search />
    </QueryClientProvider>
  );
}

function Search() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const setSearchParams = (p: Record<string, string>) => router.replace(`/search?${new URLSearchParams(p)}`);
  const urlQuery = searchParams.get("q") ?? "";
  const [inputValue, setInputValue] = useState(urlQuery);
  const [mode, setMode] = useState<SearchMode>("hybrid");
  const [drawerIndex, setDrawerIndex] = useState(-1);
  const [detailRecord, setDetailRecord] = useState<NsrRecord | null>(null);
  const [scoreInfoOpen, setScoreInfoOpen] = useState(false);
  const { openAside } = useShellPanel();
  const prefetchRecord = usePrefetchRecord();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [hiddenWidgets, setHiddenWidgets] = useState<Set<string>>(new Set());

  // Reset filters and hidden widgets when query changes
  useEffect(() => {
    setInputValue(urlQuery);
    setFilters(EMPTY_FILTERS);
    setHiddenWidgets(new Set());
  }, [urlQuery]);

  const { data, isLoading } = useNsrSearch(urlQuery, mode);
  const records = useMemo(() => data?.records ?? [], [data]);

  // Apply client-side filters
  const filteredRecords = useMemo(
    () => (hasActiveFilters(filters) ? applyFilters(records, filters) : records),
    [records, filters],
  );

  // Stats computed from ALL results (not filtered) so widgets stay stable
  const yearEntries = useMemo(() => countYears(records), [records]);
  const nuclideEntries = useMemo(
    () => countField(records, (r) => r.nuclides),
    [records],
  );
  const reactionEntries = useMemo(
    () => countField(records, (r) => r.reactions),
    [records],
  );
  const journalEntries = useMemo(() => countJournals(records), [records]);
  const authorEntries = useMemo(() => countField(records, (r) => splitAuthors(r.authors)).slice(0, 40), [records]);
  const subjectEntries = useMemo(() => countField(records, (r) => r.subjects), [records]);
  // Topic and Type have a fixed, known vocabulary (7 and 7 values in the corpus) —
  // list all of them, absent ones at 0, so the widgets keep a stable shape.
  const topicEntries = useMemo(() => withAllValues(countField(records, (r) => r.topics), Object.keys(TOPIC_LABEL)), [records]);
  const typeEntries = useMemo(() => withAllValues(countField(records, (r) => [typeOf(r)]), Object.keys(TYPE_LABEL)), [records]);
  const citationEntries = useMemo(() => countCitations(records), [records]);

  const handleSubmit = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    setSearchParams({ q: trimmed });
  };


  // Toggle helpers
  const toggleSet = useCallback(
    (key: "years" | "nuclides" | "reactions" | "journals" | "authors" | "subjects" | "topics" | "types", value: string) => {
      setFilters((prev) => {
        const next = new Set(prev[key]);
        if (next.has(value)) next.delete(value);
        else next.add(value);
        return { ...prev, [key]: next };
      });
    },
    [],
  );

  const hideWidget = useCallback((name: string) => {
    setHiddenWidgets((prev) => new Set(prev).add(name));
  }, []);

  /* ---------- Widget order (draggable) ---------- */
  const DEFAULT_ORDER = useMemo(() => [
    "yearChart", "nuclideMap", "yearTable", "journals", "nuclides", "reactions",
    "subjects", "authors", "topics", "types", "cited",
    "cumulative", "topicsArea", "typesArea", "relevance", "topicPie", "citationScatter",
  ], []);
  const [widgetOrder, setWidgetOrder] = useState<string[]>(DEFAULT_ORDER);
  const dragId = useRef<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const moveWidget = useCallback((from: string | null, to: string) => {
    if (!from || from === to) return;
    setWidgetOrder((prev) => {
      const next = prev.filter((x) => x !== from);
      const i = next.indexOf(to);
      next.splice(i < 0 ? next.length : i, 0, from);
      return next;
    });
  }, []);

  const hasQuery = urlQuery.length >= 3;

  const openByKey = (key: string) => {
    const i = filteredRecords.findIndex((r) => r.key_number === key);
    if (i >= 0) setDrawerIndex(i);
  };
  const widgets: Record<string, { full?: boolean; node: React.ReactNode }> = {
    yearChart: { full: true, node: <YearBarChart entries={yearEntries} activeYears={filters.years} onToggle={(v) => toggleSet("years", v)} onClose={() => hideWidget("yearChart")} /> },
    nuclideMap: { full: true, node: <NuclideMap entries={nuclideEntries} activeNuclides={filters.nuclides} onToggle={(v) => toggleSet("nuclides", v)} onClose={() => hideWidget("nuclideMap")} /> },
    yearTable: { node: <StatWidget icon={<Calendar className="h-3.5 w-3.5 text-[var(--paper-muted)]" />} title="Year" entries={yearEntries} activeValues={filters.years} onToggle={(v) => toggleSet("years", v)} onClose={() => hideWidget("yearTable")} /> },
    journals: { node: <StatWidget icon={<BookOpen className="h-3.5 w-3.5 text-[var(--paper-muted)]" />} title="Journal" entries={journalEntries} activeValues={filters.journals} onToggle={(v) => toggleSet("journals", v)} onClose={() => hideWidget("journals")} /> },
    nuclides: { node: <StatWidget icon={<Atom className="h-3.5 w-3.5 text-[var(--paper-muted)]" />} title="Nuclides" entries={nuclideEntries} activeValues={filters.nuclides} onToggle={(v) => toggleSet("nuclides", v)} onClose={() => hideWidget("nuclides")} /> },
    reactions: { node: <StatWidget icon={<Zap className="h-3.5 w-3.5 text-[var(--paper-muted)]" />} title="Reactions" entries={reactionEntries} activeValues={filters.reactions} onToggle={(v) => toggleSet("reactions", v)} onClose={() => hideWidget("reactions")} /> },
    subjects: { node: <StatWidget icon={<Tag className="h-3.5 w-3.5 text-[var(--paper-muted)]" />} title="Measured" entries={subjectEntries} activeValues={filters.subjects} onToggle={(v) => toggleSet("subjects", v)} onClose={() => hideWidget("subjects")} /> },
    authors: { node: <StatWidget icon={<Users className="h-3.5 w-3.5 text-[var(--paper-muted)]" />} title="Authors" entries={authorEntries} activeValues={filters.authors} onToggle={(v) => toggleSet("authors", v)} onClose={() => hideWidget("authors")} /> },
    topics: { node: <StatWidget icon={<Layers className="h-3.5 w-3.5 text-[var(--paper-muted)]" />} title="Topic" entries={topicEntries} activeValues={filters.topics} onToggle={(v) => toggleSet("topics", v)} onClose={() => hideWidget("topics")} label={labelFor(TOPIC_LABEL)} /> },
    types: { node: <StatWidget icon={<FileText className="h-3.5 w-3.5 text-[var(--paper-muted)]" />} title="Type" entries={typeEntries} activeValues={filters.types} onToggle={(v) => toggleSet("types", v)} onClose={() => hideWidget("types")} label={labelFor(TYPE_LABEL)} /> },
    cited: { node: <StatWidget icon={<Quote className="h-3.5 w-3.5 text-[var(--paper-muted)]" />} title="Most cited" entries={citationEntries} activeValues={EMPTY_SET} onToggle={openByKey} onClose={() => hideWidget("cited")} /> },
    cumulative: { full: true, node: <CumulativeChart entries={yearEntries} onClose={() => hideWidget("cumulative")} /> },
    topicsArea: { full: true, node: <DecadeAreaChart icon={<Layers className="h-3.5 w-3.5 text-[var(--paper-muted)]" />} title="Topics over time" records={records} getter={(r) => r.topics} label={labelFor(TOPIC_LABEL)} onClose={() => hideWidget("topicsArea")} /> },
    typesArea: { full: true, node: <DecadeAreaChart icon={<FileText className="h-3.5 w-3.5 text-[var(--paper-muted)]" />} title="Types over time" records={records} getter={(r) => [typeOf(r)]} label={labelFor(TYPE_LABEL)} onClose={() => hideWidget("typesArea")} /> },
    relevance: { full: true, node: <RelevanceChart records={records} onClose={() => hideWidget("relevance")} /> },
    topicPie: { node: <DoughnutChart icon={<PieIcon className="h-3.5 w-3.5 text-[var(--paper-muted)]" />} title="Topic" entries={topicEntries} activeValues={filters.topics} onToggle={(v) => toggleSet("topics", v)} label={labelFor(TOPIC_LABEL)} onClose={() => hideWidget("topicPie")} /> },
    citationScatter: { node: <CitationScatter records={records} onOpen={openByKey} onClose={() => hideWidget("citationScatter")} /> },
  };

  /* ---------- Empty state ---------- */
  if (!hasQuery) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-4">
        <div className="w-full max-w-[720px]">
          <SearchBox
            value={inputValue}
            onChange={setInputValue}
            onSubmit={handleSubmit}
            mode={mode}
            onModeChange={setMode}
          />
        </div>
      </div>
    );
  }

  /* ---------- Results state ---------- */
  const hasWidgets =
    yearEntries.length > 0 ||
    nuclideEntries.length > 0 ||
    reactionEntries.length > 0 ||
    journalEntries.length > 0 ||
    authorEntries.length > 0 ||
    subjectEntries.length > 0;

  const drawerRecords = filteredRecords;

  return (
    <div className="h-full px-4 pt-4 pb-6 overflow-x-hidden">
      <div className="mx-auto flex h-full max-w-[1200px] flex-col lg:flex-row gap-6">
        {/* Left column — search box + scrollable results */}
        <div className="flex flex-1 min-w-0 flex-col">
          {/* Search box (stays put) */}
          <div className="shrink-0 max-w-[720px]">
            <SearchBox
              value={inputValue}
              onChange={setInputValue}
              onSubmit={handleSubmit}
              mode={mode}
              onModeChange={setMode}
              isLoading={isLoading}
            />

            {/* Count header — one line: count on the left, "Clear filters" right-aligned when filtering */}
            <div className="mt-3 flex items-center justify-between gap-3">
              {isLoading ? (
                <div className="flex items-center gap-2 py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-[var(--paper-muted)]" />
                  <span className="text-sm text-[var(--paper-muted)]">Searching…</span>
                </div>
              ) : filteredRecords.length === 0 ? (
                <p className="text-sm text-[var(--paper-muted)] py-2">
                  {hasActiveFilters(filters)
                    ? `No results match the current filters (${records.length} before filtering)`
                    : <>No results found for &ldquo;{urlQuery}&rdquo;</>}
                </p>
              ) : (
                <p className="text-sm text-[var(--paper-muted)]">
                  {hasActiveFilters(filters)
                    ? `About ${filteredRecords.length} of ${records.length} results`
                    : `About ${data?.count ?? records.length} results`}
                </p>
              )}
              {hasActiveFilters(filters) && !isLoading && (
                <button
                  onClick={() => setFilters(EMPTY_FILTERS)}
                  className="text-sm text-nuclear hover:underline shrink-0"
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>

          {/* Scrollable results list */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 mt-2">
            {!isLoading && filteredRecords.length > 0 && (
              <div key={urlQuery} className="pr-1 animate-in fade-in slide-in-from-bottom-2 duration-500">
                {filteredRecords.map((record, i) => (
                  <ResultRow
                    key={record.id}
                    record={record}
                    mode={mode}
                    first={i === 0}
                    onClick={() => setDrawerIndex(i)}
                    onDetail={() => setDetailRecord(record)}
                    onScoreInfo={() => setScoreInfoOpen(true)}
                    onHover={() => prefetchRecord(record.id)}
                    onChat={() => openAside({
                      key: `chat:${record.key_number}`,
                      title: `Chat ${record.key_number}`,
                      body: <PanelChat key={record.key_number} record={record} />,
                    })}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right column — widgets: drag a card to reorder, ✕ to hide */}
        {!isLoading && hasWidgets && (
          <div key={`w-${urlQuery}`} className="w-full lg:w-auto lg:min-w-[280px] lg:max-w-[620px] shrink-0 overflow-y-auto animate-in fade-in slide-in-from-right-2 duration-500">
            <div className="flex flex-wrap gap-4">
              {widgetOrder.map((id) => {
                const w = widgets[id];
                if (!w || hiddenWidgets.has(id)) return null;
                return (
                  <div
                    key={id}
                    draggable
                    onDragStart={(e) => { dragId.current = id; e.dataTransfer.effectAllowed = "move"; }}
                    onDragOver={(e) => { e.preventDefault(); if (overId !== id) setOverId(id); }}
                    onDragLeave={() => setOverId((o) => (o === id ? null : o))}
                    onDrop={(e) => { e.preventDefault(); moveWidget(dragId.current, id); dragId.current = null; setOverId(null); }}
                    onDragEnd={() => { dragId.current = null; setOverId(null); }}
                    className={`${w.full ? "w-full min-w-[222px]" : "flex-1 min-w-[222px] max-w-[300px]"} rounded-lg transition-shadow ${overId === id ? "ring-2 ring-nuclear/60" : ""}`}
                  >
                    {w.node}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* What the % badge means */}
      <ScoreInfoDialog open={scoreInfoOpen} onOpenChange={setScoreInfoOpen} mode={mode} />

      {/* Record detail dialog (stand-in for a /record page) */}
      <RecordDialog record={detailRecord} open={detailRecord !== null} onOpenChange={(o) => !o && setDetailRecord(null)} />

      {/* Record drawer */}
      <RecordDrawer
        records={drawerRecords}
        currentIndex={drawerIndex}
        open={drawerIndex >= 0}
        onOpenChange={(open) => {
          if (!open) setDrawerIndex(-1);
        }}
        onNavigate={setDrawerIndex}
      />
    </div>
  );
}
