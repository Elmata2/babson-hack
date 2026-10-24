/**
 * @built F-36 the sentences under the money cards, checked against the numbers
 *
 * A one-line summary is the easiest place in the product to tell a small lie:
 * round the rebate up, call a loss "no saving", print a payback that the verdict
 * itself refused. These tests pin the four cases the verdict engine can return and
 * the municipal-light-plant refusal, with the exact figures the cards render.
 */

import { describe, expect, it } from 'vitest'

import { moneySummary, rebateBasis } from '../money-summary'

const base = {
  totalRebate: 11_500,
  installCost: 22_000,
  netCost: 10_500,
  annualSavings: 2_723,
  paybackYears: 3.86,
  breakEvenElectricPrice: null,
  tier: 'enhanced' as const,
  installYear: 2026 as const,
  tons: 3,
}

describe('the three sentences', () => {
  it('shows the subtraction on the net-cost card, with the same figures as the card', () => {
    const { netCost } = moneySummary(base)
    expect(netCost).toBe('$22,000 install − $11,500 rebate = $10,500 you pay.')
  })

  it('shows the division on the payback card', () => {
    const { payback } = moneySummary(base)
    expect(payback).toBe('$10,500 ÷ $2,723 a year = 3.9 years to break even.')
  })

  it('says what the rebate rests on, so the number is not a mystery', () => {
    expect(moneySummary(base).rebate).toBe(
      '$11,500 back on a $22,000 install — 2026 rules · enhanced tier · 3.0 tons.',
    )
    expect(rebateBasis(base)).toBe('2026 rules · enhanced tier · 3.0 tons')
  })

  it('uses the 2027 rules and the standard tier when that is what was bought', () => {
    const { rebate } = moneySummary({ ...base, installYear: 2027, tier: 'basic', tons: 2.5 })
    expect(rebate).toContain('2027 rules')
    expect(rebate).toContain('standard tier')
    expect(rebate).toContain('2.5 tons')
  })

  it('says when the rebate covers the whole install, instead of a negative net cost', () => {
    const { rebate, payback } = moneySummary({ ...base, totalRebate: 22_000, netCost: 0 })
    expect(rebate).toBe('The program pays the whole $22,000 install: 2026 rules · enhanced tier · 3.0 tons.')
    expect(payback).toContain('Nothing to pay back')
    expect(payback).toContain('$2,723')
  })
})

describe('a verdict that says not yet', () => {
  it('calls a loss a loss, and names the break-even price', () => {
    const { payback } = moneySummary({
      ...base,
      annualSavings: -480,
      paybackYears: null,
      breakEvenElectricPrice: 0.184,
      netCost: 10_500,
    })
    expect(payback).toBe('No payback: running costs rise about $480 a year; electricity would need to be under 18.4¢.')
    expect(payback).not.toContain('years to break even')
  })

  it('calls a wash a wash, without inventing a break-even it does not have', () => {
    const { payback } = moneySummary({ ...base, annualSavings: 0, paybackYears: null })
    expect(payback).toBe('No payback: the running cost is a wash.')
  })

  it('never renders a payback the engine refused to compute', () => {
    const { payback } = moneySummary({ ...base, paybackYears: null })
    expect(payback).toContain('No payback is calculated')
    expect(payback).not.toMatch(/\d+\.\d years/)
  })
})

describe('a municipal light plant town', () => {
  it('says why the rebate is missing, and who to ask', () => {
    const { rebate, netCost, payback } = moneySummary(base, { noMassSave: true, utilityName: 'Wellesley Municipal Light Plant' })
    expect(rebate).toContain('Wellesley Municipal Light Plant is not a Mass Save electric sponsor')
    expect(netCost).toContain('$22,000')
    expect(payback).toContain('left blank')
  })

  it('does not name a utility it was not given, and reads as a sentence', () => {
    const { rebate } = moneySummary(base, { noMassSave: true })
    expect(rebate).toBe(
      'Nothing available: this town is served by a municipal light plant, which is not a Mass Save electric sponsor — so no rebate is quoted here.',
    )
  })

  it('treats a generic "Municipal light plant" label as the plain case, not a proper noun', () => {
    const { rebate } = moneySummary(base, { noMassSave: true, utilityName: 'Municipal light plant' })
    expect(rebate).toContain('this town is served by a municipal light plant')
    expect(rebate).not.toContain('Municipal light plant is not')
  })

  it('never shows a rebate or a payback in that town', () => {
    const summary = moneySummary(base, { noMassSave: true })
    expect(summary.rebate).not.toContain('$11,500')
    expect(summary.payback).not.toMatch(/years to break even/)
  })
})

describe('the sentences never disagree with the cards', () => {
  it('rounds the same way the cards do', () => {
    const summary = moneySummary({ ...base, totalRebate: 11_500.4, netCost: 10_499.6 })
    expect(summary.netCost).toContain('$11,500')
    expect(summary.netCost).toContain('$10,500')
  })
})
