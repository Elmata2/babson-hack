/**
 * @built F-10 HTTP surface for the Census geocoder: address → lat/lon + town + tract
 * @built F-49 `?demo=1` returns a typed `demo_unavailable` refusal (200, no fetch);
 * the UI's documented fallback is the manual town list
 *
 * The adapter lives in `lib/geocode` and is tested there. It uses the
 * `geographies` endpoint only, because `locations` returns a match with an empty
 * geographies object — coordinates and no tract, which silently costs the whole
 * map join. This route adds the one thing the adapter deliberately does not know
 * about: the Massachusetts town name, resolved against the 351-town table.
 *
 * Privacy: the address is the only PII in this flow. It is not logged, not stored,
 * and not echoed into an error. The response carries the matched address because
 * the user needs to confirm what was found.
 *
 * Next 16 deprecates the edge runtime for route handlers, so no `runtime` export.
 *
 * GET /api/geocode?q=1 Main St, Framingham, MA
 */

import { DEMO_MESSAGES, demoFromRequest, demoUnavailable } from '@/lib/demo'
import { geocodeAddress } from '@/lib/geocode'
import { countyOfFips, locateTown } from '@/lib/geo'

export const dynamic = 'force-dynamic'

const MAX_QUERY = 120
const NO_STORE = { 'cache-control': 'no-store' }

/** Census matches "…, WELLESLEY, MA, 02482": the town is the third part from the end. */
function townFromMatchedAddress(matchedAddress: string): { town: string | null; known: boolean } {
  const parts = matchedAddress.split(',').map((part) => part.trim())
  const candidate = parts.length >= 3 ? parts[parts.length - 3] : null
  if (!candidate) return { town: null, known: false }
  const resolved = locateTown(candidate)
  if (resolved) return { town: resolved.town, known: true }
  // A Census place name that is not one of the 351 towns (a village, a reserve):
  // return it as text, flagged, rather than pretending it resolved.
  const title = candidate
    .toLowerCase()
    .split(' ')
    .map((word) => (word.length > 0 ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ')
  return { town: title, known: false }
}

export async function GET(request: Request): Promise<Response> {
  if (demoFromRequest(request)) {
    // No baked address index exists, and inventing one would be worse than the
    // manual path the form already offers.
    return Response.json(demoUnavailable(DEMO_MESSAGES.geocode, 'town_list'), {
      headers: NO_STORE,
    })
  }

  const address = new URL(request.url).searchParams.get('q')?.trim() ?? ''

  if (address.length < 5) {
    return Response.json(
      {
        ok: false,
        code: 'missing_address',
        message: 'Pass a street address: /api/geocode?q=1+Main+St,+Framingham,+MA',
      },
      { status: 400, headers: NO_STORE },
    )
  }
  if (address.length > MAX_QUERY) {
    return Response.json(
      { ok: false, code: 'bad_request', message: 'That query is too long for a street address.' },
      { status: 400, headers: NO_STORE },
    )
  }

  const outcome = await geocodeAddress(address, { timeoutMs: 6_000 })

  if (!outcome.ok) {
    const { error } = outcome
    // No address in the message: it is the one piece of PII in this flow.
    return Response.json(
      {
        ok: false,
        code: error.code === 'no_match' ? 'no_match' : 'upstream_error',
        message:
          error.code === 'no_match'
            ? 'The Census geocoder did not match that address. Enter the town and heating details by hand — the verdict does not need the coordinate.'
            : 'The Census geocoder is unreachable. Enter the town and heating details by hand.',
      },
      { status: error.code === 'no_match' ? 404 : 502, headers: NO_STORE },
    )
  }

  const { result } = outcome
  const town = townFromMatchedAddress(result.matchedAddress)
  const county = countyOfFips(result.county)

  return Response.json(
    {
      ok: true,
      matchedAddress: result.matchedAddress,
      lat: result.lat,
      lon: result.lon,
      town: town.town,
      /** False when the matched name is not one of the 351 municipalities. */
      townKnown: town.known,
      county: county?.name ?? result.countyName,
      countyFips: result.county,
      tract: result.tract,
      degraded: town.known ? [] : ['town: the matched place name is not a Massachusetts municipality'],
    },
    { headers: NO_STORE },
  )
}
