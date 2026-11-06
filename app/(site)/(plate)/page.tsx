import { RevealFx } from "@/components/RevealFx";
import { VizBoxMenu } from "./viz/box-menu";
import { ExpandBox } from "./viz/expand-box";
import { VIZ_CHARTS, type VizChart } from "@/lib/viz-charts";
import { PLATE_H } from "@/lib/plate";
import { PlateGrid } from "@/app/PlateGrid";

export const metadata = {
  title: "NSRgpt",
  description: "Charts and tables over the Nuclear Science References corpus and the NNDC databases: ENSDF, XUNDL, EXFOR and AME2020.",
};

const SERIF = { fontFamily: "var(--font-display), Georgia, serif" } as const;
const SANS = { fontFamily: 'var(--font-sans, "DM Sans"), sans-serif' } as const;
const MONO = { fontFamily: "var(--font-mono), ui-monospace, monospace" } as const;



/** The root page (NSRgpt, 2026-11-05): the masthead, the contents plate and the byline, with one box
 *  per chart page in lib/viz-charts.ts order. A press on a box grows it into its chart. Fully static. */
export default function HomePage() {

  // The masthead and the byline are the (plate) layout's; the page is the plate.
  return (
    <RevealFx className="flex min-h-0 flex-1 flex-col" delay={0.22} translateY={5}>
      <div className="relative mt-[72px] flex min-h-0 flex-1 flex-col">
        {/* The plate as / has it (HomeContents): a fixed height, an even grid from its own measured size. */}
        <div className={`isolate flex flex-col overflow-hidden rounded-2xl border border-[var(--paper-rule)] bg-[var(--paper)] ${PLATE_H}`}>
          <PlateGrid className="-m-px min-h-0 flex-1" minW={220}>
            {VIZ_CHARTS.map((chart, i) => (
              <VizBox key={chart.href} chart={chart} index={i} />
            ))}
          </PlateGrid>
        </div>
      </div>
    </RevealFx>
  );
}

/** A contents-plate cell at rest: the chart's type, its variables, and its number. */
function VizBox({ chart, index }: { chart: VizChart; index: number }) {
  const body = (
    <>
      <div className="flex flex-1 flex-col">
        <div className="flex items-start justify-between gap-3">
          <h3 className="m-0 line-clamp-4 text-[20px] leading-[1.1]" style={{ ...SERIF, color: "var(--paper-text)" }}>
            {chart.title}
          </h3>
          <span className="flex h-[22px] shrink-0 items-center">
            <VizBoxMenu title={chart.title} anchor={chart.href.replace(/^\//, "").replace(/[^a-z0-9]+/gi, "-").toLowerCase()} href={chart.href} />
          </span>
        </div>
        <p className="mt-2 flex-1 text-[12px] leading-[1.5] text-[var(--paper-muted)]" style={SANS}>
          {chart.body}
        </p>
      </div>
      <div className="relative mt-4 flex items-end justify-end gap-3">
        <span className="shrink-0 text-[10px] tabular-nums tracking-[0.2em] text-[var(--paper-faint)]" style={MONO}>
          {String(index + 1).padStart(2, "0")}
        </span>
      </div>
    </>
  );
  const cls = "flex min-h-[210px] flex-col border-b border-r border-[var(--paper-rule)] px-5 py-5 transition-colors hover:bg-[var(--paper-quiet)] [-webkit-tap-highlight-color:transparent]";
  // Every chart box grows into its page (Brendan, 2026-11-04).
  return (
    <ExpandBox href={chart.href} className={cls}>
      {body}
    </ExpandBox>
  );
}
