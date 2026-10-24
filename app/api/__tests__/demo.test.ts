/**
 * @built F-49 route contract — every endpoint that can reach a provider refuses
 * or answers from baked data when `?demo=1` is present
 *
 * One test per route, and each one asserts the same two things: the documented
 * demo answer, and zero calls to the global `fetch`. The final cases prove the
 * normal path is still the normal path, because a demo flag that quietly turns
 * itself on would be as bad as one that does not work.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { computeVerdict } from '@/lib/calc'
import type { VerdictResult } from '@/lib/calc/types'
import { DEMO_HEADER, DEMO_MESSAGES } from '@/lib/demo'
import { resetPriceCache } from '@/lib/prices'
import type { OutreachRequest } from '@/lib/switch/types'

import { GET as addressGET } from '../address/route'
import { POST as explainPOST } from '../explain/route'
import { GET as geocodeGET } from '../geocode/route'
import { GET as parcelGET } from '../parcel/route'
import { POST as parseBillPOST } from '../parse-bill/route'
import { GET as pricesGET } from '../prices/route'
import { POST as switchPOST } from '../switch/route'

/* ------------------------------------------------------------------ helpers */

/** A fetch that fails loudly: any call is a bug in demo mode. */
function networkThatMustNotBeCalled() {
  return vi.fn(async () => {
    throw new Error('outbound fetch in demo mode')
  })
}

function demoRequest(path: string, init?: RequestInit): Request {
  return new Request(`https://switchpoint.test${path}`, init)
}

async function body(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>
}

const TINY_JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xd9])

const result = computeVerdict(
  { fuel: 'oil', annualUnits: 800, unitPrice: 6.23, hdd65: 5_600 },
  { tier: 'whole', installYear: 2026, installCost: 22_000, heatPumpRate: 0.235, standardRate: 0.305 },
) as VerdictResult

const REAL_DEALER = {
  id: 'real-dealer',
  name: 'A real dealer',
  kind: 'fuel',
  channels: ['email'],
  phone: null,
  email: 'quotes@dealer.test',
  source: 'Fixture list',
  asOf: '2026-10-24',
  allowlist: false,
}

function outreachBody(overrides: Partial<OutreachRequest> = {}): OutreachRequest {
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
    providers: [{ id: 'real-dealer', channel: 'email' }],
    consentAt: '2026-10-24T15:00:00.000Z',
    ...overrides,
  }
}

const CENSUS_MATCH = {
  result: {
    addressMatches: [
      {
        matchedAddress: '888 WASHINGTON ST, WELLESLEY, MA, 02482',
        coordinates: { x: -71.308457238005, y: 42.279618063349 },
        geographies: {
          Counties: [{ GEOID: '25021', BASENAME: 'Norfolk', NAME: 'Norfolk County' }],
          'Census Tracts': [{ GEOID: '25021404400', NAME: 'Census Tract 4044' }],
        },
      },
    ],
  },
}

beforeEach(() => {
  resetPriceCache()
  vi.stubEnv('EIA_API_KEY', '')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/* ------------------------------------------------------------------- routes */

describe('GET /api/prices?demo=1', () => {
  it('answers from the baked snapshot and never calls fetch', async () => {
    vi.stubEnv('EIA_API_KEY', 'KEY-THAT-WOULD-OTHERWISE-BE-USED')
    const fetchMock = networkThatMustNotBeCalled()
    vi.stubGlobal('fetch', fetchMock)

    const response = await pricesGET(demoRequest('/api/prices?demo=1'))
    const payload = await body(response)

    expect(response.status).toBe(200)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(payload.ok).toBe(true)
    expect(payload.demo).toBe(true)
    expect(payload.mode).toBe('snapshot')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(String((payload.notes as string[]).join(' '))).toContain('Demo mode')
  })
})

describe('GET /api/geocode?demo=1', () => {
  it('returns the documented refusal and never calls fetch', async () => {
    const fetchMock = networkThatMustNotBeCalled()
    vi.stubGlobal('fetch', fetchMock)

    const response = await geocodeGET(demoRequest('/api/geocode?q=1+Main+St,+Wellesley,+MA&demo=1'))
    const payload = await body(response)

    expect(response.status).toBe(200)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(payload).toMatchObject({
      ok: false,
      demo: true,
      code: 'demo_unavailable',
      message: DEMO_MESSAGES.geocode,
      fallback: 'town_list',
    })
  })

  it('accepts the header as well as the query', async () => {
    const fetchMock = networkThatMustNotBeCalled()
    vi.stubGlobal('fetch', fetchMock)

    const response = await geocodeGET(
      new Request('https://switchpoint.test/api/geocode?q=1+Main+St,+Wellesley,+MA', {
        headers: { [DEMO_HEADER]: '1' },
      }),
    )
    expect(fetchMock).not.toHaveBeenCalled()
    expect(response.status).toBe(200)
  })
})

describe('GET /api/address?demo=1', () => {
  it('refuses without Nominatim, and does not wait on the throttle', async () => {
    const fetchMock = networkThatMustNotBeCalled()
    vi.stubGlobal('fetch', fetchMock)

    const started = Date.now()
    const response = await addressGET(demoRequest('/api/address?q=106+chandler&demo=1'))
    const payload = await body(response)

    expect(Date.now() - started).toBeLessThan(500)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(payload).toMatchObject({
      ok: false,
      demo: true,
      code: 'demo_unavailable',
      message: DEMO_MESSAGES.address,
      fallback: 'town_list',
    })
  })
})

describe('GET /api/parcel?demo=1', () => {
  it('refuses without MassGIS, and says the manual fields are enough', async () => {
    const fetchMock = networkThatMustNotBeCalled()
    vi.stubGlobal('fetch', fetchMock)

    const response = await parcelGET(demoRequest('/api/parcel?lat=42.2992&lon=-71.4342&demo=1'))
    const payload = await body(response)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(payload).toMatchObject({
      ok: false,
      demo: true,
      code: 'demo_unavailable',
      message: DEMO_MESSAGES.parcel,
      fallback: 'manual_entry',
    })
  })
})

describe('POST /api/parse-bill in demo mode', () => {
  it('refuses before a credential is read, with the flag on the query', async () => {
    vi.stubEnv('BABSON_GATEWAY_KEY', 'gateway-test-key')
    const fetchMock = networkThatMustNotBeCalled()
    vi.stubGlobal('fetch', fetchMock)

    const form = new FormData()
    form.set('file', new File([TINY_JPEG], 'bill.jpg', { type: 'image/jpeg' }))
    const response = await parseBillPOST(
      demoRequest('/api/parse-bill?demo=1', { method: 'POST', body: form }),
    )
    const payload = await body(response)

    expect(response.status).toBe(200)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(payload).toMatchObject({
      ok: false,
      demo: true,
      code: 'demo_unavailable',
      message: DEMO_MESSAGES.parseBill,
      fallback: 'manual_entry',
    })
  })

  it('also reads the flag from the form body', async () => {
    vi.stubEnv('BABSON_GATEWAY_KEY', 'gateway-test-key')
    const fetchMock = networkThatMustNotBeCalled()
    vi.stubGlobal('fetch', fetchMock)

    const form = new FormData()
    form.set('file', new File([TINY_JPEG], 'bill.jpg', { type: 'image/jpeg' }))
    form.set('demo', '1')
    const response = await parseBillPOST(demoRequest('/api/parse-bill', { method: 'POST', body: form }))

    expect(fetchMock).not.toHaveBeenCalled()
    expect(response.status).toBe(200)
  })
})

describe('POST /api/explain in demo mode', () => {
  it('returns the deterministic sentences without picking a provider', async () => {
    vi.stubEnv('BABSON_GATEWAY_KEY', 'gateway-test-key')
    const fetchMock = networkThatMustNotBeCalled()
    vi.stubGlobal('fetch', fetchMock)

    const request = demoRequest('/api/explain?demo=1', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ result }),
    })
    const response = await explainPOST(request)
    const payload = await body(response)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(payload.ok).toBe(true)
    expect(payload.demo).toBe(true)
    expect(payload.source).toBe('fallback')
    expect(payload.reader).toBe('none')
    expect(payload.sentences).toHaveLength(3)
  })

  it('accepts the body flag too', async () => {
    vi.stubEnv('BABSON_GATEWAY_KEY', 'gateway-test-key')
    const fetchMock = networkThatMustNotBeCalled()
    vi.stubGlobal('fetch', fetchMock)

    const response = await explainPOST(
      demoRequest('/api/explain', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ result, demo: true }),
      }),
    )
    expect(fetchMock).not.toHaveBeenCalled()
    expect((await body(response)).source).toBe('fallback')
  })
})

describe('POST /api/switch in demo mode', () => {
  it('validates the same request, then returns baked statuses and sends nothing', async () => {
    vi.stubEnv('PROVIDER_OUTREACH_ENABLED', 'true')
    vi.stubEnv('PROVIDER_ALLOWLIST_JSON', JSON.stringify([REAL_DEALER]))
    vi.stubEnv('RESEND_API_KEY', 're_test')
    vi.stubEnv('RESEND_FROM', 'Switchpoint <hello@switchpoint.test>')
    const fetchMock = networkThatMustNotBeCalled()
    vi.stubGlobal('fetch', fetchMock)

    const response = await switchPOST(
      demoRequest('/api/switch?demo=1', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(outreachBody()),
      }),
    )
    const payload = await body(response)

    expect(response.status).toBe(200)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(payload.ok).toBe(true)
    expect(payload.mode).toBe('demo')
    expect(payload.notice).toBe(DEMO_MESSAGES.switch)
    const statuses = payload.statuses as { status: string; note: string }[]
    expect(statuses).toHaveLength(1)
    expect(statuses[0]?.status).toBe('queued')
    expect(statuses[0]?.note).toContain('baked')
  })

  it('still refuses a provider that is not configured', async () => {
    const fetchMock = networkThatMustNotBeCalled()
    vi.stubGlobal('fetch', fetchMock)

    const response = await switchPOST(
      demoRequest('/api/switch?demo=1', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(outreachBody({ providers: [{ id: 'ghost-dealer', channel: 'email' }] })),
      }),
    )
    expect(fetchMock).not.toHaveBeenCalled()
    expect(response.status).toBe(400)
    expect((await body(response)).code).toBe('unknown_provider')
  })
})

/* ------------------------------------------------------- normal mode, intact */

describe('normal mode is unchanged', () => {
  it('/api/prices with a key still makes its three EIA reads', async () => {
    vi.stubEnv('EIA_API_KEY', 'KEY')
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('ELEC.PRICE')) {
        return new Response(
          JSON.stringify({ response: { data: [{ period: '2026-08', price: 30.48 }] } }),
          { status: 200 },
        )
      }
      return new Response(
        JSON.stringify({ response: { data: [{ period: '2026-10-19', value: 6.115 }] } }),
        { status: 200 },
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    const response = await pricesGET(demoRequest('/api/prices'))
    const payload = await body(response)

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(payload.demo).toBeUndefined()
    expect(payload.mode).toBe('live')
    expect(response.headers.get('cache-control')).toContain('s-maxage')
  })

  it('/api/geocode still calls the Census geocoder when the flag is absent', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(CENSUS_MATCH), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const response = await geocodeGET(
      demoRequest('/api/geocode?q=888+Washington+St,+Wellesley,+MA,+02482&nocache=1'),
    )
    const payload = await body(response)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(payload.ok).toBe(true)
    expect(payload.town).toBe('Wellesley')
  })
})
