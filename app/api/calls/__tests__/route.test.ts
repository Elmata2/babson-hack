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

function request(payload: unknown, query = '?demo=1'): Request {
  return new Request(`https://example.test/api/calls${query}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

afterEach(() => {
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
    expect(payload.notice).toContain('Calling is off here')
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
    expect(payload.records[0]?.conversationId).toBe('conv_live_1')
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/twilio/outbound-call')
    const sent = JSON.parse(String(init.body)) as { to_number: string; dynamic_variables?: unknown }
    expect(sent.to_number).toBe('+15550100001')
    const dynamic = (JSON.parse(String(init.body)) as { conversation_initiation_client_data: { dynamic_variables: Record<string, string> } })
      .conversation_initiation_client_data.dynamic_variables
    expect(dynamic).toMatchObject({ town: 'Framingham', vertical: 'fuel' })
    expect(Object.keys(dynamic)).not.toContain('name')
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
})
