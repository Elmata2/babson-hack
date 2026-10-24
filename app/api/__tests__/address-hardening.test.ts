import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/geocode', () => ({
  geocodeAddress: vi.fn(async () => ({
    ok: true,
    result: {
      matchedAddress: '1 MAIN ST, FRAMINGHAM, MA, 01702',
      lat: 42.29,
      lon: -71.43,
      county: '25017',
      countyName: 'Middlesex',
      tract: '25017383001',
    },
  })),
}))

vi.mock('@/lib/parcel', () => ({
  parcelAt: vi.fn(async () => ({
    ok: true,
    parcel: { yearBuilt: 1950, useCode: '101', siteAddr: '1 MAIN ST', city: 'FRAMINGHAM', zip: '01702', bldAreaSqft: 1500, units: 1, townId: 1 },
  })),
}))

import { GET as address } from '../address/route'
import { GET as geocode } from '../geocode/route'
import { GET as parcel } from '../parcel/route'
import { POST as parseBill } from '../parse-bill/route'

afterEach(() => {
  vi.restoreAllMocks()
})

function get(path: string): Request {
  return new Request(`https://example.test${path}`)
}

describe('address-keyed responses are never publicly cached', () => {
  it('geocode answers no-store on success and on failure', async () => {
    const ok = await geocode(get('/api/geocode?q=1+Main+St,+Framingham,+MA'))
    expect(ok.status).toBe(200)
    expect(ok.headers.get('cache-control')).toBe('no-store')
    const short = await geocode(get('/api/geocode?q=ab'))
    expect(short.headers.get('cache-control')).toBe('no-store')
  })

  it('parcel answers no-store', async () => {
    const ok = await parcel(get('/api/parcel?lat=42.29&lon=-71.43'))
    expect(ok.status).toBe(200)
    expect(ok.headers.get('cache-control')).toBe('no-store')
    const bad = await parcel(get('/api/parcel?lat=x&lon=y'))
    expect(bad.headers.get('cache-control')).toBe('no-store')
  })

  it('geocode refuses a query over 120 characters', async () => {
    const response = await geocode(get(`/api/geocode?q=${'a'.repeat(121)}`))
    expect(response.status).toBe(400)
    expect(response.headers.get('cache-control')).toBe('no-store')
  })
})

describe('/api/address queue depth', () => {
  it('answers 429 once the upstream queue is full, without waiting on it', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () => new Promise<Response>(() => undefined),
    )
    const pending = Array.from({ length: 8 }, (_, i) => address(get(`/api/address?q=${i}+Chandler+Street`)))
    await new Promise((resolve) => setTimeout(resolve, 20))
    pending.push(address(get('/api/address?q=88+Chandler+Street')))
    const full = await address(get('/api/address?q=99+Chandler+Street'))
    expect(full.status).toBe(429)
    expect(Number(full.headers.get('retry-after'))).toBeGreaterThan(0)
    void pending
  })
})

describe('/api/parse-bill size gate', () => {
  it('refuses on Content-Length before reading the body', async () => {
    const request = new Request('https://example.test/api/parse-bill', {
      method: 'POST',
      headers: { 'content-length': String(5 * 1024 * 1024), 'content-type': 'multipart/form-data; boundary=x' },
      body: 'x',
    })
    const formData = vi.spyOn(request, 'formData')
    const response = await parseBill(request)
    expect(response.status).toBe(413)
    expect(formData).not.toHaveBeenCalled()
  })
})
