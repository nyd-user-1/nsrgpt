// PAX's tokens for video. Every template draws with these and nothing else, so
// motion, type and colour read the same in every clip. Self-contained on
// purpose (no app imports): Remotion Studio and the renderer bundle src/video
// with their own webpack, where neither Tailwind nor the app's "@/" paths exist.
// The values are copied from the app; keep them in step with the sources named.

/** src/app/pax2.css, and the slate the app's text and rules use. */
export const COLOR = {
  /** --pax2-blue: the brand. */
  blue: "#1e3a8a",
  /** --pax2-light-blue: a positive lift's bar, links, the active word. */
  lightBlue: "#2563eb",
  /** --pax2-lavender: the light blue fill under a picked item. */
  lavender: "#dbeafe",
  /** --pax2-mist: the rail's ground. */
  mist: "#f5f7fb",
  /** --pax2-red: a negative lift. */
  red: "#dc2626",
  ink: "#0f172a",
  secondary: "#475569",
  muted: "#64748b",
  faint: "#94a3b8",
  rule: "#e2e8f0",
  white: "#ffffff",
} as const

/** The Lift table's bars (src/app/lift/lift-marks.tsx): blue up, red down, a
 *  lift inside its margin grey. Each bar fades from 45% of its colour to full. */
export const LIFT = {
  positive: COLOR.lightBlue,
  negative: COLOR.red,
  quiet: COLOR.faint,
  /** The pale end of a bar's gradient, as a fraction of its colour. */
  fadeFrom: 0.45,
} as const

/** The Emotional Response bar's segments, in Lift's order (src/app/lift/lift-marks.tsx EMOTIONS). */
export const EMOTIONS = [
  { name: "Hopeful", color: "#2a78d6" },
  { name: "Proud", color: "#eb6834" },
  { name: "Happy", color: "#1baf7a" },
  { name: "Worried", color: "#eda100" },
  { name: "Irritated", color: "#e87ba4" },
  { name: "Angry", color: "#008300" },
  { name: "No strong feeling", color: "#c3c2b7" },
] as const

/** The Yes on 3 kit as the campaign's own Wave 2 cards draw it, measured from the frames in Report 2
 *  (MA message testing, page 18) and the tested videos on the clips CDN: a royal blue panel and row
 *  type, an orange for the checks and the footer bar. src/lib/footage.ts's Yes on 3 brand carries the
 *  same two values; keep them in step. */
export const YES_ON_3 = {
  blue: "#003486",
  orange: "#e66026",
} as const

/** Answer bands on a chart, in order: the brand's blues, then the Lift palette's warm hues. */
export const BANDS = ["#1e3a8a", "#2563eb", "#60a5fa", "#eb6834", "#eda100", "#c3c2b7"] as const

/** The app's face, Plus Jakarta Sans (src/app/layout.tsx). Root.tsx loads it
 *  for Studio and the renderer; inside the app the page already has it. */
export const FONT = {
  // In the app next/font names the face by a hashed family, which --font-sans
  // carries; each var keeps a fallback, since a var with none voids the whole
  // list wherever it is undefined (Studio, the renderer).
  family: "'Plus Jakarta Sans', var(--font-sans, system-ui), sans-serif",
  mono: "'Geist Mono', var(--font-mono, ui-monospace), monospace",
} as const

/** Type sizes in pixels, for a 1080-wide frame; a 1920-wide frame uses the same. */
export const TYPE = {
  hero: 96,
  title: 64,
  heading: 48,
  body: 36,
  label: 28,
  caption: 24,
  small: 20,
} as const

/** Frame geometry shared by every template. */
export const LAYOUT = {
  /** The safe margin on every side. */
  safe: 80,
  radius: 28,
  gap: 24,
} as const

export const SIZES = {
  vertical: { width: 1080, height: 1920 },
  wide: { width: 1920, height: 1080 },
} as const

export const FPS = 30

/** The one spring every template moves with (pass to remotion's spring({ config })). */
export const SPRING = { damping: 200, stiffness: 120, mass: 0.6 } as const

/** Timing shared by every template, in seconds. */
export const MOTION = {
  /** Between one item's entrance and the next. */
  stagger: 0.6,
  /** A fade's length. */
  fade: 0.4,
  /** How long a bar takes to draw. */
  draw: 0.8,
} as const

/** Seconds to frames at the house rate. */
export const sec = (s: number, fps: number = FPS) => Math.round(s * fps)

// ---- NSRgpt (Brendan, 2026-11-19): the charts' own palette, light and dark, from NSRgpt's chart code
// (components/viz/use-echart.ts: slate axis ink, navy series; dark: lighter ink, brighter navy) on the app's paper.
// A template takes `theme` from the page and draws in these.

export type Theme = "light" | "dark"

export const NSR = {
  light: {
    ground: "#ffffff",
    ink: "#16181d",
    secondary: "#334155",
    muted: "#64748b",
    faint: "#94a3b8",
    rule: "#e2e8f0",
    card: "#f8fafc",
    series: ["#1e3a8a", "#2563eb", "#0891b2", "#eb6834", "#eda100", "#7c3aed"],
    accent: "#2563eb",
    measured: "#dc2626",
  },
  dark: {
    ground: "#15120d",
    ink: "#f0e9d8",
    secondary: "#cbd5e1",
    muted: "#94a3b8",
    faint: "#64748b",
    rule: "rgba(240, 233, 216, 0.14)",
    card: "#1d1912",
    series: ["#60a5fa", "#93c5fd", "#22d3ee", "#fb923c", "#facc15", "#a78bfa"],
    accent: "#60a5fa",
    measured: "#f87171",
  },
} as const

export const palette = (t: Theme | undefined) => NSR[t ?? "light"]

/** The chart of the nuclides' decay-mode colours (NSRgpt's rainfall and chart pages): alpha gold, beta-minus blue,
 *  beta-plus and electron capture red, fission green, isomeric transition violet. */
export const MODE_COLOR: Record<string, string> = { A: "#eda100", "B-": "#2563eb", "B+": "#dc2626", EC: "#dc2626", SF: "#16a34a", IT: "#7c3aed" }
/** The same modes as a reader writes them. */
export const MODE_LABEL: Record<string, string> = { A: "α", "B-": "β−", "B+": "β+", EC: "EC", SF: "SF", IT: "IT" }
