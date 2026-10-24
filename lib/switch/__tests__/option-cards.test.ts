/** @built F-152 tests for the decision cards' copy */

import { describe, expect, it } from 'vitest'

import { computeVerdict } from '@/lib/calc'
import { optionCard, optionsSummary, type OptionInput } from '../option-cards'

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
  plan: { mode: 'off' },
  reachable: { fuel: 3, installer: 3 },
  ...over,
})

describe('optionCard', () => {
  it('never claims the agent acts when outreach is off', () => {
    const card = optionCard('SHOP_FUEL', base())
    expect(card.what).toContain('switched off')
    expect(card.agent?.live).toBe(false)
    expect(card.what).not.toMatch(/emails up to/)
  })

  it('says email only, no calls, and replies are not read in live mode', () => {
    const card = optionCard('SWITCH_HEAT_PUMP', base({ plan: { mode: 'live' } }))
    expect(card.what).toMatch(/emails up to 3 installers/)
    expect(card.what).toContain('no phone calls')
    expect(card.what).toContain('does not read replies')
    expect(card.agent?.label).toBe('Let the agent get quotes')
  })

  it('caps the provider count at the session limit', () => {
    expect(optionCard('SHOP_FUEL', base({ plan: { mode: 'live' }, reachable: { fuel: 40, installer: 0 } })).what).toContain('up to 6')
  })

  it('falls back to the kit when no provider of that kind is reachable', () => {
    const card = optionCard('SWITCH_HEAT_PUMP', base({ plan: { mode: 'live' }, reachable: { fuel: 2, installer: 0 } }))
    expect(card.agent?.live).toBe(false)
    expect(card.what).toContain('nothing is sent')
    expect(card.what).not.toMatch(/emails up to/)
  })

  it('gives every card a filled primary action', () => {
    expect(optionCard('STAY', base()).primary).toBe(true)
    expect(optionCard('SHOP_SUPPLY', base()).primary).toBe(true)
    expect(optionCard('SHOP_FUEL', base()).primary).toBe(false)
  })

  it('labels allowlist mode as team test lines', () => {
    expect(optionCard('SHOP_FUEL', base({ plan: { mode: 'allowlist' } })).what).toContain('test lines only')
  })

  it('gives STAY and supply no agent action', () => {
    expect(optionCard('STAY', base()).agent).toBeNull()
    expect(optionCard('SHOP_SUPPLY', base()).agent).toBeNull()
  })

  it('uses the household figures in the fuel reason', () => {
    expect(optionCard('SHOP_FUEL', base()).why).toContain('$2.13/gal more than the $4.10')
  })

  it('does not suggest a saving when the household is under the average', () => {
    const why = optionCard('SHOP_FUEL', base({ unitPrice: 3.9 })).why
    expect(why).toContain('at or below')
    expect(why).not.toMatch(/about \$/)
  })

  it('prints no supply rate when none is published', () => {
    expect(optionCard('SHOP_SUPPLY', base({ basic: null })).why).toContain('none is printed')
  })

  it('prints break-even for a household the heat pump does not pay', () => {
    const input = base({ result: result('gas', 1000, 1.9, 'whole'), fuel: 'gas' })
    expect(input.result.verdict).toBe('DO_NOT_SWITCH_YET')
    expect(optionCard('STAY', input).why).toContain('flips if electricity passes')
    expect(optionCard('SWITCH_HEAT_PUMP', input).why).toContain('not the running cost')
  })

  it('pluralises the summary', () => {
    expect(optionsSummary(4)).toBe("You have 4 options. Here's why you'd pick each.")
    expect(optionsSummary(1)).toContain('1 option.')
  })
})
