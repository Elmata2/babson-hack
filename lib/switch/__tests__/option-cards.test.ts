/** @built F-152 tests for the outreach copy */

import { describe, expect, it } from 'vitest'

import { computeVerdict } from '@/lib/calc'
import { outreachCopy, type OptionInput } from '../option-cards'

function result(fuel: 'oil' | 'propane' | 'gas', units: number, price: number, tier: 'whole' | 'enhanced') {
  const r = computeVerdict(
    { fuel, annualUnits: units, unitPrice: price, hdd65: 5_599 },
    { tier, installYear: 2026, heatPumpRate: 0.235, standardRate: 0.305 },
  )
  if (!r) throw new Error('no verdict')
  return r
}

const base = (over: Partial<OptionInput> = {}): OptionInput => ({
  result: result('oil', 800, 6.23, 'whole'),
  fuel: 'oil',
  unitPrice: 6.23,
  annualUnits: 800,
  market: { price: 4.1, period: '2026-10-19' },
  basic: { centsPerKwh: 13.8, source: 'Eversource', sourceDate: '2026-08-01' },
  noMassSave: false,
  town: 'Framingham',
  plan: { mode: 'off' },
  reachable: { fuel: 3, installer: 3 },
  ...over,
})

describe('outreachCopy', () => {
  it('never claims the agent acts when outreach is off', () => {
    const copy = outreachCopy('dealers', base())
    expect(copy.what).toContain('switched off')
    expect(copy.live).toBe(false)
    expect(copy.what).not.toMatch(/emails up to/)
  })

  it('says the agent calls, and what it never says, in live mode', () => {
    const copy = outreachCopy('installers', base({ plan: { mode: 'live' } }))
    expect(copy.what).toMatch(/calls up to 3 installers/)
    expect(copy.what).toContain('never says your name')
    expect(copy.what).toContain('You compare what comes back and choose.')
    expect(copy.live).toBe(true)
  })

  it('uses the dial plan when email has no reachable row', () => {
    const copy = outreachCopy(
      'installers',
      base({
        plan: { mode: 'off' },
        call: { mode: 'live' },
        reachable: { fuel: 0, installer: 0 },
      }),
    )
    expect(copy.live).toBe(true)
    expect(copy.what).toContain('calls up to 2 installers')
  })

  it('says the demo replays a fixture and dials nothing', () => {
    const copy = outreachCopy('installers', base({ demo: true }))
    expect(copy.live).toBe(true)
    expect(copy.what).toContain('Demo mode')
    expect(copy.what).toContain('Nothing is dialled')
  })

  it('caps the provider count at the session limit', () => {
    expect(outreachCopy('dealers', base({ plan: { mode: 'live' }, reachable: { fuel: 40, installer: 0 } })).what).toContain('up to 6')
  })

  it('falls back to the kit when no provider of that kind is reachable', () => {
    const copy = outreachCopy('installers', base({ plan: { mode: 'live' }, reachable: { fuel: 2, installer: 0 } }))
    expect(copy.live).toBe(false)
    expect(copy.what).toContain('nothing is sent')
    expect(copy.what).not.toMatch(/emails up to/)
  })

  it('labels allowlist mode as team test lines', () => {
    expect(outreachCopy('dealers', base({ plan: { mode: 'allowlist' } })).what).toContain('test lines only')
  })
})
