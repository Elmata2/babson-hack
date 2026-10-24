/**
 * @built F-131 the inbound tool is closed or off, never open by default
 *
 * Two gates in front of a calculation that anybody on the internet can reach: a
 * shared secret, and a closed fact list. With no secret the route answers 503 — an
 * unconfigured deployment must not become a public calculator with a phone bill.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

import { GET, POST } from '../route'

const TOOL_SECRET_HEADER = 'x-voice-secret'
const SHARED = 'voice-tool-test-value'

function request(body: unknown, secret: string | null = SHARED): Request {
  return new Request('https://example.test/api/voice/verdict', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(secret ? { [TOOL_SECRET_HEADER]: secret } : {}) },
    body: JSON.stringify(body),
  })
}

function body(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { town: 'Framingham', fuel: 'oil', units: 800, price: 6.23, year: '2026', lang: 'en', ...overrides }
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('POST /api/voice/verdict', () => {
  it('is off when no secret is configured', async () => {
    const response = await POST(request(body()))
    expect(response.status).toBe(503)
    expect(((await response.json()) as { code: string }).code).toBe('not_configured')
  })

  it('refuses a call that does not carry the secret', async () => {
    vi.stubEnv('VOICE_TOOL_SECRET', SHARED)
    const response = await POST(request(body(), null))
    expect(response.status).toBe(401)
  })

  it('answers with a line, a disclaimer and the numbers it used', async () => {
    vi.stubEnv('VOICE_TOOL_SECRET', SHARED)
    const response = await POST(request(body()))
    expect(response.status).toBe(200)
    const payload = (await response.json()) as {
      ok: boolean
      verdict: string
      line: string
      disclaimer: string
      decision: string
      source: string
    }
    expect(payload.ok).toBe(true)
    expect(['SWITCH_NOW', 'SWITCH_BEFORE_DEC31', 'DO_NOT_SWITCH_YET']).toContain(payload.verdict)
    expect(payload.line.length).toBeGreaterThan(10)
    expect(payload.disclaimer).toContain('not a quote')
    expect(payload.decision).toContain('decision is yours')
    expect(payload.source).toContain('snapshot')
  })

  it('answers in the caller’s language', async () => {
    vi.stubEnv('VOICE_TOOL_SECRET', SHARED)
    const payload = (await (await POST(request(body({ lang: 'ht' })))).json()) as { disclaimer: string }
    expect(payload.disclaimer).toContain('estimasyon')
  })

  it('refuses a personal fact, a bad town, a bad language and an unknown field', async () => {
    vi.stubEnv('VOICE_TOOL_SECRET', SHARED)
    const cases: [Record<string, unknown>, string][] = [
      [{ name: 'Alex' }, 'personal_fact'],
      [{ town: 'Albany' }, 'bad_town'],
      [{ lang: 'fr' }, 'bad_language'],
      [{ income: 90_000 }, 'personal_fact'],
      [{ sqft: 1_200 }, 'unknown_field'],
      [{ units: 0 }, 'bad_units'],
      [{ price: 'free' }, 'bad_price'],
    ]
    for (const [overrides, code] of cases) {
      const response = await POST(request(body(overrides)))
      expect(response.status).toBe(400)
      expect(((await response.json()) as { code: string }).code).toBe(code)
    }
  })

  it('refuses every other verb with a typed answer', async () => {
    const response = GET()
    expect(response.status).toBe(405)
  })
})
