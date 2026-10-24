/**
 * @built F-10 live smoke against geocoding.geo.census.gov
 *
 * No key needed, so this runs by default and skips only when the network is
 * genuinely unreachable. It is the test that would have caught the `locations`
 * endpoint trap: an address with coordinates and no tract fails here.
 */

import { describe, expect, it } from 'vitest'

import { geocodeAddress, resetGeocodeCache } from '../index'

const WELLESLEY = '888 Washington St, Wellesley, MA'

describe('live geocoding.geo.census.gov', () => {
  it('resolves a Wellesley address to a Norfolk County tract', async (ctx) => {
    resetGeocodeCache()
    const result = await geocodeAddress(WELLESLEY, { bypassCache: true })

    if (!result.ok && (result.error.code === 'network' || result.error.code === 'timeout')) {
      ctx.skip() // offline: nothing to prove
      return
    }

    expect(result.ok).toBe(true)
    if (result.ok) {
      // A coordinate without a tract is the exact failure the wrong endpoint produces.
      expect(result.result.tract).toMatch(/^25\d{9}$/)
      expect(result.result.tract.startsWith('25021')).toBe(true) // Norfolk
      expect(result.result.county).toBe('25021')
      expect(result.result.countyName).toBe('Norfolk')
      expect(result.result.lat).toBeGreaterThan(42)
      expect(result.result.lat).toBeLessThan(43)
      expect(result.result.lon).toBeGreaterThan(-72)
      expect(result.result.lon).toBeLessThan(-70)
      expect(result.result.matchedAddress).toMatch(/WELLESLEY/)
    }
  }, 20_000)

  it('returns no_match for a fictional address instead of a nearby guess', async (ctx) => {
    resetGeocodeCache()
    const result = await geocodeAddress('99999 Nowhere Nonexistent Pkwy, ZZ', { bypassCache: true })

    if (!result.ok && (result.error.code === 'network' || result.error.code === 'timeout')) {
      ctx.skip()
      return
    }

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('no_match')
  }, 20_000)
})
