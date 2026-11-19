import type * as React from "react"

import { allSpecs, getSpec, type AnySpec } from "./specs"
import type { Template } from "./template"
import { LiftCardComposition } from "./templates/lift-card/Composition"
import { LiftLeaderboardComposition } from "./templates/lift-leaderboard/Composition"
import { MetricTrendComposition } from "./templates/metric-trend/Composition"
import { SurveySplitComposition } from "./templates/survey-split/Composition"

// Each spec (specs.ts) with the Remotion component that draws it (trinity's src/video/registry.ts): what TemplatePlayer
// plays in the page. Client bundles only: the components need React's client runtime, so server code reads specs.ts.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const COMPONENTS: Record<string, React.ComponentType<any>> = {
  "lift-card": LiftCardComposition,
  "lift-leaderboard": LiftLeaderboardComposition,
  "survey-split": SurveySplitComposition,
  "metric-trend": MetricTrendComposition,
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyTemplate = Template<any>

const pair = (spec: AnySpec): AnyTemplate | null => {
  const component = COMPONENTS[spec.id]
  return component ? { ...spec, component } : null
}

const ALL: AnyTemplate[] = allSpecs()
  .map(pair)
  .filter((t): t is AnyTemplate => t != null)

export function getTemplate(id: string): AnyTemplate | null {
  const spec = getSpec(id)
  return spec ? pair(spec) : null
}

export function allTemplates(): readonly AnyTemplate[] {
  return ALL
}

export { durationOf, listTemplates, validate } from "./specs"
