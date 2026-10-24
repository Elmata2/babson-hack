/**
 * @built F-37 cash flow: the loan payment, the monthly saving, and the difference
 *
 * These tests protect the two things R7.3 asks for and the one it forbids:
 * `monthly = netCost / 84` at 0%, `monthlyCashFlow = monthlySavings − monthlyLoan`
 * exactly, and a screen that never calls a shortfall "in your pocket".
 */

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { cashFlow, heatLoan } from '../finance'
import type { CashFlow } from '../types'

const NUM_RUNS = 200

/** Hand-computed anchor: net cost $14,050, savings $2,722.97/yr. */
const ANCHOR: CashFlow = {
  monthlyLoan: 14_050 / 84,
  monthlySavings: 2_722.966_465_923_742_4 / 12,
  monthlyCashFlow: 2_722.966_465_923_742_4 / 12 - 14_050 / 84,
}

describe('cashFlow()', () => {
  it('reproduces the anchor month for month', () => {
    const flow = cashFlow(14_050, 2_722.966_465_923_742_4)
    expect(flow).not.toBeNull()
    if (!flow) return
    expect(flow.monthlyLoan).toBeCloseTo(ANCHOR.monthlyLoan, 9)
    expect(flow.monthlySavings).toBeCloseTo(ANCHOR.monthlySavings, 9)
    expect(flow.monthlyCashFlow).toBeCloseTo(ANCHOR.monthlyCashFlow, 9)
    expect(flow.monthlyCashFlow).toBeCloseTo(59.651_967_398_407, 9)
  })

  it('is exactly the HEAT Loan payment: netCost ÷ 84 at 0%', () => {
    expect(heatLoan(14_050)?.monthly).toBe(14_050 / 84)
    expect(cashFlow(14_050, 0)?.monthlyLoan).toBe(14_050 / 84)
  })

  it('refuses a cost that is not a quantity', () => {
    expect(cashFlow(-1, 1_000)).toBeNull()
    expect(cashFlow(Number.NaN, 1_000)).toBeNull()
    expect(cashFlow(10_000, Number.POSITIVE_INFINITY)).toBeNull()
  })

  it('carries a loss as a negative saving, never as a gain', () => {
    const flow = cashFlow(10_000, -1_200)
    expect(flow).not.toBeNull()
    if (!flow) return
    expect(flow.monthlySavings).toBe(-100)
    expect(flow.monthlyCashFlow).toBeLessThan(0)
  })

  it('for every realistic cost and saving: the difference is the difference', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 250_000, noNaN: true }),
        fc.double({ min: -20_000, max: 60_000, noNaN: true }),
        (netCost, annualSavings) => {
          const flow = cashFlow(netCost, annualSavings)
          expect(flow).not.toBeNull()
          if (!flow) return
          expect(flow.monthlyLoan).toBeCloseTo(netCost / 84, 9)
          expect(flow.monthlySavings).toBeCloseTo(annualSavings / 12, 9)
          expect(flow.monthlyCashFlow).toBeCloseTo(flow.monthlySavings - flow.monthlyLoan, 9)
        },
      ),
      { numRuns: NUM_RUNS },
    )
  })
})
