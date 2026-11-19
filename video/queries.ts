import { z } from "zod/v4"

// What the model writes for a template the page fills from the cached API (Brendan, 2026-11-19, brief 78): it names the
// data, never the numbers; components/video/loaders.ts fetches the rows, thins them and builds the template's props.
// Server-safe: the chat route lists these in the guide, the page validates a block's `data` with them.

const Nuclide = z.string().regex(/^[A-Z][a-z]?-\d{1,3}m?$/, 'a nuclide as "U-235", "Co-60", "Pa-234m"')

export const QUERIES = {
  "xs-curve": z.object({
    nuclide: Nuclide,
    /** The ENDF reaction number: 1 total, 2 elastic, 18 fission, 102 capture (n,γ), 16 (n,2n), 103 (n,p), 107 (n,α). */
    mt: z.number().int().min(1).max(999),
    /** Evaluated libraries as the API names them: "B-VIII.1", "B-VIII.0", "JEFF-3.3", "JENDL-5", "TENDL-2023". */
    releases: z.array(z.string().min(2).max(24)).min(1).max(4).default(["B-VIII.1"]),
    /** Overlay EXFOR's measured points for the same reaction. */
    exfor: z.boolean().default(true),
    /** The EXFOR reaction code for the overlay, "N,F" for fission, "N,G" for capture; the page reads it from mt when omitted. */
    exforReaction: z.string().max(16).optional(),
    emin: z.number().positive().optional(),
    emax: z.number().positive().optional(),
    /** A callout at an energy in eV: a resonance, a threshold, thermal. */
    annotation: z.object({ x: z.number().positive(), text: z.string().min(1).max(80) }).optional(),
  }),
  "decay-chain": z.object({ nuclide: Nuclide }),
  "half-life-bars": z.object({ nuclides: z.array(Nuclide).min(2).max(12) }),
} as const

export type QueryId = keyof typeof QUERIES
export const isQueryId = (id: string): id is QueryId => id in QUERIES
