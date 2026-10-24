/**
 * @built F-50 R14.3 — the enhanced path is offered where it is true, and only there
 *
 * The offer is money, so the conditions matter more than the copy: an oil, propane
 * or resistance home that is not already on the enhanced tier, at an address where
 * Mass Save exists. A gas home is refused by the rebate table itself, and a
 * municipal light plant has no Mass Save programme to be income-qualified inside.
 *
 * The link is the *whole* query with two keys changed, so switching to the
 * enhanced path cannot lose the bill, the town or the install quote — the same
 * guarantee `withBonus` gives.
 */

import { describe, expect, it } from 'vitest'

import { tierRule } from '@/lib/calc/rules'

import { OFFER_TIER, enhancedOffer } from '../enhanced-offer'
import { FIXTURES } from './fixtures'

const PARAMS = { fuel: 'oil', units: '800', price: '6.23', town: 'Framingham', tier: 'whole', year: '2026', inc: 'no', ut: 'eversource' }

const oilWhole = FIXTURES.find((fixture) => fixture.name === 'oil, whole-home, 2027')!.result
const gasWhole = FIXTURES.find((fixture) => fixture.name === 'gas, whole-home, 2026')!.result
const oilEnhanced = FIXTURES.find((fixture) => fixture.name === 'oil, enhanced, 2026')!.result
const resistance = FIXTURES.find((fixture) => fixture.name === 'resistance, partial-home, 2026')!.result

describe('enhancedOffer — R14.3', () => {
  it('offers the enhanced path to an oil home that is not on it', () => {
    const offer = enhancedOffer(oilWhole, PARAMS, { noMassSave: false })
    expect(offer.show).toBe(true)
    expect(offer.headline).not.toBe('')
    expect(offer.body).not.toBe('')
    expect(offer.linkLabel).not.toBe('')
    expect(offer.href).not.toBeNull()
  })

  it('offers it to a resistance home too', () => {
    expect(enhancedOffer(resistance, PARAMS, { noMassSave: false }).show).toBe(true)
  })

  it('says nothing when the household is already on the enhanced tier', () => {
    expect(enhancedOffer(oilEnhanced, PARAMS, { noMassSave: false }).show).toBe(false)
  })

  it('says nothing for gas: the table closes the tier to it', () => {
    expect(enhancedOffer(gasWhole, PARAMS, { noMassSave: false }).show).toBe(false)
  })

  it('says nothing at a municipal light plant: there is no Mass Save award to qualify for', () => {
    expect(enhancedOffer(oilWhole, PARAMS, { noMassSave: true }).show).toBe(false)
  })

  it('links to the enhanced tier with the income answer set, keeping every other key', () => {
    const offer = enhancedOffer(oilWhole, PARAMS, { noMassSave: false })
    const url = new URL(offer.href!, 'https://example.test')
    const query = url.searchParams

    expect(url.pathname).toBe('/verdict')
    expect(query.get('tier')).toBe(OFFER_TIER)
    expect(query.get('inc')).toBe('yes')
    for (const [key, value] of Object.entries(PARAMS)) {
      if (key === 'tier' || key === 'inc') continue
      expect(query.get(key), key).toBe(value)
    }
  })

  it('quotes the cap out of the rebate table, not out of the copy', () => {
    for (const year of [2026, 2027] as const) {
      const rule = tierRule(year, 'enhanced')
      expect(rule).not.toBeNull()
      const offer = enhancedOffer({ ...oilWhole, installYear: year }, PARAMS, { noMassSave: false })
      expect(offer.body).toContain(rule!.capUsd.toLocaleString('en-US'))
    }
  })

  it('never claims eligibility, approval or a guaranteed saving', () => {
    const offer = enhancedOffer(oilWhole, PARAMS, { noMassSave: false })
    const text = `${offer.headline} ${offer.body} ${offer.linkLabel}`
    expect(text).not.toMatch(/guarantee/i)
    expect(text).not.toMatch(/\bapproved\b/i)
    expect(text).not.toMatch(/\byou qualify\b/i)
    expect(text).not.toMatch(/\bwill save\b/i)
    expect(text).toMatch(/may pay more/i)
    expect(text).toMatch(/Home Energy Assessment decides/i)
  })

  it('is deterministic and returns a hidden offer with no link when it is not shown', () => {
    const hidden = enhancedOffer(gasWhole, PARAMS, { noMassSave: false })
    expect(hidden.href).toBeNull()
    expect(hidden).toEqual(enhancedOffer(gasWhole, PARAMS, { noMassSave: false }))
  })
})
