/** @built F-147 tests for the provider allowlist and the honest outreach plan */

import { describe, expect, it } from 'vitest'

import { loadProviders, outreachPlan, parseProviders } from '../providers'
import type { SwitchProvider } from '../types'

const allowlistRow: SwitchProvider = {
  id: 'team-line',
  name: 'Team test line',
  kind: 'fuel',
  channels: ['email'],
  phone: null,
  email: 'quotes@example.com',
  source: 'Team allowlist',
  asOf: '2026-10-24',
  allowlist: true,
}

describe('parseProviders', () => {
  it('parses a complete allowlist row', () => {
    expect(parseProviders(JSON.stringify([allowlistRow]))).toEqual([allowlistRow])
  })

  it('returns nothing for absent or malformed configuration', () => {
    expect(parseProviders(undefined)).toEqual([])
    expect(parseProviders('')).toEqual([])
    expect(parseProviders('{')).toEqual([])
    expect(parseProviders(JSON.stringify({ not: 'an array' }))).toEqual([])
  })

  it('drops a row with no source, no date, or a channel it cannot reach', () => {
    const rows = [
      { ...allowlistRow, id: 'no-source', source: '' },
      { ...allowlistRow, id: 'no-date', asOf: '24/10/2026' },
      { ...allowlistRow, id: 'phone-no-number', channels: ['phone'], phone: null },
      { ...allowlistRow, id: 'email-no-address', email: null },
      { ...allowlistRow, id: 'unknown-kind', kind: 'supplier' },
      allowlistRow,
    ]
    const parsed = parseProviders(JSON.stringify(rows))
    expect(parsed.map((row) => row.id)).toEqual(['team-line'])
  })

  it('keeps the first row when an id repeats', () => {
    const parsed = parseProviders(JSON.stringify([allowlistRow, { ...allowlistRow, name: 'Second' }]))
    expect(parsed).toHaveLength(1)
    expect(parsed[0]?.name).toBe('Team test line')
  })
})

describe('loadProviders', () => {
  it('reads the environment key', () => {
    expect(
      loadProviders({ PROVIDER_ALLOWLIST_JSON: JSON.stringify([allowlistRow]) } as unknown as NodeJS.ProcessEnv),
    ).toHaveLength(1)
    expect(loadProviders({} as unknown as NodeJS.ProcessEnv)).toEqual([])
  })
})

describe('outreachPlan', () => {
  it('is off unless the switch is explicitly true', () => {
    const plan = outreachPlan([allowlistRow], { PROVIDER_OUTREACH_ENABLED: 'false' } as unknown as NodeJS.ProcessEnv)
    expect(plan.mode).toBe('off')
    expect(plan.reason).toContain('switched off')
  })

  it('is off with no provider list, and says no number is invented', () => {
    const plan = outreachPlan([], { PROVIDER_OUTREACH_ENABLED: 'true' } as unknown as NodeJS.ProcessEnv)
    expect(plan.mode).toBe('off')
    expect(plan.reason).toContain('will not invent')
  })

  it('is allowlist when every row is a team line', () => {
    const plan = outreachPlan([allowlistRow], { PROVIDER_OUTREACH_ENABLED: 'true' } as unknown as NodeJS.ProcessEnv)
    expect(plan.mode).toBe('allowlist')
    expect(plan.notice).toContain('no real business')
  })

  it('is off for real providers when no email sender exists', () => {
    const real: SwitchProvider = { ...allowlistRow, id: 'real-dealer', allowlist: false }
    const plan = outreachPlan([real], { PROVIDER_OUTREACH_ENABLED: 'true' } as unknown as NodeJS.ProcessEnv)
    expect(plan.mode).toBe('off')
    expect(plan.reason).toContain('No email sender')
  })

  it('is live only with a real provider and a configured sender', () => {
    const real: SwitchProvider = { ...allowlistRow, id: 'real-dealer', allowlist: false }
    const plan = outreachPlan([real], {
      PROVIDER_OUTREACH_ENABLED: 'true',
      RESEND_API_KEY: 'test',
      RESEND_FROM: 'quotes@switchpoint.test',
    } as unknown as NodeJS.ProcessEnv)
    expect(plan.mode).toBe('live')
  })
})
