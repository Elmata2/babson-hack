/**
 * @built F-37 the cash-flow sentence is honest in both directions
 *
 * R6.2 and R7.3 together mean the loss branch cannot be a footnote and cannot be
 * softer language than the gain: same sentence shape, same numbers, opposite
 * direction. These tests pin the three branches and the guarantee that the tone
 * always agrees with the sign of the engine's difference.
 */

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { cashFlowView, type CashFlowInput } from '../cash-flow'

const NUM_RUNS = 200

/** The golden anchor: $167.26 a month borrowed, $226.91 a month saved. */
const ANCHOR: CashFlowInput = {
  netCost: 14_050,
  monthlyLoan: 167.261_904_761_904_76,
  monthlySavings: 226.913_872_160_311_85,
  monthlyCashFlow: 59.651_967_398_407_06,
  months: 84,
  apr: 0,
  paybackYears: 5.159_813_819_166_392,
}

describe('cashFlowView — ahead', () => {
  it('says the household is ahead, with both figures and the difference', () => {
    const view = cashFlowView(ANCHOR)
    expect(view.tone).toBe('ahead')
    expect(view.covered).toBe(true)
    expect(view.monthlyDelta).toBe(60)
    expect(view.sentence).toContain('$167')
    expect(view.sentence).toContain('$227')
    expect(view.sentence).toContain('$60 ahead')
    expect(view.sentence).toContain('84 months at 0%')
  })
})

describe('cashFlowView — short but still saving', () => {
  const short: CashFlowInput = {
    ...ANCHOR,
    monthlySavings: 120,
    monthlyCashFlow: 120 - ANCHOR.monthlyLoan,
  }

  it('names the shortfall and the month the loan ends', () => {
    const view = cashFlowView(short)
    expect(view.tone).toBe('short')
    expect(view.covered).toBe(false)
    expect(view.label).toBe('Short each month')
    expect(view.sentence).toContain('$47 short')
    expect(view.sentence).toContain('month 84')
  })

  it('uses the same shape as the gain: payment, saving, difference', () => {
    const gain = cashFlowView(ANCHOR).sentence
    const loss = cashFlowView(short).sentence
    expect(gain.startsWith('The loan is')).toBe(true)
    expect(loss.startsWith('The loan is')).toBe(true)
  })
})

describe('cashFlowView — the heat pump costs money to run', () => {
  const losing: CashFlowInput = {
    ...ANCHOR,
    monthlySavings: -30.5,
    monthlyCashFlow: -30.5 - ANCHOR.monthlyLoan,
    paybackYears: null,
  }

  it('adds the running loss to the payment and says there is no payback', () => {
    const view = cashFlowView(losing)
    expect(view.tone).toBe('short')
    expect(view.covered).toBe(false)
    expect(view.label).toBe('Costs you monthly')
    expect(view.sentence).toContain('$31 a month more to run')
    expect(view.sentence).toContain('$198')
    expect(view.sentence).toContain('no payback')
  })

  it('never prints a negative dollar figure', () => {
    expect(cashFlowView(losing).sentence).not.toMatch(/-\$/)
    expect(cashFlowView(losing).sentence).not.toMatch(/\$-/)
  })
})

describe('cashFlowView — exactly even', () => {
  it('calls it even rather than a gain', () => {
    const view = cashFlowView({ ...ANCHOR, monthlySavings: ANCHOR.monthlyLoan, monthlyCashFlow: 0 })
    expect(view.tone).toBe('level')
    expect(view.covered).toBe(true)
    expect(view.sentence).toContain('the same number')
  })
})

describe('cashFlowView — the tone always agrees with the sign', () => {
  it('for any monthly difference', () => {
    fc.assert(
      fc.property(fc.double({ min: -400, max: 400, noNaN: true }), (monthlyCashFlow) => {
        const view = cashFlowView({ ...ANCHOR, monthlyCashFlow })
        if (Math.abs(monthlyCashFlow) <= 0.005) {
          expect(view.tone).toBe('level')
          return
        }
        expect(view.tone).toBe(monthlyCashFlow > 0 ? 'ahead' : 'short')
        expect(view.covered).toBe(monthlyCashFlow > 0)
      }),
      { numRuns: NUM_RUNS },
    )
  })
})
