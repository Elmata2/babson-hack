/**
 * @built F-39 route contract — the prose endpoint answers, or answers with the fallback
 *
 * The unit tests in `lib/verdict/explain` prove the number guard. This file proves
 * the route: it refuses a body it does not recognise, it uses the deterministic
 * sentences when no provider is configured, it rejects a model sentence that
 * invents a figure, and it accepts a faithful one. `fetch` is mocked, so no key
 * and no network are involved.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { computeVerdict } from '@/lib/calc'
import type { VerdictResult } from '@/lib/calc/types'
import { fallbackSentences, inventedNumbers } from '@/lib/verdict/explain'

import { GET, POST } from '../route'

const result = computeVerdict(
  { fuel: 'oil', annualUnits: 800, unitPrice: 6.23, hdd65: 5_600 },
  { tier: 'whole', installYear: 2026, installCost: 22_000, heatPumpRate: 0.235, standardRate: 0.305 },
) as VerdictResult

function request(body: unknown): Request {
  return new Request('https://switchpoint.test/api/explain', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

interface Body {
  ok: boolean
  code?: string
  sentences?: string[]
  source?: string
  reader?: string
}

async function bodyOf(response: Response): Promise<Body> {
  return (await response.json()) as Body
}

/** The gateway's Anthropic-shaped envelope. */
function envelope(text: string): Response {
  return new Response(JSON.stringify({ content: [{ type: 'text', text }] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

beforeEach(() => {
  vi.stubEnv('BABSON_GATEWAY_KEY', '')
  vi.stubEnv('ANTHROPIC_API_KEY', '')
  vi.stubEnv('OPENROUTER_API_KEY', '')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('/api/explain', () => {
  it('refuses a body that is not JSON', async () => {
    const response = await POST(request('not json'))
    expect(response.status).toBe(400)
    expect((await bodyOf(response)).code).toBe('bad_request')
  })

  it('refuses a result it does not recognise, rather than coercing one', async () => {
    for (const body of [{}, { result: {} }, { result: { ...result, netCost: 'free' } }]) {
      const response = await POST(request(body))
      expect(response.status).toBe(400)
      expect((await bodyOf(response)).ok).toBe(false)
    }
  })

  it('answers with the deterministic three sentences when no provider is configured', async () => {
    const response = await POST(request({ result }))
    expect(response.status).toBe(200)
    const body = await bodyOf(response)
    expect(body.ok).toBe(true)
    expect(body.source).toBe('fallback')
    expect(body.sentences).toHaveLength(3)
    expect(inventedNumbers((body.sentences ?? []).join(' '), result)).toEqual([])
  })

  it('discards a model sentence that invents a number', async () => {
    vi.stubEnv('BABSON_GATEWAY_KEY', 'gateway-test-key')
    vi.stubGlobal('fetch', vi.fn(async () => envelope('You will save $12,345 a year, guaranteed.')))

    const response = await POST(request({ result }))
    const body = await bodyOf(response)
    expect(body.source).toBe('fallback')
    expect(body.sentences).toEqual(fallbackSentences(result))
    expect(body.sentences?.join(' ')).not.toContain('12,345')
  })

  it('keeps a faithful model answer and names the reader', async () => {
    vi.stubEnv('BABSON_GATEWAY_KEY', 'gateway-test-key')
    const faithful = fallbackSentences(result).join(' ')
    const fetchMock = vi.fn(async () => envelope(faithful))
    vi.stubGlobal('fetch', fetchMock)

    const response = await POST(request({ result }))
    const body = await bodyOf(response)
    expect(body.source).toBe('model')
    expect(body.reader).toBe('babson')
    expect(body.sentences).toEqual(fallbackSentences(result))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('falls back when the provider is unreachable, without failing the page', async () => {
    vi.stubEnv('BABSON_GATEWAY_KEY', 'gateway-test-key')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })))

    const response = await POST(request({ result }))
    expect(response.status).toBe(200)
    expect((await bodyOf(response)).source).toBe('fallback')
  })

  it('is POST only', async () => {
    expect(GET().status).toBe(405)
  })
})
