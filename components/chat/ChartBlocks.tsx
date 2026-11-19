"use client";

import * as React from "react";
import dynamic from "next/dynamic";

// The charts an answer draws (Brendan, 2026-11-19; brief 78), in two fenced blocks the model writes (app/api/chat/route.ts
// CHART_GUIDE):
// - ```nsr-video: one of NSRgpt's Remotion chart templates (video/specs.ts), played in by Remotion's Player
//   (components/video/TemplatePlayer.tsx), as trinity's chat draws its ```pax-video blocks. A template filled from the API
//   names its data; the rows are fetched here before the Player mounts.
// - ```nsr-chart: the fallback for a shape no template covers, an ECharts option as JSON in the page's light or dark.
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

/** The page's light or dark, live: the templates draw in it (video/theme.ts NSR). */
function usePageTheme(): "light" | "dark" {
  const read = () => (typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "dark" : "light");
  const [theme, setTheme] = React.useState<"light" | "dark">("light");
  React.useEffect(() => {
    setTheme(read());
    const m = new MutationObserver(() => setTheme(read()));
    m.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => m.disconnect();
  }, []);
  return theme;
}

/** A ```nsr-video block: one of NSRgpt's Remotion chart templates (video/specs.ts). A template the page fills names its
 *  data (video/queries.ts): the rows are fetched from the cached API before the Player mounts (components/video/
 *  loaders.ts). Any other carries its props, filled from the conversation's tool rows. */
export function VideoChartBlock({ text }: { text: string }) {
  const streaming = React.useContext(StreamingContext);
  const block = React.useMemo(() => parse(text), [text]);
  const theme = usePageTheme();
  const [loaded, setLoaded] = React.useState<{ key: string; props?: Record<string, unknown>; error?: string } | null>(null);
  const id = typeof block?.templateId === "string" ? block.templateId : null;
  const wantsData = !!id && block?.data !== undefined;
  React.useEffect(() => {
    if (!id || !wantsData || streaming) return;
    let live = true;
    const key = text;
    (async () => {
      const { QUERIES, isQueryId } = await import("@/video/queries");
      if (!isQueryId(id)) throw new Error(`${id} does not take data.`);
      const q = QUERIES[id].safeParse(block!.data);
      if (!q.success) throw new Error(q.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
      const { loadProps } = await import("@/components/video/loaders");
      return loadProps(id, q.data);
    })()
      .then((props) => live && setLoaded({ key, props: typeof block?.title === "string" ? { ...props, title: block.title } : props }))
      .catch((e: Error) => live && setLoaded({ key, error: e.message }));
    return () => {
      live = false;
    };
    // The block's text names it; a new text is a new block.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, streaming]);
  if (!block || !id) return <Quiet>{streaming ? "Drawing the chart…" : "This chart could not be drawn."}</Quiet>;
  let props: unknown = block.props;
  if (wantsData) {
    if (!loaded || loaded.key !== text) return <Quiet>{streaming ? "Drawing the chart…" : "Fetching the data for the chart…"}</Quiet>;
    if (loaded.error) return <Quiet>This chart could not be drawn: {loaded.error}</Quiet>;
    props = loaded.props;
  }
  return (
    <figure className="my-4">
      <TemplatePlayer templateId={id} props={props && typeof props === "object" ? { ...(props as object), theme } : props} />
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
