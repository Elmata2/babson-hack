import { describe, expect, it } from 'vitest'

import { directoryFor } from '../directory'

const TEAM_FUEL = {
  id: 'demo-dealer',
  name: 'Demo dealer (team line)',
  kind: 'fuel',
  channels: ['phone'],
  phone: '+31600000000',
  email: null,
  towns: [],
  source: 'Team allowlist',
  asOf: '2026-10-25',
  allowlist: true,
}

const env = (values: Record<string, string>): NodeJS.ProcessEnv => ({ NODE_ENV: 'test', ...values })

describe('directoryFor', () => {
  it('serves the seed when the deployment names no rows', () => {
    const kinds = new Set(directoryFor('Framingham', env({})).map((provider) => provider.kind))
    expect(kinds).toEqual(new Set(['fuel', 'installer']))
  })

  it('drops the seed for a vertical the deployment names, and keeps it for the other', () => {
    const rows = directoryFor('Framingham', env({ PROVIDER_ALLOWLIST_JSON: JSON.stringify([TEAM_FUEL]) }))
    expect(rows.filter((provider) => provider.kind === 'fuel').map((provider) => provider.id)).toEqual(['demo-dealer'])
    expect(rows.some((provider) => provider.kind === 'installer')).toBe(true)
  })
})
