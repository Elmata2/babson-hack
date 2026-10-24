/**
 * @built F-101 prompt v3 is self-consistent and exports its schema
 * @built F-102 validator: price in code, CCF to therms, role, low-income, season
 * @built F-103 period-weighted hdd_scaled, baseload, re-annualise with fills
 */
import { describe, expect, it } from 'vitest'

import { annualise, heatingShareOfWindow, serviceWindow } from '../annualise'
import { DEFAULT_HEAT_YEAR } from '../heat-year'
import { readBill, reannualiseWithFills, RANGES } from '../plausibility'
import { BILL_PROMPT, PARSE_SCHEMA_TEXT } from '../prompt'
import type { BillParse } from '../types'

import g from './fixtures/g-eversource-electric-bars-r1.json'
import h from './fixtures/h-eversource-gas-r3-ccf.json'
import i from './fixtures/i-national-grid-electric-r2-numeric.json'
import j from './fixtures/j-gas-r1-non-heat.json'
import k from './fixtures/k-budget-billing-gas.json'
import l from './fixtures/l-unknown-document.json'
import b from './fixtures/b-oil-ticket-no-degree-days.json'

const NOW = Date.parse('2026-10-24T12:00:00Z')

function parse(json: unknown, options?: Parameters<typeof readBill>[2]): BillParse {
  const result = readBill(json, NOW, options)
  if (!result.ok) throw new Error(`refused: ${result.refusal.message}`)
  return result.bill
}

describe('prompt v3', () => {
  it('no longer asks the model to divide (ADR-005)', () => {
    expect(BILL_PROMPT).not.toMatch(/divide the total/i)
    expect(BILL_PROMPT).toContain('total_charge')
    expect(BILL_PROMPT).toContain('therm_factor')
    expect(BILL_PROMPT).toContain('history_kind')
    expect(BILL_PROMPT).toContain('"R-4"')
    expect(BILL_PROMPT).toMatch(/several images/i)
    expect(BILL_PROMPT).toMatch(/never the street/i)
  })
  it('exports the schema it embeds', () => {
    expect(BILL_PROMPT).toContain(PARSE_SCHEMA_TEXT)
  })
})

describe('fixture G: Eversource electric, bars, not the heat source', () => {
  const bill = parse(g)
  it('is the electricity role with no heating fuel', () => {
    expect(bill.role).toBe('electricity')
    expect(bill.fuel).toBeNull()
  })
  it('computes the price in code, flagged derived', () => {
    expect(bill.price.value).toBeCloseTo(0.305, 3)
    expect(bill.price.derived).toBe(true)
    expect(bill.price.note).toMatch(/total ÷ quantity/)
    expect(bill.price.unit).toBe('$/kWh')
  })
  it('reads bars at 0.75 and says so', () => {
    expect(bill.annualisation?.method).toBe('printed_history')
    expect(bill.annualisation?.confidence).toBe(0.75)
    expect(bill.annualisation?.assumptions.join(' ')).toMatch(/bar heights/)
  })
  it('populates the extras', () => {
    expect(bill.utility).toBe('eversource')
    expect(bill.serviceZip).toBe('02139')
    expect(bill.serviceTown).toBe('Cambridge')
    expect(bill.totalCharge).toBe(180.55)
    expect(bill.periodStart).toBe('2026-09-12')
    expect(bill.days).toBe(31)
    expect(bill.supplierName).toBe('Basic Service')
    expect(bill.rateClassV3).toBe('R-1')
    expect(bill.lowIncomeSignal).toBe(false)
    expect(bill.readType).toBe('actual')
    expect(bill.budgetBilling).toBe(false)
    expect(bill.baseloadAnnual).toBeNull()
  })
  it('becomes heating when the user says the electric bill heats the house', () => {
    const heated = parse(g, { heating: true })
    expect(heated.role).toBe('heating')
    expect(heated.fuel).toBe('resistance')
  })
})

describe('fixture H: gas R-3 in CCF', () => {
  const bill = parse(h)
  it('converts CCF with the printed therm factor, derived', () => {
    expect(bill.documentQuantity).toBeCloseTo(129.8178, 3)
    expect(bill.flags.some((f) => f.field === 'units' && /1\.0303/.test(f.message))).toBe(true)
  })
  it('treats R-3 as heating without being told', () => {
    expect(bill.role).toBe('heating')
    expect(bill.fuel).toBe('gas')
    expect(bill.annualisation?.method).toBe('hdd_scaled')
  })
  it('prices per therm, not per CCF', () => {
    expect(bill.price.value).toBeCloseTo(211.4 / 129.8178, 3)
    expect(bill.price.unit).toBe('$/therm')
  })
  it('falls back to 1.037 and names the assumption when no factor is printed', () => {
    const noFactor = parse({ ...h, therm_factor: null })
    expect(noFactor.documentQuantity).toBeCloseTo(126 * 1.037, 3)
    expect(noFactor.flags.map((f) => f.message).join(' ')).toMatch(/1\.037/)
  })
})

describe('fixture I: National Grid electric R-2, numeric history', () => {
  const bill = parse(i)
  it('flags low income and trusts a numeric table at 0.95', () => {
    expect(bill.lowIncomeSignal).toBe(true)
    expect(bill.annualisation?.confidence).toBe(0.95)
    expect(bill.role).toBe('electricity')
  })
  it('a discount line alone is reported apart and does not set the low-income signal', () => {
    const lineOnly = parse({ ...i, rate_class: 'R-1' })
    expect(lineOnly.lowIncomeSignal).toBe(false)
    expect(lineOnly.discountLine).toBe(true)
    const none = parse({ ...i, rate_class: 'R-1', discount_line_present: false })
    expect(none.lowIncomeSignal).toBe(false)
    expect(none.discountLine).toBe(false)
  })
})

describe('fixture J: gas R-1 is not a heating fuel', () => {
  const bill = parse(j)
  it('flags it and uses the flat year', () => {
    expect(bill.flags.some((f) => f.code === 'not_heating_fuel')).toBe(true)
    expect(bill.annualisation?.method).toBe('monthly_x12')
    expect(bill.ready).toBe(true)
  })
})

describe('fixture K: budget billing', () => {
  it('prices from total current charges, never amount due', () => {
    const bill = parse(k)
    expect(bill.price.value).toBeCloseTo(260.4 / 140, 4)
    expect(bill.budgetBilling).toBe(true)
    expect(bill.readType).toBe('estimated')
  })
})

describe('fixture L: unknown document with no fuel', () => {
  it('is refused like not_a_bill', () => {
    const result = readBill(l, NOW)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.refusal.code).toBe('not_a_bill')
  })
})

describe('season is not a year', () => {
  const season = { ...h, billing_period: 'season', unit: 'therm', therm_factor: null, quantity: 400 }
  it('is flagged partial unless the dates span 330 days', () => {
    const short = parse({ ...season, period_start: '2025-11-01', period_end: '2026-04-30' })
    expect(short.flags.some((f) => f.code === 'partial_period' || f.code === 'annualised')).toBe(true)
  })
  it('passes as a year when the span is 330+ days', () => {
    const full = parse({ ...season, quantity: 700, period_start: '2025-10-01', period_end: '2026-09-30' })
    expect(full.units.value).toBe(700)
    expect(full.annualisation).toBeNull()
  })
})

describe('period-weighted hdd_scaled', () => {
  const shares = DEFAULT_HEAT_YEAR.monthShares
  it('weights daily shares across the actual service days', () => {
    const window = serviceWindow('2026-01-03', '2026-02-02', null)
    expect(window?.days).toBe(31)
    const share = heatingShareOfWindow(window!, shares)!
    expect(share).toBeCloseTo((29 / 31) * 0.191 + (2 / 28) * 0.169, 4)
  })
  it('assumes ~30 days ending 3 days before the document date, and says so', () => {
    const window = serviceWindow(null, null, '2026-02-05')
    expect(window?.end).toBe('2026-02-02')
    expect(window?.start).toBe('2026-01-04')
    expect(window?.assumed).toBe(true)
    const out = annualise({
      fuel: 'gas',
      quantity: 100,
      documentPeriod: 'month',
      documentDate: '2026-02-05',
      usageHistory: null,
      degreeDays: null,
      deliveriesPerSeason: null,
      tankSizeGal: null,
      heating: true,
      bounds: RANGES.gas.units,
      seasonHdd: 5693.7,
      monthShares: shares,
    })
    expect(out.estimate?.method).toBe('hdd_scaled')
    expect(out.estimate?.assumptions.join(' ')).toMatch(/3 days before the document date/)
  })
  it('a 25 and a 35 day period at the same daily rate give the same year', () => {
    const run = (start: string, end: string, quantity: number) =>
      annualise({
        fuel: 'gas', quantity, documentPeriod: 'month', documentDate: null,
        periodStart: start, periodEnd: end,
        usageHistory: null, degreeDays: null, deliveriesPerSeason: null, tankSizeGal: null,
        heating: true, bounds: RANGES.gas.units, seasonHdd: 5693.7, monthShares: shares,
      }).estimate!.value
    // Whole Jan 1-25 vs Jan 1-31 at 4 therms/day, same month weight per day.
    expect(run('2026-01-01', '2026-01-25', 100)).toBeCloseTo(run('2026-01-01', '2026-01-31', 124), 0)
  })
  it('names the county instead of Boston', () => {
    const bill = parse(h, { countyFips: '25027' })
    const text = [...(bill.annualisation?.assumptions ?? []), bill.annualisation?.note ?? ''].join(' ')
    expect(text).toMatch(/Worcester/)
    expect(text).not.toMatch(/Boston/)
    const none = parse(h)
    expect([...(none.annualisation?.assumptions ?? []), none.annualisation?.note ?? ''].join(' ')).not.toMatch(/Boston/)
  })
})

describe('baseload', () => {
  const history = [200, 120, 60, 30, 22, 25, 35, 90, 180, 260, 300, 280] // Mar 2025 .. Feb 2026, the last bar is the bill's month
  it('takes the summer minimum x 12 and exposes space heating', () => {
    const bill = parse({
      ...h, therm_factor: null, unit: 'therm', quantity: 130, usage_history: history,
      history_kind: 'numbers', document_date: '2026-02-05', period_start: null, period_end: '2026-02-02',
    })
    expect(bill.annualisation?.method).toBe('printed_history')
    expect(bill.baseloadAnnual).toBeGreaterThan(0)
    const sum = history.reduce((a, c) => a + c, 0)
    expect(bill.annualisation?.spaceHeating).toBeCloseTo(sum - bill.baseloadAnnual!, 5)
    expect(bill.baseloadAnnual).toBe(22 * 12)
  })
  it('is null for an electricity-role bill', () => {
    expect(parse(i).baseloadAnnual).toBeNull()
  })
})

describe('reannualiseWithFills', () => {
  const oil = parse({ ...b, billing_period: 'delivery' })
  it('turns one delivery into a year from the confirmed fills, with no second read', () => {
    const out = reannualiseWithFills(oil, 4)
    expect('method' in out && out.method).toBe('tank_cadence')
    if ('method' in out) expect(out.value).toBeCloseTo((oil.documentQuantity ?? 0) * 4, 5)
  })
  it('refuses an impossible fill count with a typed refusal', () => {
    const out = reannualiseWithFills(oil, 40)
    expect('code' in out).toBe(true)
  })
})
