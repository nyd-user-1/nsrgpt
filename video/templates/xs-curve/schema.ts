import { z } from "zod/v4"

/** A point on a log-log plot: x and y above zero. */
const Pt = z.tuple([z.number().positive(), z.number().positive()])
/** A measured point, with its uncertainty in y when the measurement gives one. */
const Measured = z.union([z.tuple([z.number().positive(), z.number().positive()]), z.tuple([z.number().positive(), z.number().positive(), z.number().nonnegative()])])

// A cross section against energy, log-log (NSRgpt's lab plot, components/lab/PlotChart.tsx): evaluated libraries as
// curves, EXFOR measurements as points with their error bars. The page fills it from the cached API (/endf/xs,
// /exfor/points), thinned to the frame's width; the model names what to draw, never the points.
export const XsCurveProps = z
  .object({
    title: z.string().min(1).max(90),
    subtitle: z.string().max(90).optional(),
    series: z.array(z.object({ name: z.string().min(1).max(40), points: z.array(Pt).min(2).max(1200) })).min(1).max(5),
    measured: z.array(z.object({ name: z.string().min(1).max(48), points: z.array(Measured).min(1).max(400) })).max(8).optional(),
    xLabel: z.string().max(48).default("Incident neutron energy (eV)"),
    yLabel: z.string().max(48).default("Cross section (b)"),
    /** A callout that springs in as the reveal passes energy `x`. */
    annotation: z.object({ x: z.number().positive(), text: z.string().min(1).max(80) }).optional(),
    source: z.string().min(1).max(160),
    theme: z.enum(["light", "dark"]).optional(),
  })
  .refine((p) => (p.measured ?? []).reduce((n, m) => n + m.points.length, 0) <= 600, { message: "more than 600 measured points", path: ["measured"] })

export type XsCurveProps = z.infer<typeof XsCurveProps>
