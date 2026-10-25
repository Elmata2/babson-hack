/**
 * @built F-124 the route contract — nothing is dialled without an agent, a consent
 * body and a line this deployment is allowed to call
 *
 * `fetch` is mocked and no key is set, so these tests prove the refusals: the same
 * closed fact list as the email path, the six-provider cap, the town-narrowed
 * directory, and the demo replay that answers three staged records without a
 * socket. The live path is one mocked POST, which is enough to prove the shape.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

import { outreachMode } from '@/lib/security/operator'
import { validateOutreachRequest } from '@/lib/switch/consent'
import { mintConsentToken, openCallId, resetUsedConsentTokensForTests } from '@/lib/switch/consent-token'

import { POST } from '../route'

const SESSION = 'session-abc123'

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
      deliveryWindow: null,
      sqft: null,
      tons: null,
    },
    providers: [{ id: 'test-fuel-a', channel: 'phone' }],
    consentAt: '2026-10-24T15:00:00.000Z',
    sessionId: SESSION,
    ...overrides,
  }
}

function signed(payload: unknown, at: Date = new Date()): unknown {
  const validated = validateOutreachRequest(payload)
  if (!validated.ok) return payload
  const sessionId = (payload as { sessionId?: string }).sessionId ?? null
  const mode = outreachMode(validated.value.facts.town)
  return {
    ...(payload as object),
    consentToken: mintConsentToken(validated.value, sessionId, mode === 'live' ? 'live' : 'allowlist', at),
  }
}

function request(payload: unknown, query = '?demo=1'): Request {
  return rawRequest(signed(payload), query)
}

function rawRequest(payload: unknown, query = '?demo=1'): Request {
  return new Request(`https://example.test/api/calls${query}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

afterEach(() => {
  resetUsedConsentTokensForTests()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('POST /api/calls', () => {
  it('replays a staged call in demo mode, with no vendor and no socket', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const response = await POST(request(body()))
    const payload = (await response.json()) as {
      ok: boolean
      mode: string
      notice: string
      records: { conversationId: string; status: string; providerName: string }[]
    }
    expect(response.status).toBe(200)
    expect(payload.mode).toBe('demo')
    expect(payload.notice).toContain('Nothing was dialled')
    expect(payload.records).toHaveLength(1)
    expect(payload.records[0]?.conversationId).toBe('demo-fuel-a')
    expect(payload.records[0]?.status).toBe('queued')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('accepts the demo flag in the body as well as the query', async () => {
    const response = await POST(request({ ...body(), demo: true }, ''))
    expect(((await response.json()) as { mode: string }).mode).toBe('demo')
  })

  it('refuses a fact that identifies a person, by name', async () => {
    const response = await POST(
      request(body({ facts: { ...(body().facts as object), town: 'Framingham', deliveryWindow: 'call 508-555-0101' } })),
    )
    const payload = (await response.json()) as { code: string; message: string }
    expect(response.status).toBe(400)
    expect(payload.code).toBe('personal_fact')
    expect(payload.message).toContain('phone')
  })

  it('refuses an unknown provider and a wrong vertical', async () => {
    const unknown = await POST(request(body({ providers: [{ id: 'not-a-line', channel: 'phone' }] })))
    expect(((await unknown.json()) as { code: string }).code).toBe('unknown_provider')

    const wrongKind = await POST(
      request(body({ kind: 'installer', choice: 'SWITCH_HEAT_PUMP', providers: [{ id: 'test-fuel-a', channel: 'phone' }] })),
    )
    expect(((await wrongKind.json()) as { code: string }).code).toBe('wrong_provider_kind')
  })

  it('refuses more than six providers and a malformed session id', async () => {
    const seven = Array.from({ length: 7 }, () => ({ id: 'test-fuel-a', channel: 'phone' }))
    const tooMany = await POST(request(body({ providers: seven })))
    expect(((await tooMany.json()) as { code: string }).code).toBe('too_many_providers')

    const badSession = await POST(request(body({ sessionId: 'NOPE' })))
    expect(((await badSession.json()) as { code: string }).code).toBe('bad_session')
  })

  it('refuses a town the directory cannot narrow, without inventing a line', async () => {
    const notMassachusetts = await POST(
      request(body({ facts: { ...(body().facts as object), town: 'Albany' } })),
    )
    expect(((await notMassachusetts.json()) as { code: string }).code).toBe('bad_town')
  })

  it('is off — not simulated — when no agent is configured', async () => {
    const response = await POST(request(body(), ''))
    const payload = (await response.json()) as { mode: string; notice: string; records: unknown[] }
    expect(payload.mode).toBe('off')
    expect(payload.notice).toContain('switch kit')
    expect(payload.records).toEqual([])
  })

  it('dial only team lines when an agent exists but real calls are not enabled', async () => {
    vi.stubEnv('ELEVENLABS_API_KEY', 'test-key')
    vi.stubEnv('ELEVENLABS_AGENT_ID', 'agent-1')
    vi.stubEnv('ELEVENLABS_PHONE_NUMBER_ID', 'phone-1')

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ conversation_id: 'conv_live_1' }), { status: 200 }),
    )

    const response = await POST(request(body(), ''))
    const payload = (await response.json()) as {
      mode: string
      records: { status: string; conversationId: string; note: string | null }[]
    }
    expect(payload.mode).toBe('allowlist')
    expect(payload.records[0]?.status).toBe('queued')
    expect(payload.records[0]?.conversationId.startsWith('conv_live_1.')).toBe(true)
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/twilio/outbound-call')
    const sent = JSON.parse(String(init.body)) as { to_number: string; dynamic_variables?: unknown }
    expect(sent.to_number).toBe('+15550100001')
    const override = (JSON.parse(String(init.body)) as { conversation_initiation_client_data: { conversation_config_override: { agent: Record<string, unknown> } } })
      .conversation_initiation_client_data.conversation_config_override.agent
    expect(Object.keys(override)).not.toContain('first_message')
    const dynamic = (JSON.parse(String(init.body)) as { conversation_initiation_client_data: { dynamic_variables: Record<string, string> } })
      .conversation_initiation_client_data.dynamic_variables
    expect(dynamic).toMatchObject({ town: 'Framingham', vertical: 'fuel' })
    expect(Object.keys(dynamic)).not.toContain('name')
  })

  it('asks an installer about heat pump prices, so the disclosure never has an empty hole', async () => {
    vi.stubEnv('ELEVENLABS_API_KEY', 'test-key')
    vi.stubEnv('ELEVENLABS_AGENT_ID', 'agent-1')
    vi.stubEnv('ELEVENLABS_PHONE_NUMBER_ID', 'phone-1')
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ conversation_id: 'conv_live_2' }), { status: 200 }),
    )

    const response = await POST(
      request(body({ kind: 'installer', choice: 'SWITCH_HEAT_PUMP', providers: [{ id: 'test-installer-a', channel: 'phone' }] }), ''),
    )
    expect(response.status).toBe(200)
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    const dynamic = (JSON.parse(String(init.body)) as { conversation_initiation_client_data: { dynamic_variables: Record<string, string> } })
      .conversation_initiation_client_data.dynamic_variables
    expect(dynamic).toMatchObject({ vertical: 'installer', fuel: 'heat pump', current_fuel: 'oil' })
  })

  it('reports a vendor failure per provider instead of failing the request', async () => {
    vi.stubEnv('ELEVENLABS_API_KEY', 'test-key')
    vi.stubEnv('ELEVENLABS_AGENT_ID', 'agent-1')
    vi.stubEnv('ELEVENLABS_PHONE_NUMBER_ID', 'phone-1')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 500 }))

    const response = await POST(request(body(), ''))
    const payload = (await response.json()) as { mode: string; records: { status: string; note: string }[] }
    expect(response.status).toBe(200)
    expect(payload.records[0]?.status).toBe('failed')
    expect(payload.records[0]?.note).toContain('voice platform')
  })

  it('refuses a live call whose consent token is missing, forged, stale or for other facts', async () => {
    vi.stubEnv('ELEVENLABS_API_KEY', 'test-key')
    vi.stubEnv('ELEVENLABS_AGENT_ID', 'agent-1')
    vi.stubEnv('ELEVENLABS_PHONE_NUMBER_ID', 'phone-1')
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    const missing = await POST(rawRequest(body(), ''))
    expect(missing.status).toBe(403)
    expect(((await missing.json()) as { code: string }).code).toBe('missing_consent')

    const forged = await POST(rawRequest({ ...body(), consentToken: `${Date.now()}.${'a'.repeat(16)}.${'a'.repeat(64)}` }, ''))
    expect(((await forged.json()) as { code: string }).code).toBe('bad_consent')

    const stale = await POST(rawRequest(signed(body(), new Date(Date.now() - 11 * 60_000)), ''))
    expect(((await stale.json()) as { code: string }).code).toBe('expired_consent')

    const token = (signed(body()) as { consentToken: string }).consentToken
    const otherFacts = body({ facts: { ...(body().facts as object), annualVolume: 1200 } })
    const swapped = await POST(rawRequest({ ...otherFacts, consentToken: token }, ''))
    expect(((await swapped.json()) as { code: string }).code).toBe('bad_consent')

    const otherSession = await POST(rawRequest({ ...body({ sessionId: 'session-other99' }), consentToken: token }, ''))
    expect(((await otherSession.json()) as { code: string }).code).toBe('bad_consent')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('returns call refs bound to the session', async () => {
    vi.stubEnv('ELEVENLABS_API_KEY', 'test-key')
    vi.stubEnv('ELEVENLABS_AGENT_ID', 'agent-1')
    vi.stubEnv('ELEVENLABS_PHONE_NUMBER_ID', 'phone-1')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ conversation_id: 'conv_live_1' }), { status: 200 }),
    )
    const response = await POST(request(body(), ''))
    const payload = (await response.json()) as { records: { conversationId: string }[] }
    const ref = payload.records[0]?.conversationId ?? ''
    expect(ref).not.toBe('conv_live_1')
    expect(openCallId(ref, SESSION)).toBe('conv_live_1')
    expect(openCallId(ref, 'session-other99')).toBeNull()
  })

  it('spends a consent token once, and refuses live calling in production without a real secret', async () => {
    vi.stubEnv('ELEVENLABS_API_KEY', 'test-key')
    vi.stubEnv('ELEVENLABS_AGENT_ID', 'agent-1')
    vi.stubEnv('ELEVENLABS_PHONE_NUMBER_ID', 'phone-1')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ conversation_id: 'conv_live_1' }), { status: 200 }),
    )
    const once = signed(body())
    expect((await POST(rawRequest(once, ''))).status).toBe(200)
    const replay = await POST(rawRequest(once, ''))
    expect(replay.status).toBe(403)
    expect(((await replay.json()) as { code: string }).code).toBe('used_consent')

    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('CONSENT_SECRET', 'short')
    const prod = await POST(rawRequest(signed(body()), ''))
    expect(prod.status).toBe(503)
    expect(((await prod.json()) as { code: string }).code).toBe('consent_secret_not_configured')
  })

  it('rejects a token minted under the other mode', async () => {
    vi.stubEnv('ELEVENLABS_API_KEY', 'test-key')
    vi.stubEnv('ELEVENLABS_AGENT_ID', 'agent-1')
    vi.stubEnv('ELEVENLABS_PHONE_NUMBER_ID', 'phone-1')
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const validated = validateOutreachRequest(body())
    if (!validated.ok) throw new Error('fixture invalid')

    const liveToken = mintConsentToken(validated.value, SESSION, 'live')
    const underAllowlist = await POST(rawRequest({ ...body(), consentToken: liveToken }, ''))
    expect(underAllowlist.status).toBe(403)
    expect(((await underAllowlist.json()) as { code: string }).code).toBe('bad_consent')

    vi.stubEnv('PROVIDER_CALLS_ENABLED', 'true')
    vi.stubEnv('PROVIDER_ALLOWLIST_JSON', JSON.stringify([{ ...LIVE_ROW }]))
    const allowlistToken = mintConsentToken(validated.value, SESSION, 'allowlist')
    const underLive = await POST(rawRequest({ ...body(), consentToken: allowlistToken }, ''))
    expect(underLive.status).toBe(403)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

const LIVE_ROW = {
  id: 'real-fuel',
  name: 'A real dealer',
  kind: 'fuel',
  channels: ['phone'],
  phone: '+16175550100',
  email: null,
  source: 'Fixture list',
  asOf: '2026-10-24',
  allowlist: false,
}
