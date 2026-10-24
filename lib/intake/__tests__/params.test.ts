import { describe, expect, it } from 'vitest'

import {
  bonusOn, defaultInstallYear, enhancedTierNote, fromSearchParams, plausibleElectricRate,
  plausibleInstallCost, provenanceLine, queryString, tierFor, toQuery, withBonus, withInstallCost,
  type IntakeValues,
} from '../params'

const values: IntakeValues = {
  fuel: 'gas', units: '1,020', price: '1.62', town: 'Worcester', tier: 'whole', income: 'unsure', year: '2026',
  yearBuilt: '1952', sqft: '1,600', src: 'assessor', buildingUnits: 3, method: 'hdd_scaled', methodConfidence: 0.5,
  note: 'Yearly gas from your Jan bill; scaled & shifted', utility: 'eversource', electricRate: '0.305', lowIncome: true,
  weatherizationBonus: false, sizingBonus: true, installCost: '26,000',
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

describe('install cost', () => {
  it.each([
    ['26,000', 26_000], [22000, 22_000], ['1000', 1_000], ['250000', 250_000],
    ['999', null], ['250001', null], ['abc', null], ['', null], [null, null],
  ])('%s', (input, expected) => {
    expect(plausibleInstallCost(input as never)).toBe(expected)
  })

  it('sets and clears the value without touching the rest of the link', () => {
    const base = 'fuel=oil&units=800&price=6.23&town=Framingham'
    const quoted = new URLSearchParams(withInstallCost(base, 40_000))
    expect(quoted.get('ic')).toBe('40000')
    expect(quoted.get('units')).toBe('800')
    const restored = new URLSearchParams(withInstallCost(quoted.toString(), 22_000))
    expect(restored.get('ic')).toBeNull()
    expect(restored.get('price')).toBe('6.23')
  })
})

describe('round trip', () => {
  it('survives toQuery → search params → fromSearchParams', () => {
    const q = toQuery(values)
    const back = fromSearchParams(Object.fromEntries(q))
    expect(back).toMatchObject({
      fuel: 'gas', units: '1020', price: '1.62', town: 'Worcester', year: '2026', yearBuilt: '1952', sqft: '1600',
      src: 'assessor', buildingUnits: 3, method: 'hdd_scaled', methodConfidence: 0.5, utility: 'eversource',
      electricRate: '0.305', lowIncome: true, income: 'unsure', installCost: '26000', sizingBonus: true,
    })
    // An unticked bonus is absent from the query, not asserted as false.
    expect(back.weatherizationBonus).toBeUndefined()
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

describe('R5 — the bonuses are query state, not client state', () => {
  const query = { fuel: 'oil', units: '800', price: '6.23', town: 'Wellesley', tier: 'whole', year: '2026', wz: '1' }

  it('reads a bonus only when the query says 1', () => {
    expect(bonusOn(query, 'wz')).toBe(true)
    expect(bonusOn(query, 'sz')).toBe(false)
    expect(bonusOn({ wz: '0' }, 'wz')).toBe(false)
    expect(bonusOn({ wz: ['1', '0'] }, 'wz')).toBe(true)
  })

  it('flips one bonus and keeps every other key', () => {
    const off = new URLSearchParams(withBonus(query, 'wz'))
    expect(off.get('wz')).toBeNull()
    expect(off.get('town')).toBe('Wellesley')
    expect(off.get('price')).toBe('6.23')

    const on = new URLSearchParams(withBonus(query, 'sz'))
    expect(on.get('wz')).toBe('1')
    expect(on.get('sz')).toBe('1')
    expect(on.get('units')).toBe('800')
  })

  it('round-trips the toggles through the form', () => {
    const back = fromSearchParams(query)
    expect(back.weatherizationBonus).toBe(true)
    expect(back.sizingBonus).toBeUndefined()
    const out = toQuery({ ...values, weatherizationBonus: true, sizingBonus: false })
    expect(out.get('wz')).toBe('1')
    expect(out.get('sz')).toBeNull()
  })
})

describe('R5.2 — the enhanced tier says no to gas out loud', () => {
  it('explains the exclusion when the household asked for it', () => {
    const note = enhancedTierNote('gas', 'yes', 'whole')
    expect(note).toMatch(/Not eligible for enhanced/)
    expect(note).toMatch(/oil, propane or electric resistance/)
    expect(enhancedTierNote('gas', 'unsure', 'enhanced')).toMatch(/Not eligible/)
  })

  it('stays quiet when the question was not asked, or the fuel can claim it', () => {
    expect(enhancedTierNote('gas', 'no', 'whole')).toBeNull()
    expect(enhancedTierNote('gas', 'unsure', 'whole')).toBeNull()
    expect(enhancedTierNote('oil', 'yes', 'enhanced')).toBeNull()
    expect(enhancedTierNote('resistance', 'yes', 'enhanced')).toBeNull()
  })
})
