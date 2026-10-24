/** @built F-73 tests for the supply reader and the one allowed calculation */

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { basicServiceRate, daysUntil, monthlyDifferenceUsd } from '../supply'

const TODAY = new Date(2026, 9, 24, 15, 30)

describe('daysUntil', () => {
  it('counts whole local days', () => {
    expect(daysUntil('2026-12-31', TODAY)).toBe(68)
    expect(daysUntil('2027-03-01', TODAY)).toBe(128)
  })
  it('is 0 on the same day and negative in the past', () => {
    expect(daysUntil('2026-10-24', TODAY)).toBe(0)
    expect(daysUntil('2026-10-23', TODAY)).toBe(-1)
  })
  it('returns NaN for a malformed date', () => {
    expect(daysUntil('soon', TODAY)).toBeNaN()
  })
})

describe('monthlyDifferenceUsd', () => {
  it('matches the worked example', () => {
    const d = monthlyDifferenceUsd({ supplierRateCents: 21, basicServiceCents: 16.074, kwh: 600 })
    expect(d.usd).toBeCloseTo(29.556, 6)
    expect(d.display).toBe('$29.56')
    expect(d.formula).toBe('(21 − 16.074) ¢/kWh × 600 kWh ÷ 100 = $29.56')
  })
  it('is negative when the supplier is cheaper', () => {
    const d = monthlyDifferenceUsd({ supplierRateCents: 15, basicServiceCents: 17.3, kwh: 600 })
    expect(d.usd).toBeLessThan(0)
    expect(d.display).toBe('$13.80')
    expect(d.formula.endsWith('= −$13.80')).toBe(true)
  })
  it('is antisymmetric in (supplier, basic)', () => {
    const rate = fc.double({ min: 0, max: 60, noNaN: true })
    fc.assert(
      fc.property(rate, rate, fc.integer({ min: 0, max: 5000 }), (a, b, kwh) => {
        const ab = monthlyDifferenceUsd({ supplierRateCents: a, basicServiceCents: b, kwh }).usd
        const ba = monthlyDifferenceUsd({ supplierRateCents: b, basicServiceCents: a, kwh }).usd
        expect(ab).toBeCloseTo(-ba, 9)
      }),
    )
  })
})

describe('basicServiceRate', () => {
  it('reads Eversource and National Grid', () => {
    expect(basicServiceRate('eversource')?.centsPerKwh).toBe(17.3)
    expect(basicServiceRate('nationalgrid')?.centsPerKwh).toBe(16.074)
  })
  it('has no number for Unitil, and no record for others', () => {
    expect(basicServiceRate('unitil')?.centsPerKwh).toBeNull()
    expect(basicServiceRate('municipal')).toBeNull()
    expect(basicServiceRate('cape_light')).toBeNull()
  })
})
