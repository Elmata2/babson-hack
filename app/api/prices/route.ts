/**
 * @built F-09 HTTP surface for the EIA adapter: prices, dated, with a snapshot fallback
 * @built F-49 `?demo=1` answers from the baked snapshot with `cache-control: no-store`
 * and never constructs a fetch; the normal response body is unchanged
 *
 * The adapter itself lives in `lib/prices` and is tested there. This file is the
 * transport and nothing else, which is the point of a route in this app: it hides
 * a key, adds a cache header, and cannot change a number.
 *
 * ADR-002 is enforced upstream: oil and propane headline the dated DOER survey and
 * carry the live EIA series as a cross-check (a gap over 12% is reported in
 * `notes`, never silently substituted). Electricity is the one headline that EIA
 * owns, because DOER publishes no $/kWh — and it is ~2 months lagged, so every
 * point carries the `period` it describes.
 *
 * No key → snapshot. EIA down → snapshot. The envelope is always renderable, and
 * it never invents a price.
 *
 * Next 16 deprecates the edge runtime for route handlers, so no `runtime` export:
 * these handlers use only the Web Request/Response APIs and run on the default
 * Node.js runtime.
 *
 * GET /api/prices
 */

import { demoFromRequest } from '@/lib/demo'
import { getPrices } from '@/lib/prices'

/** Prices move weekly; the electricity series lags two months. */
export const revalidate = 86_400

const CACHE_CONTROL = 'public, s-maxage=86400, stale-while-revalidate=604800'

export async function GET(request: Request): Promise<Response> {
  const demo = demoFromRequest(request)
  // `getPrices` reads EIA_API_KEY itself, caches for 24h and never throws. With
  // `demo` it returns the baked snapshot before any of that happens.
  const prices = await getPrices({ timeoutMs: 6_000, demo })
  return Response.json(
    { ok: true, ...(demo ? { demo: true } : {}), ...prices },
    { headers: { 'cache-control': demo ? 'no-store' : CACHE_CONTROL } },
  )
}

/** Any other verb: a typed refusal, never a stack trace. */
export async function POST(): Promise<Response> {
  return Response.json(
    { ok: false, code: 'bad_request', message: 'GET only: this endpoint reads prices, it does not accept them.' },
    { status: 405 },
  )
}
