/**
 * @built F-152 R8 acceptance — the verdict is a closed set, decided by four ordered rules,
 * explained by at least two reasons and one caveat, and deterministic.
 *
 * The 2027 table pays less than 2026 for the same tier and tonnage, so the
 * `SWITCH_BEFORE_DEC31` branch needs a real 2026 cliff. The fixture below is
 * built for the rule tests rather than for realism; the matrix at the bottom
 * uses whole engine runs.
 */

import { describe, expect, it } from 'vitest'

import { computeVerdict } from '../index'
import type { HeatingInput, UpgradeInput, Verdict, VerdictResult } from '../types'
import { verdictOf } from '../verdict'

const CLOSED_SET: readonly Verdict[] = ['SWITCH_NOW', 'SWITCH_BEFORE_DEC31', 'DO_NOT_SWITCH_YET']

const BASE: VerdictResult = {
  deliveredMMBtu: 88.64,
  designBTUhr: 38_252.38,
  tons: 3,
  annualKWh: 9_621.42,
  oldAnnualCost: 4_984,
  newAnnualCostStandard: 2_934.5,
  newAnnualCostHeatPumpRate: 2_261.03,
  annualSavings: 2_722.97,
  annualSavingsAtHeatPumpRate: 2_722.97,
  annualSavingsAtStandardRate: 2_049.5,
  totalRebate: 7_950,
  rebateBreakdown: [],
  netCost: 14_050,
  paybackYears: 5.16,
  loanAmount: 14_050,
  monthlyLoan: 167.26,
  monthlySavings: 226.91,
  monthlyCashFlow: 226.91 - 167.26,
  cashFlowPositive: true,
  breakEvenElectricPrice: 0.4,
  rebate2026: 7_950,
  rebate2027: 7_050,
  cliffCost: 900,
  verdict: 'SWITCH_NOW',
  reasons: ['reason one', 'reason two'],
  caveats: ['caveat one'],
  assumptions: [],
  fuel: 'oil',
  tier: 'whole',
  installYear: 2026,
  installCost: 22_000,
  scop: 2.7,
  hdd65: 5_600,
  designTempF: 7,
  annualUnits: 800,
  unitPrice: 6.23,
  heatPumpRate: 0.235,
  standardRate: 0.305,
  rebateEligible: true,
}

const result = (overrides: Partial<VerdictResult> = {}): VerdictResult => ({ ...BASE, ...overrides })

const FUELS: Record<HeatingInput['fuel'], HeatingInput> = {
  oil: { fuel: 'oil', annualUnits: 800, unitPrice: 6.23 },
  propane: { fuel: 'propane', annualUnits: 900, unitPrice: 3.6 },
  gas: { fuel: 'gas', annualUnits: 900, unitPrice: 1.8 },
  resistance: { fuel: 'resistance', annualUnits: 9_000, unitPrice: 0.29 },
}

const TIERS: readonly UpgradeInput['tier'][] = ['whole', 'partial', 'basic', 'enhanced']
const YEARS: readonly (2026 | 2027)[] = [2026, 2027]

const upgradeFor = (tier: UpgradeInput['tier'], installYear: 2026 | 2027): UpgradeInput => ({
  tier,
  installYear,
  // Enhanced is capped by install cost, so the engine refuses it without a quote.
  installCost: 22_000,
  heatPumpRate: 0.235,
  standardRate: 0.305,
})

describe('R8.1 — exactly one verdict from a closed set', () => {
  it('only ever returns SWITCH_NOW, SWITCH_BEFORE_DEC31 or DO_NOT_SWITCH_YET', () => {
    for (const heating of Object.values(FUELS)) {
      for (const tier of TIERS) {
        for (const installYear of YEARS) {
          const r = computeVerdict(heating, upgradeFor(tier, installYear))
          expect(r, `${heating.fuel} ${tier} ${installYear}`).not.toBeNull()
          expect(CLOSED_SET).toContain(r!.verdict)
        }
      }
    }
  })
})

describe('R8.2 — four rules, first match wins', () => {
  it('rule 1: savings <= 0 is DO_NOT_SWITCH_YET even with a cliff and a fast payback', () => {
    expect(verdictOf(result({ annualSavings: 0 }))).toBe('DO_NOT_SWITCH_YET')
    expect(verdictOf(result({ annualSavings: -1, paybackYears: 2 }))).toBe('DO_NOT_SWITCH_YET')
  })

  it('rule 2: payback > 15 years is DO_NOT_SWITCH_YET even with a cliff', () => {
    expect(verdictOf(result({ paybackYears: 15.01 }))).toBe('DO_NOT_SWITCH_YET')
    expect(verdictOf(result({ paybackYears: 40 }))).toBe('DO_NOT_SWITCH_YET')
  })

  it('rule 2: a non-finite or absent payback is not a win', () => {
    expect(verdictOf(result({ paybackYears: null }))).toBe('DO_NOT_SWITCH_YET')
    expect(verdictOf(result({ paybackYears: Number.NaN }))).toBe('DO_NOT_SWITCH_YET')
  })

  it('rule 3: a 2026 install worth more than a 2027 one is SWITCH_BEFORE_DEC31', () => {
    expect(verdictOf(result({ installYear: 2026, rebate2026: 7_950, rebate2027: 7_050 }))).toBe(
      'SWITCH_BEFORE_DEC31',
    )
  })

  it('rule 3 is strict: equal rebates are SWITCH_NOW', () => {
    expect(verdictOf(result({ installYear: 2026, rebate2026: 7_950, rebate2027: 7_950 }))).toBe('SWITCH_NOW')
  })

  it('rule 3 needs the 2026 install year: a 2027 install ignores the cliff', () => {
    expect(verdictOf(result({ installYear: 2027, rebate2026: 7_950, rebate2027: 7_050 }))).toBe('SWITCH_NOW')
  })

  it('rule 4: savings, payback and no cliff is SWITCH_NOW', () => {
    expect(verdictOf(result({ installYear: 2026, rebate2026: 7_050, rebate2027: 7_050 }))).toBe('SWITCH_NOW')
  })

  it('first match wins: rule 1 and rule 2 beat rule 3', () => {
    expect(verdictOf(result({ annualSavings: 0, paybackYears: 99 }))).toBe('DO_NOT_SWITCH_YET')
    expect(verdictOf(result({ annualSavings: 100, paybackYears: 16 }))).toBe('DO_NOT_SWITCH_YET')
    // 15.0 exactly is inside the horizon, so rule 3 is reachable.
    expect(verdictOf(result({ annualSavings: 100, paybackYears: 15 }))).toBe('SWITCH_BEFORE_DEC31')
  })

  it('a NaN savings figure is a refusal to flatter, not a switch', () => {
    expect(verdictOf(result({ annualSavings: Number.NaN }))).toBe('DO_NOT_SWITCH_YET')
  })
})

describe('R8.3 — every verdict carries at least two reasons and one caveat', () => {
  it('holds for every fuel, tier and install year the engine accepts', () => {
    for (const heating of Object.values(FUELS)) {
      for (const tier of TIERS) {
        for (const installYear of YEARS) {
          const r = computeVerdict(heating, upgradeFor(tier, installYear))
          expect(r, `${heating.fuel} ${tier} ${installYear}`).not.toBeNull()
          expect(r!.reasons.length, `${heating.fuel} ${tier} ${installYear} reasons`).toBeGreaterThanOrEqual(2)
          expect(r!.caveats.length, `${heating.fuel} ${tier} ${installYear} caveats`).toBeGreaterThanOrEqual(1)
          for (const reason of r!.reasons) expect(reason.trim().length).toBeGreaterThan(10)
          for (const caveat of r!.caveats) expect(caveat.trim().length).toBeGreaterThan(10)
        }
      }
    }
  })

  it('supports the verdict it actually returned, on a real run', () => {
    const r = computeVerdict(FUELS.oil, upgradeFor('whole', 2026))!
    expect(r.verdict).toBe('SWITCH_BEFORE_DEC31')
    expect(r.reasons.join(' ')).toContain('2026')
    expect(r.caveats.join(' ')).toContain('Estimate only')
  })
})

describe('R8.4 — deterministic', () => {
  it('identical input produces an identical result, every time', () => {
    for (const heating of Object.values(FUELS)) {
      for (const tier of TIERS) {
        for (const installYear of YEARS) {
          const first = computeVerdict(heating, upgradeFor(tier, installYear))
          const second = computeVerdict(heating, upgradeFor(tier, installYear))
          expect(second).toEqual(first)
        }
      }
    }
  })
})
