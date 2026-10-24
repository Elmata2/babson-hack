/**
 * @built F-10 geocoder contract: the endpoint trap, the tract gate, and the privacy rule
 *
 * The payloads below are trimmed from real Census responses captured on
 * 2026-10-24, so the shapes are not invented.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import type { FetchLike } from '../../net/json'
import { CACHE_TTL_MS, geocodeAddress, geocodeUrl, readMatch, resetGeocodeCache } from '../index'

/** Real `geographies/onelineaddress` payload for 888 Washington St, Wellesley. */
const REAL_MATCH = {
  result: {
    addressMatches: [
      {
        matchedAddress: '888 WASHINGTON ST, WELLESLEY, MA, 02482',
        coordinates: { x: -71.308457238005, y: 42.279618063349 },
        geographies: {
          Counties: [{ GEOID: '25021', BASENAME: 'Norfolk', NAME: 'Norfolk County' }],
          'Census Tracts': [
            {
              GEOID: '25021404400',
              NAME: 'Census Tract 4044',
              COUNTY: '021',
              STATE: '25',
              TRACT: '404400',
            },
          ],
          '2020 Census Blocks': [{ GEOID: '250214044001000' }],
        },
      },
    ],
  },
}

/** What the WRONG endpoint returns: a great match, coordinates, and no geographies. */
const LOCATIONS_ENDPOINT_MATCH = {
  result: {
    addressMatches: [
      {
        matchedAddress: '888 WASHINGTON ST, WELLESLEY, MA, 02482',
        coordinates: { x: -71.308457238005, y: 42.279618063349 },
      },
    ],
  },
}

function ok(body: unknown): { ok: boolean; status: number; json(): Promise<unknown> } {
  return { ok: true, status: 200, json: async () => body }
}

function mockFetch(body: unknown, calls: string[] = []): FetchLike {
  return async (url) => {
    calls.push(url)
    return ok(body)
  }
}

describe('geocodeUrl — the endpoint choice', () => {
  it('uses the geographies service, not the locations service', () => {
    const url = new URL(geocodeUrl('888 Washington St, Wellesley, MA'))
    expect(url.pathname).toBe('/geocoder/geographies/onelineaddress')
    expect(url.pathname).not.toContain('/locations/')
  })

  it('pins the benchmark and vintage that return geographies', () => {
    const url = new URL(geocodeUrl('888 Washington St, Wellesley, MA'))
    expect(url.searchParams.get('benchmark')).toBe('Public_AR_Current')
    expect(url.searchParams.get('vintage')).toBe('Current_Current')
    expect(url.searchParams.get('format')).toBe('json')
  })
})

describe('readMatch', () => {
  it('reads tract, county, name, coordinates and block from a real payload', () => {
    const match = readMatch(REAL_MATCH)

    expect(match).not.toBeNull()
    expect(match?.tract).toBe('25021404400')
    expect(match?.county).toBe('25021')
    expect(match?.countyName).toBe('Norfolk')
    expect(match?.lat).toBeCloseTo(42.2796, 4)
    expect(match?.lon).toBeCloseTo(-71.3085, 4)
    expect(match?.block).toBe('250214044001000')
    expect(match?.matchedAddress).toContain('WELLESLEY')
  })

  it('rejects a coordinate that came back without a tract', () => {
    // This is the `locations` endpoint. It "works" and costs you every tract join.
    expect(readMatch(LOCATIONS_ENDPOINT_MATCH)).toBeNull()
  })

  it('returns null when nothing matched', () => {
    expect(readMatch({ result: { addressMatches: [] } })).toBeNull()
    expect(readMatch({ result: {} })).toBeNull()
    expect(readMatch(null)).toBeNull()
  })

  it('derives the county FIPS from the tract when the Counties block is absent', () => {
    const noCounties = {
      result: {
        addressMatches: [
          {
            matchedAddress: 'X',
            coordinates: { x: -71, y: 42 },
            geographies: { 'Census Tracts': [{ GEOID: '25021404400' }] },
          },
        ],
      },
    }
    expect(readMatch(noCounties)?.county).toBe('25021')
  })
})

describe('geocodeAddress', () => {
  beforeEach(() => {
    resetGeocodeCache()
  })

  it('rejects a too-short address without spending a request', async () => {
    const calls: string[] = []
    const result = await geocodeAddress('abc', { fetchImpl: mockFetch(REAL_MATCH, calls) })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('empty')
    expect(calls).toHaveLength(0)
  })

  it('resolves a real address to a tract and county', async () => {
    const result = await geocodeAddress('888 Washington St, Wellesley, MA', {
      fetchImpl: mockFetch(REAL_MATCH),
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.result.tract).toBe('25021404400')
      expect(result.result.county).toBe('25021')
    }
  })

  it('maps an unmatched address to a typed no_match the UI can act on', async () => {
    const result = await geocodeAddress('nowhere at all', {
      fetchImpl: mockFetch({ result: { addressMatches: [] } }),
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('no_match')
      expect(result.error.message).toMatch(/manually/i)
    }
  })

  it('surfaces a timeout as a timeout, not a hang', async () => {
    const hanging: FetchLike = async () => {
      const error = new Error('timed out')
      error.name = 'TimeoutError'
      throw error
    }

    const result = await geocodeAddress('888 Washington St, Wellesley, MA', { fetchImpl: hanging })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('timeout')
  })

  it('caches a match for 30 days and refetches when bypassed', async () => {
    const calls: string[] = []
    let clock = 1_000
    const now = () => clock
    const fetchImpl = mockFetch(REAL_MATCH, calls)

    await geocodeAddress('888 Washington St, Wellesley, MA', { fetchImpl, now })
    expect(calls).toHaveLength(1)

    await geocodeAddress('888 washington st,  wellesley, ma', { fetchImpl, now })
    expect(calls).toHaveLength(1) // normalised, so it is the same key

    clock += CACHE_TTL_MS + 1
    await geocodeAddress('888 Washington St, Wellesley, MA', { fetchImpl, now })
    expect(calls).toHaveLength(2)

    await geocodeAddress('888 Washington St, Wellesley, MA', { fetchImpl, now, bypassCache: true })
    expect(calls).toHaveLength(3)
  })

  it('never puts the street address into an error message', async () => {
    const address = '888 Washington St, Wellesley, MA'
    const result = await geocodeAddress(address, {
      fetchImpl: async () => {
        throw new Error('socket closed')
      },
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.message).not.toContain('888')
      expect(result.error.message).not.toContain('Washington')
    }
  })
})
