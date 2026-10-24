/**
 * @built F-26 route contract — the whole POST path, with the vision call mocked
 *
 * The unit tests in `lib/parse` prove the validator. This file proves the *route*:
 * that a photographed document plus the three fields only the household knows
 * actually reach the parser, and that the annualisation method survives the trip
 * back to the browser. Without this, the annualiser could be perfect and still be
 * unreachable — which is exactly the bug this file was written to catch.
 *
 * `fetch` is mocked, so no key and no network are needed.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import fixtureA from '@/lib/parse/__tests__/fixtures/a-oil-ticket-degree-days.json'
import fixtureB from '@/lib/parse/__tests__/fixtures/b-oil-ticket-no-degree-days.json'

import { GET, POST } from '../route'

/** A one-pixel JPEG is enough: the route only passes bytes to the mocked model. */
const TINY_JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xd9])

/** The model's envelope, as the route expects it. */
function visionEnvelope(parsed: unknown): Response {
  return new Response(
    JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(parsed) }] }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
}

function billRequest(fields: Record<string, string> = {}): Request {
  const form = new FormData()
  form.set('file', new File([TINY_JPEG], 'bill.jpg', { type: 'image/jpeg' }))
  for (const [key, value] of Object.entries(fields)) form.set(key, value)
  return new Request('https://switchpoint.test/api/parse-bill', { method: 'POST', body: form })
}

/** Shape of the JSON the route returns on success. */
interface RouteBody {
  ok: boolean
  bill: {
    annualisation: { method: string; value: number; confidence: number; assumptions: string[] } | null
    units: { value: number | null; unit: string }
    price: { value: number | null }
    ready: boolean
    flags: { code: string }[]
  }
}

async function parse(fields: Record<string, string> = {}): Promise<RouteBody> {
  const response = await POST(billRequest(fields))
  expect(response.status).toBe(200)
  return (await response.json()) as RouteBody
}

describe('/api/parse-bill', () => {
  beforeEach(() => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key-not-real')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('refuses GET', async () => {
    expect((await GET()).status).toBe(405)
  })

  it('says so when bill reading is not configured', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    const response = await POST(billRequest())
    expect(response.status).toBe(503)
    expect(((await response.json()) as { code: string }).code).toBe('vision_not_configured')
  })

  it('rejects a request with no file', async () => {
    const form = new FormData()
    const response = await POST(new Request('https://switchpoint.test/api/parse-bill', { method: 'POST', body: form }))
    expect(response.status).toBe(400)
  })

  it('round-trips a degree-day oil ticket through the route', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => visionEnvelope(fixtureA)))
    const body = await parse()
    expect(body.ok).toBe(true)
    // 187.4 gal × (season HDD / 1,183 degree days) — no cadence needed.
    expect(body.bill.annualisation?.method).toBe('degree_days')
    expect(body.bill.annualisation?.value).toBeGreaterThan(850)
    expect(body.bill.annualisation?.value).toBeLessThan(950)
    expect(body.bill.price.value).toBeCloseTo(6.239, 3)
  })

  it('forwards deliveriesPerSeason so one ticket becomes a year', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => visionEnvelope(fixtureB)))
    const body = await parse({ deliveriesPerSeason: '4' })
    expect(body.bill.annualisation?.method).toBe('tank_cadence')
    expect(body.bill.annualisation?.value).toBe(760)
    expect(body.bill.annualisation?.assumptions.join(' ')).toMatch(/4/)
    expect(body.bill.ready).toBe(true)
  })

  it('asks instead of inventing when the fill count is missing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => visionEnvelope(fixtureB)))
    const body = await parse()
    expect(body.bill.annualisation).toBeNull()
    expect(body.bill.ready).toBe(false)
    expect(body.bill.flags.map((flag) => flag.code)).toContain('needs_fills')
  })

  it('ignores an out-of-range fill count rather than trusting it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => visionEnvelope(fixtureB)))
    const body = await parse({ deliveriesPerSeason: '99' })
    // 99 is not a plausible number of fills, so the field is dropped and the
    // parser falls back to asking — the same outcome as sending nothing.
    expect(body.bill.annualisation).toBeNull()
    expect(body.bill.flags.map((flag) => flag.code)).toContain('needs_fills')
  })

  it('treats a model "not a bill" as a typed refusal, not a 500', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => visionEnvelope({ error: 'not_a_bill' })))
    const response = await POST(billRequest())
    expect(response.status).toBe(422)
    expect(((await response.json()) as { code: string }).code).toBe('not_a_bill')
  })

  it('never returns an upstream body to the client', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('x-api-key: sk-ant-leaked-key', { status: 500 })),
    )
    const response = await POST(billRequest())
    expect(response.status).toBe(502)
    const text = await response.text()
    expect(text).not.toMatch(/sk-ant/)
  })
})
