/**
 * @built F-11 live smoke against MassGIS L3 parcels
 *
 * The second test is the important one: it queries layer 0 at the same point and
 * asserts it returns nothing. That documents the trap in executable form — layer 0
 * is Devens only, and an empty answer there looks identical to "no parcel".
 */

import { describe, expect, it } from 'vitest'

import { parcelAt, parcelUrl, resetParcelCache } from '../index'

/** 890 Washington St, Wellesley — a real single-family parcel. */
const LAT = 42.279618
const LON = -71.308457

describe('live MassGIS L3 parcels', () => {
  it('finds a parcel with an assessor year built', async (ctx) => {
    resetParcelCache()
    const result = await parcelAt(LAT, LON, { bypassCache: true })

    if (!result.ok && (result.error.code === 'network' || result.error.code === 'timeout')) {
      ctx.skip()
      return
    }

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.parcel.city).toBe('WELLESLEY')
      // Bounded, not pinned: assessor data gets corrected, and a test that
      // hard-codes 1884 breaks the first time they fix a typo.
      expect(result.parcel.yearBuilt).toBeGreaterThan(1650)
      expect(result.parcel.yearBuilt).toBeLessThan(2030)
      expect(result.parcel.siteAddr.length).toBeGreaterThan(0)
    }
  }, 20_000)

  it('proves layer 0 is Devens only — empty at a Wellesley point where layer 1 has a parcel', async (ctx) => {
    const layer0Url = parcelUrl(LAT, LON).replace('/MapServer/1/', '/MapServer/0/')

    let payload: { features?: unknown[] } | null = null
    try {
      const response = await fetch(layer0Url)
      payload = (await response.json()) as { features?: unknown[] }
    } catch {
      ctx.skip() // offline
      return
    }

    // This is why PARCEL_LAYER is pinned to 1 and a test asserts it.
    expect(payload.features).toHaveLength(0)
  }, 20_000)
})
