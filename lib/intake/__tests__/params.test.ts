import { describe, expect, it } from 'vitest'

import {
  defaultInstallYear, fromSearchParams, plausibleElectricRate, provenanceLine, queryString, tierFor, toQuery,
  type IntakeValues,
} from '../params'

const values: IntakeValues = {
  fuel: 'gas', units: '1,020', price: '1.62', town: 'Worcester', tier: 'whole', income: 'unsure', year: '2026',
  yearBuilt: '1952', sqft: '1,600', src: 'assessor', buildingUnits: 3, method: 'hdd_scaled', methodConfidence: 0.5,
  note: 'Yearly gas from your Jan bill; scaled & shifted', utility: 'eversource', electricRate: '0.305', lowIncome: true,
}

describe('tierFor', () => {
  it('upgrades to enhanced only for non-gas fuels', () => {
    expect(tierFor('whole', 'yes', 'oil')).toBe('enhanced')
    expect(tierFor('partial', 'yes', 'resistance')).toBe('enhanced')
    expect(tierFor('whole', 'yes', 'gas')).toBe('whole')
  })
  it('not sure and no stay standard', () => {
    expect(tierFor('partial', 'unsure', 'oil')).toBe('partial')
    expect(tierFor('whole', 'no', 'propane')).toBe('whole')
  })
})

describe('electric rate', () => {
  it.each([[0.305, 0.305], ['0.1', 0.1], [0.05, null], [0.9, null], ['abc', null], [null, null]])('%s', (i, o) => {
    expect(plausibleElectricRate(i as never)).toBe(o)
  })
})

describe('round trip', () => {
  it('survives toQuery → search params → fromSearchParams', () => {
    const q = toQuery(values)
    const back = fromSearchParams(Object.fromEntries(q))
    expect(back).toMatchObject({
      fuel: 'gas', units: '1020', price: '1.62', town: 'Worcester', year: '2026', yearBuilt: '1952', sqft: '1600',
      src: 'assessor', buildingUnits: 3, method: 'hdd_scaled', methodConfidence: 0.5, utility: 'eversource',
      electricRate: '0.305', lowIncome: true, income: 'unsure',
    })
    expect(back.note).toBe(values.note)
  })
  it('caps the note at 160 and drops junk', () => {
    expect(toQuery({ ...values, note: 'x'.repeat(300) }).get('mn')).toHaveLength(160)
    const back = fromSearchParams({ m: 'nope', ut: 'nope', er: '5', mc: '2', li: 'x' })
    expect(back).toEqual({})
  })
  it('queryString keeps every key', () => {
    expect(new URLSearchParams(queryString({ a: '1', b: ['2', '3'], c: undefined })).toString()).toBe('a=1&b=2')
  })
})

describe('misc', () => {
  it('install year follows the calendar', () => {
    expect(defaultInstallYear(new Date('2026-10-24'))).toBe('2026')
    expect(defaultInstallYear(new Date('2027-01-02'))).toBe('2027')
  })
  it('provenance line', () => {
    expect(provenanceLine('Yearly gas from your Jan bill.', 0.5)).toBe('Yearly gas from your Jan bill — estimate, 50% confidence')
    expect(provenanceLine(null, 0.5)).toBeNull()
  })
})
