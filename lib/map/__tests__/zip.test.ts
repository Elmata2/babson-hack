import { describe, expect, it } from 'vitest'
import { isZip, lookupZip } from '../zip'

describe('lookupZip', () => {
  it('resolves Wellesley and Boston', () => {
    expect(lookupZip('02482')?.town).toBe('WELLESLEY')
    expect(lookupZip('02108')?.town).toBe('BOSTON')
  })
  it('returns a [lon, lat] inside Massachusetts', () => {
    const hit = lookupZip('02482')
    expect(hit?.lon).toBeGreaterThan(-74)
    expect(hit?.lon).toBeLessThan(-69)
    expect(hit?.lat).toBeGreaterThan(41)
    expect(hit?.lat).toBeLessThan(43)
  })
  it('returns null for a ZIP that is not in Massachusetts or not a ZIP', () => {
    expect(lookupZip('99999')).toBeNull()
    expect(lookupZip('0248')).toBeNull()
    expect(lookupZip('abcde')).toBeNull()
  })
  it('isZip accepts exactly five digits', () => {
    expect(isZip(' 02482 ')).toBe(true)
    expect(isZip('024821')).toBe(false)
    expect(isZip('1 Main St')).toBe(false)
  })
})
