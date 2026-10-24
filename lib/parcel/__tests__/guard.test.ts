import { describe, expect, it } from 'vitest'

import { isResidentialUseCode, judgeParcel } from '../guard'

const base = { yearBuilt: 1900, bldAreaSqft: 6327, siteAddr: '34 Adams ST', useCode: '985', units: 1 }

describe('judgeParcel', () => {
  it('rejects an exact match for the wrong house number (12 vs 34 Adams)', () => {
    const v = judgeParcel({ expectedHouse: '12', parcel: { ...base, useCode: '101' } })
    expect(v).toMatchObject({ use: false, reason: 'wrong_house' })
  })

  it('rejects a tax-exempt record even at the right number', () => {
    const v = judgeParcel({ expectedHouse: '34', parcel: base })
    expect(v).toMatchObject({ use: false, reason: 'not_a_home' })
    if (!v.use) expect(v.message).toContain("isn't a home")
  })

  it('requires a house number on both sides', () => {
    expect(judgeParcel({ expectedHouse: null, parcel: { ...base, useCode: '101' } }).use).toBe(false)
    expect(judgeParcel({ expectedHouse: '34', parcel: { ...base, useCode: '101', siteAddr: 'ADAMS ST' } }).use).toBe(false)
  })

  it('accepts a single family home', () => {
    const v = judgeParcel({ expectedHouse: '34', parcel: { ...base, useCode: '101' } })
    expect(v).toMatchObject({ use: true, sqft: 6327, units: 1, sqftIsPerUnitEstimate: false, unitsNote: null })
  })

  it('divides sqft by units and says so', () => {
    const v = judgeParcel({ expectedHouse: '34', parcel: { ...base, useCode: '104', units: 3, bldAreaSqft: 3000 } })
    expect(v).toMatchObject({ use: true, sqft: 1000, units: 3, sqftIsPerUnitEstimate: true })
    if (v.use) expect(v.unitsNote).toBe('This building has 3 units — size for your unit.')
  })
})

describe('isResidentialUseCode', () => {
  it.each(['101', '102', '109', '111', '112', '013', '031', '1010'])('%s is a home', (c) => {
    expect(isResidentialUseCode(c)).toBe(true)
  })
  it.each(['110', '300', '325', '400', '985', '930', '0'])('%s is not', (c) => {
    expect(isResidentialUseCode(c)).toBe(false)
  })
  it('null is allowed', () => expect(isResidentialUseCode(null)).toBe(true))
  it.each(['0101', '0104', '012', '019'])('%s (leading zero or mixed-use residential) is a home', (c) => {
    expect(isResidentialUseCode(c)).toBe(true)
  })
  it.each(['R1', 'R3', 'CD', 'A'])('%s (a city code, not DOR) is not evidence against', (c) => {
    expect(isResidentialUseCode(c)).toBe(true)
  })
})
