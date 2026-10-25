/**
 * Unit tests for `ttlCache` from lib/net/json.ts.
 *
 * The clock is a parameter of get/set, so expiry is deterministic and testable
 * without `vi.useFakeTimers`. These tests cover the happy path, expiry
 * boundary, stale-after-expiry, and the edge case where a negative TTL means
 * the entry is immediately expired.
 */

import { describe, expect, it } from 'vitest'

import { ttlCache } from '../json'

describe('ttlCache', () => {
  it('returns a value that was just set', () => {
    const cache = ttlCache<string>()
    cache.set('k', 'v', 1_000, 100)
    expect(cache.get('k', 100)).toBe('v')
  })

  it('returns the value before the TTL expires', () => {
    const cache = ttlCache<number>()
    cache.set('k', 42, 1_000, 0)
    expect(cache.get('k', 999)).toBe(42)
  })

  it('returns null at the exact expiry boundary (>=)', () => {
    const cache = ttlCache<string>()
    cache.set('k', 'v', 1_000, 0)
    // at - storedAt >= ttl → expired
    expect(cache.get('k', 1_000)).toBeNull()
  })

  it('returns null after the TTL expires', () => {
    const cache = ttlCache<string>()
    cache.set('k', 'v', 500, 0)
    expect(cache.get('k', 600)).toBeNull()
  })

  it('deletes the entry on expiry so a subsequent get also misses', () => {
    const cache = ttlCache<string>()
    cache.set('k', 'v', 500, 0)
    cache.get('k', 600) // triggers deletion
    expect(cache.get('k', 600)).toBeNull()
  })

  it('returns null for a key that was never set', () => {
    const cache = ttlCache<string>()
    expect(cache.get('missing', 0)).toBeNull()
  })

  it('returns null when the TTL is zero', () => {
    const cache = ttlCache<string>()
    cache.set('k', 'v', 0, 100)
    // at - storedAt >= 0 is always true for at >= storedAt
    expect(cache.get('k', 100)).toBeNull()
  })

  it('treats a negative TTL as immediately expired', () => {
    // Edge case: at - storedAt = -100, ttl = -1000.
    // -100 >= -1000 is true, so the formula says "expired" even though the clock
    // moved backwards. A negative TTL means the entry never survives a get.
    const cache = ttlCache<string>()
    cache.set('k', 'v', -1000, 200)
    expect(cache.get('k', 100)).toBeNull()
  })

  it('overwrites a previous value for the same key', () => {
    const cache = ttlCache<string>()
    cache.set('k', 'old', 1_000, 0)
    cache.set('k', 'new', 1_000, 0)
    expect(cache.get('k', 500)).toBe('new')
  })

  it('clear empties all entries', () => {
    const cache = ttlCache<string>()
    cache.set('a', '1', 1_000, 0)
    cache.set('b', '2', 1_000, 0)
    cache.clear()
    expect(cache.get('a', 0)).toBeNull()
    expect(cache.get('b', 0)).toBeNull()
  })

  it('handles object values', () => {
    const cache = ttlCache<{ price: number }>()
    cache.set('k', { price: 6.23 }, 1_000, 0)
    expect(cache.get('k', 0)).toEqual({ price: 6.23 })
  })
})
