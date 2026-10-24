/**
 * @built F-109 confirm-panel decisions: what must be touched, what auto-applies, what is emitted
 */
import { describe, expect, it } from 'vitest'

import {
  buildApplied,
  canUseNumbers,
  confirmCopy,
  evaluateBill,
  formatAmount,
  formatPrice,
  messageForNonJson,
  methodPhrase,
  spaceHeatingUnits,
  withFills,
  type ParsedBill,
} from '../bill-confirm'

import fixtureB from '@/lib/parse/__tests__/fixtures/b-oil-ticket-no-degree-days.json'
import { readBill } from '@/lib/parse/plausibility'

function bill(over: Partial<ParsedBill> = {}): ParsedBill {
  return {
    fuel: 'gas',
    units: { value: 901.9399999, confidence: 0.9, derived: true, unit: 'therms/yr' },
    price: { value: 2.1234, confidence: 0.9, derived: true, unit: '$/therm' },
    documentPeriod: 'month',
    documentDate: '2026-01-15',
    confidence: 'high',
    ready: true,
    flags: [],
    documentType: 'gas_bill',
    rateClass: null,
    annualisation: { value: 901.94, method: 'hdd_scaled', confidence: 0.5, assumptions: [], note: 'Scaled from January.' },
    role: 'heating',
    utility: 'national_grid',
    serviceZip: '02139',
    serviceTown: 'Cambridge',
    lowIncomeSignal: false,
    discountLine: false,
    baseloadAnnual: null,
    ...over,
  } as ParsedBill
}

describe('formatting', () => {
  it('rounds without float noise', () => {
    expect(formatAmount(901.9399999)).toBe('902')
    expect(formatAmount(41.26)).toBe('41.3')
    expect(formatPrice(2.1234)).toBe('2.123')
    expect(formatPrice(2.5)).toBe('2.50')
  })
})

describe('methodPhrase', () => {
  it('names the month for a scaled single bill', () => {
    expect(methodPhrase(bill())).toBe('scaled from one January bill')
  })
  it('says a printed year was printed', () => {
    expect(methodPhrase(bill({ annualisation: null }))).toMatch(/full year/)
  })
})

describe('evaluateBill', () => {
  it('auto-applies a clean, confident, complete parse', () => {
    expect(evaluateBill(bill())).toEqual({ checks: [], autoApply: true })
  })
  it('flags a low-confidence price and blocks auto-apply', () => {
    const result = evaluateBill(bill({ price: { value: 2, confidence: 0.3, derived: false, unit: '$/therm' } }))
    expect(result.checks).toEqual(['price'])
    expect(result.autoApply).toBe(false)
  })
  it('asks about a missing fuel but not for an electric bill', () => {
    expect(evaluateBill(bill({ fuel: null })).checks).toContain('fuel')
    expect(evaluateBill(bill({ fuel: null, role: 'electricity' })).checks).not.toContain('fuel')
  })
  it('requires explicit fuel confirmation when gas rate class says non-heating', () => {
    const result = evaluateBill(bill({ flags: [{ field: 'fuel', code: 'not_heating_fuel', message: 'R-1 is not a heating rate.' }] }))
    expect(result).toEqual({ checks: ['fuel'], autoApply: false })
  })
  it('does not auto-apply when a question is pending', () => {
    const q = bill({ flags: [{ field: 'annualisation', code: 'needs_fills', message: '?' }] })
    expect(evaluateBill(q).autoApply).toBe(false)
  })
  it('treats overall low confidence as needing both numbers checked', () => {
    expect(evaluateBill(bill({ confidence: 'low' })).checks).toEqual(['units', 'price'])
  })
})

describe('buildApplied', () => {
  it('removes baseload and says so', () => {
    const applied = buildApplied({ bill: bill({ baseloadAnnual: 150 }), fuel: 'gas', units: '902', price: '2.123', unitsEdited: false })
    expect(applied?.units).toBe('752')
    expect(applied?.note).toMatch(/150 therms.*removed/)
    expect(spaceHeatingUnits(100, 150)).toBe(100)
  })
  it('sends an edited figure as typed', () => {
    const applied = buildApplied({ bill: bill({ baseloadAnnual: 150 }), fuel: 'gas', units: '800', price: '2.1', unitsEdited: true })
    expect(applied?.units).toBe('800')
  })
  it('emits the electric rate for an electric bill and no fuel', () => {
    const applied = buildApplied({ bill: bill({ role: 'electricity', fuel: null }), fuel: '', units: '', price: '0.31', unitsEdited: false })
    expect(applied).toMatchObject({ role: 'electricity', fuel: null, electricRate: '0.31', price: '0.31' })
  })
  it('returns null until the numbers are usable', () => {
    expect(buildApplied({ bill: bill(), fuel: '', units: '900', price: '2', unitsEdited: false })).toBeNull()
    expect(buildApplied({ bill: bill(), fuel: 'gas', units: '900', price: '0', unitsEdited: false })).toBeNull()
  })
  it('carries utility, town and low-income signal', () => {
    const applied = buildApplied({ bill: bill({ lowIncomeSignal: true }), fuel: 'gas', units: '900', price: '2', unitsEdited: false })
    expect(applied).toMatchObject({ utility: 'national_grid', serviceTown: 'Cambridge', lowIncomeSignal: true, method: 'hdd_scaled' })
  })
})

describe('messageForNonJson', () => {
  it('names the 413 and the 504', () => {
    expect(messageForNonJson(413)).toMatch(/too big/)
    expect(messageForNonJson(504)).toMatch(/too long/)
  })
})

describe('withFills', () => {
  it('uses the original printed quantity without another read', () => {
    const parsed = readBill(fixtureB)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const next = withFills(parsed.bill, 4)
    expect(typeof next).toBe('object')
    if (typeof next === 'string') return
    expect(next.units.value).toBe(760)
    expect(next.annualisation?.method).toBe('tank_cadence')
    expect(next.flags.map((flag) => flag.code)).not.toContain('needs_fills')
    expect(next.ready).toBe(true)
    expect(evaluateBill(next).checks).toContain('units')
  })
})

describe('canUseNumbers', () => {
  it('accepts a shaky heating parse in one click once the numbers exist', () => {
    const shaky = bill({ confidence: 'low', units: { value: 812, confidence: 0.5, derived: true, unit: 'therm/yr' } })
    expect(evaluateBill(shaky).checks).toEqual(['units', 'price'])
    expect(canUseNumbers({ role: 'heating', fuel: 'gas', units: '812', price: '1.58' })).toBe(true)
  })
  it('needs fuel, units and price for heating', () => {
    expect(canUseNumbers({ role: 'heating', fuel: '', units: '812', price: '1.58' })).toBe(false)
    expect(canUseNumbers({ role: 'heating', fuel: 'gas', units: '', price: '1.58' })).toBe(false)
    expect(canUseNumbers({ role: 'heating', fuel: 'gas', units: '812', price: '0' })).toBe(false)
  })
  it('needs only a price for electricity', () => {
    expect(canUseNumbers({ role: 'electricity', fuel: '', units: '', price: '0.3674' })).toBe(true)
  })
})

describe('confirmCopy', () => {
  it('names the flagged fields and counts them on the button', () => {
    expect(confirmCopy(['units', 'price'])).toEqual({
      button: 'Use these numbers (2 to check)',
      summary: 'Check before you use them: units, price',
    })
  })
  it('stays plain when nothing is flagged', () => {
    expect(confirmCopy([])).toEqual({ button: 'Use these numbers', summary: null })
  })
})
