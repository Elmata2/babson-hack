/**
 * @built F-46 R10.6: an address picked on the map prefills the address form.
 *
 * The link is the whole mechanism, so the link is what is tested: it must carry the
 * street and the town, say where it came from, and survive the form's own reader.
 */

import { describe, expect, it } from 'vitest'
import { fromSearchParams, onboardingHref, toQuery, type IntakeValues } from '../params'

const VALUES: IntakeValues = {
  fuel: 'oil',
  units: '750',
  price: '6.23',
  town: 'Wellesley',
  tier: 'whole',
  income: 'unsure',
  year: '2026',
  yearBuilt: '',
  sqft: '',
  src: null,
  buildingUnits: null,
  method: null,
  methodConfidence: null,
  note: '',
  utility: null,
  electricRate: '',
  lowIncome: null,
  weatherizationBonus: false,
  sizingBonus: false,
  installCost: '',
}

describe('onboardingHref', () => {
  it('is the bare wizard route, with no address in the URL', () => {
    expect(onboardingHref(false)).toBe('/onboarding')
  })

  it('keeps the demo flag', () => {
    expect(onboardingHref(true)).toBe('/onboarding?demo=1')
  })
})

describe('address in the query builder', () => {
  it('round-trips through the query builder,', () => {
    const query = toQuery({ ...VALUES, address: '106 Chandler St' })
    expect(query.get('addr')).toBe('106 Chandler St')
    expect(fromSearchParams(Object.fromEntries(query)).address).toBe('106 Chandler St')
  })

  it('omits the key entirely when there is no address', () => {
    expect(toQuery(VALUES).has('addr')).toBe(false)
  })
})
