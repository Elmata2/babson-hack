/**
 * @built F-26a the second price band: a season, not a sanity check
 *
 * The hard band in `RANGES` catches a misread decimal. It cannot catch $3.79/gal,
 * because last winter's oil really was $3.55. So the DOER survey week of
 * 2026-10-19 gives a second band that only warns — the number is kept, the user is
 * told it may be an old receipt, and nothing is blocked.
 */

import { describe, expect, it } from 'vitest'

import {
  RANGES,
  SEASONAL_PRICE,
  SEASONAL_PRICE_AS_OF,
  UNIT_BY_FUEL,
  readBill,
} from '../plausibility'
import type { BillFuel } from '../types'

const NOW = Date.parse('2026-10-24T12:00:00Z')

function annualBill(fuel: BillFuel, price: number): Record<string, unknown> {
  const quantity: Record<BillFuel, number> = { oil: 800, propane: 900, gas: 900, resistance: 8_000 }
  return {
    fuel,
    quantity: quantity[fuel],
    unit: UNIT_BY_FUEL[fuel],
    price_per_unit: price,
    billing_period: 'year',
    period_start: '2025-10-19',
    period_end: '2026-10-18',
    document_date: '2026-09-30',
    confidence: 'high',
  }
}

describe('the seasonal band', () => {
  it('is the survey week the steering file names', () => {
    expect(SEASONAL_PRICE_AS_OF).toBe('2026-10-19')
  })

  it('sits inside the hard band, so a warning can never be the only check', () => {
    for (const fuel of Object.keys(SEASONAL_PRICE) as BillFuel[]) {
      const [softLow, softHigh] = SEASONAL_PRICE[fuel]
      const [hardLow, hardHigh] = RANGES[fuel].price
      expect(softLow).toBeLessThan(softHigh)
      expect(softLow).toBeGreaterThanOrEqual(hardLow)
      expect(softHigh).toBeLessThanOrEqual(hardHigh)
    }
  })
})

describe('a price outside the season but inside reality', () => {
  it('keeps last winter oil at $3.79 and says it may be an old receipt', () => {
    const result = readBill(annualBill('oil', 3.79), NOW)
    if (!result.ok) throw new Error('expected a bill')
    expect(result.bill.price.value).toBe(3.79)
    const flag = result.bill.flags.find((f) => f.code === 'stale_price')
    expect(flag?.field).toBe('price')
    expect(flag?.message).toContain('3.79')
    expect(flag?.message).toMatch(/below this season's Massachusetts range/)
    expect(flag?.message).toContain('5.20')
    expect(flag?.message).toContain('7.20')
    expect(flag?.message).toMatch(/old receipt/)
  })

  it('does not block: the bill stays ready', () => {
    const result = readBill(annualBill('oil', 3.79), NOW)
    if (!result.ok) throw new Error('expected a bill')
    expect(result.bill.ready).toBe(true)
    expect(result.bill.flags.map((f) => f.code)).not.toContain('out_of_range')
  })

  it('does not warn inside the band', () => {
    for (const [fuel, price] of [
      ['oil', 6.23],
      ['propane', 3.91],
      ['gas', 1.62],
      ['resistance', 0.3049],
    ] as [BillFuel, number][]) {
      const result = readBill(annualBill(fuel, price), NOW)
      if (!result.ok) throw new Error('expected a bill')
      expect(result.bill.flags.map((f) => f.code), `${fuel} ${price}`).not.toContain('stale_price')
    }
  })

  it('warns above the band too, and still keeps the number', () => {
    const result = readBill(annualBill('oil', 8.5), NOW)
    if (!result.ok) throw new Error('expected a bill')
    expect(result.bill.price.value).toBe(8.5)
    expect(result.bill.flags.find((f) => f.code === 'stale_price')?.message).toMatch(/above/)
  })

  it('has a band for all four fuels', () => {
    for (const [fuel, price] of [
      ['propane', 2.5],
      ['gas', 0.55],
      ['resistance', 0.62],
    ] as [BillFuel, number][]) {
      const result = readBill(annualBill(fuel, price), NOW)
      if (!result.ok) throw new Error('expected a bill')
      expect(result.bill.price.value, fuel).toBe(price)
      expect(result.bill.flags.map((f) => f.code), fuel).toContain('stale_price')
    }
  })

  it('leaves a misread decimal to the hard band, which does block', () => {
    const result = readBill(annualBill('oil', 0.06), NOW)
    if (!result.ok) throw new Error('expected a bill')
    expect(result.bill.price.value).toBeNull()
    expect(result.bill.flags.map((f) => f.code)).toContain('out_of_range')
    expect(result.bill.flags.map((f) => f.code)).not.toContain('stale_price')
  })
})
