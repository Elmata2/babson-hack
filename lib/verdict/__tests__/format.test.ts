/**
 * Unit tests for the two untested formatters in lib/verdict/format.ts:
 * `usdExact` (dead export — no importer in the repo) and `one` (used by
 * lib/calc and components but never directly unit-tested).
 *
 * Also covers NaN / Infinity edge cases that none of the five formatters guard.
 */

import { describe, expect, it } from 'vitest'

import { cents, count, one, usd, usdExact } from '../format'

describe('usdExact', () => {
  it('formats a whole number with two decimal places', () => {
    expect(usdExact(4984)).toBe('$4,984.00')
  })

  it('formats a fractional value with two decimal places', () => {
    expect(usdExact(226.913_87)).toBe('$226.91')
  })

  it('preserves the sign for negative values', () => {
    expect(usdExact(-120.5)).toBe('-$120.50')
  })

  it('formats zero as $0.00', () => {
    expect(usdExact(0)).toBe('$0.00')
  })

  it('renders NaN as $NaN (no guard — known edge case)', () => {
    // This documents the current behaviour: the formatter trusts upstream and
    // does not guard against NaN. Upstream (lib/calc) guarantees finiteness, so
    // this is a defence-in-depth concern, not a runtime bug.
    expect(usdExact(Number.NaN)).toBe('$NaN')
  })
})

describe('one', () => {
  it('formats a value with one decimal place', () => {
    expect(one(3)).toBe('3.0')
    expect(one(5.16)).toBe('5.2')
  })

  it('rounds to one decimal', () => {
    expect(one(5.159_813)).toBe('5.2')
  })

  it('formats zero as 0.0', () => {
    expect(one(0)).toBe('0.0')
  })

  it('preserves the sign for negative values', () => {
    expect(one(-1.5)).toBe('-1.5')
  })

  it('renders NaN as "NaN" (no guard — known edge case)', () => {
    expect(one(Number.NaN)).toBe('NaN')
  })

  it('renders Infinity as "Infinity" (no guard — known edge case)', () => {
    expect(one(Number.POSITIVE_INFINITY)).toBe('Infinity')
  })
})

describe('existing formatters (regression guards)', () => {
  it('usd rounds to whole dollars above $100', () => {
    expect(usd(4984)).toBe('$4,984')
  })

  it('cents converts $/kWh to one-decimal cents', () => {
    expect(cents(0.235)).toBe('23.5¢')
  })

  it('count rounds to the nearest integer', () => {
    expect(count(9621.4)).toBe('9,621')
  })
})
