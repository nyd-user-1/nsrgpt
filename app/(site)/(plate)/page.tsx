import { VizBoxMenu } from "./viz/box-menu";
import { ExpandBox } from "./viz/expand-box";
import { PaneButton } from "./viz/pane-button";
import { BoxMarks } from "./viz/box-marks";
import { BoxIcon } from "./viz/box-icon";
import { BOX_CLASS, SANS, SERIF } from "./viz/box-style";
import { PlateKeys } from "./viz/plate-keys";
import { PLATE_BOXES, PLATE_H, type PlateBox } from "@/lib/plate";
import { PlateArrange } from "./viz/plate-arrange";

export const metadata = {
  title: "NSRgpt",
  description: "Charts and tables over the Nuclear Science References corpus and the NNDC databases: ENSDF, XUNDL, EXFOR and AME2020.",
};

/** The root page (NSRgpt, 2026-11-05): the masthead, the contents plate and the byline. One box per chart, table and
 *  sidebar page (lib/plate.ts), A to Z; the browser's marks and dragged order arrange them (plate-arrange.tsx). A press
 *  on a box grows it into its page. Fully static. */
export default function HomePage() {

  // The masthead and the byline are the (plate) layout's; the page is the plate.
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PlateKeys />
      <div className="relative mt-[72px] flex min-h-0 flex-1 flex-col">
        {/* The plate as / has it (HomeContents): a fixed height, an even grid from its own measured size. */}
        <div className={`isolate flex flex-col overflow-hidden rounded-2xl border border-[var(--paper-rule)] bg-[var(--paper)] ${PLATE_H}`}>
          <PlateArrange hrefs={PLATE_BOXES.map((b) => b.href)}>
            {PLATE_BOXES.map((box) => (
              <VizBox key={box.href} box={box} />
            ))}
          </PlateArrange>
        </div>
      </div>
    </div>
  );
}

/** A contents-plate cell at rest: the name, a chart's type and axes or a page's description, and its icon. */
function VizBox({ box }: { box: PlateBox }) {
  // Every box the same shape (brief 35, Part 4, 2026-11-09): the grid cell's height, the same padding, its content
  // clipped. The description takes what the title and the foot leave and clips; the foot (the icon, the pin when pinned,
  // pane button) always shows.
  const body = (
    <>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-start justify-between gap-3">
          {/* Every box's title the same shape (Brendan, 2026-11-06): two lines, always, a longer name ending in "…";
              hovering shows it whole. A chart's type sits beneath. */}
          <div className="min-w-0">
            <h3 title={box.name} className="m-0 line-clamp-2 min-h-[2.2em] text-[20px] leading-[1.1]" style={{ ...SERIF, color: "var(--paper-text)" }}>
              {box.name}
            </h3>
            {box.type && (
              <p className="m-0 mt-1.5 text-[11px] text-[var(--paper-faint)]" style={SANS}>
                {box.type}
              </p>
            )}
          </div>
          <span className="flex h-[22px] shrink-0 items-center">
            <VizBoxMenu title={box.type ?? box.name} anchor={box.anchor} href={box.href} />
          </span>
        </div>
        {/* The description: a chart's axes, one a line (Brendan, 2026-11-06), or what a page is for. */}
        <div className="mt-2 min-h-0 flex-1 overflow-hidden text-[12px] leading-[1.5] text-[var(--paper-muted)]" style={SANS}>
          {box.lines?.map((l) => (
            <p key={l} className="m-0 truncate" title={l}>{l}</p>
          ))}
          {box.body && <p className="m-0">{box.body}</p>}
        </div>
      </div>
      <div className="relative mt-3 flex min-w-0 shrink-0 items-end justify-between gap-3">
        <span className="-mb-1 flex h-7 items-center">
          <BoxIcon href={box.href} type={box.type} />
        </span>
        <span className="flex shrink-0 items-end gap-0.5">
          <BoxMarks href={box.href} title={box.name} />
          <PaneButton href={box.href} title={box.type ?? box.name} />
        </span>
      </div>
    </>
  );
  // Every box grows into its page (Brendan, 2026-11-04).
  return (
    <ExpandBox href={box.href} className={BOX_CLASS}>
      {body}
    </ExpandBox>
  );
}
