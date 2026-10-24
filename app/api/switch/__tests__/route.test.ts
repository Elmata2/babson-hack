/**
 * @built F-147 route contract — the consent gate, the allowlist and the only send
 *
 * The unit tests prove the validator and the plan. This file proves the route:
 * that off really sends nothing, that an allowlist status is labelled, that a
 * personal fact is refused by name, and that live email is one templated message
 * with no identifying detail. `fetch` is mocked; no key and no network are needed.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { OutreachRequest } from '@/lib/switch/types'

import { GET, POST } from '../route'

const TEAM_LINE = {
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

const REAL_DEALER = {
  id: 'real-dealer',
  name: 'A real dealer',
  kind: 'fuel',
  channels: ['email', 'phone'],
  phone: '+16175550100',
  email: 'quotes@dealer.test',
  source: 'Fixture list',
  asOf: '2026-10-24',
  allowlist: false,
}

function payload(overrides: Partial<OutreachRequest> = {}): OutreachRequest {
  return {
    kind: 'fuel',
    choice: 'SHOP_FUEL',
    facts: {
      town: 'Arlington',
      zip: '02476',
      fuel: 'oil',
      annualVolume: 800,
      unit: 'gal',
      deliverySizeGal: 150,
      tankSizeGal: 275,
      deliveryWindow: 'next two weeks',
      sqft: null,
      tons: null,
    },
    providers: [{ id: 'team-line', channel: 'email' }],
    consentAt: '2026-10-24T15:00:00.000Z',
    ...overrides,
  }
}

function post(body: unknown): Request {
  return new Request('https://switchpoint.test/api/switch', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function read(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('POST /api/switch', () => {
  it('sends nothing when outreach is off, and says so', async () => {
    vi.stubEnv('PROVIDER_OUTREACH_ENABLED', 'false')
    vi.stubEnv('PROVIDER_ALLOWLIST_JSON', JSON.stringify([TEAM_LINE]))

    const response = await POST(post(payload()))
    expect(response.status).toBe(200)
    const body = await read(response)
    expect(body.mode).toBe('off')
    expect(body.statuses).toEqual([])
    expect(String(body.notice)).toContain('switched off')
  })

  it('stages allowlist contacts and labels them as team test lines', async () => {
    vi.stubEnv('PROVIDER_OUTREACH_ENABLED', 'true')
    vi.stubEnv('PROVIDER_ALLOWLIST_JSON', JSON.stringify([TEAM_LINE]))

    const body = await read(await POST(post(payload())))
    expect(body.mode).toBe('allowlist')
    const statuses = body.statuses as { status: string; allowlist: boolean; note: string }[]
    expect(statuses[0]?.status).toBe('queued')
    expect(statuses[0]?.allowlist).toBe(true)
    expect(statuses[0]?.note).toContain('No real business')
  })

  it('refuses a personal fact by name and sends nothing', async () => {
    vi.stubEnv('PROVIDER_OUTREACH_ENABLED', 'true')
    vi.stubEnv('PROVIDER_ALLOWLIST_JSON', JSON.stringify([TEAM_LINE]))

    const response = await POST(post({ ...payload(), name: 'Alex Rivera' }))
    expect(response.status).toBe(400)
    const body = await read(response)
    expect(body.code).toBe('personal_fact')
  })

  it('refuses more than six providers before looking any of them up', async () => {
    vi.stubEnv('PROVIDER_OUTREACH_ENABLED', 'true')
    vi.stubEnv('PROVIDER_ALLOWLIST_JSON', JSON.stringify([TEAM_LINE]))

    const providers = Array.from({ length: 7 }, (_, index) => ({
      id: `provider-${index}`,
      channel: 'email' as const,
    }))
    const response = await POST(post(payload({ providers })))
    expect(response.status).toBe(400)
    expect((await read(response)).code).toBe('too_many_providers')
  })

  it('refuses an id that is not in the configured list', async () => {
    vi.stubEnv('PROVIDER_OUTREACH_ENABLED', 'true')
    vi.stubEnv('PROVIDER_ALLOWLIST_JSON', JSON.stringify([TEAM_LINE]))

    const response = await POST(post(payload({ providers: [{ id: 'someone-else', channel: 'email' }] })))
    expect(response.status).toBe(400)
    expect((await read(response)).code).toBe('unknown_provider')
  })

  it('sends one templated email in live mode, with facts and no identity', async () => {
    vi.stubEnv('PROVIDER_OUTREACH_ENABLED', 'true')
    vi.stubEnv('PROVIDER_ALLOWLIST_JSON', JSON.stringify([REAL_DEALER]))
    vi.stubEnv('RESEND_API_KEY', 'test-key')
    vi.stubEnv('RESEND_FROM', 'quotes@switchpoint.test')

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }))

    const body = await read(await POST(post(payload({ providers: [{ id: 'real-dealer', channel: 'email' }] }))))
    expect(body.mode).toBe('live')
    const statuses = body.statuses as { providerId: string; status: string }[]
    expect(statuses[0]).toMatchObject({ providerId: 'real-dealer', status: 'sent' })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const init = fetchMock.mock.calls[0]?.[1] as { body: string }
    const email = JSON.parse(init.body) as { to: string[]; subject: string; text: string }
    expect(email.to).toEqual(['quotes@dealer.test'])
    expect(email.text).toContain('Arlington')
    expect(email.text).toContain('800 gal')
    expect(email.text).not.toContain('Alex')
    expect(email.text).not.toContain('Chandler')
  })

  it('marks a phone channel as scheduled or unsupported — never ringing', async () => {
    vi.stubEnv('PROVIDER_OUTREACH_ENABLED', 'true')
    vi.stubEnv('PROVIDER_ALLOWLIST_JSON', JSON.stringify([REAL_DEALER]))
    vi.stubEnv('RESEND_API_KEY', 'test-key')
    vi.stubEnv('RESEND_FROM', 'quotes@switchpoint.test')

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }))
    const body = await read(await POST(post(payload({ providers: [{ id: 'real-dealer', channel: 'phone' }] }))))
    const statuses = body.statuses as { status: string; note: string }[]
    expect(['scheduled', 'unsupported']).toContain(statuses[0]?.status)
    expect(statuses[0]?.note).toMatch(/Business hours only|places no phone calls/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuses a GET with a typed error', async () => {
    const response = GET()
    expect(response.status).toBe(405)
    expect((await read(response)).ok).toBe(false)
  })
})

describe('@built F-49 demo mode on the send path', () => {
  it('accepts the demo flag in the body — the shape the switch screen actually sends', async () => {
    // Regression: `demo` was not on the closed key list, so the demo body was refused
    // as an unknown field before the flag could be read. The screen sent exactly this.
    vi.stubEnv('PROVIDER_ALLOWLIST_JSON', JSON.stringify([TEAM_LINE]))
    const body = await read(await POST(post({ ...payload(), demo: true })))
    expect(body.ok).toBe(true)
    expect(body.mode).toBe('demo')
    expect(String(body.notice)).toMatch(/nothing was dialled/i)
  })

  it('accepts a session id, which the call flow carries alongside the same consent body', async () => {
    vi.stubEnv('PROVIDER_ALLOWLIST_JSON', JSON.stringify([TEAM_LINE]))
    const body = await read(await POST(post({ ...payload(), sessionId: 'session-abc123', demo: true })))
    expect(body.mode).toBe('demo')
  })
})
