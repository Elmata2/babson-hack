/**
 * @built F-49 the demo flag's contract — one parser, one link rewriter, one refusal
 *
 * R13.1 is only as good as the flag's edge cases. These tests pin the ones that
 * would silently turn demo mode off: a leading `?`, a full URL, a `0`, an empty
 * value, a route helper receiving a Next page's `searchParams` object, and a link
 * that already carries other parameters or a hash.
 */

import { describe, expect, it } from 'vitest'

import {
  DEMO_HEADER,
  DEMO_MESSAGES,
  demoFromLocation,
  demoFromParams,
  demoFromRequest,
  demoUnavailable,
  isDemo,
  isDemoFlag,
  withDemo,
} from '../demo'

describe('isDemo', () => {
  it('accepts the spellings we document', () => {
    for (const value of ['1', 'true', 'TRUE', 'yes', 'on', ' 1 ']) {
      expect(isDemo(`demo=${value}`)).toBe(true)
    }
  })

  it('rejects absent, zero and nonsense values', () => {
    for (const value of ['', '0', 'false', 'no', 'off', 'demo', '1.0', 'maybe']) {
      expect(isDemo(`demo=${value}`)).toBe(false)
    }
    expect(isDemo('')).toBe(false)
    expect(isDemo('fuel=oil&units=800')).toBe(false)
  })

  it('reads a bare query, a leading ?, a path, a full URL and URLSearchParams', () => {
    expect(isDemo('demo=1&fuel=oil')).toBe(true)
    expect(isDemo('?demo=1')).toBe(true)
    expect(isDemo('/verdict?fuel=oil&demo=1')).toBe(true)
    expect(isDemo('https://switchpoint.test/verdict?demo=1')).toBe(true)
    expect(isDemo(new URLSearchParams('demo=1'))).toBe(true)
    expect(isDemo('/verdict')).toBe(false)
  })

  it('reads the object a Next 16 page receives, including a repeated key', () => {
    expect(demoFromParams({ demo: '1' })).toBe(true)
    expect(demoFromParams({ demo: ['1', '0'] })).toBe(true)
    expect(demoFromParams({ demo: '0' })).toBe(false)
    expect(demoFromParams({})).toBe(false)
    expect(demoFromParams(null)).toBe(false)
  })

  it('does not treat a path segment as a parameter', () => {
    expect(isDemo('/demo')).toBe(false)
    expect(isDemo('/demo/1')).toBe(false)
  })
})

describe('isDemoFlag', () => {
  it('accepts a string or a JSON boolean and refuses a File or null', () => {
    expect(isDemoFlag('1')).toBe(true)
    expect(isDemoFlag('true')).toBe(true)
    expect(isDemoFlag(true)).toBe(true)
    expect(isDemoFlag(false)).toBe(false)
    expect(isDemoFlag('0')).toBe(false)
    expect(isDemoFlag(null)).toBe(false)
    expect(isDemoFlag(1)).toBe(false)
    expect(isDemoFlag(new File([], 'bill.jpg'))).toBe(false)
  })
})

describe('withDemo', () => {
  it('appends the flag without touching the rest of the query', () => {
    expect(withDemo('/verdict?fuel=oil&units=800', true)).toBe('/verdict?fuel=oil&units=800&demo=1')
    expect(withDemo('/onboarding', true)).toBe('/onboarding?demo=1')
  })

  it('preserves the hash', () => {
    expect(withDemo('/verdict?fuel=oil#numbers', true)).toBe('/verdict?fuel=oil&demo=1#numbers')
    expect(withDemo('/verdict#numbers', true)).toBe('/verdict?demo=1#numbers')
  })

  it('is idempotent', () => {
    const once = withDemo('/verdict?fuel=oil', true)
    expect(withDemo(once, true)).toBe(once)
  })

  it('replaces a conflicting value rather than appending a second demo key', () => {
    const href = withDemo('/verdict?demo=0', true)
    const params = new URLSearchParams(href.split('?')[1])
    expect(params.getAll('demo')).toEqual(['1'])
    expect(isDemo(href)).toBe(true)
  })

  it('removes the flag and leaves a clean href when demo is off', () => {
    expect(withDemo('/verdict?fuel=oil&demo=1', false)).toBe('/verdict?fuel=oil')
    expect(withDemo('/verdict?demo=1', false)).toBe('/verdict')
    expect(withDemo('/verdict', false)).toBe('/verdict')
    expect(withDemo('/verdict?fuel=oil', false)).toBe('/verdict?fuel=oil')
  })

  it('keeps a hash when removing the last parameter', () => {
    expect(withDemo('/verdict?demo=1#numbers', false)).toBe('/verdict#numbers')
  })
})

describe('demoFromRequest', () => {
  it('reads the query string', () => {
    expect(demoFromRequest(new Request('https://switchpoint.test/api/prices?demo=1'))).toBe(true)
    expect(demoFromRequest(new Request('https://switchpoint.test/api/prices'))).toBe(false)
  })

  it('reads the header for a client that cannot rewrite the URL', () => {
    const request = new Request('https://switchpoint.test/api/geocode', {
      headers: { [DEMO_HEADER]: '1' },
    })
    expect(demoFromRequest(request)).toBe(true)
  })
})

describe('demoFromLocation', () => {
  it('is false without a window, so a server render cannot read the flag by accident', () => {
    expect(typeof window).toBe('undefined')
    expect(demoFromLocation()).toBe(false)
  })
})

describe('demoUnavailable', () => {
  it('is a documented 200-shaped refusal, not an error', () => {
    const refusal = demoUnavailable(DEMO_MESSAGES.geocode, 'town_list')
    expect(refusal).toEqual({
      ok: false,
      demo: true,
      code: 'demo_unavailable',
      message: DEMO_MESSAGES.geocode,
      fallback: 'town_list',
    })
    expect(refusal.fallback).not.toBe('')
  })
})
