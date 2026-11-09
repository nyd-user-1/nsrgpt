import { VizBoxMenu } from "./viz/box-menu";
import { ExpandBox } from "./viz/expand-box";
import { PaneButton } from "./viz/pane-button";
import { PlateKeys } from "./viz/plate-keys";
import { PLATE_TABLES, VIZ_CHARTS, type VizChart } from "@/lib/viz-charts";
import { HEADER_TITLES } from "@/lib/header-titles";
import { PLATE_H } from "@/lib/plate";
import { PlateGrid } from "@/app/PlateGrid";

export const metadata = {
  title: "NSRgpt",
  description: "Charts and tables over the Nuclear Science References corpus and the NNDC databases: ENSDF, XUNDL, EXFOR and AME2020.",
};

// The boxes A to Z by the name each one shows, left to right and top to bottom across the frames (Brendan, 2026-11-07).
// The charts, and the tables that have a box of their own (brief 35: the nuclides table). A box's own name, when it has
// one, leads (brief 36: Nuclides opens /viz/chart).
type PlateBox = VizChart;
const nameOf = (c: PlateBox) => c.name ?? HEADER_TITLES[c.href] ?? c.title;
const BY_NAME = [...VIZ_CHARTS, ...PLATE_TABLES].sort((a, b) => nameOf(a).localeCompare(nameOf(b), "en", { sensitivity: "base", numeric: true }));

const SERIF = { fontFamily: "var(--font-display), Georgia, serif" } as const;
const SANS = { fontFamily: 'var(--font-sans, "DM Sans"), sans-serif' } as const;
const MONO = { fontFamily: "var(--font-mono), ui-monospace, monospace" } as const;



/** The root page (NSRgpt, 2026-11-05): the masthead, the contents plate and the byline, with one box
 *  per chart page in lib/viz-charts.ts order. A press on a box grows it into its chart. Fully static. */
export default function HomePage() {

  // The masthead and the byline are the (plate) layout's; the page is the plate.
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PlateKeys />
      <div className="relative mt-[72px] flex min-h-0 flex-1 flex-col">
        {/* The plate as / has it (HomeContents): a fixed height, an even grid from its own measured size. */}
        <div className={`isolate flex flex-col overflow-hidden rounded-2xl border border-[var(--paper-rule)] bg-[var(--paper)] ${PLATE_H}`}>
          <PlateGrid className="-m-px min-h-0 flex-1" minW={220} maxCols={4}>
            {BY_NAME.map((chart, i) => (
              <VizBox key={chart.href} chart={chart} index={i} />
            ))}
          </PlateGrid>
        </div>
      </div>
    </div>
  );
}

/** A contents-plate cell at rest: the chart's type, its variables, and its number. */
function VizBox({ chart, index }: { chart: PlateBox; index: number }) {
  // The source sits after the box's number, "02 • ENSDF"; the axes are the description (Brendan, 2026-11-06).
  const source = chart.lines.find((l) => l.startsWith("Source: "))?.slice("Source: ".length);
  const axes = chart.lines.filter((l) => !l.startsWith("Source: "));
  const name = nameOf(chart);
  // Every box the same shape (brief 35, Part 4, 2026-11-09): the grid cell's height, the same padding, its content
  // clipped. The description takes what the title and the foot leave and clips; the foot (number, source, pane button)
  // always shows, the source cut with an ellipsis when long. Before, a box kept a 210 px floor taller than a short
  // plate's cells, so the plate cut off its foot, and a long source pushed the pane button into the next box.
  const body = (
    <>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-start justify-between gap-3">
          {/* Every box's title the same shape (Brendan, 2026-11-06): two lines, always, a longer name ending in "…";
              hovering shows it whole. The chart type sits beneath. */}
          <div className="min-w-0">
            <h3 title={name} className="m-0 line-clamp-2 min-h-[2.2em] text-[20px] leading-[1.1]" style={{ ...SERIF, color: "var(--paper-text)" }}>
              {name}
            </h3>
            <p className="m-0 mt-1.5 text-[11px] text-[var(--paper-faint)]" style={SANS}>
              {chart.title}
            </p>
          </div>
          <span className="flex h-[22px] shrink-0 items-center">
            <VizBoxMenu title={chart.title} anchor={chart.href.replace(/^\//, "").replace(/[^a-z0-9]+/gi, "-").toLowerCase()} href={chart.href} />
          </span>
        </div>
        {/* The description: the axes, one a line (Brendan, 2026-11-06). */}
        <div className="mt-2 min-h-0 flex-1 overflow-hidden text-[12px] leading-[1.5] text-[var(--paper-muted)]" style={SANS}>
          {axes.map((l) => (
            <p key={l} className="m-0 truncate" title={l}>{l}</p>
          ))}
        </div>
      </div>
      <div className="relative mt-3 flex min-w-0 shrink-0 items-end justify-between gap-3">
        <span className="min-w-0 truncate text-[10px] tabular-nums tracking-[0.2em] text-[var(--paper-faint)]" style={MONO} title={source}>
          {String(index + 1).padStart(2, "0")}
          {source && ` • ${source}`}
        </span>
        <PaneButton href={chart.href} title={chart.title} />
      </div>
    </>
  );
  const cls = "flex h-full min-h-0 min-w-0 flex-col overflow-hidden border-b border-r border-[var(--paper-rule)] px-5 py-5 transition-colors hover:bg-[var(--paper-quiet)] [-webkit-tap-highlight-color:transparent]";
  // Every chart box grows into its page (Brendan, 2026-11-04).
  return (
    <ExpandBox href={chart.href} className={cls}>
      {body}
    </ExpandBox>
  );
}
