/**
 * @built F-147 route contract — the consent gate, the allowlist and the only send
 *
 * The unit tests prove the validator and the plan. This file proves the route:
 * that off really sends nothing, that an allowlist status is labelled, that a
 * personal fact is refused by name, and that live email is one templated message
 * with no identifying detail. `fetch` is mocked; no key and no network are needed.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

import { outreachMode } from '@/lib/security/operator'
import { validateOutreachRequest } from '@/lib/switch/consent'
import { mintConsentToken } from '@/lib/switch/consent-token'
import type { OutreachRequest } from '@/lib/switch/types'

import { resetOutboundForTests } from '@/lib/security/outbound-cap'
import { resetUsedConsentTokensForTests } from '@/lib/switch/consent-token'

import { GET, POST } from '../route'

const SESSION = 'session-abc123'

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
      deliveryWindow: 'morning',
      sqft: null,
      tons: null,
    },
    providers: [{ id: 'team-line', channel: 'email' }],
    consentAt: '2026-10-24T15:00:00.000Z',
    ...overrides,
  }
}

function rawPost(body: unknown): Request {
  return new Request('https://switchpoint.test/api/switch', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function signMode(): 'allowlist' | 'live' {
  return outreachMode('Arlington') === 'live' ? 'live' : 'allowlist'
}

function signed(body: unknown, at: Date = new Date()): unknown {
  const withSession = { ...(body as object), sessionId: SESSION }
  const validated = validateOutreachRequest(withSession)
  if (!validated.ok) return body
  return { ...withSession, consentToken: mintConsentToken(validated.value, SESSION, signMode(), at) }
}

function post(body: unknown): Request {
  return rawPost(signed(body))
}

async function read(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>
}

afterEach(() => {
  resetUsedConsentTokensForTests()
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

  it('refuses a live request with no consent token, before anything is sent', async () => {
    vi.stubEnv('PROVIDER_OUTREACH_ENABLED', 'true')
    vi.stubEnv('PROVIDER_ALLOWLIST_JSON', JSON.stringify([TEAM_LINE]))
    const fetchMock = vi.spyOn(globalThis, 'fetch')

    const response = await POST(rawPost({ ...payload(), sessionId: SESSION }))
    expect(response.status).toBe(403)
    expect((await read(response)).code).toBe('missing_consent')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuses a forged token, a stale token and a token for different facts', async () => {
    vi.stubEnv('PROVIDER_OUTREACH_ENABLED', 'true')
    vi.stubEnv('PROVIDER_ALLOWLIST_JSON', JSON.stringify([TEAM_LINE]))

    const forged = await POST(rawPost({ ...payload(), sessionId: SESSION, consentToken: `${Date.now()}.${'0'.repeat(16)}.${'0'.repeat(64)}` }))
    expect((await read(forged)).code).toBe('bad_consent')

    const stale = await POST(rawPost(signed(payload(), new Date(Date.now() - 11 * 60_000))))
    expect((await read(stale)).code).toBe('expired_consent')

    const other = payload()
    const token = (signed(other) as { consentToken: string }).consentToken
    const changed = payload({ facts: { ...other.facts, annualVolume: 1200 } })
    const swapped = await POST(rawPost({ ...changed, sessionId: SESSION, consentToken: token }))
    expect((await read(swapped)).code).toBe('bad_consent')
  })

  it('lets the demo flag through without a token, because nothing leaves the process', async () => {
    vi.stubEnv('PROVIDER_ALLOWLIST_JSON', JSON.stringify([TEAM_LINE]))
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    const response = await POST(rawPost({ ...payload(), demo: true }))
    expect((await read(response)).mode).toBe('demo')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('caps live sends per client with a 429 and Retry-After', async () => {
    vi.stubEnv('PROVIDER_OUTREACH_ENABLED', 'true')
    vi.stubEnv('PROVIDER_ALLOWLIST_JSON', JSON.stringify([REAL_DEALER]))
    vi.stubEnv('RESEND_API_KEY', 'k')
    vi.stubEnv('RESEND_FROM', 'a@b.test')
    vi.stubEnv('OUTBOUND_DAILY_CAP', '2')
    resetOutboundForTests()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }))
    const one = payload({ providers: [{ id: 'real-dealer', channel: 'email' }] })

    expect((await POST(post(one))).status).toBe(200)
    expect((await POST(post(one))).status).toBe(200)
    const third = await POST(post(one))
    expect(third.status).toBe(429)
    expect(Number(third.headers.get('retry-after'))).toBeGreaterThan(0)
    resetOutboundForTests()
  })

  it('requires a session id on a live request, so a token never binds to nothing', async () => {
    vi.stubEnv('PROVIDER_OUTREACH_ENABLED', 'true')
    vi.stubEnv('PROVIDER_ALLOWLIST_JSON', JSON.stringify([TEAM_LINE]))
    const validated = validateOutreachRequest(payload())
    if (!validated.ok) throw new Error('fixture invalid')
    const token = mintConsentToken(validated.value, null, 'allowlist')
    const response = await POST(rawPost({ ...payload(), consentToken: token }))
    expect(response.status).toBe(400)
    expect((await read(response)).code).toBe('bad_session')
  })

  it('spends a consent token once: a replay is refused', async () => {
    vi.stubEnv('PROVIDER_OUTREACH_ENABLED', 'true')
    vi.stubEnv('PROVIDER_ALLOWLIST_JSON', JSON.stringify([TEAM_LINE]))
    const request = signed(payload())
    expect((await POST(rawPost(request))).status).toBe(200)
    const replay = await POST(rawPost(request))
    expect(replay.status).toBe(403)
    expect((await read(replay)).code).toBe('used_consent')
  })

  it('refuses live outreach in production without a 32-character CONSENT_SECRET', async () => {
    vi.stubEnv('PROVIDER_OUTREACH_ENABLED', 'true')
    vi.stubEnv('PROVIDER_ALLOWLIST_JSON', JSON.stringify([TEAM_LINE]))
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('CONSENT_SECRET', 'too-short-secret')
    const response = await POST(rawPost(signed(payload())))
    expect(response.status).toBe(503)
    expect((await read(response)).code).toBe('consent_secret_not_configured')
  })

  it('leaves off mode alone in production without a secret', async () => {
    vi.stubEnv('PROVIDER_OUTREACH_ENABLED', 'false')
    vi.stubEnv('PROVIDER_ALLOWLIST_JSON', JSON.stringify([TEAM_LINE]))
    vi.stubEnv('NODE_ENV', 'production')
    const response = await POST(rawPost(signed(payload())))
    expect((await read(response)).mode).toBe('off')
  })

  it('rejects a token minted under the other mode, in both directions', async () => {
    vi.stubEnv('PROVIDER_OUTREACH_ENABLED', 'true')
    vi.stubEnv('PROVIDER_ALLOWLIST_JSON', JSON.stringify([TEAM_LINE]))
    const validated = validateOutreachRequest({ ...payload(), sessionId: SESSION })
    if (!validated.ok) throw new Error('fixture invalid')
    const liveToken = mintConsentToken(validated.value, SESSION, 'live')
    const underAllowlist = await POST(rawPost({ ...payload(), sessionId: SESSION, consentToken: liveToken }))
    expect(underAllowlist.status).toBe(403)
    expect((await read(underAllowlist)).code).toBe('bad_consent')

    vi.stubEnv('PROVIDER_ALLOWLIST_JSON', JSON.stringify([REAL_DEALER]))
    vi.stubEnv('RESEND_API_KEY', 'k')
    vi.stubEnv('RESEND_FROM', 'a@b.test')
    const allowlistToken = mintConsentToken(validated.value, SESSION, 'allowlist')
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    const underLive = await POST(
      rawPost({
        ...payload({ providers: [{ id: 'real-dealer', channel: 'email' }] }),
        sessionId: SESSION,
        consentToken: allowlistToken,
      }),
    )
    expect(underLive.status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
