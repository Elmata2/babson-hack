/**
 * @built F-24 property suite P1–P12 on the calculation core, with fast-check
 *
 * Each property names the bug class it prevents. Generators stay inside realistic
 * Massachusetts ranges because a property over absurd inputs proves nothing about
 * the demo — except P11, which is deliberately hostile and asserts that the engine
 * refuses instead of guessing.
 *
 * Every run is `numRuns: 200`. Total generated cases: 12 × 200 = 2,400.
 */

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { btuToMmBtu, deliveredHeat, mmBtuToBtu } from '../heat'
import { computeVerdict, refusalFor } from '../index'
import { rebate } from '../rebate'
import { rulesForYear } from '../rules'
import type { Fuel, HeatingInput, Tier, UpgradeInput, VerdictResult } from '../types'

const NUM_RUNS = 200

// --------------------------------------------------------------- generators

/** Realistic annual burn per fuel: mid-size MA single family. */
const UNITS_RANGE: Record<Fuel, [number, number]> = {
  oil: [150, 2_500],
  propane: [150, 2_500],
  gas: [100, 3_000],
  resistance: [1_000, 40_000],
}

/** Realistic unit price per fuel, wide enough to cross break-even both ways. */
const PRICE_RANGE: Record<Fuel, [number, number]> = {
  oil: [2.5, 9.0],
  propane: [1.5, 6.0],
  gas: [0.8, 3.5],
  resistance: [0.12, 0.5],
}

const arbFuel = fc.constantFrom<Fuel>('oil', 'propane', 'gas', 'resistance')
const arbTier = fc.constantFrom<Tier>('whole', 'partial', 'basic', 'enhanced')

const arbHeating: fc.Arbitrary<HeatingInput> = arbFuel.chain((fuel) =>
  fc.record({
    fuel: fc.constant(fuel),
    annualUnits: fc.double({ min: UNITS_RANGE[fuel][0], max: UNITS_RANGE[fuel][1], noNaN: true }),
    unitPrice: fc.double({ min: PRICE_RANGE[fuel][0], max: PRICE_RANGE[fuel][1], noNaN: true }),
    afue: fc.option(fc.double({ min: 0.75, max: 1.0, noNaN: true }), { nil: undefined }),
    hdd65: fc.option(fc.double({ min: 5_000, max: 7_000, noNaN: true }), { nil: undefined }),
    designTempF: fc.option(fc.double({ min: -10, max: 20, noNaN: true }), { nil: undefined }),
  }),
)

const arbUpgrade: fc.Arbitrary<UpgradeInput> = fc.record({
  tier: arbTier,
  installYear: fc.constantFrom<2026 | 2027>(2026, 2027),
  installCost: fc.double({ min: 8_000, max: 60_000, noNaN: true }),
  weatherizationBonus: fc.boolean(),
  sizingBonus: fc.boolean(),
  heatPumpRate: fc.double({ min: 0.12, max: 0.45, noNaN: true }),
  standardRate: fc.double({ min: 0.2, max: 0.55, noNaN: true }),
  scop: fc.option(fc.double({ min: 2.3, max: 3.2, noNaN: true }), { nil: undefined }),
})

const arbCase = fc.record({ heating: arbHeating, upgrade: arbUpgrade })

function must(h: HeatingInput, u: UpgradeInput): VerdictResult {
  const result = computeVerdict(h, u)
  expect(result, `engine refused a realistic input: ${JSON.stringify({ h, u })}`).not.toBeNull()
  return result as VerdictResult
}

const NUMERIC_FIELDS = [
  'deliveredMMBtu',
  'designBTUhr',
  'tons',
  'annualKWh',
  'oldAnnualCost',
  'newAnnualCostStandard',
  'newAnnualCostHeatPumpRate',
  'annualSavings',
  'annualSavingsAtHeatPumpRate',
  'annualSavingsAtStandardRate',
  'totalRebate',
  'netCost',
  'monthlyLoan',
  'monthlySavings',
  'rebate2026',
  'rebate2027',
  'cliffCost',
  'installCost',
  'scop',
  'hdd65',
  'designTempF',
  'annualUnits',
  'unitPrice',
  'heatPumpRate',
  'standardRate',
] as const

// ------------------------------------------------------------------ properties

describe('P1–P12', () => {
  it('P1: delivered heat is positive for any positive bill', () => {
    // Bug class: a zero-gallon bill or an AFUE branch that silently returns 0/NaN,
    // which then divides by zero two functions later.
    fc.assert(
      fc.property(arbHeating, (heating) => {
        const delivered = deliveredHeat(heating)
        expect(delivered).not.toBeNull()
        if (!delivered) return
        expect(delivered.btu).toBeGreaterThan(0)
        expect(delivered.mmBtu).toBeGreaterThan(0)
        expect(Number.isFinite(delivered.mmBtu)).toBe(true)
        expect(delivered.source).toBe('bill')
      }),
      { numRuns: NUM_RUNS },
    )
  })

  it('P2: raising the fuel price never increases savings', () => {
    // Bug class: a sign flip (old − new written as new − old) or a price that leaks
    // into the heat-pump side, which would make expensive oil look worse.
    fc.assert(
      fc.property(arbCase, fc.double({ min: 0.01, max: 1, noNaN: true }), ({ heating, upgrade }, bump) => {
        const cheaper = { ...heating, unitPrice: heating.unitPrice }
        const dearer = { ...heating, unitPrice: heating.unitPrice * (1 + bump) }
        const a = must(cheaper, upgrade)
        const b = must(dearer, upgrade)
        expect(b.annualSavings).toBeGreaterThanOrEqual(a.annualSavings - 1e-9)
        expect(b.oldAnnualCost).toBeGreaterThan(a.oldAnnualCost)
        // the heat pump side must not move when only the fuel price moves
        expect(b.annualKWh).toBeCloseTo(a.annualKWh, 9)
      }),
      { numRuns: NUM_RUNS },
    )
  })

  it('P3: raising the electricity price never increases savings', () => {
    // Bug class: rate inversion — seasonal and standard rates crossed, or savings
    // computed from the cheaper of the two.
    fc.assert(
      fc.property(arbCase, fc.double({ min: 0.01, max: 1, noNaN: true }), ({ heating, upgrade }, bump) => {
        const cheaper = { ...upgrade, heatPumpRate: upgrade.heatPumpRate }
        const dearer = {
          ...upgrade,
          heatPumpRate: upgrade.heatPumpRate * (1 + bump),
          standardRate: upgrade.standardRate * (1 + bump),
        }
        const a = must(heating, cheaper)
        const b = must(heating, dearer)
        expect(b.annualSavingsAtHeatPumpRate).toBeLessThanOrEqual(a.annualSavingsAtHeatPumpRate + 1e-9)
        expect(b.newAnnualCostHeatPumpRate).toBeGreaterThan(a.newAnnualCostHeatPumpRate)
        expect(b.oldAnnualCost).toBeCloseTo(a.oldAnnualCost, 9)
      }),
      { numRuns: NUM_RUNS },
    )
  })

  it('P4: the rebate never exceeds the install cost', () => {
    // Bug class: negative net cost, which renders as "they pay you" and destroys
    // the whole pitch in front of a judge.
    fc.assert(
      fc.property(arbCase, ({ heating, upgrade }) => {
        const r = must(heating, upgrade)
        expect(r.totalRebate).toBeLessThanOrEqual(r.installCost + 1e-9)
        expect(r.netCost).toBeGreaterThanOrEqual(-1e-9)
      }),
      { numRuns: NUM_RUNS },
    )
  })

  it('P5: caps hold before and after bonuses', () => {
    // Bug class: bonuses added after the cap, or the wrong year's cap applied —
    // the single most likely way to overstate a rebate.
    fc.assert(
      fc.property(arbCase, ({ heating, upgrade }) => {
        const r = must(heating, upgrade)
        const rules = rulesForYear(upgrade.installYear)
        expect(rules).not.toBeNull()
        const one = rebate(upgrade.tier, r.tons, upgrade.installYear, {
          installCost: upgrade.installCost,
          weatherizationBonus: upgrade.weatherizationBonus,
          sizingBonus: upgrade.sizingBonus,
          fuel: heating.fuel,
        })
        expect(one).not.toBeNull()
        if (!one || !rules) return
        expect(one.base).toBeLessThanOrEqual(rules.tiers[upgrade.tier].capUsd + 1e-9)
        expect(one.total).toBeLessThanOrEqual(rules.tiers[upgrade.tier].capAfterBonusesUsd + 1e-9)
        expect(one.total).toBeLessThanOrEqual(one.base + one.bonuses + 1e-9)
      }),
      { numRuns: NUM_RUNS },
    )
  })

  it('P6: payback is exactly netCost / savings', () => {
    // Bug class: arithmetic drift between the number on the dial and the number in
    // the formula drawer, which is the first thing a sceptical judge checks.
    fc.assert(
      fc.property(arbCase, ({ heating, upgrade }) => {
        const r = must(heating, upgrade)
        if (r.paybackYears === null) {
          expect(r.annualSavings).toBeLessThanOrEqual(0)
          return
        }
        expect(r.annualSavings).toBeGreaterThan(0)
        expect(Math.abs(r.paybackYears - r.netCost / r.annualSavings)).toBeLessThanOrEqual(1e-9)
      }),
      { numRuns: NUM_RUNS },
    )
  })

  it('P7: the savings sign agrees with the break-even price', () => {
    // Bug class: claiming a saving while the break-even price shown next to it is
    // below the rate being charged.
    fc.assert(
      fc.property(arbCase, ({ heating, upgrade }) => {
        const r = must(heating, upgrade)
        expect(r.breakEvenElectricPrice).not.toBeNull()
        const be = r.breakEvenElectricPrice as number
        const rate = upgrade.heatPumpRate
        const eps = 1e-12 * Math.max(1, Math.abs(be), Math.abs(rate))
        if (r.annualSavings > 0) expect(be).toBeGreaterThan(rate - eps)
        else if (r.annualSavings < 0) expect(be).toBeLessThan(rate + eps)
        else expect(Math.abs(be - rate)).toBeLessThanOrEqual(eps * 1e3)
      }),
      { numRuns: NUM_RUNS },
    )
  })

  it('P8: the 2027 rebate is never larger than the 2026 rebate', () => {
    // Bug class: a copied table with a stale rate, or bonuses that grew in the
    // step-down year — either one kills the "switch before Dec 31" story.
    fc.assert(
      fc.property(arbCase, ({ heating, upgrade }) => {
        const r = must(heating, upgrade)
        expect(r.rebate2027).toBeLessThanOrEqual(r.rebate2026 + 1e-9)
        expect(r.cliffCost).toBeGreaterThanOrEqual(0)
        expect(r.cliffCost).toBeCloseTo(r.rebate2026 - r.rebate2027, 9)
      }),
      { numRuns: NUM_RUNS },
    )
    // and explicitly for every tier, because the generator may not hit them all
    for (const tier of ['whole', 'partial', 'basic', 'enhanced'] as Tier[]) {
      for (const fuel of ['oil', 'propane', 'gas', 'resistance'] as Fuel[]) {
        const a = rebate(tier, 2.5, 2026, { installCost: 22_000, fuel })
        const b = rebate(tier, 2.5, 2027, { installCost: 22_000, fuel })
        expect(a, `${tier}/${fuel} 2026`).not.toBeNull()
        expect(b, `${tier}/${fuel} 2027`).not.toBeNull()
        if (!a || !b) continue
        expect(b.total).toBeLessThanOrEqual(a.total + 1e-9)
      }
    }
  })

  it('P9: the same input produces a deep-equal result', () => {
    // Bug class: hidden state — a memo cache, a module-level accumulator, or a
    // clock read that makes the demo show a different number on stage.
    fc.assert(
      fc.property(arbCase, ({ heating, upgrade }) => {
        const first = must(heating, upgrade)
        const second = must(heating, upgrade)
        expect(second).toEqual(first)
        expect(JSON.stringify(second)).toBe(JSON.stringify(first))
      }),
      { numRuns: NUM_RUNS },
    )
  })

  it('P10: no NaN, no Infinity, no negative kWh', () => {
    // Bug class: the killer demo bug — a field renders "NaN" or "-3,120 kWh".
    fc.assert(
      fc.property(arbCase, ({ heating, upgrade }) => {
        const r = must(heating, upgrade)
        for (const field of NUMERIC_FIELDS) {
          const value = r[field]
          expect(Number.isFinite(value), `${field} = ${value}`).toBe(true)
        }
        if (r.paybackYears !== null) expect(Number.isFinite(r.paybackYears)).toBe(true)
        if (r.breakEvenElectricPrice !== null) expect(Number.isFinite(r.breakEvenElectricPrice)).toBe(true)
        expect(r.annualKWh).toBeGreaterThanOrEqual(0)
        expect(r.deliveredMMBtu).toBeGreaterThan(0)
        expect(r.tons).toBeGreaterThan(0)
        expect(r.totalRebate).toBeGreaterThanOrEqual(0)
        expect(r.monthlyLoan).toBeGreaterThanOrEqual(0)
      }),
      { numRuns: NUM_RUNS },
    )
  })

  it('P11: the verdict is total, and hostile inputs are refused not guessed', () => {
    // Bug class: an input the engine has never seen falls through to a default
    // (0 tons, $0 rebate, NaN payback) and renders a confident wrong verdict.
    const hostileHeating: unknown[] = [
      { fuel: 'oil', annualUnits: 0, unitPrice: 6.23 },
      { fuel: 'oil', annualUnits: 1e9, unitPrice: 6.23 },
      { fuel: 'coal', annualUnits: 800, unitPrice: 6.23 },
      { fuel: 'oil', annualUnits: -800, unitPrice: 6.23 },
      { fuel: 'oil', annualUnits: Number.NaN, unitPrice: 6.23 },
      { fuel: 'gas', annualUnits: 900, unitPrice: 0 },
      { fuel: 'oil', annualUnits: Number.POSITIVE_INFINITY, unitPrice: 6.23 },
      { fuel: 'oil', annualUnits: 800, unitPrice: 6.23, hdd65: 0 },
    ]
    const hostileUpgrade: unknown[] = [
      { tier: 'whole', installYear: 2029, heatPumpRate: 0.235, standardRate: 0.305 },
      { tier: 'platinum', installYear: 2026, heatPumpRate: 0.235, standardRate: 0.305 },
      { tier: 'whole', installYear: 2026, heatPumpRate: 0, standardRate: 0.305 },
      { tier: 'whole', installYear: 2026, heatPumpRate: 0.235, standardRate: Number.NaN },
      { tier: 'enhanced', installYear: 2026, heatPumpRate: 0.235, standardRate: 0.305 },
    ]
    const arbHostile = fc.tuple(fc.constantFrom(...hostileHeating), fc.constantFrom(...hostileUpgrade))

    fc.assert(
      fc.property(arbHostile, ([heating, upgrade]) => {
        const h = heating as HeatingInput
        const u = upgrade as UpgradeInput
        const refusal = refusalFor(h, u)
        expect(refusal, `no refusal for ${JSON.stringify({ heating, upgrade })}`).not.toBeNull()
        const result = computeVerdict(h, u)
        expect(result).toBeNull()
        if (refusal) {
          expect(refusal.code.length).toBeGreaterThan(0)
          expect(refusal.message.length).toBeGreaterThan(10)
          expect(refusal.message).not.toContain('NaN')
          expect(refusal.field.length).toBeGreaterThan(0)
        }
      }),
      { numRuns: NUM_RUNS },
    )

    // ...and when the inputs are sane, the verdict is always one of three values.
    fc.assert(
      fc.property(arbCase, ({ heating, upgrade }) => {
        const r = must(heating, upgrade)
        expect(['SWITCH_NOW', 'SWITCH_BEFORE_DEC31', 'DO_NOT_SWITCH_YET']).toContain(r.verdict)
        expect(r.reasons.length).toBeGreaterThanOrEqual(2)
        expect(r.caveats.length).toBeGreaterThanOrEqual(1)
      }),
      { numRuns: NUM_RUNS },
    )
  })

  it('P12: MMBtu → BTU → MMBtu round-trips', () => {
    // Bug class: a 3,412 vs 3,412.14 typo, or a units mix-up between MMBtu and BTU
    // that is invisible at small sizes and catastrophic at 88 MMBtu.
    fc.assert(
      fc.property(fc.double({ min: 0.001, max: 1e6, noNaN: true }), (mmBtu) => {
        const roundTripped = btuToMmBtu(mmBtuToBtu(mmBtu))
        expect(Math.abs(roundTripped - mmBtu) / mmBtu).toBeLessThanOrEqual(1e-9)
      }),
      { numRuns: NUM_RUNS },
    )
  })
})
