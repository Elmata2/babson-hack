import { afterEach, describe, expect, it, vi } from 'vitest'

import { validateOutreachRequest } from '@/lib/switch/consent'
import { CONSENT_TOKEN_TTL_MS, mintConsentToken, verifyConsentToken } from '@/lib/switch/consent-token'

import { GET, POST } from '../route'

afterEach(() => {
  vi.unstubAllEnvs()
})

function body(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: 'fuel',
    choice: 'SHOP_FUEL',
    facts: {
      town: 'Framingham',
      zip: '01702',
      fuel: 'oil',
      annualVolume: 800,
      unit: 'gal',
      deliverySizeGal: 150,
      tankSizeGal: 275,
      deliveryWindow: 'morning',
      sqft: null,
      tons: null,
    },
    providers: [{ id: 'test-fuel-a', channel: 'phone' }],
    consentAt: '2026-10-24T15:00:00.000Z',
    sessionId: 'session-abc123',
    ...overrides,
  }
}

function post(payload: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://example.test/api/consent', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(payload),
  })
}

describe('POST /api/consent', () => {
  it('mints a token that verifies for exactly the approved request', async () => {
    vi.stubEnv('PROVIDER_OUTREACH_ENABLED', 'true')
    vi.stubEnv('PROVIDER_ALLOWLIST_JSON', JSON.stringify([TEAM_LINE]))
    vi.stubEnv('OPERATOR_KEY', 'correct-horse-battery')
    const response = await POST(post(body(), { 'x-operator-key': 'correct-horse-battery' }))
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const { consentToken } = (await response.json()) as { consentToken: string }
    const validated = validateOutreachRequest(body())
    if (!validated.ok) throw new Error('fixture invalid')
    expect(verifyConsentToken(consentToken, validated.value, 'session-abc123', 'allowlist')).toEqual({ ok: true })
    expect(verifyConsentToken(consentToken, validated.value, 'session-zzz999', 'allowlist')).toMatchObject({ ok: false })
    const extra = { ...validated.value, providers: [...validated.value.providers, { id: 'test-fuel-b', channel: 'phone' as const }] }
    expect(verifyConsentToken(consentToken, extra, 'session-abc123', 'allowlist')).toMatchObject({ ok: false })
    expect(verifyConsentToken(consentToken, validated.value, 'session-abc123', 'live')).toMatchObject({ ok: false })
  })

  it('refuses what the consent validator refuses, and never signs a personal fact', async () => {
    const bad = await POST(post(body({ facts: { ...(body().facts as object), deliveryWindow: 'call 508-555-0101' } })))
    expect(bad.status).toBe(400)
    expect(((await bad.json()) as { code: string }).code).toBe('personal_fact')
  })

  it('refuses a request that already carries a token, and answers GET with 405', async () => {
    expect((await POST(post(body({ consentToken: 'x' })))).status).toBe(400)
    expect(GET().status).toBe(405)
  })
})

const TEAM_LINE = {
  id: 'test-fuel-a',
  name: 'Team test line',
  kind: 'fuel',
  channels: ['email', 'phone'],
  phone: '+15550100001',
  email: 'quotes@example.com',
  source: 'Team allowlist',
  asOf: '2026-10-24',
  allowlist: true,
}

describe('POST /api/consent operator gate', () => {
  function live() {
    vi.stubEnv('PROVIDER_OUTREACH_ENABLED', 'true')
    vi.stubEnv('PROVIDER_ALLOWLIST_JSON', JSON.stringify([TEAM_LINE]))
  }

  it('refuses with 503 when live and OPERATOR_KEY is not configured', async () => {
    live()
    const response = await POST(post(body(), { 'x-operator-key': 'anything' }))
    expect(response.status).toBe(503)
    expect(((await response.json()) as { code: string }).code).toBe('operator_key_not_configured')
  })

  it('refuses with 401 without the header or with a wrong key, and mints with the right one', async () => {
    live()
    vi.stubEnv('OPERATOR_KEY', 'correct-horse-battery')
    const none = await POST(post(body()))
    expect(none.status).toBe(401)
    expect(((await none.json()) as { code: string }).code).toBe('operator_only')
    expect((await POST(post(body(), { 'x-operator-key': 'wrong' }))).status).toBe(401)
    expect((await POST(post(body(), { 'x-operator-key': 'correct-horse-battery' }))).status).toBe(200)
  })

  it('mints nothing in demo mode, query or body, and asks for no key', async () => {
    live()
    vi.stubEnv('OPERATOR_KEY', 'correct-horse-battery')
    const viaBody = await POST(post(body({ demo: true })))
    expect(viaBody.status).toBe(200)
    expect(await viaBody.json()).toEqual({ ok: true, demo: true })
    const viaQuery = await POST(
      new Request('https://example.test/api/consent?demo=1', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body()),
      }),
    )
    expect(await viaQuery.json()).toEqual({ ok: true, demo: true })
  })

  it('mints nothing when outreach is off', async () => {
    vi.stubEnv('PROVIDER_OUTREACH_ENABLED', 'false')
    const response = await POST(post(body()))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, mode: 'off' })
  })

  it('refuses to sign in production without a 32-character secret', async () => {
    live()
    vi.stubEnv('OPERATOR_KEY', 'correct-horse-battery')
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('CONSENT_SECRET', 'short')
    const response = await POST(post(body(), { 'x-operator-key': 'correct-horse-battery' }))
    expect(response.status).toBe(503)
    expect(((await response.json()) as { code: string }).code).toBe('consent_secret_not_configured')
  })

  it('requires a session id', async () => {
    const { sessionId: _omit, ...rest } = body()
    void _omit
    expect((await POST(post(rest))).status).toBe(400)
  })
})

describe('consent token', () => {
  const validated = validateOutreachRequest(body())
  if (!validated.ok) throw new Error('fixture invalid')
  const request = validated.value
  const issued = new Date('2026-10-24T15:00:00.000Z')
  const token = mintConsentToken(request, null, 'live', issued)

  it('is good for ten minutes and no longer', () => {
    expect(verifyConsentToken(token, request, null, 'live', new Date(issued.getTime() + CONSENT_TOKEN_TTL_MS))).toEqual({ ok: true })
    expect(verifyConsentToken(token, request, null, 'live', new Date(issued.getTime() + CONSENT_TOKEN_TTL_MS + 1))).toEqual({
      ok: false,
      code: 'expired_consent',
    })
  })

  it.each([undefined, '', 42, 'a.b.c', '123.abc', `${issued.getTime()}.${'0'.repeat(16)}.${'0'.repeat(64)}`])('rejects %s', (value) => {
    expect(verifyConsentToken(value, request, null, 'live', issued).ok).toBe(false)
  })

  it('is bound to every fact', () => {
    const changed = { ...request, facts: { ...request.facts, deliveryWindow: 'evening' as const } }
    expect(verifyConsentToken(token, changed, null, 'live', issued).ok).toBe(false)
  })
})
