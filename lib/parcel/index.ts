/**
 * @built F-11 MassGIS L3 parcel lookup — point to YEAR_BUILT, USE_CODE, address
 *
 * Verified live 2026-10-24 against `arcgisserver.digital.mass.gov`.
 *
 * **Two traps, both hit during verification, both encoded below:**
 *
 * 1. **Layer 0 is Devens only.** A point query at 888 Washington St, Wellesley
 *    returns a parcel on layer **1** and *zero features* on layer 0. Layer 0
 *    answering empty looks exactly like "no parcel here", so this module pins the
 *    layer number in a constant and a test asserts the URL never uses layer 0.
 *
 * 2. **There is no `TOWN` field.** The layer carries `CITY` and `TOWN_ID`. Asking
 *    for `TOWN` returns HTTP 400 "Failed to execute query" — an error that reads
 *    like a broken service rather than a bad field list. Only fields confirmed in
 *    the layer metadata appear in `OUT_FIELDS`.
 *
 * Steering: 2.5M parcels are never baked. This is a live point query with a 4s
 * abort, and the verdict must still work when it fails (manual entry).
 */

import { fetchJson, ttlCache, type FetchLike } from '../net/json'

/** Steering: parcel results are cached 30 days. */
export const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1_000

/** Steering: 4s abort. Parcels are enrichment, not a blocker. */
export const TIMEOUT_MS = 4_000

const SERVICE =
  'https://arcgisserver.digital.mass.gov/arcgisserver/rest/services/AGOL/L3_Parcels_FeatureService_4326/MapServer'

/**
 * Layer 1 is the statewide parcel layer. Layer 0 is Devens only and returns an
 * empty feature set everywhere else — see the docblock above. Do not change this.
 */
export const PARCEL_LAYER = 1

/**
 * Confirmed against the layer metadata (48 fields total). `TOWN` is not among
 * them; it is `CITY` + `TOWN_ID`. Adding a name here that does not exist turns
 * the whole call into a 400.
 */
export const OUT_FIELDS = [
  'YEAR_BUILT',
  'USE_CODE',
  'SITE_ADDR',
  'CITY',
  'ZIP',
  'BLD_AREA',
  'UNITS',
  'TOWN_ID',
] as const

/** A parcel as the calculator needs it. Nulls are real: this dataset omits values. */
export interface Parcel {
  /** Assessor year built. `null` when absent — never 0. */
  yearBuilt: number | null
  /** MassGIS use code, e.g. `101` (single family). Kept raw, not interpreted. */
  useCode: string | null
  siteAddr: string
  city: string
  zip: string | null
  /** Building area, sqft. `0` in this dataset means "not reported", so it becomes `null`. */
  bldAreaSqft: number | null
  /** Dwelling units on the parcel. */
  units: number | null
  townId: number | null
}

export type ParcelError =
  | { code: 'invalid'; message: string }
  | { code: 'no_match'; message: string }
  | { code: 'network'; message: string }
  | { code: 'timeout'; message: string }
  | { code: 'http'; status: number; message: string }
  | { code: 'shape'; message: string }

export interface ParcelOptions {
  fetchImpl?: FetchLike
  timeoutMs?: number
  now?: () => number
  bypassCache?: boolean
}

const cache = ttlCache<Parcel>()

/** Drop the cache. For tests and the `?fresh=1` debug path. */
export function resetParcelCache(): void {
  cache.clear()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function num(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function str(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }
  return null
}

/** Build the point-query URL. Exported so the layer number and field list are testable. */
export function parcelUrl(lat: number, lon: number): string {
  const geometry = JSON.stringify({
    x: lon,
    y: lat,
    spatialReference: { wkid: 4326 },
  })
  const params = new URLSearchParams({
    geometry,
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: OUT_FIELDS.join(','),
    returnGeometry: 'false',
    f: 'json',
  })
  return `${SERVICE}/${PARCEL_LAYER}/query?${params.toString()}`
}

/**
 * Read the first parcel out of an ArcGIS query payload.
 * Input: parsed JSON. Output: a `Parcel`, or `null` when no feature intersects.
 * Guarantee: a missing `YEAR_BUILT` is `null`, and a `0` building area is `null`,
 * because both are how this dataset spells "unknown". Neither becomes a number
 * the calculator would silently trust.
 */
export function readParcel(json: unknown): Parcel | null {
  if (!isRecord(json)) return null
  const features = json.features
  if (!Array.isArray(features) || features.length === 0) return null

  const first = features[0]
  if (!isRecord(first)) return null
  const attributes = first.attributes
  if (!isRecord(attributes)) return null

  const siteAddr = str(attributes.SITE_ADDR)
  const city = str(attributes.CITY)
  // A parcel with no address and no city is not a usable parcel for our flow.
  if (!siteAddr && !city) return null

  const bldArea = num(attributes.BLD_AREA)

  return {
    yearBuilt: num(attributes.YEAR_BUILT),
    useCode: str(attributes.USE_CODE),
    siteAddr: siteAddr ?? '',
    city: city ?? '',
    zip: str(attributes.ZIP),
    bldAreaSqft: bldArea !== null && bldArea > 0 ? bldArea : null,
    units: num(attributes.UNITS),
    townId: num(attributes.TOWN_ID),
  }
}

/** True when the coordinates are usable at all. Catches lon/lat swaps before the call. */
export function isPlausibleCoordinate(lat: number, lon: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
}

/**
 * Look up the parcel under a coordinate.
 * Input: lat/lon in WGS84. Output: `{ ok: true, parcel }` or a typed error.
 * Guarantee: never throws; a failed lookup is a reason to fall back to manual
 * entry, never a reason to guess a year built.
 */
export async function parcelAt(
  lat: number,
  lon: number,
  options: ParcelOptions = {},
): Promise<{ ok: true; parcel: Parcel } | { ok: false; error: ParcelError }> {
  if (!isPlausibleCoordinate(lat, lon)) {
    return { ok: false, error: { code: 'invalid', message: 'That coordinate is not a valid latitude/longitude.' } }
  }

  // ~11m grid: enough to dedupe repeat lookups, coarse enough to be honest about it.
  const now = options.now ?? Date.now
  const cacheKey = `${lat.toFixed(4)},${lon.toFixed(4)}`
  if (!options.bypassCache) {
    const hit = cache.get(cacheKey, now())
    if (hit) return { ok: true, parcel: hit }
  }

  const response = await fetchJson(parcelUrl(lat, lon), {
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs ?? TIMEOUT_MS,
  })

  if (!response.ok) {
    const error = response.error
    if (error.code === 'http') {
      return { ok: false, error: { code: 'http', status: error.status, message: 'MassGIS responded with an error.' } }
    }
    return { ok: false, error: { code: error.code, message: 'MassGIS is unreachable.' } }
  }

  const parcel = readParcel(response.json)
  if (!parcel) {
    return {
      ok: false,
      error: {
        code: 'no_match',
        message: 'No assessor parcel at that point. Enter the year built manually.',
      },
    }
  }

  cache.set(cacheKey, parcel, CACHE_TTL_MS, now())
  return { ok: true, parcel }
}
