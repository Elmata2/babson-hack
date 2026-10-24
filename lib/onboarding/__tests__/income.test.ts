import { describe, expect, it } from 'vitest'

import { eligibilityFor, enhancedLimitFor, incomeResultCopy, parseIncome } from '../income'

describe('enhancedLimitFor', () => {
  it('reads the official table', () => {
    expect(enhancedLimitFor(1)).toBe(71447)
    expect(enhancedLimitFor(4)).toBe(137399)
    expect(enhancedLimitFor(8)).toBe(189610)
  })
  it('has no limit outside the table', () => {
    expect(enhancedLimitFor(0)).toBeNull()
    expect(enhancedLimitFor(18)).toBeNull()
    expect(enhancedLimitFor(2.5)).toBeNull()
  })
})

describe('eligibilityFor', () => {
  it('is yes well under the limit', () => {
    expect(eligibilityFor(4, 90000)).toBe('yes')
  })
  it('is no well over the limit', () => {
    expect(eligibilityFor(4, 160000)).toBe('no')
  })
  it('is unsure within 5% either side', () => {
    expect(eligibilityFor(1, 71447)).toBe('unsure')
    expect(eligibilityFor(1, 71447 * 0.96)).toBe('unsure')
    expect(eligibilityFor(1, 71447 * 1.04)).toBe('unsure')
    expect(eligibilityFor(1, 71447 * 0.94)).toBe('yes')
    expect(eligibilityFor(1, 71447 * 1.06)).toBe('no')
  })
  it('is unsure without a usable answer', () => {
    expect(eligibilityFor(null, 50000)).toBe('unsure')
    expect(eligibilityFor(3, null)).toBe('unsure')
    expect(eligibilityFor(3, 0)).toBe('unsure')
    expect(eligibilityFor(3, Number.NaN)).toBe('unsure')
  })
  it('never says no to an 8-or-more household over the 8-person limit', () => {
    expect(eligibilityFor(8, 250000)).toBe('unsure')
    expect(eligibilityFor(8, 100000)).toBe('yes')
  })
})

describe('incomeResultCopy', () => {
  it('names the income, the size and the phone number', () => {
    const text = incomeResultCopy(3, 80000)
    expect(text).toContain('$80,000 for a household of 3')
    expect(text).toContain('likely under')
    expect(text).toContain('888-714-3990')
    expect(text).toContain('limits can vary by ZIP')
  })
  it('says over, and falls back to the standard rebate', () => {
    expect(incomeResultCopy(2, 200000)).toContain('likely over')
  })
  it('says close for the unsure band', () => {
    expect(incomeResultCopy(2, 93431)).toContain('close to')
  })
  it('is null until both answers are in', () => {
    expect(incomeResultCopy(null, 80000)).toBeNull()
    expect(incomeResultCopy(3, null)).toBeNull()
  })
})

describe('parseIncome', () => {
  it('accepts formatted numbers', () => {
    expect(parseIncome('$85,000')).toBe(85000)
    expect(parseIncome(' 85000 ')).toBe(85000)
  })
  it('accepts a k suffix', () => {
    expect(parseIncome('85k')).toBe(85000)
    expect(parseIncome('$85K')).toBe(85000)
    expect(parseIncome('85.5k')).toBe(85500)
  })
  it('rejects exponent notation', () => {
    expect(parseIncome('1e5')).toBeNull()
    expect(parseIncome('8.5e4')).toBeNull()
    expect(parseIncome('k')).toBeNull()
  })
  it('rejects non-numbers and zero', () => {
    expect(parseIncome('')).toBeNull()
    expect(parseIncome('abc')).toBeNull()
    expect(parseIncome('0')).toBeNull()
    expect(parseIncome('-5')).toBeNull()
  })
})
