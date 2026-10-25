/**
 * Unit test for the untested `elapsedOf` in lib/calls/route-model.ts.
 *
 * `elapsedOf` reads `?t=<ms>` from a URL and clamps it to [0, 120000] so a
 * hand-edited URL cannot stage a year-long replay. Missing, negative, or
 * non-finite values return 0.
 */

import { describe, expect, it } from 'vitest'

import { elapsedOf } from '../route-model'

function url(t: string | null): URL {
  const base = new URL('https://example.org/replay')
  if (t !== null) base.searchParams.set('t', t)
  return base
}

describe('elapsedOf', () => {
  it('returns 0 when t is absent', () => {
    expect(elapsedOf(url(null))).toBe(0)
  })

  it('returns the parsed value when it is a positive number', () => {
    expect(elapsedOf(url('5000'))).toBe(5_000)
  })

  it('returns 0 for a negative value', () => {
    expect(elapsedOf(url('-100'))).toBe(0)
  })

  it('returns 0 for a non-numeric string', () => {
    expect(elapsedOf(url('abc'))).toBe(0)
  })

  it('clamps to 120000 (two minutes)', () => {
    expect(elapsedOf(url('999999'))).toBe(120_000)
  })

  it('returns exactly 120000 at the clamp boundary', () => {
    expect(elapsedOf(url('120000'))).toBe(120_000)
  })

  it('returns 0 for NaN', () => {
    expect(elapsedOf(url('NaN'))).toBe(0)
  })

  it('returns 0 for Infinity (Number(Infinity) is finite but > 120000)', () => {
    // Number('Infinity') is Infinity, which is not finite, so it falls to 0.
    expect(elapsedOf(url('Infinity'))).toBe(0)
  })

  it('returns 0 for an empty string', () => {
    expect(elapsedOf(url(''))).toBe(0)
  })
})
