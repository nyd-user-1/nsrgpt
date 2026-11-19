"use client";

import * as React from "react";
import dynamic from "next/dynamic";

// The charts an answer draws (Brendan, 2026-11-19), in two fenced blocks the model writes (app/api/chat/route.ts
// CHART_GUIDE):
// - ```nsr-video: one of trinity's Remotion chart templates filled with the answer's numbers ({ templateId, title, props },
//   video/specs.ts), played live in the page by Remotion's Player (components/video/TemplatePlayer.tsx), as trinity's
//   chat draws its ```pax-video blocks.
// - ```nsr-chart: an ECharts option as JSON, drawn on a canvas in the page's light or dark colours.
// While the answer streams, a block's JSON is still arriving: it shows a quiet line until it parses.

/** Whether the answer holding a block is still streaming (ChatMarkdown provides it). */
export const StreamingContext = React.createContext(false);

const TemplatePlayer = dynamic(() => import("@/components/video/TemplatePlayer").then((m) => m.TemplatePlayer), {
  ssr: false,
  loading: () => <Quiet>Loading the chart…</Quiet>,
});

function Quiet({ children }: { children: React.ReactNode }) {
  return <div className="my-3 rounded-xl border border-[var(--paper-rule)] bg-[var(--paper-quiet)] px-4 py-3 text-sm text-[var(--paper-muted)]">{children}</div>;
}

function parse(text: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(text);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** A ```nsr-video block: a filled Remotion chart template. */
export function VideoChartBlock({ text }: { text: string }) {
  const streaming = React.useContext(StreamingContext);
  const block = React.useMemo(() => parse(text), [text]);
  if (!block || typeof block.templateId !== "string") return <Quiet>{streaming ? "Drawing the chart…" : "This chart could not be drawn."}</Quiet>;
  return (
    <figure className="my-4">
      <TemplatePlayer templateId={block.templateId} props={block.props} />
      {typeof block.title === "string" && <figcaption className="mt-2 text-center text-xs text-[var(--paper-muted)]">{block.title}</figcaption>}
    </figure>
  );
}

/** The page's ink, muted ink and rule, read from <html> so the chart follows light and dark. */
function inks() {
  const s = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => s.getPropertyValue(name).trim() || fallback;
  return { ink: v("--paper-text", "#16181d"), muted: v("--paper-muted", "#64748b"), rule: v("--paper-rule-soft", "rgba(0,0,0,0.08)") };
}

type Axis = Record<string, unknown>;
/** Each axis gets the page's colours where the option leaves them unset. */
function dressAxes(axes: unknown, c: ReturnType<typeof inks>) {
  const one = (a: Axis) => ({
    ...a,
    axisLine: { ...(a.axisLine as object), lineStyle: { color: c.muted, ...((a.axisLine as Axis | undefined)?.lineStyle as object) } },
    axisLabel: { color: c.muted, ...(a.axisLabel as object) },
    nameTextStyle: { color: c.muted, ...(a.nameTextStyle as object) },
    splitLine: { ...(a.splitLine as object), lineStyle: { color: c.rule, ...((a.splitLine as Axis | undefined)?.lineStyle as object) } },
  });
  if (Array.isArray(axes)) return axes.map((a) => one(a as Axis));
  return axes && typeof axes === "object" ? one(axes as Axis) : axes;
}

/** A ```nsr-chart block: an ECharts option, as JSON, with an optional "height" in pixels beside it. */
export function EChartBlock({ text }: { text: string }) {
  const streaming = React.useContext(StreamingContext);
  const option = React.useMemo(() => parse(text), [text]);
  const box = React.useRef<HTMLDivElement>(null);
  const [failed, setFailed] = React.useState(false);
  const height = typeof option?.height === "number" ? Math.min(Math.max(option.height, 200), 720) : 360;
  React.useEffect(() => {
    if (!option || !box.current) return;
    let chart: { setOption: (o: object, notMerge?: boolean) => void; resize: () => void; dispose: () => void } | null = null;
    let live = true;
    const el = box.current;
    const draw = () => {
      if (!chart) return;
      const c = inks();
      const rest = { ...option };
      delete rest.height;
      const title = rest.title as Axis | undefined;
      const legend = rest.legend as Axis | undefined;
      chart.setOption(
        {
          ...rest,
          backgroundColor: "transparent",
          textStyle: { color: c.ink, fontFamily: "inherit", ...(rest.textStyle as object) },
          ...(title && !Array.isArray(title) ? { title: { ...title, textStyle: { color: c.ink, fontSize: 14, ...(title.textStyle as object) } } } : {}),
          ...(legend && !Array.isArray(legend) ? { legend: { ...legend, textStyle: { color: c.muted, ...(legend.textStyle as object) } } } : {}),
          ...(rest.xAxis ? { xAxis: dressAxes(rest.xAxis, c) } : {}),
          ...(rest.yAxis ? { yAxis: dressAxes(rest.yAxis, c) } : {}),
        },
        true,
      );
    };
    import("echarts")
      .then((echarts) => {
        if (!live) return;
        try {
          chart = echarts.init(el, undefined, { renderer: "canvas" });
          draw();
        } catch {
          setFailed(true);
        }
      })
      .catch(() => setFailed(true));
    const resize = new ResizeObserver(() => chart?.resize());
    resize.observe(el);
    // Light and dark: <html>'s class flips, and the chart redraws in the other colours.
    const theme = new MutationObserver(draw);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => {
      live = false;
      resize.disconnect();
      theme.disconnect();
      chart?.dispose();
    };
  }, [option]);
  if (!option || failed) return <Quiet>{streaming && !failed ? "Drawing the chart…" : "This chart could not be drawn."}</Quiet>;
  return <div ref={box} className="my-4 w-full" style={{ height }} />;
}
