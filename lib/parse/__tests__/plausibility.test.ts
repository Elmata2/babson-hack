/**
 * @built F-28 plausibility gate is tested against the shapes a vision model
 * actually returns: a clean annual bill, a monthly bill, one oil delivery, a
 * misread unit, an impossible quantity, and something that is not a bill at all.
 *
 * The tests assert the honesty rules, not just the happy path: an impossible
 * value must not survive, and a partial period must not be multiplied into a year
 * without saying so.
 */

import { describe, expect, it } from 'vitest'

import { readBill, asDocumentDate, RANGES } from '../plausibility'
import { isNotABill, readJsonBody, stripFence } from '../prompt'

const NOW = Date.parse('2026-10-24T12:00:00Z')

function bill(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    fuel: 'oil',
    quantity: 800,
    unit: 'gal',
    price_per_unit: 6.23,
    billing_period: 'year',
    document_date: '2026-10-19',
    confidence: 'high',
    ...overrides,
  }
}

describe('not_a_bill guard', () => {
  it('refuses the marker the prompt asks the model to return', () => {
    expect(isNotABill({ error: 'not_a_bill' })).toBe(true)
    const result = readBill({ error: 'not_a_bill' }, NOW)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.refusal.code).toBe('not_a_bill')
  })

  it('does not treat an arbitrary error string as the marker', () => {
    expect(isNotABill({ error: 'timeout' })).toBe(false)
  })
})

describe('a clean annual bill', () => {
  it('passes both numbers through untouched and is ready', () => {
    const result = readBill(bill(), NOW)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.bill.fuel).toBe('oil')
    expect(result.bill.units.value).toBe(800)
    expect(result.bill.units.derived).toBe(false)
    expect(result.bill.price.value).toBe(6.23)
    expect(result.bill.documentDate).toBe('2026-10-19')
    expect(result.bill.confidence).toBe('high')
    expect(result.bill.ready).toBe(true)
    expect(result.bill.flags).toHaveLength(0)
  })

  it('marks a seasonal statement as annual without deriving anything', () => {
    const result = readBill(bill({ billing_period: 'season' }), NOW)
    if (!result.ok) throw new Error('expected a bill')
    expect(result.bill.units.value).toBe(800)
    expect(result.bill.units.derived).toBe(false)
    expect(result.bill.ready).toBe(true)
  })
})

describe('a monthly bill', () => {
  it('annualises × 12 and says so, with capped confidence', () => {
    const result = readBill(
      bill({ fuel: 'gas', unit: 'therm', quantity: 100, price_per_unit: 1.62, billing_period: 'month' }),
      NOW,
    )
    if (!result.ok) throw new Error('expected a bill')
    expect(result.bill.units.value).toBe(1_200)
    expect(result.bill.units.derived).toBe(true)
    expect(result.bill.units.confidence).toBeLessThanOrEqual(0.6)
    expect(result.bill.flags.map((f) => f.code)).toContain('annualised')
    expect(result.bill.ready).toBe(true)
  })
})

describe('one oil delivery', () => {
  it('refuses to turn a single drop into a winter', () => {
    const result = readBill(bill({ billing_period: 'delivery', quantity: 150 }), NOW)
    if (!result.ok) throw new Error('expected a bill with a price')
    expect(result.bill.units.value).toBeNull()
    expect(result.bill.price.value).toBe(6.23)
    expect(result.bill.flags.map((f) => f.code)).toContain('partial_period')
    expect(result.bill.ready).toBe(false)
  })

  it('refuses outright when neither number survives', () => {
    const result = readBill(bill({ billing_period: 'delivery', quantity: 150, price_per_unit: null }), NOW)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.refusal.code).toBe('unreadable')
      expect(result.refusal.message).toMatch(/winter/i)
    }
  })
})

describe('impossible readings', () => {
  it('never clamps a quantity that cannot be a house', () => {
    const result = readBill(bill({ quantity: 41_000 }), NOW)
    if (!result.ok) throw new Error('expected a bill')
    expect(result.bill.units.value).toBeNull()
    const flag = result.bill.flags.find((f) => f.field === 'units')
    expect(flag?.code).toBe('out_of_range')
    expect(flag?.message).toContain('41,000')
    expect(result.bill.ready).toBe(false)
  })

  it('rejects a price that is a misread decimal', () => {
    const result = readBill(bill({ price_per_unit: 0.06 }), NOW)
    if (!result.ok) throw new Error('expected a bill')
    expect(result.bill.price.value).toBeNull()
    expect(result.bill.flags.map((f) => f.code)).toContain('out_of_range')
  })

  it('rejects a unit that does not match the fuel', () => {
    const result = readBill(bill({ unit: 'therm' }), NOW)
    if (!result.ok) throw new Error('expected a bill')
    expect(result.bill.units.value).toBeNull()
    expect(result.bill.flags.map((f) => f.code)).toContain('unit_mismatch')
  })

  it('keeps the bands ordered and non-empty', () => {
    for (const fuel of Object.keys(RANGES) as (keyof typeof RANGES)[]) {
      const { units, price } = RANGES[fuel]
      expect(units[0]).toBeLessThan(units[1])
      expect(price[0]).toBeLessThan(price[1])
    }
  })
})

describe('confidence and dates', () => {
  it('drops to low when the model was unsure, and flags it', () => {
    const result = readBill(bill({ confidence: 'low' }), NOW)
    if (!result.ok) throw new Error('expected a bill')
    expect(result.bill.confidence).toBe('low')
    expect(result.bill.flags.map((f) => f.code)).toContain('low_confidence')
  })

  it('refuses dates that cannot be on a bill', () => {
    expect(asDocumentDate('2026-10-19', NOW)).toBe('2026-10-19')
    expect(asDocumentDate('19/10/2026', NOW)).toBeNull()
    expect(asDocumentDate('1970-01-01', NOW)).toBeNull()
    expect(asDocumentDate('2099-01-01', NOW)).toBeNull()
    expect(asDocumentDate(20261019, NOW)).toBeNull()
  })
})

describe('hostile input shapes', () => {
  it('returns a typed refusal for null, arrays and strings', () => {
    for (const value of [null, [], 'oil', 42]) {
      const result = readBill(value, NOW)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.refusal.code).toBe('unreadable')
    }
  })

  it('treats an unknown fuel as a question, not a default', () => {
    const result = readBill(bill({ fuel: 'wood' }), NOW)
    if (!result.ok) throw new Error('expected a bill')
    expect(result.bill.fuel).toBeNull()
    expect(result.bill.ready).toBe(false)
    expect(result.bill.flags).toContainEqual(
      expect.objectContaining({ field: 'fuel', code: 'missing' }),
    )
  })
})

describe('reading the model envelope', () => {
  it('strips a fenced JSON block', () => {
    expect(stripFence('```json\n{"a":1}\n```')).toBe('{"a":1}')
    expect(readJsonBody('```json\n{"fuel":"oil"}\n```')).toEqual({ fuel: 'oil' })
  })

  it('returns null rather than repairing broken JSON', () => {
    expect(readJsonBody('{"fuel":"oil",}')).toBeNull()
    expect(readJsonBody('I could not read this.')).toBeNull()
  })
})
