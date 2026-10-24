/**
 * @built F-49 forced-snapshot prices — no cache, no key, no fetch
 *
 * The test that matters for R13.1: `getPrices({ demo: true })` must return the
 * baked envelope even when a key is present and a `fetchImpl` is armed to fail.
 * A single call through to `fetch` would mean the venue wifi is load-bearing.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getPrices, resetPriceCache } from '../index'

beforeEach(() => {
  resetPriceCache()
})

describe('getPrices in demo mode', () => {
  it('never calls fetch, even with a key and a fetch impl that would throw', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network call in demo mode')
    })

    const prices = await getPrices({ demo: true, apiKey: 'KEY', fetchImpl })

    expect(fetchImpl).not.toHaveBeenCalled()
    expect(prices.mode).toBe('snapshot')
    expect(prices.errors).toEqual([])
    expect(prices.crosscheck).toEqual({ oil: null, propane: null })
    expect(prices.notes.join(' ')).toContain('Demo mode')
  })

  it('returns the same numbers as the no-key snapshot, so the verdict is identical', async () => {
    const demo = await getPrices({ demo: true, apiKey: 'KEY' })
    resetPriceCache()
    const noKey = await getPrices({ apiKey: '', bypassCache: true })

    expect(demo.oil).toEqual(noKey.oil)
    expect(demo.propane).toEqual(noKey.propane)
    expect(demo.elec).toEqual(noKey.elec)
    expect(demo.asOf).toBe(noKey.asOf)
    expect(demo.mode).toBe(noKey.mode)
  })

  it('does not read or write the live cache', async () => {
    let now = 1_000
    const live = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ response: { data: [{ period: '2026-10-19', value: 6.115 }] } }),
    }))

    // Warm a cache entry in normal mode.
    await getPrices({ apiKey: 'KEY', fetchImpl: live, now: () => now })
    expect(live).toHaveBeenCalled()

    live.mockClear()
    const demo = await getPrices({ demo: true, apiKey: 'KEY', fetchImpl: live, now: () => now })
    expect(live).not.toHaveBeenCalled()
    expect(demo.oil.usdPerUnit).not.toBe(6.115)

    // And the demo call did not evict the live entry for the next request.
    now += 1
    const cached = await getPrices({ apiKey: 'KEY', fetchImpl: live, now: () => now })
    expect(live).not.toHaveBeenCalled()
    expect(cached.oil.usdPerUnit).toBe(demo.oil.usdPerUnit)
  })

  it('leaves the default path unchanged: a key still reads EIA', async () => {
    const fetchImpl = vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () => {
        if (url.includes('ELECTRICITY') || url.includes('ELEC')) {
          return { response: { data: [{ period: '2026-08', price: 30.48 }] } }
        }
        return { response: { data: [{ period: '2026-10-19', value: 6.115 }] } }
      },
    }))

    const prices = await getPrices({ apiKey: 'KEY', fetchImpl, bypassCache: true })

    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(prices.elec.usdPerUnit).toBeCloseTo(0.3048, 6)
    expect(prices.mode).toBe('live')
  })
})
