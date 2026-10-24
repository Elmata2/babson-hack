/**
 * @built F-11 parcel contract: layer 1 only, real field names only, unknown stays null
 *
 * Two of these tests exist because the live service punished me for getting them
 * wrong during verification: layer 0 returns an empty feature set, and asking for
 * a `TOWN` field returns HTTP 400.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import type { FetchLike } from '../../net/json'
import {
  CACHE_TTL_MS,
  OUT_FIELDS,
  PARCEL_LAYER,
  isPlausibleCoordinate,
  parcelAt,
  parcelUrl,
  readParcel,
  resetParcelCache,
} from '../index'

/** Real layer-1 response for 890 Washington St, Wellesley. */
const REAL_PARCEL = {
  features: [
    {
      attributes: {
        YEAR_BUILT: 1884,
        USE_CODE: '101',
        SITE_ADDR: '890 WASHINGTON STREET',
        CITY: 'WELLESLEY',
        ZIP: null,
        BLD_AREA: 0,
        UNITS: 1,
        TOWN_ID: 317,
      },
    },
  ],
}

function mockFetch(body: unknown, calls: string[] = []): FetchLike {
  return async (url) => {
    calls.push(url)
    return { ok: true, status: 200, json: async () => body }
  }
}

describe('parcelUrl', () => {
  it('queries layer 1 and never layer 0', () => {
    const url = parcelUrl(42.279618, -71.308457)
    expect(url).toContain(`/MapServer/${PARCEL_LAYER}/query`)
    expect(url).not.toContain('/MapServer/0/')
    expect(PARCEL_LAYER).toBe(1)
  })

  it('sends the point as an ESRI geometry in WGS84', () => {
    const url = new URL(parcelUrl(42.279618, -71.308457))
    const geometry = JSON.parse(url.searchParams.get('geometry') ?? '{}')

    expect(geometry.x).toBeCloseTo(-71.308457, 6)
    expect(geometry.y).toBeCloseTo(42.279618, 6)
    expect(geometry.spatialReference.wkid).toBe(4326)
    expect(url.searchParams.get('inSR')).toBe('4326')
    expect(url.searchParams.get('geometryType')).toBe('esriGeometryPoint')
    expect(url.searchParams.get('returnGeometry')).toBe('false')
  })

  it('never asks for a field that does not exist on the layer', () => {
    // `TOWN` is not a field. Requesting it returns HTTP 400 "Failed to execute query".
    expect(OUT_FIELDS).not.toContain('TOWN')
    expect(OUT_FIELDS).toContain('CITY')
    expect(OUT_FIELDS).toContain('TOWN_ID')
    expect(OUT_FIELDS).toContain('YEAR_BUILT')
    expect(OUT_FIELDS).toContain('USE_CODE')
  })
})

describe('readParcel', () => {
  it('reads a real parcel', () => {
    const parcel = readParcel(REAL_PARCEL)

    expect(parcel?.yearBuilt).toBe(1884)
    expect(parcel?.useCode).toBe('101')
    expect(parcel?.siteAddr).toBe('890 WASHINGTON STREET')
    expect(parcel?.city).toBe('WELLESLEY')
    expect(parcel?.units).toBe(1)
    expect(parcel?.townId).toBe(317)
  })

  it('turns a missing YEAR_BUILT into null, never 0', () => {
    const parcel = readParcel({
      features: [{ attributes: { YEAR_BUILT: null, CITY: 'WELLESLEY' } }],
    })
    expect(parcel?.yearBuilt).toBeNull()
  })

  it('turns the dataset’s 0 building area into null', () => {
    // This dataset spells "unknown area" as 0. A calculator that trusted it
    // would size a heat pump for a house with no floor.
    const parcel = readParcel(REAL_PARCEL)
    expect(parcel?.bldAreaSqft).toBeNull()
  })

  it('keeps a real building area', () => {
    const parcel = readParcel({
      features: [{ attributes: { YEAR_BUILT: 1955, CITY: 'BOSTON', BLD_AREA: 2100 } }],
    })
    expect(parcel?.bldAreaSqft).toBe(2100)
  })

  it('returns null when no feature intersects', () => {
    // Layer 0 answers exactly like this at a Wellesley address.
    expect(readParcel({ features: [] })).toBeNull()
    expect(readParcel({})).toBeNull()
    expect(readParcel(null)).toBeNull()
  })

  it('returns null for a parcel with no address and no city', () => {
    expect(readParcel({ features: [{ attributes: {} }] })).toBeNull()
  })
})

describe('isPlausibleCoordinate', () => {
  it('catches an out-of-range value and a lon/lat swap', () => {
    expect(isPlausibleCoordinate(42.28, -71.31)).toBe(true)
    expect(isPlausibleCoordinate(200, -71.31)).toBe(false)
    expect(isPlausibleCoordinate(Number.NaN, -71.31)).toBe(false)
  })
})

describe('parcelAt', () => {
  beforeEach(() => {
    resetParcelCache()
  })

  it('rejects a bad coordinate before calling the service', async () => {
    const calls: string[] = []
    const result = await parcelAt(200, -71.31, { fetchImpl: mockFetch(REAL_PARCEL, calls) })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('invalid')
    expect(calls).toHaveLength(0)
  })

  it('resolves a parcel at a real coordinate', async () => {
    const result = await parcelAt(42.279618, -71.308457, { fetchImpl: mockFetch(REAL_PARCEL) })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.parcel.yearBuilt).toBe(1884)
      expect(result.parcel.city).toBe('WELLESLEY')
    }
  })

  it('tells the user to type the year when there is no parcel', async () => {
    const result = await parcelAt(42.279618, -71.308457, {
      fetchImpl: mockFetch({ features: [] }),
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('no_match')
      expect(result.error.message).toMatch(/manually/i)
    }
  })

  it('surfaces a timeout as a timeout', async () => {
    const hanging: FetchLike = async () => {
      const error = new Error('timed out')
      error.name = 'TimeoutError'
      throw error
    }

    const result = await parcelAt(42.279618, -71.308457, { fetchImpl: hanging })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('timeout')
  })

  it('turns a 400 into a typed http error, not a crash', async () => {
    const badRequest: FetchLike = async () => ({
      ok: false,
      status: 400,
      json: async () => ({ error: { code: 400, message: 'Failed to execute query.' } }),
    })

    const result = await parcelAt(42.279618, -71.308457, { fetchImpl: badRequest })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('http')
      if (result.error.code === 'http') expect(result.error.status).toBe(400)
    }
  })

  it('caches a parcel for 30 days at an ~11m grid', async () => {
    const calls: string[] = []
    let clock = 1_000
    const now = () => clock
    const fetchImpl = mockFetch(REAL_PARCEL, calls)

    await parcelAt(42.279618, -71.308457, { fetchImpl, now })
    expect(calls).toHaveLength(1)

    // Same building, sub-metre difference: same cache key.
    await parcelAt(42.27962, -71.308459, { fetchImpl, now })
    expect(calls).toHaveLength(1)

    clock += CACHE_TTL_MS + 1
    await parcelAt(42.279618, -71.308457, { fetchImpl, now })
    expect(calls).toHaveLength(2)
  })
})

describe('buffered lookup (address point on a street centreline)', () => {
  it('adds no distance parameter for an exact point query', () => {
    const url = new URL(parcelUrl(42.279618, -71.308457))
    expect(url.searchParams.get('distance')).toBeNull()
    expect(url.searchParams.get('units')).toBeNull()
  })

  it('buffers in metres when asked, so a geocoded point still finds its parcel', () => {
    const url = new URL(parcelUrl(42.279618, -71.308457, 20))
    expect(url.searchParams.get('distance')).toBe('20')
    expect(url.searchParams.get('units')).toBe('esriSRUnit_Meter')
  })

  it('keeps exact and buffered results in separate cache entries', async () => {
    resetParcelCache()
    const calls: string[] = []
    const fetchImpl = mockFetch(REAL_PARCEL, calls)
    const now = () => 1_000

    await parcelAt(42.279618, -71.308457, { fetchImpl, now })
    await parcelAt(42.279618, -71.308457, { fetchImpl, now, bufferMeters: 20 })
    expect(calls).toHaveLength(2)

    await parcelAt(42.279618, -71.308457, { fetchImpl, now, bufferMeters: 20 })
    expect(calls).toHaveLength(2)
  })
})
