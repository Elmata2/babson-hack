import { describe, expect, it } from 'vitest'

import { isVerdictQueryComplete } from '../../verdict/inputs'
import { readCompleted, verdictHref } from '../completion'

const base = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  phone: '',
  consentAt: '2026-10-01T12:00:00.000Z',
}
const mapFields = { town: 'Newton', fuel: 'oil', utility: 'eversource', kwh: 600, incomeEligible: 'yes' }

const stored = (extra: Record<string, unknown> = {}) => JSON.stringify({ ...base, ...mapFields, ...extra })

describe('readCompleted', () => {
  it('is complete with an account, town and fuel', () => {
    const done = readCompleted(stored())
    expect(done).toMatchObject({ town: 'Newton', fuel: 'oil', utility: 'eversource', kwh: 600, income: 'yes' })
  })

  it('is incomplete without town or fuel, or without the account', () => {
    expect(readCompleted(JSON.stringify(base))).toBeNull()
    expect(readCompleted(stored({ fuel: 'coal' }))).toBeNull()
    expect(readCompleted(JSON.stringify(mapFields))).toBeNull()
    expect(readCompleted(null)).toBeNull()
  })
})

describe('verdictHref', () => {
  it('is null when storage lacks units and price, so the profile page links to onboarding', () => {
    expect(verdictHref(readCompleted(stored())!)).toBeNull()
  })

  it('builds a complete, PII-free query when units and price are stored', () => {
    const profile = readCompleted(stored({ units: 800, price: 4.2, addr: '1 Main St', mn: 'note' }))!
    const href = verdictHref(profile)!
    const query = new URL(href, 'http://x').searchParams
    expect(isVerdictQueryComplete(Object.fromEntries(query))).toBe(true)
    expect(query.has('addr')).toBe(false)
    expect(query.has('mn')).toBe(false)
    expect(href).not.toMatch(/addr|mn=|1\+Main|ada@example/)
  })

  it('writes no stored key of its own', () => {
    expect(Object.keys(readCompleted(stored())!)).not.toContain('addr')
  })
})
