/**
 * @built F-50 the verdict fixtures the display-edge tests share
 *
 * R14.4 and R15 are assertions about *every* verdict branch, so the branches are
 * built here once, from the engine, using the same inputs as the three demo
 * presets (`lib/verdict/presets.ts`) plus two edge cases the presets do not
 * cover: a gas home on the enhanced tier (the engine refuses the rebate) and a
 * resistance-heated home (the third eligible fuel).
 *
 * These are not snapshots. If the engine changes a number, the tests read the new
 * one; what is asserted is the shape of the copy, never the arithmetic.
 */

import { computeVerdict } from '@/lib/calc'
import { HDD65_DEFAULT } from '@/lib/calc/constants'
import type { Fuel, Tier, Verdict, VerdictResult } from '@/lib/calc/types'
import { seasonalHeatPumpRate } from '@/lib/utility'

export const STANDARD_RATE = 0.305

interface Spec {
  /** What the branch is, for the test name. */
  name: string
  fuel: Fuel
  annualUnits: number
  unitPrice: number
  /** The town decides the seasonal heat-pump rate through the sponsor. */
  town: string
  tier: Tier
  installYear: 2026 | 2027
  installCost: number
}

const SPECS: readonly Spec[] = [
  { name: 'oil, enhanced, 2026', fuel: 'oil', annualUnits: 800, unitPrice: 6.23, town: 'Framingham', tier: 'enhanced', installYear: 2026, installCost: 22_000 },
  { name: 'propane, whole-home, 2026', fuel: 'propane', annualUnits: 1_100, unitPrice: 3.85, town: 'Worcester', tier: 'whole', installYear: 2026, installCost: 22_000 },
  { name: 'gas, whole-home, 2026', fuel: 'gas', annualUnits: 1_000, unitPrice: 1.9, town: 'Boston', tier: 'whole', installYear: 2026, installCost: 22_000 },
  { name: 'oil, whole-home, 2027', fuel: 'oil', annualUnits: 800, unitPrice: 6.23, town: 'Framingham', tier: 'whole', installYear: 2027, installCost: 22_000 },
  { name: 'gas, enhanced (refused), 2026', fuel: 'gas', annualUnits: 1_000, unitPrice: 1.9, town: 'Boston', tier: 'enhanced', installYear: 2026, installCost: 22_000 },
  { name: 'resistance, partial-home, 2026', fuel: 'resistance', annualUnits: 9_000, unitPrice: 0.305, town: 'Salem', tier: 'partial', installYear: 2026, installCost: 18_000 },
]

export interface Fixture {
  name: string
  result: VerdictResult
}

function build(spec: Spec): Fixture {
  const seasonal = seasonalHeatPumpRate(STANDARD_RATE, spec.town)
  const result = computeVerdict(
    { fuel: spec.fuel, annualUnits: spec.annualUnits, unitPrice: spec.unitPrice, hdd65: HDD65_DEFAULT },
    {
      tier: spec.tier,
      installYear: spec.installYear,
      installCost: spec.installCost,
      weatherizationBonus: false,
      sizingBonus: false,
      heatPumpRate: seasonal.rate,
      standardRate: STANDARD_RATE,
    },
  )
  if (result === null) throw new Error(`fixture "${spec.name}" was refused by the engine`)
  return { name: spec.name, result }
}

export const FIXTURES: readonly Fixture[] = SPECS.map(build)

/** The fixtures grouped by verdict, for the tests that must cover every branch. */
export const BY_VERDICT: Record<Verdict, Fixture[]> = {
  SWITCH_NOW: FIXTURES.filter((fixture) => fixture.result.verdict === 'SWITCH_NOW'),
  SWITCH_BEFORE_DEC31: FIXTURES.filter((fixture) => fixture.result.verdict === 'SWITCH_BEFORE_DEC31'),
  DO_NOT_SWITCH_YET: FIXTURES.filter((fixture) => fixture.result.verdict === 'DO_NOT_SWITCH_YET'),
}
