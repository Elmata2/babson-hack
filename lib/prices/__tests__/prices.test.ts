/**
 * @built F-09 EIA adapter contract: the value/price trap, the DOER headline rule,
 * the snapshot fallback, and the cache.
 *
 * Every case here is a failure we would otherwise ship: `$NaN` on electricity, a
 * live number replacing the DOER headline, a silent fallback that looks live, or
 * a key that is absent and somehow still produces a figure.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import {
  CACHE_TTL_MS,
  DIVERGENCE_LIMIT_PCT,
  FAILURE_CACHE_TTL_MS,
  divergencePct,
  getPrices,
  resetPriceCache,
} from '../index'
import { readApiError, readSeries, SERIES, seriesUrl, type FetchLike } from '../eia'

// The snapshot the fallback must produce, from data/snapshots/fuel-2026-10-19.json.
const DOER_OIL = 6.23
const DOER_PROPANE = 3.91
const SNAPSHOT_ELEC = 0.3049

function json(body: unknown, status = 200): { ok: boolean; status: number; json(): Promise<unknown> } {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

function payloadFor(url: string): unknown {
  if (url.includes(SERIES.oil.id)) {
    return { response: { data: [{ period: '2026-10-19', value: 6.115 }] } }
  }
  if (url.includes(SERIES.propane.id)) {
    return { response: { data: [{ period: '2026-10-19', value: 3.659 }] } }
  }
  if (url.includes(SERIES.electricity.id)) {
    return { response: { data: [{ period: '2026-08', price: 30.48, 'price-units': 'cents per kilowatt-hour' }] } }
  }
  return json({ error: { code: 'NOT_FOUND', message: 'unknown series' } }, 404)
}

/** A fetch that answers every series correctly, and counts the calls. */
function liveFetch(calls: string[] = []): FetchLike {
  return async (url) => {
    calls.push(url)
    return json(payloadFor(url))
  }
}

function failingFetch(status = 500): FetchLike {
  return async (url) => json({ error: { code: 'FAILED', message: `${url} ${status}` } }, status)
}

describe('readSeries — the per-series field trap', () => {
  it('reads `value` for the petroleum series', () => {
    const reading = readSeries(
      { response: { data: [{ period: '2026-10-19', value: 6.115 }] } },
      SERIES.oil as never,
    )
    expect(reading).toEqual({ usdPerUnit: 6.115, period: '2026-10-19', label: SERIES.oil.label })
  })

  it('reads `price` and converts cents to dollars for electricity', () => {
    const reading = readSeries(
      { response: { data: [{ period: '2026-08', price: 30.48 }] } },
      SERIES.electricity as never,
    )
    expect(reading?.usdPerUnit).toBeCloseTo(0.3048, 6)
    expect(reading?.period).toBe('2026-08')
  })

  it('returns null, not undefined, when the series expects `price` and only `value` is present', () => {
    // This is the exact bug the generic adapter shipped: electricity read as `value`.
    const reading = readSeries(
      { response: { data: [{ period: '2026-08', value: 30.48 }] } },
      SERIES.electricity as never,
    )
    expect(reading).toBeNull()
  })

  it('returns null for an empty payload rather than a zero price', () => {
    expect(readSeries({ response: { data: [] } }, SERIES.oil as never)).toBeNull()
    expect(readSeries({}, SERIES.oil as never)).toBeNull()
    expect(readSeries(null, SERIES.oil as never)).toBeNull()
  })

  it('rejects a non-positive price instead of showing a free gallon', () => {
    expect(readSeries({ response: { data: [{ period: '2026-10-19', value: 0 }] } }, SERIES.oil as never)).toBeNull()
    expect(readSeries({ response: { data: [{ period: '2026-10-19', value: -1 }] } }, SERIES.oil as never)).toBeNull()
  })
})

describe('readApiError', () => {
  it('separates an invalid key from a provider failure', () => {
    expect(readApiError({ error: { code: 'API_KEY_INVALID', message: 'bad key' } })?.code).toBe('no_key')
    expect(readApiError({ error: { code: 'SERVER_ERROR', message: 'boom' } })?.code).toBe('api')
    expect(readApiError({ response: {} })).toBeNull()
  })
})

describe('seriesUrl', () => {
  it('asks EIA for exactly one newest row, with the key', () => {
    const url = new URL(seriesUrl(SERIES.oil as never, 'KEY123'))
    expect(url.host).toBe('api.eia.gov')
    expect(url.pathname).toBe(`/v2/seriesid/${SERIES.oil.id}`)
    expect(url.searchParams.get('api_key')).toBe('KEY123')
    expect(url.searchParams.get('length')).toBe('1')
    expect(url.searchParams.get('sort[0][column]')).toBe('period')
    expect(url.searchParams.get('sort[0][direction]')).toBe('desc')
  })
})

describe('divergencePct', () => {
  it('is signed and null-safe', () => {
    expect(divergencePct(6.23, 6.115)).toBeCloseTo(-1.846, 3)
    expect(divergencePct(0, 5)).toBeNull()
    expect(divergencePct(5, Number.NaN)).toBeNull()
  })
})

describe('getPrices', () => {
  beforeEach(() => {
    resetPriceCache()
  })

  it('falls back to the dated snapshot with no key, and says so', async () => {
    const prices = await getPrices({ apiKey: '', fetchImpl: liveFetch() })

    expect(prices.mode).toBe('snapshot')
    expect(prices.asOf).toBe('2026-10-19')
    expect(prices.oil.usdPerUnit).toBe(DOER_OIL)
    expect(prices.propane.usdPerUnit).toBe(DOER_PROPANE)
    expect(prices.elec.usdPerUnit).toBe(SNAPSHOT_ELEC)
    expect(prices.elec.source).toBe('EIA snapshot')
    expect(prices.notes.join(' ')).toMatch(/no eia_api_key/i)
  })

  it('keeps the DOER headline when live, and carries EIA only as a cross-check', async () => {
    const prices = await getPrices({ apiKey: 'KEY', fetchImpl: liveFetch() })

    expect(prices.mode).toBe('live')
    // ADR-002: the resident sees the survey number, not the machine read.
    expect(prices.oil.usdPerUnit).toBe(DOER_OIL)
    expect(prices.oil.source).toBe('DOER')
    expect(prices.crosscheck.oil?.usdPerUnit).toBe(6.115)
    expect(prices.crosscheck.oil?.agrees).toBe(true)
    expect(prices.notes.join(' ')).not.toMatch(/apart, showing doer/i)
  })

  it('lets EIA own electricity, because DOER publishes no $/kWh', async () => {
    const prices = await getPrices({ apiKey: 'KEY', fetchImpl: liveFetch() })

    expect(prices.elec.source).toBe('EIA')
    expect(prices.elec.usdPerUnit).toBeCloseTo(0.3048, 6)
    expect(prices.elec.period).toBe('2026-08')
    // The lag must be stated, not hidden behind "today".
    expect(prices.notes.join(' ')).toMatch(/lagged/)
  })

  it('logs a gap wider than 12% and still shows DOER', async () => {
    const spiking: FetchLike = async (url) => {
      if (url.includes(SERIES.oil.id)) {
        return json({ response: { data: [{ period: '2026-10-19', value: 9.5 }] } })
      }
      return json(payloadFor(url))
    }

    const prices = await getPrices({ apiKey: 'KEY', fetchImpl: spiking })

    expect(prices.oil.usdPerUnit).toBe(DOER_OIL)
    expect(prices.crosscheck.oil?.agrees).toBe(false)
    expect(Math.abs(prices.crosscheck.oil?.divergencePct ?? 0)).toBeGreaterThan(DIVERGENCE_LIMIT_PCT)
    expect(prices.notes.join(' ')).toMatch(/showing DOER per ADR-002/)
  })

  it('is `partial` when only electricity fails, and falls back for that one field', async () => {
    const mostlyUp: FetchLike = async (url) => {
      if (url.includes(SERIES.electricity.id)) return json({ error: { code: 'FAILED', message: 'down' } }, 503)
      return json(payloadFor(url))
    }

    const prices = await getPrices({ apiKey: 'KEY', fetchImpl: mostlyUp })

    expect(prices.mode).toBe('partial')
    expect(prices.elec.usdPerUnit).toBe(SNAPSHOT_ELEC)
    expect(prices.oil.usdPerUnit).toBe(DOER_OIL)
    expect(prices.notes.join(' ')).toMatch(/snapshot rate/)
  })

  it('is `snapshot` when every call fails, and reports typed errors', async () => {
    const prices = await getPrices({ apiKey: 'KEY', fetchImpl: failingFetch(500) })

    expect(prices.mode).toBe('snapshot')
    expect(prices.oil.usdPerUnit).toBe(DOER_OIL)
    expect(prices.elec.usdPerUnit).toBe(SNAPSHOT_ELEC)
    expect(prices.errors).toHaveLength(3)
    expect(prices.errors.every((e) => e.code === 'api' || e.code === 'http')).toBe(true)
  })

  it('treats a rejected key as no_key, not as a price of zero', async () => {
    const rejected: FetchLike = async () =>
      json({ error: { code: 'API_KEY_INVALID', message: 'An invalid api_key was supplied.' } }, 403)

    const prices = await getPrices({ apiKey: 'BAD', fetchImpl: rejected })

    expect(prices.mode).toBe('snapshot')
    expect(prices.errors.every((e) => e.code === 'no_key')).toBe(true)
    expect(prices.oil.usdPerUnit).toBe(DOER_OIL)
  })

  it('survives a timeout without throwing', async () => {
    const hanging: FetchLike = async () => {
      const err = new Error('The operation timed out.')
      err.name = 'TimeoutError'
      throw err
    }

    const prices = await getPrices({ apiKey: 'KEY', fetchImpl: hanging })

    expect(prices.mode).toBe('snapshot')
    expect(prices.errors.some((e) => e.code === 'network' && /timed out/i.test(e.message))).toBe(true)
  })

  it('caches a healthy result for 24h and refetches on demand', async () => {
    const calls: string[] = []
    const fetchImpl = liveFetch(calls)

    let clock = 1_000
    const now = () => clock

    await getPrices({ apiKey: 'KEY', fetchImpl, now })
    expect(calls).toHaveLength(3)

    await getPrices({ apiKey: 'KEY', fetchImpl, now })
    expect(calls).toHaveLength(3) // still warm

    clock += CACHE_TTL_MS + 1
    await getPrices({ apiKey: 'KEY', fetchImpl, now })
    expect(calls).toHaveLength(6) // expired

    await getPrices({ apiKey: 'KEY', fetchImpl, now, bypassCache: true })
    expect(calls).toHaveLength(9)
  })

  it('caches a degraded result only briefly, so a blip does not pin the snapshot', async () => {
    const calls: string[] = []
    const flaky: FetchLike = async (url) => {
      calls.push(url)
      return json({ error: { code: 'FAILED', message: 'down' } }, 500)
    }

    let clock = 1_000
    const now = () => clock

    const first = await getPrices({ apiKey: 'KEY', fetchImpl: flaky, now })
    expect(first.mode).toBe('snapshot')
    expect(calls).toHaveLength(3)

    clock += FAILURE_CACHE_TTL_MS + 1
    await getPrices({ apiKey: 'KEY', fetchImpl: flaky, now })
    expect(calls).toHaveLength(6)
  })

  it('always returns a renderable envelope — every point carries its own period', async () => {
    const prices = await getPrices({ apiKey: 'KEY', fetchImpl: liveFetch() })

    for (const point of [prices.oil, prices.propane, prices.elec]) {
      expect(point.usdPerUnit).toBeGreaterThan(0)
      expect(point.period).toMatch(/^\d{4}-\d{2}/)
      expect(point.unit === 'gal' || point.unit === 'kWh').toBe(true)
      expect(point.source === 'DOER' || point.source === 'EIA' || point.source === 'EIA snapshot').toBe(true)
    }
  })
})
