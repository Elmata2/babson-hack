/**
 * @built F-156 property tests for the consent gate: no key and no identifying string
 * outside the closed fact list can reach a provider, whatever the generator invents.
 */
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { DEFAULT_DELIVERY_GALLONS, validateOutreachRequest } from '../consent'
import type { OutreachRequest } from '../types'

const base: OutreachRequest = {
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

const TOP_LEVEL_KEYS = ['kind', 'choice', 'facts', 'providers', 'consentAt', 'demo', 'sessionId']
const FACT_KEYS = ['town', 'zip', 'fuel', 'annualVolume', 'unit', 'deliverySizeGal', 'tankSizeGal', 'deliveryWindow', 'sqft', 'tons']

/** Keys a generator can invent that are not on the allowed lists. */
const strangeKey = (allowed: string[]) =>
  fc.string({ minLength: 1, maxLength: 12 }).filter((key) => !allowed.includes(key) && key !== '__proto__')

describe('consent gate properties', () => {
  it('control: the base request is accepted, so the refusals below mean something', () => {
    expect(validateOutreachRequest(base).ok).toBe(true)
  })

  it('P17: a top-level key outside the closed list is always refused', () => {
    fc.assert(
      fc.property(strangeKey(TOP_LEVEL_KEYS), fc.jsonValue(), (key, value) => {
        const result = validateOutreachRequest({ ...base, [key]: value })
        expect(result.ok).toBe(false)
        if (!result.ok) expect(['unknown_field', 'personal_fact']).toContain(result.code)
      }),
      { numRuns: 300 },
    )
  })

  it('P18: a fact key outside the closed list is always refused', () => {
    fc.assert(
      fc.property(strangeKey(FACT_KEYS), fc.jsonValue(), (key, value) => {
        const result = validateOutreachRequest({ ...base, facts: { ...base.facts, [key]: value } })
        expect(result.ok).toBe(false)
        if (!result.ok) expect(['unknown_fact', 'personal_fact']).toContain(result.code)
      }),
      { numRuns: 300 },
    )
  })

  it('P19: an email address hidden in any free-text fact is always refused', () => {
    const email = fc
      .tuple(fc.stringMatching(/^[a-z]{1,8}$/), fc.stringMatching(/^[a-z]{1,8}$/))
      .map(([local, domain]) => `${local}@${domain}.com`)
    fc.assert(
      fc.property(email, fc.stringMatching(/^[a-z ]{0,4}$/), (address, padding) => {
        const result = validateOutreachRequest({
          ...base,
          facts: { ...base.facts, deliveryWindow: `${padding} ${address} ${padding}` },
        })
        // The reason must be the identifying value itself, not an unrelated length rule.
        expect(result.ok).toBe(false)
        if (!result.ok) expect(result.code).toBe('personal_fact')
      }),
      { numRuns: 200 },
    )
  })

  it('P20: a US phone number hidden in any free-text fact is always refused', () => {
    const phone = fc
      .tuple(fc.integer({ min: 200, max: 999 }), fc.integer({ min: 200, max: 999 }), fc.integer({ min: 0, max: 9999 }))
      .map(([area, exchange, line]) => `${area}-${exchange}-${String(line).padStart(4, '0')}`)
    fc.assert(
      fc.property(phone, (number) => {
        const result = validateOutreachRequest({ ...base, facts: { ...base.facts, deliveryWindow: `call ${number}` } })
        expect(result.ok).toBe(false)
        if (!result.ok) expect(result.code).toBe('personal_fact')
      }),
      { numRuns: 200 },
    )
  })

  it('P21: more than six providers is always refused', () => {
    fc.assert(
      fc.property(fc.integer({ min: 7, max: 20 }), (count) => {
        const providers = Array.from({ length: count }, (_, index) => ({ id: `provider-${index}`, channel: 'email' as const }))
        const result = validateOutreachRequest({ ...base, providers })
        expect(result.ok).toBe(false)
        if (!result.ok) expect(result.code).toBe('too_many_providers')
      }),
      { numRuns: 50 },
    )
  })
})
