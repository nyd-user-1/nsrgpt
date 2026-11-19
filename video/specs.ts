import { z } from "zod/v4"

import { QUERIES, isQueryId } from "./queries"
import type { TemplateSpec } from "./template"
import { decayChainSpec } from "./templates/decay-chain/spec"
import { halfLifeBarsSpec } from "./templates/half-life-bars/spec"
import { seriesTrendSpec } from "./templates/series-trend/spec"
import { xsCurveSpec } from "./templates/xs-curve/spec"

// Every template's spec by id (trinity's src/video/specs.ts): its schema, frame, length and fixture, without its
// component. Server-safe, so /api/chat lists the templates and the page validates a block without loading Remotion.
// registry.ts pairs each spec with its component for the Player. NSRgpt's own charts (brief 78): a cross section, a
// decay chain, half-lives, and trinity's trend in NSRgpt's palette. A new template is one import and one entry here,
// its component in registry.ts, and, when the page fills it from the API, its query in queries.ts and its loader in
// components/video/loaders.ts.

// Each spec is typed by its own schema; the list holds them side by side.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnySpec = TemplateSpec<any>

const SPECS: AnySpec[] = [xsCurveSpec, decayChainSpec, halfLifeBarsSpec, seriesTrendSpec]

const BY_ID: Readonly<Record<string, AnySpec>> = Object.fromEntries(SPECS.map((s) => [s.id, s]))

export function getSpec(id: string): AnySpec | null {
  return BY_ID[id] ?? null
}

export function allSpecs(): readonly AnySpec[] {
  return SPECS
}

/** A template's length in frames for validated props. */
export function durationOf(spec: AnySpec, props: unknown): number {
  return typeof spec.durationInFrames === "number" ? spec.durationInFrames : spec.durationInFrames(props)
}

/** What the model is told: each template's id, purpose and frame, and the JSON Schema of what it writes: the data to
 *  fetch for a template the page fills, else the props. */
export function listTemplates() {
  return SPECS.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    width: s.width,
    height: s.height,
    fps: s.fps,
    fills: isQueryId(s.id) ? ("data" as const) : ("props" as const),
    schema: z.toJSONSchema(isQueryId(s.id) ? QUERIES[s.id] : s.propsSchema, { io: "input", unrepresentable: "any" }),
  }))
}

export type Validated = { ok: true; spec: AnySpec; props: unknown; durationInFrames: number } | { ok: false; error: string }

/** The validation boundary: nothing reaches a composition without passing its schema. */
export function validate(templateId: string, props: unknown): Validated {
  const spec = getSpec(templateId)
  if (!spec) return { ok: false, error: `No template "${templateId}". Known: ${SPECS.map((s) => s.id).join(", ")}.` }
  const parsed = spec.propsSchema.safeParse(props)
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) }
  return { ok: true, spec, props: parsed.data, durationInFrames: durationOf(spec, parsed.data) }
}
