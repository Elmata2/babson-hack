import { describe, expect, it } from 'vitest'

import { sanitizeProfile } from '../../../components/map/use-profile'
import { serializeProfile, withoutProfile } from '../flow'
import { mapProfileFrom, mergeMapProfile, monthlyKwh, sponsorFromBill } from '../profile-map'

const electric = { units: '7,200', utility: 'national_grid' as const }

describe('sponsorFromBill', () => {
  it('maps bill utilities to map sponsors', () => {
    expect(sponsorFromBill('eversource')).toBe('eversource')
    expect(sponsorFromBill('national_grid')).toBe('nationalgrid')
    expect(sponsorFromBill('unitil')).toBe('unitil')
    expect(sponsorFromBill('municipal')).toBe('municipal')
    expect(sponsorFromBill('liberty')).toBe('other')
    expect(sponsorFromBill('oil_dealer')).toBeNull()
    expect(sponsorFromBill(null)).toBeNull()
  })
})

describe('monthlyKwh', () => {
  it('divides the annual figure by twelve', () => {
    expect(monthlyKwh(electric)).toBe(600)
  })
  it('is null without a figure', () => {
    expect(monthlyKwh({ units: '' })).toBeNull()
    expect(monthlyKwh(null)).toBeNull()
  })
})

describe('mapProfileFrom', () => {
  it('fills the fields the bills prove', () => {
    expect(mapProfileFrom({ town: 'Newton', fuel: 'oil', electric, income: 'yes' })).toEqual({
      town: 'Newton',
      utility: 'nationalgrid',
      fuel: 'oil',
      kwh: 600,
      kwhIsExample: false,
      supply: null,
      supplierRateCents: null,
      incomeEligible: 'yes',
    })
  })
  it('omits kwh when no electric bill gave one', () => {
    const fields = mapProfileFrom({ town: 'Newton', fuel: 'gas', electric: null, income: 'unsure' })
    expect('kwh' in fields).toBe(false)
    expect(fields.utility).toBeNull()
  })
})

describe('mergeMapProfile', () => {
  const fields = mapProfileFrom({ town: 'Newton', fuel: 'oil', electric, income: 'no' })

  it('produces a profile the map accepts', () => {
    const profile = sanitizeProfile(JSON.parse(mergeMapProfile(null, fields)))
    expect(profile).toMatchObject({
      town: 'Newton',
      utility: 'nationalgrid',
      fuel: 'oil',
      kwh: 600,
      kwhIsExample: false,
      incomeEligible: 'no',
    })
  })
  it('keeps onboarding fields and unrelated map fields', () => {
    const existing = serializeProfile(
      { name: 'Alex', email: 'a@b.co', phone: '', consent: true },
      new Date('2026-10-24T00:00:00Z'),
      JSON.stringify({ solar: 'yes', supply: 'competitive', supplierRateCents: 19 }),
    )
    const merged = JSON.parse(mergeMapProfile(existing, fields))
    expect(merged).toMatchObject({ name: 'Alex', solar: 'yes', supply: 'competitive', supplierRateCents: 19, town: 'Newton' })
  })
  it('survives withoutProfile with the map fields intact', () => {
    const merged = mergeMapProfile(null, fields)
    expect(JSON.parse(withoutProfile(merged) ?? '{}')).toMatchObject({ town: 'Newton', kwh: 600 })
  })
  it('never replaces a stored yes or no income with unsure', () => {
    const unsure = mapProfileFrom({ town: 'Newton', fuel: 'oil', electric, income: 'unsure' })
    expect(JSON.parse(mergeMapProfile(JSON.stringify({ incomeEligible: 'yes' }), unsure)).incomeEligible).toBe('yes')
    expect(JSON.parse(mergeMapProfile(JSON.stringify({ incomeEligible: 'unsure' }), unsure)).incomeEligible).toBe('unsure')
  })
  it('lets a fresh yes or no replace a stored income answer', () => {
    expect(JSON.parse(mergeMapProfile(JSON.stringify({ incomeEligible: 'yes' }), fields)).incomeEligible).toBe('no')
  })
  it('keeps stored kwh and utility when the new bill gives none, and overwrites them when it does', () => {
    const none = mapProfileFrom({ town: 'Newton', fuel: 'gas', electric: null, income: 'unsure' })
    const kept = JSON.parse(mergeMapProfile(JSON.stringify({ kwh: 450, utility: 'eversource', town: 'Waltham' }), none))
    expect(kept).toMatchObject({ kwh: 450, utility: 'eversource', town: 'Newton' })
    const fresh = JSON.parse(mergeMapProfile(JSON.stringify({ kwh: 450, utility: 'eversource' }), fields))
    expect(fresh).toMatchObject({ kwh: 600, utility: 'nationalgrid' })
  })
  it('maps a gas home with no income answer', () => {
    const gas = mapProfileFrom({ town: 'Quincy', fuel: 'gas', electric: { units: '6,000', utility: 'eversource' }, income: 'unsure' })
    expect(gas).toMatchObject({ fuel: 'gas', utility: 'eversource', kwh: 500, incomeEligible: 'unsure' })
    expect(sanitizeProfile(JSON.parse(mergeMapProfile(null, gas)))).toMatchObject({ fuel: 'gas', kwh: 500 })
  })
  it('maps a propane home with a municipal electric bill', () => {
    const propane = mapProfileFrom({ town: 'Concord', fuel: 'propane', electric: { units: '9,600', utility: 'municipal' }, income: 'yes' })
    expect(propane).toMatchObject({ fuel: 'propane', utility: 'municipal', kwh: 800, incomeEligible: 'yes' })
    expect(sanitizeProfile(JSON.parse(mergeMapProfile(null, propane)))).toMatchObject({ fuel: 'propane', utility: 'municipal', incomeEligible: 'yes' })
  })
  it('recovers from corrupt storage', () => {
    expect(JSON.parse(mergeMapProfile('{nope', fields)).town).toBe('Newton')
  })
})
