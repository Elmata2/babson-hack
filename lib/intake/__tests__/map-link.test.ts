/**
 * @built F-46 R10.6: an address picked on the map prefills the address form.
 *
 * The link is the whole mechanism, so the link is what is tested: it must carry the
 * street and the town, say where it came from, and survive the form's own reader.
 */

import { describe, expect, it } from 'vitest'
import { ADDRESS_MAX, fromSearchParams, intakeHrefForAddress, toQuery, type IntakeValues } from '../params'

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

const BASE = 'https://example.test'

describe('intakeHrefForAddress', () => {
  it('carries the street address, the town and the map as the source', () => {
    const url = new URL(intakeHrefForAddress('Wellesley', '106 Chandler St, Wellesley, MA 02482'), BASE)
    expect(url.pathname).toBe('/start')
    expect(url.searchParams.get('addr')).toBe('106 Chandler St, Wellesley, MA 02482')
    expect(url.searchParams.get('town')).toBe('Wellesley')
    expect(url.searchParams.get('src')).toBe('map')
  })

  it('works for a town with no street address', () => {
    const url = new URL(intakeHrefForAddress('Wellesley', null), BASE)
    expect(url.searchParams.has('addr')).toBe(false)
    expect(url.searchParams.get('town')).toBe('Wellesley')
  })

  it('caps an address instead of letting it grow the URL without bound', () => {
    const url = new URL(intakeHrefForAddress('Wellesley', 'x'.repeat(400)), BASE)
    expect(url.searchParams.get('addr')).toHaveLength(ADDRESS_MAX)
  })

  it('is readable by the form, so the prefill actually lands', () => {
    const url = new URL(intakeHrefForAddress('Wellesley', '106 Chandler St'), BASE)
    const parsed = fromSearchParams(Object.fromEntries(url.searchParams))
    expect(parsed.address).toBe('106 Chandler St')
    expect(parsed.town).toBe('Wellesley')
    // `src=map` is provenance for the reader, not one of the form's source badges.
    expect(parsed.src).toBeUndefined()
  })

  it('round-trips through the query builder, so "Change the numbers" keeps it', () => {
    const query = toQuery({ ...VALUES, address: '106 Chandler St' })
    expect(query.get('addr')).toBe('106 Chandler St')
    expect(fromSearchParams(Object.fromEntries(query)).address).toBe('106 Chandler St')
  })

  it('omits the key entirely when there is no address', () => {
    expect(toQuery(VALUES).has('addr')).toBe(false)
  })
})
