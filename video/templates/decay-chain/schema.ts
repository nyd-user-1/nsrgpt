import { z } from "zod/v4"

/** The modes a step can leave by, as ENSDF and ICRP write them. */
export const MODES = ["A", "B-", "B+", "EC", "SF", "IT"] as const

// A decay chain from its parent to its stable end (NSRgpt's decay-chain page), as the main path: each step's nuclide,
// its half-life and the mode it leaves by. The page fills it from the cached API (/icrp/chain/{nuclide}); the model
// names the parent.
export const DecayChainProps = z
  .object({
    title: z.string().min(1).max(90),
    steps: z
      .array(
        z.object({
          nuclide: z.string().min(1).max(12),
          halfLife: z.string().max(24).optional(),
          /** How this nuclide decays to the next step; none on the stable end. */
          mode: z.enum(MODES).optional(),
          stable: z.boolean().optional(),
        }),
      )
      .min(2)
      .max(15),
    source: z.string().min(1).max(120),
    theme: z.enum(["light", "dark"]).optional(),
  })
  .refine((p) => p.steps.slice(0, -1).every((s) => !s.stable), { message: "only the last step can be stable", path: ["steps"] })

export type DecayChainProps = z.infer<typeof DecayChainProps>

/** Seconds between one step and the next: a long chain moves faster, so every chain lands in about eight seconds. */
export const stepSeconds = (n: number) => Math.min(0.55, 6 / Math.max(1, n - 1))
