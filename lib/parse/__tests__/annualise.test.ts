/**
 * @built F-26a the annualiser, tested as a decision: five methods, one refusal,
 * and a rule that no path may produce a number outside the fuel's annual band.
 *
 * The tests are written against `annualise` directly, with Boston's baked
 * heating-year shares, so a change to the climate table shows up here as a
 * changed number rather than as a surprise in a verdict.
 */

import { describe, expect, it } from 'vitest'

import {
  METHOD_CONFIDENCE,
  annualise,
  heatingShareOfMonth,
  monthOf,
  sanitiseHistory,
  type AnnualiseInput,
} from '../annualise'
import { DEFAULT_HEAT_YEAR } from '../heat-year'
import { RANGES } from '../plausibility'
import type { AnnualMethod } from '../types'

const BOSTON = DEFAULT_HEAT_YEAR
const MONTH_SHARES = [...BOSTON.monthShares]

function input(overrides: Partial<AnnualiseInput> = {}): AnnualiseInput {
  return {
    fuel: 'oil',
    quantity: 187.4,
    documentPeriod: 'delivery',
    documentDate: '2026-01-14',
    usageHistory: null,
    degreeDays: null,
    deliveriesPerSeason: null,
    tankSizeGal: null,
    heating: true,
    bounds: RANGES.oil.units,
    seasonHdd: BOSTON.seasonHdd,
    monthShares: MONTH_SHARES,
    ...overrides,
  }
}

/** 12 monthly bars, oldest first: a plausible year for a resistance-heated house. */
const YEAR_OF_BARS = [620, 890, 1340, 1620, 1450, 1180, 720, 480, 420, 510, 540, 470]

describe('the heating-year table the decision rests on', () => {
  it('is the baked Boston shape: 12 shares, January the largest, July zero', () => {
    expect(MONTH_SHARES).toHaveLength(12)
    expect(MONTH_SHARES[0]).toBeCloseTo(0.191, 3)
    expect(MONTH_SHARES[6]).toBe(0)
    expect(MONTH_SHARES[7]).toBe(0)
    expect(MONTH_SHARES.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 2)
    expect(BOSTON.seasonHdd).toBeGreaterThan(5_000)
    expect(BOSTON.seasonHdd).toBeLessThan(6_500)
  })

  it('reads the month from the printed date only', () => {
    expect(monthOf('2026-01-14')).toBe(1)
    expect(monthOf('2026-12-01')).toBe(12)
    expect(monthOf('14/01/2026')).toBeNull()
    expect(monthOf(null)).toBeNull()
    expect(monthOf('2026-13-01')).toBeNull()
  })

  it('has a share for every month and none for a nonsense month', () => {
    expect(heatingShareOfMonth(1, MONTH_SHARES)).toBeCloseTo(0.191, 3)
    expect(heatingShareOfMonth(7, MONTH_SHARES)).toBe(0)
    expect(heatingShareOfMonth(null, MONTH_SHARES)).toBeNull()
    expect(heatingShareOfMonth(1, [0.5])).toBeNull()
  })
})

describe('1 — printed history', () => {
  it('sums the bars and claims the highest confidence', () => {
    const outcome = annualise(
      input({ quantity: 1043, usageHistory: YEAR_OF_BARS, historyKind: 'numbers', bounds: RANGES.resistance.units }),
    )
    expect(outcome.refusal).toBeNull()
    expect(outcome.estimate?.method).toBe('printed_history')
    expect(outcome.estimate?.value).toBe(10_240)
    expect(outcome.estimate?.confidence).toBe(METHOD_CONFIDENCE.printed_history)
    expect(outcome.estimate?.assumptions.join(' ')).not.toMatch(/bar heights/)
  })

  it('wins over degree days, because a printed year needs no ratio', () => {
    const outcome = annualise(
      input({ quantity: 1_043, usageHistory: YEAR_OF_BARS, degreeDays: 1183, bounds: RANGES.resistance.units }),
    )
    expect(outcome.estimate?.method).toBe('printed_history')
  })

  it('drops the oldest of 13 bars so the total is exactly one year', () => {
    const thirteen = [999, ...YEAR_OF_BARS]
    const outcome = annualise(input({ quantity: 1043, usageHistory: thirteen, bounds: RANGES.resistance.units }))
    expect(outcome.estimate?.method).toBe('printed_history')
    expect(outcome.estimate?.value).toBe(10_240)
    expect(outcome.estimate?.assumptions.join(' ')).toMatch(/13 months/i)
  })

  it('does not treat 11 bars as a year', () => {
    const eleven = YEAR_OF_BARS.slice(0, 11)
    const outcome = annualise(input({ quantity: 1043, usageHistory: eleven, bounds: RANGES.resistance.units }))
    expect(outcome.estimate?.method).not.toBe('printed_history')
    expect(outcome.warnings.map((w) => w.code)).toContain('history_unusable')
  })

  it('rejects nulls and strings instead of coercing them', () => {
    for (const poisoned of [
      [...YEAR_OF_BARS.slice(0, 11), null],
      [...YEAR_OF_BARS.slice(0, 11), '470'],
      [...YEAR_OF_BARS.slice(0, 11), -1],
    ]) {
      expect(sanitiseHistory(poisoned)).toBeNull()
      const outcome = annualise(input({ quantity: 1043, usageHistory: poisoned, bounds: RANGES.resistance.units }))
      expect(outcome.estimate?.method).not.toBe('printed_history')
      expect(outcome.warnings.map((w) => w.code)).toContain('history_unusable')
    }
  })

  it('does not use a chart that adds up to something no house uses', () => {
    const impossible = Array.from({ length: 12 }, () => 99_999)
    const outcome = annualise(input({ usageHistory: impossible }))
    expect(outcome.estimate).toBeNull()
    expect(outcome.refusal?.code).toBe('needs_fills')
    expect(outcome.warnings.map((w) => w.code)).toContain('history_unusable')
  })
})

describe('2 — degree days printed on the ticket', () => {
  it('scales one delivery by the ratio of seasons', () => {
    const outcome = annualise(input({ degreeDays: 1183 }))
    expect(outcome.estimate?.method).toBe('degree_days')
    // 187.4 × (5693.7 / 1183) ≈ 902 gal/yr
    expect(outcome.estimate?.value).toBeCloseTo(902, 0)
    expect(outcome.estimate?.confidence).toBe(0.7)
    expect(outcome.estimate?.assumptions.join(' ')).toMatch(/degree days/i)
    expect(outcome.estimate?.note).toMatch(/degree days/i)
  })

  it('ignores degree days outside the band a delivery can cover', () => {
    for (const degreeDays of [99, 3_001, Number.NaN, '1183']) {
      const outcome = annualise(input({ degreeDays }))
      expect(outcome.estimate?.method).not.toBe('degree_days')
    }
  })
})

describe('3 — tank cadence, the household own number', () => {
  it('multiplies the delivery by the fill count the user confirmed', () => {
    const outcome = annualise(input({ quantity: 190, deliveriesPerSeason: 4, tankSizeGal: 275 }))
    expect(outcome.estimate?.method).toBe('tank_cadence')
    expect(outcome.estimate?.value).toBe(760)
    expect(outcome.estimate?.confidence).toBe(0.55)
    expect(outcome.estimate?.assumptions.join(' ')).toMatch(/4 fills/)
    expect(outcome.warnings).toHaveLength(0)
  })

  it('only accepts a whole number of fills a season can hold', () => {
    for (const deliveriesPerSeason of [1, 9, 3.5, '4', null]) {
      const outcome = annualise(input({ quantity: 190, deliveriesPerSeason }))
      expect(outcome.estimate?.method).not.toBe('tank_cadence')
    }
  })

  it('flags a cadence that does not fit the tank on the ticket', () => {
    // 4 fills × 900 gal = 3,600 gal against a 275 gal tank: 13 tankfuls.
    const outcome = annualise(input({ quantity: 900, deliveriesPerSeason: 4, tankSizeGal: 275 }))
    expect(outcome.estimate?.method).toBe('tank_cadence')
    expect(outcome.warnings.map((w) => w.code)).toContain('tank_mismatch')
  })
})

describe('4 — one winter month scaled by its share of the heating year', () => {
  it('divides January by 19.1%, not by 12', () => {
    const outcome = annualise(
      input({
        fuel: 'gas',
        quantity: 142,
        documentPeriod: 'month',
        periodStart: '2026-01-01',
        periodEnd: '2026-01-31',
        bounds: RANGES.gas.units,
      }),
    )
    expect(outcome.estimate?.method).toBe('hdd_scaled')
    expect(outcome.estimate?.value).toBeCloseTo(142 / 0.191, 4)
    expect(outcome.estimate?.confidence).toBe(0.5)
    expect(outcome.estimate?.assumptions.join(' ')).toMatch(/19\.1%/)
  })

  it('is not available to a month below the 8% threshold', () => {
    const outcome = annualise(
      input({ fuel: 'gas', quantity: 30, documentPeriod: 'month', documentDate: '2026-10-12', bounds: RANGES.gas.units }),
    )
    expect(outcome.estimate?.method).not.toBe('hdd_scaled')
  })

  it('refuses a summer month instead of inventing a winter from it', () => {
    // A bill dated in June covers May: the service days, not the statement month, decide.
    for (const month of ['05', '06', '07', '08', '09']) {
      const outcome = annualise(
        input({
          fuel: 'gas',
          quantity: 18,
          documentPeriod: 'month',
          periodStart: `2026-${month}-01`,
          periodEnd: `2026-${month}-28`,
          bounds: RANGES.gas.units,
        }),
      )
      expect(outcome.estimate).toBeNull()
      expect(outcome.refusal?.code).toBe('summer_month')
      expect(outcome.refusal?.message).toMatch(/says nothing about your heating year/)
    }
  })
})

describe('5 — flat × 12, only where it is true', () => {
  it('is used for fuel that is not the heat source', () => {
    const outcome = annualise(
      input({
        fuel: 'resistance',
        quantity: 470,
        documentPeriod: 'month',
        documentDate: '2026-07-08',
        heating: false,
        bounds: RANGES.resistance.units,
      }),
    )
    expect(outcome.estimate?.method).toBe('monthly_x12')
    expect(outcome.estimate?.value).toBe(5_640)
    expect(outcome.estimate?.confidence).toBe(0.4)
  })

  it('is used when the caller explicitly asks for it', () => {
    const outcome = annualise(
      input({
        fuel: 'gas',
        quantity: 18,
        documentPeriod: 'month',
        documentDate: '2026-07-12',
        forceMonthlyX12: true,
        bounds: RANGES.gas.units,
      }),
    )
    expect(outcome.estimate?.method).toBe('monthly_x12')
    expect(outcome.estimate?.value).toBe(216)
  })

  it('is used for a shoulder month, and says that it understates the winter', () => {
    const outcome = annualise(
      input({ fuel: 'gas', quantity: 24, documentPeriod: 'month', documentDate: '2026-10-20', bounds: RANGES.gas.units }),
    )
    expect(outcome.estimate?.method).toBe('monthly_x12')
    expect(outcome.estimate?.assumptions.join(' ')).toMatch(/shoulder/i)
  })
})

describe('the refusal is a question, not a dead end', () => {
  it('asks how many fills a season when there is only one delivery', () => {
    const outcome = annualise(input({ quantity: 190, tankSizeGal: 275 }))
    expect(outcome.estimate).toBeNull()
    expect(outcome.refusal?.code).toBe('needs_fills')
    expect(outcome.refusal?.message).toMatch(/how many fills/i)
    expect(outcome.refusal?.message).toMatch(/two to eight/i)
  })

  it('will not scale a heating month with no date on it', () => {
    const outcome = annualise(input({ fuel: 'gas', quantity: 142, documentPeriod: 'month', documentDate: null }))
    expect(outcome.estimate).toBeNull()
    expect(outcome.refusal?.code).toBe('partial_period')
  })

  it('says so when there is no quantity at all', () => {
    const outcome = annualise(input({ quantity: null }))
    expect(outcome.estimate).toBeNull()
    expect(outcome.refusal?.code).toBe('missing_quantity')
  })
})

describe('the one invariant no method may break', () => {
  const QUANTITIES: Record<string, number[]> = {
    oil: [50, 190, 400, 900],
    propane: [60, 200, 500, 1_200],
    gas: [10, 40, 142, 600],
    resistance: [400, 1_043, 3_000],
  }
  const FUELS = Object.keys(QUANTITIES) as (keyof typeof RANGES)[]

  it('never returns a value outside RANGES[fuel].units', () => {
    const reached = new Set<AnnualMethod>()
    for (const fuel of FUELS) {
      const [low, high] = RANGES[fuel].units
      for (const quantity of QUANTITIES[fuel]) {
        for (let month = 1; month <= 12; month += 1) {
          for (const heating of [true, false]) {
            const outcome = annualise({
              ...input({
                fuel,
                quantity,
                documentPeriod: 'month',
                documentDate: `2026-${String(month).padStart(2, '0')}-15`,
                heating,
                bounds: [low, high],
              }),
            })
            if (outcome.estimate === null) continue
            reached.add(outcome.estimate.method)
            expect(outcome.estimate.value).toBeGreaterThanOrEqual(low)
            expect(outcome.estimate.value).toBeLessThanOrEqual(high)
            expect(outcome.estimate.confidence).toBeLessThanOrEqual(
              METHOD_CONFIDENCE[outcome.estimate.method],
            )
          }
        }
      }
    }
    // month × 12, one winter month and the summer refusal are all exercised here.
    expect(reached.has('hdd_scaled')).toBe(true)
    expect(reached.has('monthly_x12')).toBe(true)
  })
})
