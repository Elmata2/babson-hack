import { NextResponse, type NextRequest } from 'next/server'

import { billTooLarge } from '@/lib/security/limits'
import { clientIp, createLimiter, POLL_PREFIX, POLL_RULE, ROUTE_RULES } from '@/lib/security/rate-limit'

const limiters = new Map(Object.entries(ROUTE_RULES).map(([path, rule]) => [path, createLimiter(rule)]))
const pollLimiter = createLimiter(POLL_RULE)

export function proxy(request: NextRequest): NextResponse {
  const path = request.nextUrl.pathname
  const limiter = limiters.get(path) ?? (path.startsWith(POLL_PREFIX) ? pollLimiter : undefined)
  if (!limiter || request.method === 'OPTIONS' || request.method === 'HEAD') return NextResponse.next()

  if (path === '/api/parse-bill' && billTooLarge(request.headers.get('content-length'))) {
    return NextResponse.json(
      { ok: false, code: 'too_large', message: 'That upload is more than 4 MB. Send fewer pages, or a closer photo.' },
      { status: 413, headers: { 'cache-control': 'no-store' } },
    )
  }

  const taken = limiter.take(clientIp(request.headers))
  if (taken.ok) return NextResponse.next()
  return NextResponse.json(
    { ok: false, code: 'rate_limited', message: 'Too many requests. Wait a moment and try again.' },
    { status: 429, headers: { 'retry-after': String(taken.retryAfterSeconds), 'cache-control': 'no-store' } },
  )
}

export const config = {
  matcher: [
    '/api/parse-bill',
    '/api/explain',
    '/api/calls',
    '/api/calls/:path*',
    '/api/switch',
    '/api/consent',
    '/api/geocode',
    '/api/address',
    '/api/parcel',
  ],
}
