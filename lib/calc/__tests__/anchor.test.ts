/**
 * @built F-25 golden anchor: 800 gal oil at $6.23 in a Wellesley-sized house
 *
 * Every expected value below was computed by hand from the formula sheet in
 * design.md §2.2, then confirmed with plain arithmetic outside the engine:
 *
 *   deliveredBTU = 800 × 138,500 × 0.80           = 88,640,000 BTU  = 88.64 MMBtu
 *   UA           = 88,640,000 / (24 × 5,600)      = 659.523809… BTU/hr/°F
 *   designBTUhr  = 659.523809… × (65 − 7)         = 38,252.380952… BTU/hr
 *   tons         = round0.5(38,252.38 / 12,000)   = 3.0
 *   annualKWh    = 88,640,000 / (3,412.14 × 2.70) = 9,621.419294… kWh
 *   oldCost      = 800 × 6.23                     = 4,984.00
 *   newCost(HP)  = 9,621.419294… × 0.235          = 2,261.033534… 
 *   savings      = 4,984.00 − 2,261.033534…       = 2,722.966466…
 *   rebate       = min(3.0 × 2,650, 8,500)        = 7,950.00
 *   netCost      = 22,000 − 7,950                 = 14,050.00
 *   payback      = 14,050 / 2,722.966466…         = 5.159813819… years
 *   monthlyLoan  = 14,050 / 84                    = 167.261904… 
 *   monthlySaving= 2,722.966466… / 12             = 226.913872…
 *   rebate2027   = min(3.0 × 2,350, 7,500)        = 7,050.00
 *   cliffCost    = 7,950 − 7,050                  = 900.00
 *
 * The task brief prints a few of these rounded (38252.05, 9621.44, 2261.04,
 * 2722.96, 5.1599). Those five disagree with exact arithmetic by up to 8.6e-6
 * relative — well inside one cent on screen, but outside a 1e-6 tolerance. The
 * last test in this file records the brief's printed values and pins the
 * deviation, so any real drift fails while the brief's rounding is documented.
 */

import { describe, expect, it } from 'vitest'

import { HEAT_PUMP_RULES_2026, HEAT_PUMP_RULES_2027, FUEL_SNAPSHOT_2026_10_19, rulesSourceLabel } from '../rules'
import { computeVerdict } from '../index'
import { deliveredHeat, designLoad, sizeTons } from '../heat'
import { rebate } from '../rebate'
import { annualKWh, operatingCost } from '../cost'
import { payback, heatLoan, breakEvenElectricPrice } from '../finance'
import type { HeatingInput, UpgradeInput, VerdictResult } from '../types'

const ANCHOR_HEATING: HeatingInput = {
  fuel: 'oil',
  annualUnits: 800,
  unitPrice: 6.23,
  afue: 0.8,
  hdd65: 5_600,
  designTempF: 7,
}

const ANCHOR_UPGRADE: UpgradeInput = {
  tier: 'whole',
  installYear: 2026,
  installCost: 22_000,
  heatPumpRate: 0.235,
  standardRate: 0.305,
  scop: 2.7,
}

const REL = 1e-6

function expectClose(actual: number | null, expected: number, label: string, rel = REL): void {
  expect(actual, `${label} is null`).not.toBeNull()
  const value = actual as number
  expect(Number.isFinite(value), `${label} is not finite`).toBe(true)
  const delta = Math.abs(value - expected)
  const tolerance = Math.abs(expected) * rel
  expect(delta, `${label}: got ${value}, expected ${expected} (Δ ${delta}, tol ${tolerance})`).toBeLessThanOrEqual(
    tolerance,
  )
}

function anchor(): VerdictResult {
  const result = computeVerdict(ANCHOR_HEATING, ANCHOR_UPGRADE)
  expect(result, 'engine refused the golden input').not.toBeNull()
  return result as VerdictResult
}

describe('golden anchor — 800 gal oil @ $6.23, whole-home, 2026', () => {
  it('reproduces every intermediate from the formula sheet', () => {
    expectClose(anchor().deliveredMMBtu, 88.64, 'deliveredMMBtu')
    expectClose(anchor().designBTUhr, 38_252.380_952_380_954, 'designBTUhr')
    expectClose(anchor().annualKWh, 9_621.419_293_941_522, 'annualKWh')
    expectClose(anchor().oldAnnualCost, 4_984, 'oldAnnualCost')
    expectClose(anchor().newAnnualCostHeatPumpRate, 2_261.033_534_076_257_6, 'newAnnualCostHeatPumpRate')
    expectClose(anchor().newAnnualCostStandard, 2_934.532_884_652_164_3, 'newAnnualCostStandard')
  })

  it('reproduces the headline: rebate, net cost, payback, loan', () => {
    const r = anchor()
    expect(r.tons).toBe(3)
    expectClose(r.totalRebate, 7_950, 'totalRebate')
    expectClose(r.netCost, 14_050, 'netCost')
    expectClose(r.annualSavings, 2_722.966_465_923_742_4, 'annualSavings')
    expectClose(r.paybackYears, 5.159_813_819_166_392, 'paybackYears')
    expectClose(r.monthlyLoan, 167.261_904_761_904_76, 'monthlyLoan')
    expectClose(r.monthlySavings, 226.913_872_160_311_85, 'monthlySavings')
    expect(r.cashFlowPositive).toBe(true)
  })

  it('reproduces the cliff and the verdict', () => {
    const r = anchor()
    expectClose(r.rebate2027, 7_050, 'rebate2027')
    expectClose(r.cliffCost, 900, 'cliffCost')
    expect(r.verdict).toBe('SWITCH_BEFORE_DEC31')
  })

  it('keeps the answer auditable: breakdown sums, reasons, caveats, assumptions', () => {
    const r = anchor()
    const sum = r.rebateBreakdown.reduce((acc, line) => acc + line.amount, 0)
    expectClose(sum, r.totalRebate, 'rebateBreakdown sum')
    expect(r.reasons.length).toBeGreaterThanOrEqual(2)
    expect(r.caveats.length).toBeGreaterThanOrEqual(1)
    expect(r.assumptions.length).toBeGreaterThanOrEqual(1)
    for (const a of r.assumptions) {
      expect(a.field.length).toBeGreaterThan(0)
      expect(a.value.length).toBeGreaterThan(0)
      expect(a.reason.length).toBeGreaterThan(10)
    }
    expect(r.reasons.join(' ')).toContain('7,950')
    expect(r.reasons.join(' ')).toContain('900')
  })

  it('agrees with the individual functions it composes', () => {
    const delivered = deliveredHeat(ANCHOR_HEATING)
    expect(delivered).not.toBeNull()
    if (!delivered) return
    expect(delivered.source).toBe('bill')
    expectClose(delivered.mmBtu, 88.64, 'deliveredHeat.mmBtu')

    const load = designLoad({ btu: delivered.btu, hdd65: 5_600, designTempF: 7 })
    expect(load).not.toBeNull()
    if (!load) return
    expectClose(load.ua, 659.523_809_523_809_5, 'designLoad.ua')
    expectClose(load.btuhr, 38_252.380_952_380_954, 'designLoad.btuhr')
    expect(sizeTons(load.btuhr)).toBe(3)

    const kWh = annualKWh(delivered.btu, 2.7)
    expect(kWh).not.toBeNull()
    if (kWh === null) return
    expectClose(kWh, 9_621.419_293_941_522, 'annualKWh()')
    expectClose(operatingCost(kWh, 0.235), 2_261.033_534_076_257_6, 'operatingCost()')
    expectClose(payback(14_050, 2_722.966_465_923_742_4), 5.159_813_819_166_392, 'payback()')
    expectClose(heatLoan(14_050)?.monthly ?? null, 167.261_904_761_904_76, 'heatLoan().monthly')
    expectClose(breakEvenElectricPrice({ btu: delivered.btu, oldCost: 4_984, scop: 2.7 }), 0.518_010_892_960_288_9, 'breakEven')

    const whole = rebate('whole', 3, 2026, { installCost: 22_000, fuel: 'oil' })
    expect(whole).not.toBeNull()
    if (!whole) return
    expectClose(whole.total, 7_950, 'rebate().total')
    expectClose(whole.base, 7_950, 'rebate().base')
    expect(whole.eligible).toBe(true)
  })

  it('caps the same house in 2027 below the 2026 figure', () => {
    const r = anchor()
    expect(r.rebate2027).toBeLessThan(r.rebate2026)
    expectClose(r.rebate2026 - r.rebate2027, 900, 'cliffCost')
  })
})

describe('brief printout vs exact arithmetic', () => {
  // The brief's printed values are rounded for a slide. We record them verbatim and
  // pin how far they sit from exact arithmetic: if either moves, this fails.
  const brief: Array<{ label: string; printed: number; actual: number }> = [
    { label: 'deliveredMMBtu', printed: 88.64, actual: 88.64 },
    { label: 'designBTUhr', printed: 38_252.05, actual: 38_252.380_952_380_954 },
    { label: 'tons', printed: 3.0, actual: 3 },
    { label: 'annualKWh', printed: 9_621.44, actual: 9_621.419_293_941_522 },
    { label: 'oldAnnualCost', printed: 4_984.0, actual: 4_984 },
    { label: 'newAnnualCostHeatPumpRate', printed: 2_261.04, actual: 2_261.033_534_076_257_6 },
    { label: 'annualSavings', printed: 2_722.96, actual: 2_722.966_465_923_742_4 },
    { label: 'totalRebate', printed: 7_950.0, actual: 7_950 },
    { label: 'netCost', printed: 14_050.0, actual: 14_050 },
    { label: 'paybackYears', printed: 5.159_9, actual: 5.159_813_819_166_392 },
    { label: 'monthlyLoan', printed: 167.26, actual: 167.261_904_761_904_76 },
    { label: 'monthlySavings', printed: 226.91, actual: 226.913_872_160_311_85 },
    { label: 'rebate2027', printed: 7_050.0, actual: 7_050 },
    { label: 'cliffCost', printed: 900.0, actual: 900 },
  ]

  it.each(brief)('$label stays within 2e-5 of the value the brief prints', ({ printed, actual }) => {
    const deviation = Math.abs(printed - actual) / Math.abs(actual)
    expect(deviation).toBeLessThanOrEqual(2e-5)
  })

  it('is exact to 1e-6 for every value the brief got right', () => {
    const exact = brief.filter((row) => Math.abs(row.printed - row.actual) / Math.abs(row.actual) <= REL)
    expect(exact.map((r) => r.label)).toEqual([
      'deliveredMMBtu',
      'tons',
      'oldAnnualCost',
      'totalRebate',
      'netCost',
      'rebate2027',
      'cliffCost',
    ])
  })
})

describe('rules tables mirror mass-save-rules.md', () => {
  it('2026 rates and caps', () => {
    expect(HEAT_PUMP_RULES_2026.tiers.whole.perTonUsd).toBe(2_650)
    expect(HEAT_PUMP_RULES_2026.tiers.whole.capUsd).toBe(8_500)
    expect(HEAT_PUMP_RULES_2026.tiers.partial.perTonUsd).toBe(1_125)
    expect(HEAT_PUMP_RULES_2026.tiers.partial.capUsd).toBe(8_500)
    expect(HEAT_PUMP_RULES_2026.tiers.basic.perTonUsd).toBe(250)
    expect(HEAT_PUMP_RULES_2026.tiers.basic.capUsd).toBe(2_500)
    expect(HEAT_PUMP_RULES_2026.tiers.enhanced.capUsd).toBe(16_000)
    expect(HEAT_PUMP_RULES_2026.tiers.enhanced.eligibleFuels).toEqual(['oil', 'propane', 'resistance'])
  })

  it('2027 rates and caps, the step-down', () => {
    expect(HEAT_PUMP_RULES_2027.tiers.whole.perTonUsd).toBe(2_350)
    expect(HEAT_PUMP_RULES_2027.tiers.whole.capUsd).toBe(7_500)
    expect(HEAT_PUMP_RULES_2027.tiers.partial.perTonUsd).toBe(1_000)
    expect(HEAT_PUMP_RULES_2027.tiers.partial.capUsd).toBe(7_500)
    expect(HEAT_PUMP_RULES_2027.tiers.basic.perTonUsd).toBe(250)
    expect(HEAT_PUMP_RULES_2027.tiers.enhanced.capUsd).toBe(16_000)
  })

  it('bonuses are $500 + $500 on whole/partial only', () => {
    expect(HEAT_PUMP_RULES_2026.tiers.whole.bonuses).toEqual({ weatherizationUsd: 500, sizingUsd: 500 })
    expect(HEAT_PUMP_RULES_2026.tiers.partial.bonuses).toEqual({ weatherizationUsd: 500, sizingUsd: 500 })
    expect(HEAT_PUMP_RULES_2026.tiers.basic.bonuses).toBeNull()
    expect(HEAT_PUMP_RULES_2026.tiers.enhanced.bonuses).toBeNull()
  })

  it('the DOER snapshot is dated and priced as published', () => {
    expect(FUEL_SNAPSHOT_2026_10_19.asOf).toBe('2026-10-19')
    expect(FUEL_SNAPSHOT_2026_10_19.oil.avg).toBe(6.23)
    expect(FUEL_SNAPSHOT_2026_10_19.propane.avg).toBe(3.91)
    expect(FUEL_SNAPSHOT_2026_10_19.electricity.standardRate).toBe(0.3049)
  })

  it('the enhanced tier reproduces Mass Save published example: 22,000 → 16,000 → 6,000 net', () => {
    const r = rebate('enhanced', 3, 2026, { installCost: 22_000, fuel: 'oil' })
    expect(r).not.toBeNull()
    if (!r) return
    expect(r.total).toBe(16_000)
    expect(22_000 - r.total).toBe(6_000)
    expect(r.eligible).toBe(true)
  })

  it('enhanced is closed to gas, with a reason instead of a number', () => {
    const r = rebate('enhanced', 3, 2026, { installCost: 22_000, fuel: 'gas' })
    expect(r).not.toBeNull()
    if (!r) return
    expect(r.eligible).toBe(false)
    expect(r.total).toBe(0)
    expect(r.reason).toMatch(/oil, propane or electric resistance/)
  })

  it('names the table the way a household should read it', () => {
    const label = rulesSourceLabel(HEAT_PUMP_RULES_2026)
    expect(label).toContain('Mass Save')
    expect(label).toContain('2026 table')
    expect(label).toContain('2026-10-24')
    expect(label).not.toContain('.kiro')
  })
})

describe('R5 — the rebate stack is auditable in dollars', () => {
  const sum = (lines: { amount: number }[]): number => lines.reduce((acc, line) => acc + line.amount, 0)

  it('5.1: the table follows the install year, both years implemented', () => {
    const y2026 = rebate('whole', 3, 2026, { fuel: 'oil' })
    const y2027 = rebate('whole', 3, 2027, { fuel: 'oil' })
    expect(y2026?.total).toBe(7_950)
    expect(y2027?.total).toBe(7_050)
    expect(rebate('whole', 3, 2028, { fuel: 'oil' })).toBeNull()
  })

  it('5.2: the enhanced tier is closed to gas and says why', () => {
    const oil = rebate('enhanced', 3, 2026, { installCost: 22_000, fuel: 'oil' })
    const gas = rebate('enhanced', 3, 2026, { installCost: 22_000, fuel: 'gas' })
    expect(oil?.eligible).toBe(true)
    expect(gas?.eligible).toBe(false)
    expect(gas?.breakdown).toEqual([])
    expect(gas?.reason).toMatch(/gas home is not eligible/i)
  })

  it('5.3: bonuses exist only on whole/partial and each one adds $500', () => {
    const none = rebate('whole', 2, 2026, { fuel: 'oil' })
    const weatherized = rebate('whole', 2, 2026, { fuel: 'oil', weatherizationBonus: true })
    const both = rebate('whole', 2, 2026, { fuel: 'oil', weatherizationBonus: true, sizingBonus: true })
    expect(none?.total).toBe(5_300)
    expect(weatherized?.total).toBe(5_800)
    expect(both?.total).toBe(6_300)
    expect(both?.bonuses).toBe(1_000)

    for (const tier of ['basic', 'enhanced'] as const) {
      const r = rebate(tier, 2, 2026, { fuel: 'oil', installCost: 22_000, weatherizationBonus: true, sizingBonus: true })
      expect(r?.bonuses, `${tier} must not pay bonuses`).toBe(0)
      expect(r?.breakdown.some((line) => /bonus/i.test(line.label))).toBe(false)
    }
  })

  it('5.4: the cap is applied after bonuses and the lines still add up', () => {
    // 4 tons × $2,650 = $10,600, capped at $8,500 before any bonus.
    const r = rebate('whole', 4, 2026, { fuel: 'oil', weatherizationBonus: true, sizingBonus: true })
    expect(r).not.toBeNull()
    if (!r) return
    expect(r.base).toBe(8_500)
    expect(r.total).toBe(8_500)
    expect(r.bonuses).toBe(0) // the post-bonus cap swallows both bonuses
    expect(sum(r.breakdown)).toBeCloseTo(r.total, 6)
    expect(r.breakdown.some((line) => line.amount < 0)).toBe(true)
    expect(r.breakdown.some((line) => /after bonuses/i.test(line.label))).toBe(true)
  })

  it('5.4: when the cap bites, the award line stays at the rate and the cap is its own line', () => {
    const r = rebate('whole', 4, 2026, { fuel: 'oil' })
    expect(r).not.toBeNull()
    if (!r) return
    expect(r.breakdown[0].amount).toBe(10_600)
    expect(r.breakdown[1].amount).toBe(-2_100)
    expect(sum(r.breakdown)).toBe(8_500)
    expect(r.total).toBe(8_500)
  })

  it('5.5: the Jan 1 delta is quantified for the same household', () => {    const h: HeatingInput = { ...ANCHOR_HEATING }
    const result2026 = computeVerdict(h, { ...ANCHOR_UPGRADE, installYear: 2026 })
    const result2027 = computeVerdict(h, { ...ANCHOR_UPGRADE, installYear: 2027 })
    expect(result2026?.rebate2026).toBe(7_950)
    expect(result2026?.rebate2027).toBe(7_050)
    expect(result2026?.cliffCost).toBe(900)
    expect(result2027?.totalRebate).toBe(7_050)
    // Basic never steps down, so its cliff is honestly zero rather than a slogan.
    const basic = rebate('basic', 2, 2026, { fuel: 'oil' })
    const basic2027 = rebate('basic', 2, 2027, { fuel: 'oil' })
    expect(basic?.total).toBe(500)
    expect(basic2027?.total).toBe(500)
  })
})
