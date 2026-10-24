/**
 * @built F-09 live smoke against api.eia.gov — skipped unless a key is available
 *
 * This is the only test in the suite that touches the network, and it is the only
 * one that can catch EIA retiring a series id or changing a field name. It reads
 * `EIA_API_KEY` from the environment, then from `.env.local` (gitignored), and
 * skips cleanly when neither exists — so a clone with no keys still goes green.
 *
 * It asserts *shape and freshness*, never a price. Pinning a dollar figure here
 * would fail the moment EIA publishes next week's survey, which is the opposite
 * of useful.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { getPrices, resetPriceCache } from '../index'

function keyFromEnvFile(): string {
  const path = join(process.cwd(), '.env.local')
  if (!existsSync(path)) return ''
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const match = /^\s*EIA_API_KEY\s*=\s*(\S+)\s*$/.exec(line)
    if (match?.[1]) return match[1]
  }
  return ''
}

const apiKey = process.env.EIA_API_KEY || keyFromEnvFile()

describe.skipIf(!apiKey)('live api.eia.gov', () => {
  it('resolves all three verified series with a real key', async () => {
    resetPriceCache()
    const prices = await getPrices({ apiKey, bypassCache: true })

    expect(prices.mode).toBe('live')
    expect(prices.errors).toHaveLength(0)

    // Every point is dated. A number without a period is not renderable.
    expect(prices.oil.period).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(prices.propane.period).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(prices.elec.period).toMatch(/^\d{4}-\d{2}$/)

    // Sanity envelopes, not point predictions. If oil leaves $1–$20/gal, the
    // series id probably changed under us.
    expect(prices.oil.usdPerUnit).toBeGreaterThan(1)
    expect(prices.oil.usdPerUnit).toBeLessThan(20)
    expect(prices.propane.usdPerUnit).toBeGreaterThan(1)
    expect(prices.propane.usdPerUnit).toBeLessThan(20)

    // Electricity is dollars per kWh, so the cents/1000 trap shows up here:
    // a raw 30.48 would blow past this bound.
    expect(prices.elec.usdPerUnit).toBeGreaterThan(0.05)
    expect(prices.elec.usdPerUnit).toBeLessThan(1)
    expect(prices.elec.source).toBe('EIA')

    // ADR-002 still holds against the live API: DOER owns the headline.
    expect(prices.oil.source).toBe('DOER')
    expect(prices.crosscheck.oil).not.toBeNull()
  }, 20_000)
})
