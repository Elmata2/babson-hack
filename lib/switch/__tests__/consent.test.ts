/** @built F-144 tests for the consent rules: rounding, Eastern hours, closed fact list */

import { describe, expect, it } from 'vitest'

import {
  DEFAULT_DELIVERY_GALLONS,
  MAX_PROVIDERS_PER_SESSION,
  buildFacts,
  disclosureRows,
  easternParts,
  findIdentifyingField,
  nextCallWindow,
  roundVolume,
  validateOutreachRequest,
  withinBusinessHours,
} from '../consent'
import type { OutreachRequest } from '../types'

const valid: OutreachRequest = {
  kind: 'fuel',
  choice: 'SHOP_FUEL',
  facts: {
    town: 'Arlington',
    zip: '02476',
    fuel: 'oil',
    annualVolume: 800,
    unit: 'gal',
    deliverySizeGal: DEFAULT_DELIVERY_GALLONS,
    tankSizeGal: 275,
    deliveryWindow: 'morning',
    sqft: null,
    tons: null,
  },
  providers: [{ id: 'team-line', channel: 'email' }],
  consentAt: '2026-10-24T15:00:00.000Z',
}

describe('roundVolume', () => {
  it('rounds to the nearest 50 gallons', () => {
    expect(roundVolume(800)).toBe(800)
    expect(roundVolume(824)).toBe(800)
    expect(roundVolume(826)).toBe(850)
    expect(roundVolume(825)).toBe(850)
  })
  it('treats a non-positive or non-finite volume as nothing', () => {
    expect(roundVolume(0)).toBe(0)
    expect(roundVolume(-40)).toBe(0)
    expect(roundVolume(Number.NaN)).toBe(0)
  })
  it('never invents a volume for an empty bill', () => {
    expect(roundVolume(12)).toBe(0)
  })
})

describe('buildFacts', () => {
  it('carries the fuel unit and rounds gallons, not therms', () => {
    const oil = buildFacts({ town: 'Arlington', fuel: 'oil', annualUnits: 813 })
    expect(oil.unit).toBe('gal')
    expect(oil.annualVolume).toBe(800)
    expect(oil.deliverySizeGal).toBe(DEFAULT_DELIVERY_GALLONS)

    const gas = buildFacts({ town: 'Arlington', fuel: 'gas', annualUnits: 813.4 })
    expect(gas.unit).toBe('therms')
    expect(gas.annualVolume).toBe(813)
  })
  it('keeps an unknown fuel and volume as null rather than guessing', () => {
    const empty = buildFacts({ town: 'Arlington', fuel: null, annualUnits: null })
    expect(empty.fuel).toBeNull()
    expect(empty.unit).toBeNull()
    expect(empty.annualVolume).toBeNull()
  })
})

describe('disclosureRows', () => {
  it('gives a dealer the volume but not the square footage', () => {
    const facts = buildFacts({ town: 'Arlington', fuel: 'oil', annualUnits: 800, sqft: 1600, tons: 4 })
    const labels = disclosureRows(facts, 'fuel').map((row) => row.label)
    expect(labels).toContain('Delivery size')
    expect(labels).not.toContain('Home size')
    expect(labels).not.toContain('Estimated size')
  })
  it('gives an installer the home size and tons but not the tank', () => {
    const facts = buildFacts({
      town: 'Arlington',
      fuel: 'oil',
      annualUnits: 800,
      sqft: 1600,
      tons: 4,
      tankSizeGal: 275,
    })
    const labels = disclosureRows(facts, 'installer').map((row) => row.label)
    expect(labels).toContain('Home size')
    expect(labels).toContain('Estimated size')
    expect(labels).not.toContain('Tank')
  })
})

describe('Eastern business hours', () => {
  it('reads Eastern time in October and in July', () => {
    expect(easternParts(new Date('2026-07-15T12:30:00Z'))).toEqual({ weekday: 'Wed', minutes: 8 * 60 + 30 })
  })
  it('opens Saturday morning and closes at noon', () => {
    expect(withinBusinessHours(new Date('2026-10-24T14:00:00Z'))).toBe(true)
    expect(withinBusinessHours(new Date('2026-10-24T16:00:00Z'))).toBe(false)
  })
  it('is closed all Sunday and on Monday evening', () => {
    expect(withinBusinessHours(new Date('2026-10-25T15:00:00Z'))).toBe(false)
    expect(withinBusinessHours(new Date('2026-10-26T22:00:00Z'))).toBe(false)
  })
  it('is open on a weekday inside 08:00–17:00 Eastern', () => {
    expect(withinBusinessHours(new Date('2026-10-26T13:00:00Z'))).toBe(true)
    expect(withinBusinessHours(new Date('2026-07-15T11:30:00Z'))).toBe(false)
  })
  it('names the next window from a Saturday afternoon', () => {
    expect(nextCallWindow(new Date('2026-10-24T17:00:00Z'))).toBe('Monday 8:00 a.m. ET')
  })
})

describe('findIdentifyingField', () => {
  it('catches names, emails, phone numbers and streets', () => {
    expect(findIdentifyingField({ name: 'Alex Rivera' })).toContain('name')
    expect(findIdentifyingField({ note: 'alex@example.com' })).toBe('an email address')
    expect(findIdentifyingField({ note: '(617) 555-0142' })).toBe('a phone or account number')
    expect(findIdentifyingField({ note: '106 Chandler St' })).toBe('a street address')
  })
  it('leaves town names, dates and prices alone', () => {
    expect(findIdentifyingField({ town: 'Arlington', date: '2026-10-24' })).toBeNull()
    expect(findIdentifyingField({ deliveryWindow: 'next two weeks' })).toBeNull()
  })
})

describe('validateOutreachRequest', () => {
  it('accepts the closed shape', () => {
    const result = validateOutreachRequest(valid)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.providers).toEqual([{ id: 'team-line', channel: 'email' }])
  })

  it('refuses an identifying field by name', () => {
    const result = validateOutreachRequest({ ...valid, name: 'Alex' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('personal_fact')
  })

  it('refuses a street address typed into the delivery window', () => {
    const result = validateOutreachRequest({
      ...valid,
      facts: { ...valid.facts, deliveryWindow: '106 Chandler St' },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('personal_fact')
  })

  it('refuses a fact that is not on the list', () => {
    const result = validateOutreachRequest({ ...valid, facts: { ...valid.facts, income: 90000 } })
    expect(result.ok).toBe(false)
  })

  it('refuses more than six providers', () => {
    const providers = Array.from({ length: MAX_PROVIDERS_PER_SESSION + 1 }, (_, index) => ({
      id: `provider-${index}`,
      channel: 'email',
    }))
    const result = validateOutreachRequest({ ...valid, providers })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('too_many_providers')
  })

  it('refuses duplicate providers and a channel that is not email or phone', () => {
    const duplicate = validateOutreachRequest({
      ...valid,
      providers: [
        { id: 'team-line', channel: 'email' },
        { id: 'team-line', channel: 'phone' },
      ],
    })
    expect(duplicate.ok).toBe(false)

    const badChannel = validateOutreachRequest({ ...valid, providers: [{ id: 'team-line', channel: 'fax' }] })
    expect(badChannel.ok).toBe(false)
  })

  it('refuses a town outside Massachusetts and a malformed ZIP', () => {
    expect(validateOutreachRequest({ ...valid, facts: { ...valid.facts, town: 'Albany' } }).ok).toBe(false)
    expect(validateOutreachRequest({ ...valid, facts: { ...valid.facts, zip: '0247' } }).ok).toBe(false)
  })

  it('refuses a delivery size below the smallest real delivery', () => {
    const result = validateOutreachRequest({ ...valid, facts: { ...valid.facts, deliverySizeGal: 10 } })
    expect(result.ok).toBe(false)
  })
})
