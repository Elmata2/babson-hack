export interface BucketRule {
  capacity: number
  refillPerSecond: number
}

export type Take = { ok: true } | { ok: false; retryAfterSeconds: number }

interface Bucket {
  tokens: number
  at: number
}

const MAX_TRACKED = 5_000

/** A token bucket per key. In memory, per process: a floor against one hot client, not a distributed limiter. */
export function createLimiter(rule: BucketRule) {
  const buckets = new Map<string, Bucket>()
  return {
    take(key: string, now: number = Date.now(), cost = 1): Take {
      let bucket = buckets.get(key)
      if (!bucket) {
        if (buckets.size >= MAX_TRACKED) {
          const oldest = buckets.keys().next().value
          if (oldest !== undefined) buckets.delete(oldest)
        }
        bucket = { tokens: rule.capacity, at: now }
        buckets.set(key, bucket)
      }
      const elapsed = Math.max(0, now - bucket.at) / 1_000
      bucket.tokens = Math.min(rule.capacity, bucket.tokens + elapsed * rule.refillPerSecond)
      bucket.at = now
      if (bucket.tokens >= cost) {
        bucket.tokens -= cost
        return { ok: true }
      }
      return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((cost - bucket.tokens) / rule.refillPerSecond)) }
    },
  }
}

export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || headers.get('x-real-ip')?.trim() || 'unknown'
}

export const ROUTE_RULES: Record<string, BucketRule> = {
  '/api/parse-bill': { capacity: 6, refillPerSecond: 6 / 60 },
  '/api/explain': { capacity: 10, refillPerSecond: 10 / 60 },
  '/api/calls': { capacity: 6, refillPerSecond: 6 / 60 },
  '/api/switch': { capacity: 6, refillPerSecond: 6 / 60 },
  '/api/consent': { capacity: 10, refillPerSecond: 10 / 60 },
  '/api/geocode': { capacity: 20, refillPerSecond: 20 / 60 },
  '/api/address': { capacity: 30, refillPerSecond: 1 },
  '/api/parcel': { capacity: 20, refillPerSecond: 20 / 60 },
}

export const POLL_PREFIX = '/api/calls/'
export const POLL_RULE: BucketRule = { capacity: 40, refillPerSecond: 1 }
