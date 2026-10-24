/**
 * @built F-11 HTTP surface for the MassGIS L3 parcel lookup, live, 4s abort
 * @built F-49 `?demo=1` returns a typed `demo_unavailable` refusal (200, no
 * ArcGIS call); the form's documented fallback is typing year built and area
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

import { DEMO_MESSAGES, demoFromRequest, demoUnavailable } from '@/lib/demo'
import { parcelAt } from '@/lib/parcel'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'cache-control': 'no-store' }

const TIMEOUT_MS = 4_000

function parseCoordinate(raw: string | null): number | null {
  if (raw === null || raw.trim() === '') return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

export async function GET(request: Request): Promise<Response> {
  if (demoFromRequest(request)) {
    // Parcels are 2.5M live records and are never baked (steering, statewide
    // build). The refusal is the honest answer, and R1.7 lets the verdict proceed.
    return Response.json(demoUnavailable(DEMO_MESSAGES.parcel, 'manual_entry'), {
      headers: { 'cache-control': 'no-store' },
    })
  }

  const params = new URL(request.url).searchParams
  const lat = parseCoordinate(params.get('lat'))
  const lon = parseCoordinate(params.get('lon'))

  if (lat === null || lon === null || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return Response.json(
      { ok: false, code: 'bad_request', message: 'Pass a decimal coordinate: /api/parcel?lat=42.2992&lon=-71.4342' },
      { status: 400, headers: NO_STORE },
    )
  }

  // An address point from a geocoder often sits on the street centreline, outside
  // the parcel. `buffer=20` asks for the nearest parcel within 20 metres; the
  // response says `buffered` so the UI can label it honestly.
  const bufferRaw = parseCoordinate(params.get('buffer'))
  const buffer = bufferRaw === null ? 0 : Math.min(Math.max(bufferRaw, 0), 50)

  const outcome = await parcelAt(lat, lon, { timeoutMs: TIMEOUT_MS, bufferMeters: buffer })

  if (!outcome.ok) {
    if (outcome.error.code === 'no_match') {
      // Not an error: water, a right-of-way, or a fresh subdivision. The form
      // asks for the year built and the verdict proceeds.
      return Response.json(
        {
          ok: true,
          parcel: null,
          match: buffer > 0 ? 'buffered' : 'exact',
          degraded: [
            buffer > 0
              ? `parcel: no assessor record within ${buffer}m — enter the year built by hand`
              : 'parcel: no assessor record at this coordinate — enter the year built by hand',
          ],
        },
        { headers: NO_STORE },
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
      { status: 504, headers: NO_STORE },
    )
  }

  const { parcel } = outcome
  return Response.json(
    {
      ok: true,
      match: buffer > 0 ? 'buffered' : 'exact',
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
    { headers: NO_STORE },
  )
}
