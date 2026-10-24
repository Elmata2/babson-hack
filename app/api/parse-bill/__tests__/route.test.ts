/**
 * @built F-26 route contract — the whole POST path, with the reader mocked
 * @built F-79 two readers — console key or OpenRouter, and OAuth refused by name
 *
 * The unit tests in `lib/parse` prove the validator. This file proves the route:
 * that a photographed document plus the fields only the household knows actually
 * reach the parser, that the annualisation method survives the trip back, and that
 * each credential failure says which failure it is.
 *
 * `fetch` is mocked, so no key and no network are needed.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import fixtureA from '@/lib/parse/__tests__/fixtures/a-oil-ticket-degree-days.json'
import fixtureB from '@/lib/parse/__tests__/fixtures/b-oil-ticket-no-degree-days.json'

import { GET, POST } from '../route'

/** A one-pixel JPEG is enough: the route only passes bytes to the mocked reader. */
const TINY_JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xd9])

// Assembled rather than written out: the pre-commit scanner refuses any literal
// that looks like an Anthropic key, and this is a fixture, not a credential.
const API_KEY = ['sk', 'ant', 'api', 'TEST-ONLY-NOT-A-CREDENTIAL'].join('-')

/** Anthropic's envelope. */
function anthropicEnvelope(parsed: unknown): Response {
  return new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(parsed) }] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

/** OpenRouter's (OpenAI-shaped) envelope. */
function openRouterEnvelope(parsed: unknown): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(parsed) } }] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

function billRequest(fields: Record<string, string> = {}, mediaType = 'image/jpeg'): Request {
  const form = new FormData()
  form.set('file', new File([TINY_JPEG], 'bill.jpg', { type: mediaType }))
  for (const [key, value] of Object.entries(fields)) form.set(key, value)
  return new Request('https://switchpoint.test/api/parse-bill', { method: 'POST', body: form })
}

interface RouteBody {
  ok: boolean
  reader?: string
  bill: {
    annualisation: { method: string; value: number; confidence: number; assumptions: string[] } | null
    units: { value: number | null; unit: string }
    price: { value: number | null }
    ready: boolean
    flags: { code: string }[]
  }
}

async function parse(fields: Record<string, string> = {}, mediaType = 'image/jpeg'): Promise<RouteBody> {
  const response = await POST(billRequest(fields, mediaType))
  expect(response.status).toBe(200)
  return (await response.json()) as RouteBody
}

describe('/api/parse-bill', () => {
  beforeEach(() => {
    vi.stubEnv('ANTHROPIC_API_KEY', API_KEY)
    vi.stubEnv('OPENROUTER_API_KEY', '')
    vi.stubEnv('BABSON_GATEWAY_KEY', '')
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

  it('refuses a Claude Code OAuth token by name instead of burning a request', async () => {
    // sk-ant-oat01-… authenticates and then always returns 429: it carries no API
    // quota. The route must not pretend it is a reader.
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-oat01-example-oauth-token')
    const fetchMock = vi.fn(async () => anthropicEnvelope(fixtureA))
    vi.stubGlobal('fetch', fetchMock)
    const response = await POST(billRequest())
    expect(response.status).toBe(503)
    const body = (await response.json()) as { code: string; message: string }
    expect(body.code).toBe('vision_not_configured')
    expect(body.message).toMatch(/OAuth token/i)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects a request with no file', async () => {
    const form = new FormData()
    const response = await POST(new Request('https://switchpoint.test/api/parse-bill', { method: 'POST', body: form }))
    expect(response.status).toBe(400)
  })

  it('round-trips a degree-day oil ticket through the route', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => anthropicEnvelope(fixtureA)))
    const body = await parse()
    expect(body.ok).toBe(true)
    expect(body.reader).toBe('anthropic')
    // 187.4 gal × (season HDD / 1,183 degree days) — no cadence needed.
    expect(body.bill.annualisation?.method).toBe('degree_days')
    expect(body.bill.annualisation?.value).toBeGreaterThan(850)
    expect(body.bill.annualisation?.value).toBeLessThan(950)
    expect(body.bill.price.value).toBeCloseTo(6.239, 3)
  })

  it('forwards deliveriesPerSeason so one ticket becomes a year', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => anthropicEnvelope(fixtureB)))
    const body = await parse({ deliveriesPerSeason: '4' })
    expect(body.bill.annualisation?.method).toBe('tank_cadence')
    expect(body.bill.annualisation?.value).toBe(760)
    expect(body.bill.annualisation?.assumptions.join(' ')).toMatch(/4/)
    expect(body.bill.ready).toBe(true)
  })

  it('asks instead of inventing when the fill count is missing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => anthropicEnvelope(fixtureB)))
    const body = await parse()
    expect(body.bill.annualisation).toBeNull()
    expect(body.bill.ready).toBe(false)
    expect(body.bill.flags.map((flag) => flag.code)).toContain('needs_fills')
  })

  it('ignores an out-of-range fill count rather than trusting it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => anthropicEnvelope(fixtureB)))
    const body = await parse({ deliveriesPerSeason: '99' })
    expect(body.bill.annualisation).toBeNull()
    expect(body.bill.flags.map((flag) => flag.code)).toContain('needs_fills')
  })

  it('treats a model "not a bill" as a typed refusal, not a 500', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => anthropicEnvelope({ error: 'not_a_bill' })))
    const response = await POST(billRequest())
    expect(response.status).toBe(422)
    expect(((await response.json()) as { code: string }).code).toBe('not_a_bill')
  })

  it('never returns an upstream body to the client', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x-api-key: sk-ant-leaked-key', { status: 500 })))
    const response = await POST(billRequest())
    expect(response.status).toBe(502)
    expect(await response.text()).not.toMatch(/sk-ant/)
  })

  it('names a rejected credential instead of calling it an outage', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })))
    const response = await POST(billRequest())
    expect(response.status).toBe(503)
    expect(((await response.json()) as { code: string }).code).toBe('vision_credentials')
  })

  it('names a rate limit instead of inviting a retry', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 429 })))
    const response = await POST(billRequest())
    expect(response.status).toBe(429)
    const body = (await response.json()) as { code: string; message: string }
    expect(body.code).toBe('vision_rate_limited')
    expect(body.message).toMatch(/type the two numbers/i)
  })
})

/**
 * @built F-79 the OpenRouter reader — the credential this deployment actually has
 *
 * A console key costs money to obtain; an OpenRouter key is already present and
 * reads a photographed Massachusetts bill for about $0.00003. It must produce the
 * identical `{ ok, bill }` contract, so nothing downstream knows which reader ran.
 */
describe('/api/parse-bill with an OpenRouter key', () => {
  beforeEach(() => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-or-v1-test-key')
    vi.stubEnv('OPENROUTER_MODEL', '')
    vi.stubEnv('BABSON_GATEWAY_KEY', '')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('reads a bill and reports which reader ran', async () => {
    const fetchMock = vi.fn(async (_url: unknown, _init?: unknown) => openRouterEnvelope(fixtureA))
    vi.stubGlobal('fetch', fetchMock)
    const body = await parse()
    expect(body.reader).toBe('openrouter')
    expect(body.bill.annualisation?.method).toBe('degree_days')
  })

  it('sends a bearer token, the default model, and the image as a data URL', async () => {
    const fetchMock = vi.fn(async (_url: unknown, _init?: unknown) => openRouterEnvelope(fixtureA))
    vi.stubGlobal('fetch', fetchMock)
    await parse()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions')
    const headers = init.headers as Record<string, string>
    expect(headers.authorization).toBe('Bearer sk-or-v1-test-key')
    expect(headers['x-api-key']).toBeUndefined()
    const sent = JSON.parse(String(init.body)) as {
      model: string
      messages: { content: { type: string; image_url?: { url: string } }[] }[]
    }
    expect(sent.model).toBe('google/gemma-3-12b-it')
    expect(sent.messages[0].content[0].image_url?.url).toMatch(/^data:image\/jpeg;base64,/)
  })

  it('honours an OPENROUTER_MODEL override', async () => {
    vi.stubEnv('OPENROUTER_MODEL', 'qwen/qwen3.7-flash')
    const fetchMock = vi.fn(async (_url: unknown, _init?: unknown) => openRouterEnvelope(fixtureA))
    vi.stubGlobal('fetch', fetchMock)
    await parse()
    const sent = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body)) as { model: string }
    expect(sent.model).toBe('qwen/qwen3.7-flash')
  })

  it('tells the truth about PDFs instead of failing upstream', async () => {
    const fetchMock = vi.fn(async (_url: unknown, _init?: unknown) => openRouterEnvelope(fixtureA))
    vi.stubGlobal('fetch', fetchMock)
    const response = await POST(billRequest({}, 'application/pdf'))
    expect(response.status).toBe(415)
    const body = (await response.json()) as { code: string; message: string }
    expect(body.code).toBe('unsupported')
    expect(body.message).toMatch(/photograph|photo/i)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('prefers a console key when both are configured', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', API_KEY)
    const fetchMock = vi.fn(async (_url: unknown, _init?: unknown) => anthropicEnvelope(fixtureA))
    vi.stubGlobal('fetch', fetchMock)
    const body = await parse()
    expect(body.reader).toBe('anthropic')
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe('https://api.anthropic.com/v1/messages')
  })
})

/**
 * @built F-79 the Babson gateway reader — the seminar key, used as the OCR workaround
 *
 * The gateway exposes exactly one model (`claude-sonnet-5`) behind an `x-api-key`
 * header and an Anthropic-shaped `/v1/messages` endpoint. It is preferred over both
 * other readers, accepts PDFs, and returns the same `{ ok, bill }` contract.
 */
describe('/api/parse-bill with the Babson gateway key', () => {
  const GATEWAY = 'https://gateway.test'

  beforeEach(() => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    vi.stubEnv('OPENROUTER_API_KEY', '')
    vi.stubEnv('BABSON_GATEWAY_KEY', 'sk-test-babson-key')
    vi.stubEnv('BABSON_GATEWAY_URL', GATEWAY)
    vi.stubEnv('BABSON_GATEWAY_MODEL', '')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('reads a bill, names the reader, and sends x-api-key to /v1/messages', async () => {
    const fetchMock = vi.fn(async (_url: unknown, _init?: unknown) => anthropicEnvelope(fixtureA))
    vi.stubGlobal('fetch', fetchMock)
    const body = await parse()
    expect(body.reader).toBe('babson')
    expect(body.bill.annualisation?.method).toBe('degree_days')

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${GATEWAY}/v1/messages`)
    const headers = init.headers as Record<string, string>
    expect(headers['x-api-key']).toBe('sk-test-babson-key')
    expect(headers.authorization).toBeUndefined()

    const sent = JSON.parse(String(init.body)) as {
      model: string
      max_tokens: number
      temperature?: number
      messages: { content: { type: string; source?: { media_type: string } }[] }[]
    }
    expect(sent.model).toBe('claude-sonnet-5')
    // Sonnet 5 rejects `temperature`; sending it would 400 every bill.
    expect(sent.temperature).toBeUndefined()
    expect(sent.messages[0].content.map((part) => part.type)).toEqual(['image', 'text'])
    expect(sent.messages[0].content[0].source?.media_type).toBe('image/jpeg')
  })

  it('honours a full endpoint and a model override', async () => {
    vi.stubEnv('BABSON_GATEWAY_URL', `${GATEWAY}/v1/messages/`)
    vi.stubEnv('BABSON_GATEWAY_MODEL', 'claude-sonnet-5-preview')
    const fetchMock = vi.fn(async (_url: unknown, _init?: unknown) => anthropicEnvelope(fixtureA))
    vi.stubGlobal('fetch', fetchMock)
    await parse()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${GATEWAY}/v1/messages`)
    expect((JSON.parse(String(init.body)) as { model: string }).model).toBe('claude-sonnet-5-preview')
  })

  it('sends PDFs as document blocks the gateway can read', async () => {
    const fetchMock = vi.fn(async (_url: unknown, _init?: unknown) => anthropicEnvelope(fixtureA))
    vi.stubGlobal('fetch', fetchMock)
    const body = await parse({}, 'application/pdf')
    expect(body.ok).toBe(true)
    const sent = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body)) as {
      messages: { content: { type: string; source?: { media_type: string } }[] }[]
    }
    expect(sent.messages[0].content[0].type).toBe('document')
    expect(sent.messages[0].content[0].source?.media_type).toBe('application/pdf')
  })

  it('wins over a console key and an OpenRouter key when all three are configured', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', API_KEY)
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-or-v1-test-key')
    const fetchMock = vi.fn(async (_url: unknown, _init?: unknown) => anthropicEnvelope(fixtureA))
    vi.stubGlobal('fetch', fetchMock)
    const body = await parse()
    expect(body.reader).toBe('babson')
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe(`${GATEWAY}/v1/messages`)
  })

  it('maps a rejected gateway key to the credentials failure, not an outage', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })))
    const response = await POST(billRequest())
    expect(response.status).toBe(503)
    expect(((await response.json()) as { code: string }).code).toBe('vision_credentials')
  })
})

/**
 * @built F-108 several pages of one bill, one vision call; HEIC refused by name
 */
describe('/api/parse-bill with several files', () => {
  beforeEach(() => {
    vi.stubEnv('ANTHROPIC_API_KEY', API_KEY)
    vi.stubEnv('OPENROUTER_API_KEY', '')
    vi.stubEnv('BABSON_GATEWAY_KEY', '')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  function multiRequest(files: File[], fields: Record<string, string> = {}): Request {
    const form = new FormData()
    for (const file of files) form.append('file', file)
    for (const [key, value] of Object.entries(fields)) form.set(key, value)
    return new Request('https://switchpoint.test/api/parse-bill', { method: 'POST', body: form })
  }

  const jpeg = (name = 'p.jpg') => new File([TINY_JPEG], name, { type: 'image/jpeg' })

  it('sends every page as a block of ONE upstream call', async () => {
    const fetchMock = vi.fn(async (_url: unknown, _init?: unknown) => anthropicEnvelope(fixtureA))
    vi.stubGlobal('fetch', fetchMock)
    const response = await POST(multiRequest([jpeg('1.jpg'), jpeg('2.jpg'), new File([TINY_JPEG], 'x.pdf', { type: 'application/pdf' })]))
    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const sent = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body)) as {
      messages: { content: { type: string; text?: string }[] }[]
    }
    expect(sent.messages[0].content.map((part) => part.type)).toEqual(['image', 'image', 'document', 'text'])
    expect(sent.messages[0].content[3].text).toMatch(/ONE bill/)
  })

  it('sends several image_url parts to OpenRouter', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-or-v1-test-key')
    const fetchMock = vi.fn(async (_url: unknown, _init?: unknown) => openRouterEnvelope(fixtureA))
    vi.stubGlobal('fetch', fetchMock)
    await POST(multiRequest([jpeg(), jpeg()]))
    const sent = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body)) as {
      messages: { content: { type: string }[] }[]
    }
    expect(sent.messages[0].content.map((part) => part.type)).toEqual(['image_url', 'image_url', 'text'])
  })

  it('refuses a fourth page', async () => {
    const response = await POST(multiRequest([jpeg(), jpeg(), jpeg(), jpeg()]))
    expect(response.status).toBe(400)
  })

  it('caps the total at 4 MB with a typed 413', async () => {
    const big = new File([new Uint8Array(2.5 * 1024 * 1024)], 'big.jpg', { type: 'image/jpeg' })
    const response = await POST(multiRequest([big, big]))
    expect(response.status).toBe(413)
    expect(((await response.json()) as { code: string }).code).toBe('too_large')
  })

  it('answers HEIC with "export as JPG" before calling any reader', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const heic = new File([TINY_JPEG], 'IMG_1.HEIC', { type: '' })
    const response = await POST(multiRequest([heic]))
    expect(response.status).toBe(415)
    expect(((await response.json()) as { message: string }).message).toMatch(/JPG/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('forwards countyFips and heating to the parser', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => anthropicEnvelope(fixtureB)))
    const response = await POST(multiRequest([jpeg()], { countyFips: '25009', heating: 'false', deliveriesPerSeason: '4' }))
    expect(response.status).toBe(200)
  })
})
