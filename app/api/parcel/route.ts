/**
 * @built F-11 HTTP surface for the MassGIS L3 parcel lookup, live, 4s abort
 *
 * Parcels are never baked: 2.5 million polygons cannot ship, and the assessor
 * year built is the one input we cannot derive. The adapter lives in `lib/parcel`
 * (layer 1 — layer 0 is Devens only and returns zero features for the rest of the
 * state) and this route is transport plus one decision: a missing parcel is a 200
 * with `parcel: null`, not an error, because the verdict continues without it.
 *
 * `USE_CODE` stays a string. "325" is a code, not a number, and leading zeros are
 * part of the code.
 *
 * Next 16 deprecates the edge runtime for route handlers, so no `runtime` export.
 *
 * GET /api/parcel?lat=42.2992&lon=-71.4342
 */

import { parcelAt } from '@/lib/parcel'

export const revalidate = 86_400

const TIMEOUT_MS = 4_000

function parseCoordinate(raw: string | null): number | null {
  if (raw === null || raw.trim() === '') return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams
  const lat = parseCoordinate(params.get('lat'))
  const lon = parseCoordinate(params.get('lon'))

  if (lat === null || lon === null || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return Response.json(
      { ok: false, code: 'bad_request', message: 'Pass a decimal coordinate: /api/parcel?lat=42.2992&lon=-71.4342' },
      { status: 400 },
    )
  }

  const outcome = await parcelAt(lat, lon, { timeoutMs: TIMEOUT_MS })

  if (!outcome.ok) {
    if (outcome.error.code === 'no_match') {
      // Not an error: water, a right-of-way, or a fresh subdivision. The form
      // asks for the year built and the verdict proceeds.
      return Response.json(
        {
          ok: true,
          parcel: null,
          degraded: ['parcel: no assessor record at this coordinate — enter the year built by hand'],
        },
        { headers: { 'cache-control': 'public, s-maxage=604800' } },
      )
    }
    if (outcome.error.code === 'invalid') {
      return Response.json({ ok: false, code: 'bad_request', message: outcome.error.message }, { status: 400 })
    }
    return Response.json(
      {
        ok: false,
        code: 'upstream_error',
        message: `MassGIS parcels did not answer within ${TIMEOUT_MS / 1000}s. Continue without the parcel prefill; nothing in the verdict depends on it.`,
      },
      { status: 504 },
    )
  }

  const { parcel } = outcome
  return Response.json(
    {
      ok: true,
      parcel: {
        yearBuilt: parcel.yearBuilt,
        useCode: parcel.useCode,
        siteAddr: parcel.siteAddr,
        city: parcel.city,
        zip: parcel.zip,
        bldAreaSqft: parcel.bldAreaSqft,
        units: parcel.units,
        townId: parcel.townId,
      },
      degraded: [],
    },
    { headers: { 'cache-control': 'public, s-maxage=2592000' } },
  )
}
