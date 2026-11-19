import { z } from "zod/v4"

// Half-lives side by side on a log scale of time (NSRgpt's bar-large page): one bar per nuclide, its ENSDF half-life at
// its end. The page fills it from the cached API (/nuclide/{name}); the model names the nuclides.
export const HalfLifeBarsProps = z.object({
  title: z.string().min(1).max(90),
  rows: z
    .array(
      z.object({
        label: z.string().min(1).max(14),
        /** The half-life in seconds. */
        seconds: z.number().positive(),
        /** As ENSDF gives it, in words: "30.08 y". */
        text: z.string().min(1).max(24),
      }),
    )
    .min(2)
    .max(12),
  source: z.string().min(1).max(120),
  theme: z.enum(["light", "dark"]).optional(),
})

export type HalfLifeBarsProps = z.infer<typeof HalfLifeBarsProps>
