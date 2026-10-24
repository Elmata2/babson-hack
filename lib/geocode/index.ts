/**
 * @built F-10 Census geocoder — address to lat/lon, tract and county
 *
 * Verified live 2026-10-24 against `geocoding.geo.census.gov`.
 *
 * **The endpoint trap, found the hard way:** `geocoder/locations/onelineaddress`
 * returns a perfectly good match with coordinates and an **empty `geographies`
 * object**. It looks like it worked. The tract and county are only on
 * `geocoder/geographies/onelineaddress`. Building on the `locations` service
 * silently costs you every tract join downstream, which is the whole map.
 *
 * Privacy rule from `.kiro/steering/data-sources.md`: Census geocoding is the
 * **only** outbound call that carries a street address, and it is a public
 * government endpoint. So: no logging of the address, no address in an error
 * message, and no address in a cache key that outlives the process.
 */

import { fetchJson, ttlCache, type FetchLike } from '../net/json'

/** Steering: Census results are cached 30 days. */
export const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1_000

const GEOCODER = 'https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress'

/** Census caps a one-line address; rejecting early beats a 414 from the provider. */
const MAX_ADDRESS_LENGTH = 200

/** A resolved address. Every field is something a downstream step actually uses. */
export interface GeocodeResult {
  /** Normalised address as Census matched it, e.g. `888 WASHINGTON ST, WELLESLEY, MA, 02482`. */
  matchedAddress: string
  lat: number
  lon: number
  /** 11-digit tract GEOID, e.g. `25021404400`. Joins to the baked tract stats. */
  tract: string
  /** 5-digit county FIPS, e.g. `25021`. Joins to the baked HDD table. */
  county: string
  /** County name without the suffix, e.g. `Norfolk`. */
  countyName: string
  /** 15-digit block GEOID when present — finer than tract, used for the EJ overlay. */
  block: string | null
}

export type GeocodeError =
  | { code: 'empty'; message: string }
  | { code: 'no_match'; message: string }
  | { code: 'network'; message: string }
  | { code: 'timeout'; message: string }
  | { code: 'http'; status: number; message: string }
  | { code: 'shape'; message: string }

export interface GeocodeOptions {
  fetchImpl?: FetchLike
  timeoutMs?: number
  /** Injected for tests. */
  now?: () => number
  bypassCache?: boolean
}

const cache = ttlCache<GeocodeResult>()

/** Drop the cache. For tests and the `?fresh=1` debug path. */
export function resetGeocodeCache(): void {
  cache.clear()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

/** Build the request URL. Kept exported so the endpoint choice is testable. */
export function geocodeUrl(address: string): string {
  const params = new URLSearchParams({
    address,
    benchmark: 'Public_AR_Current',
    vintage: 'Current_Current',
    format: 'json',
  })
  return `${GEOCODER}?${params.toString()}`
}

/**
 * Read one address match out of a Census geographies payload.
 * Input: parsed JSON. Output: a `GeocodeResult`, or `null` when there is no match.
 * Guarantee: a match with coordinates but **no tract** is treated as unusable —
 * because that is exactly what the wrong endpoint returns, and a coordinate with
 * no tract silently breaks every downstream join.
 */
export function readMatch(json: unknown): GeocodeResult | null {
  if (!isRecord(json)) return null
  const result = json.result
  if (!isRecord(result)) return null
  const matches = result.addressMatches
  if (!Array.isArray(matches) || matches.length === 0) return null

  const match = matches[0]
  if (!isRecord(match)) return null

  const matchedAddress = str(match.matchedAddress)
  const coordinates = match.coordinates
  if (!matchedAddress || !isRecord(coordinates)) return null

  const lat = typeof coordinates.y === 'number' ? coordinates.y : Number(coordinates.y)
  const lon = typeof coordinates.x === 'number' ? coordinates.x : Number(coordinates.x)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null

  const geographies = match.geographies
  if (!isRecord(geographies)) return null
  const tracts = geographies['Census Tracts']
  if (!Array.isArray(tracts) || tracts.length === 0) return null

  const tractRow = tracts[0]
  if (!isRecord(tractRow)) return null
  const tract = str(tractRow.GEOID)
  if (!tract) return null

  const counties = geographies['Counties']
  const countyRow = Array.isArray(counties) && isRecord(counties[0]) ? counties[0] : null
  const county = countyRow ? str(countyRow.GEOID) : null
  const countyName = countyRow ? str(countyRow.BASENAME) : null

  // A tract GEOID is state(2)+county(3)+tract(6). Deriving the county from it is
  // exact, so a missing Counties block degrades to a correct FIPS rather than a null.
  const derivedCounty = tract.slice(0, 5)

  const blocks = geographies['2020 Census Blocks']
  const blockRow = Array.isArray(blocks) && isRecord(blocks[0]) ? blocks[0] : null

  return {
    matchedAddress,
    lat,
    lon,
    tract,
    county: county ?? derivedCounty,
    countyName: countyName ?? '',
    block: blockRow ? str(blockRow.GEOID) : null,
  }
}

/**
 * Geocode a Massachusetts address.
 * Input: a one-line address. Output: `{ ok: true, result }` or a typed error.
 * Guarantee: never throws, never returns a coordinate without a tract, and never
 * puts the address into an error message or the cache key.
 */
export async function geocodeAddress(
  address: string,
  options: GeocodeOptions = {},
): Promise<{ ok: true; result: GeocodeResult } | { ok: false; error: GeocodeError }> {
  const trimmed = address.trim().replace(/\s+/g, ' ')

  if (trimmed.length < 5) {
    return { ok: false, error: { code: 'empty', message: 'Address is too short to match.' } }
  }
  if (trimmed.length > MAX_ADDRESS_LENGTH) {
    return { ok: false, error: { code: 'empty', message: 'Address is too long.' } }
  }

  // The address is the cache key but never leaves this process in a log line.
  const now = options.now ?? Date.now
  const cacheKey = trimmed.toLowerCase()
  if (!options.bypassCache) {
    const hit = cache.get(cacheKey, now())
    if (hit) return { ok: true, result: hit }
  }

  const response = await fetchJson(geocodeUrl(trimmed), {
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs ?? 6_000,
  })

  if (!response.ok) {
    const error = response.error
    if (error.code === 'http') {
      return { ok: false, error: { code: 'http', status: error.status, message: 'Census geocoder responded with an error.' } }
    }
    return { ok: false, error: { code: error.code, message: 'Census geocoder is unreachable.' } }
  }

  const result = readMatch(response.json)
  if (!result) {
    return {
      ok: false,
      error: { code: 'no_match', message: 'Census could not match that address. Enter the coordinates manually.' },
    }
  }

  cache.set(cacheKey, result, CACHE_TTL_MS, now())
  return { ok: true, result }
}
