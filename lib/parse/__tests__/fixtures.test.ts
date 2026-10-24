/**
 * @built F-26a four realistic synthetic documents, end to end through `readBill`
 *
 * These are the shapes a phone camera actually produces in Massachusetts: an oil
 * delivery ticket with degree days, the same ticket without them (the document
 * most oil households have), an electric bill with the printed usage chart, and a
 * July gas bill that must be refused as a heating year.
 *
 * Every fixture is invented and labelled synthetic in its own `_synthetic` field.
 * Two thin extra fixtures (E, F) exist only to reach the two remaining methods.
 *
 * The assertions are about the *decision*, not the arithmetic alone: which method
 * was chosen, what it assumed, whether the number is allowed to reach the
 * calculator, and what the user is asked when it is not.
 */

import { describe, expect, it } from 'vitest'

import { readBill, RANGES } from '../plausibility'
import type { AnnualMethod, BillParse } from '../types'

import fixtureA from './fixtures/a-oil-ticket-degree-days.json'
import fixtureB from './fixtures/b-oil-ticket-no-degree-days.json'
import fixtureC from './fixtures/c-electric-bill-usage-chart.json'
import fixtureD from './fixtures/d-gas-bill-july.json'
import fixtureE from './fixtures/e-gas-bill-january.json'
import fixtureF from './fixtures/f-electric-bill-july-baseload.json'

const NOW = Date.parse('2026-10-24T12:00:00Z')

function parse(json: unknown, options?: Parameters<typeof readBill>[2]): BillParse {
  const result = readBill(json, NOW, options)
  if (!result.ok) throw new Error(`expected a bill, got a refusal: ${result.refusal.message}`)
  return result.bill
}

const FIXTURES: { name: string; json: unknown; options?: Parameters<typeof readBill>[2] }[] = [
  { name: 'A oil ticket with degree days', json: fixtureA },
  { name: 'B oil ticket, four fills', json: fixtureB, options: { deliveriesPerSeason: 4 } },
  { name: 'B oil ticket, no fill count', json: fixtureB },
  { name: 'C electric bill with a chart', json: fixtureC },
  { name: 'D July gas bill', json: fixtureD },
  { name: 'E January gas bill', json: fixtureE },
  { name: 'F July electric baseload', json: fixtureF, options: { heating: false } },
]

describe('the fixtures are labelled synthetic', () => {
  it('says so in the document itself, so nobody mistakes one for a real bill', () => {
    for (const { json } of FIXTURES) {
      expect((json as Record<string, unknown>)._synthetic).toMatch(/^SYNTHETIC/)
    }
  })
})

describe('A — an oil delivery ticket that prints degree days', () => {
  const bill = parse(fixtureA)

  it('uses the degree days on the ticket, not a monthly share', () => {
    expect(bill.annualisation?.method).toBe('degree_days')
    expect(bill.annualisation?.value).toBeCloseTo(902, 0)
    expect(bill.units.value).toBe(bill.annualisation?.value)
    expect(bill.units.derived).toBe(true)
  })

  it('caps confidence at the method, and states the one assumption', () => {
    expect(bill.annualisation?.confidence).toBe(0.7)
    expect(bill.annualisation?.assumptions).toHaveLength(1)
    expect(bill.annualisation?.assumptions[0]).toMatch(/degree days/i)
    expect(bill.units.confidence).toBeLessThanOrEqual(0.7)
  })

  it('is usable: a single delivery with degree days is a year', () => {
    expect(bill.ready).toBe(true)
    expect(bill.documentType).toBe('oil_delivery')
    expect(bill.flags.map((f) => f.code)).not.toContain('partial_period')
    expect(bill.flags.map((f) => f.code)).not.toContain('needs_fills')
  })
})

describe('B — one oil delivery, no degree days, no history', () => {
  it('uses the household fill count when it is given', () => {
    const bill = parse(fixtureB, { deliveriesPerSeason: 4 })
    expect(bill.annualisation?.method).toBe('tank_cadence')
    expect(bill.annualisation?.value).toBe(760)
    expect(bill.annualisation?.confidence).toBe(0.55)
    expect(bill.annualisation?.assumptions.join(' ')).toMatch(/4 fills/)
    expect(bill.flags.map((f) => f.code)).toContain('annualised')
    expect(bill.ready).toBe(true)
  })

  it('asks for the fill count when it is not, instead of dead-ending', () => {
    const bill = parse(fixtureB)
    expect(bill.annualisation).toBeNull()
    expect(bill.units.value).toBeNull()
    expect(bill.ready).toBe(false)
    const question = bill.flags.find((f) => f.code === 'needs_fills')
    expect(question?.field).toBe('annualisation')
    expect(question?.message).toMatch(/how many fills/i)
    expect(question?.message).toMatch(/two to eight/i)
  })

  it('keeps the price, because the price on the ticket is still true', () => {
    const bill = parse(fixtureB)
    expect(bill.price.value).toBe(6.18)
  })
})

describe('C — an electric bill with the printed usage chart', () => {
  const bill = parse(fixtureC)

  it('uses the sum of the bars verbatim', () => {
    const chart = (fixtureC as { usage_history: number[] }).usage_history
    const sum = chart.reduce((total, bar) => total + bar, 0)
    expect(bill.annualisation?.method).toBe('printed_history')
    expect(bill.annualisation?.value).toBe(sum)
    expect(bill.units.value).toBe(sum)
  })

  it('claims the printed-history confidence and needs no annualisation flag', () => {
    expect(bill.annualisation?.confidence).toBe(0.95)
    expect(bill.annualisation?.assumptions).toHaveLength(0)
    expect(bill.flags.map((f) => f.code)).not.toContain('annualised')
    expect(bill.ready).toBe(true)
  })

  it('carries the rate class the bill printed', () => {
    expect(bill.documentType).toBe('electric_bill')
    expect(bill.rateClass).toBe('R-2')
  })

  it('does not treat 11 bars as a year, and says why', () => {
    const short = { ...fixtureC, document_date: '2026-01-18' }
    const chart = (fixtureC as { usage_history: number[] }).usage_history
    const bill = parse({ ...short, usage_history: chart.slice(0, 11) })
    expect(bill.annualisation?.method).not.toBe('printed_history')
    expect(bill.annualisation?.method).toBe('hdd_scaled')
    expect(bill.flags.map((f) => f.message).join(' ')).toMatch(/11 months/)
  })

  it('rejects a chart with a null or a string in it instead of coercing', () => {
    const chart = (fixtureC as { usage_history: number[] }).usage_history
    for (const poisoned of [
      [...chart.slice(0, 11), null],
      [...chart.slice(0, 11), '470'],
    ]) {
      const bill = parse({ ...fixtureC, document_date: '2026-01-18', usage_history: poisoned })
      expect(bill.annualisation?.method).not.toBe('printed_history')
      expect(bill.annualisation?.method).toBe('hdd_scaled')
      expect(bill.flags.map((f) => f.message).join(' ')).toMatch(/could not be read cleanly/)
    }
  })
})

describe('D — a single July gas bill', () => {
  const bill = parse(fixtureD)

  it('refuses to make a heating year out of a summer month', () => {
    expect(bill.annualisation).toBeNull()
    expect(bill.units.value).toBeNull()
    expect(bill.ready).toBe(false)
    const flag = bill.flags.find((f) => f.code === 'summer_month')
    expect(flag?.field).toBe('annualisation')
    expect(flag?.message).toMatch(/July bill says nothing about your heating year/)
    expect(flag?.message).toMatch(/photograph a winter bill|type the yearly total/)
  })

  it('keeps the therms and the price the document printed', () => {
    expect(bill.units.value).toBeNull()
    expect(bill.price.value).toBe(1.42)
    expect(bill.documentPeriod).toBe('month')
  })

  it('would have been × 12 under the old rule, which is the defect this fixes', () => {
    expect(bill.units.value).not.toBe(18 * 12)
  })
})

describe('E and F — the two remaining paths', () => {
  it('E: a January month is scaled by its share of the heating year', () => {
    const bill = parse(fixtureE)
    expect(bill.annualisation?.method).toBe('hdd_scaled')
    expect(bill.annualisation?.value).toBeCloseTo(142 / 0.191, 3)
    expect(bill.annualisation?.assumptions.join(' ')).toMatch(/19\.1%/)
  })

  it('F: a July electric bill for a house that is not resistance-heated is flat × 12', () => {
    const bill = parse(fixtureF, { heating: false })
    expect(bill.annualisation?.method).toBe('monthly_x12')
    expect(bill.annualisation?.value).toBe(5_640)
  })

  it('F: the same bill claiming resistance heat is a summer refusal', () => {
    const bill = parse(fixtureF)
    expect(bill.annualisation).toBeNull()
    expect(bill.flags.map((f) => f.code)).toContain('summer_month')
  })
})

describe('coverage and the invariant across every fixture', () => {
  it('reaches all five annualisation methods', () => {
    const reached = new Set<AnnualMethod>()
    for (const { json, options } of FIXTURES) {
      const bill = parse(json, options)
      if (bill.annualisation) reached.add(bill.annualisation.method)
    }
    expect([...reached].sort()).toEqual([
      'degree_days',
      'hdd_scaled',
      'monthly_x12',
      'printed_history',
      'tank_cadence',
    ])
  })

  it('never hands the calculator a year outside RANGES[fuel].units', () => {
    for (const { name, json, options } of FIXTURES) {
      const bill = parse(json, options)
      if (bill.units.value === null || bill.fuel === null) continue
      const [low, high] = RANGES[bill.fuel].units
      expect(bill.units.value, name).toBeGreaterThanOrEqual(low)
      expect(bill.units.value, name).toBeLessThanOrEqual(high)
      if (bill.annualisation) expect(bill.annualisation.value, name).toBe(bill.units.value)
    }
  })

  it('keeps the model output shape it claims to validate', () => {
    for (const { name, json } of FIXTURES) {
      const record = json as Record<string, unknown>
      expect(typeof record.fuel, name).toBe('string')
      expect(typeof record.quantity, name).toBe('number')
      expect('usage_history' in record, name).toBe(true)
      expect('degree_days' in record, name).toBe(true)
      expect('tank_size_gal' in record, name).toBe(true)
    }
  })
})
