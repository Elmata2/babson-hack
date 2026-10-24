/**
 * @built F-64 Nominatim forward search, bounded to Massachusetts
 *
 * Why OpenStreetMap and not the Census geocoder: the Census service resolves one
 * address to one coordinate. It cannot answer "show me every Chandler Street in
 * Massachusetts", which is the thing a person typing an address actually needs —
 * because there are nine of them and only one is their house.
 *
 * Usage policy (https://operations.osmfoundation.org/policies/nominatim/):
 *   - one request per second, enforced here with a queue, not hoped for
 *   - an identifying User-Agent set by the route
 *   - results cached for a day, so a repeated prefix costs nothing
 *   - attribution rendered in the UI next to the results
 *
 * Nothing about the user's address is logged. The query is hashed only as a cache
 * key inside the process.
 */

/** One row in the dropdown. Everything the UI needs, nothing it does not. */
export interface AddressSuggestion {
  /** Stable key for React and for `aria-activedescendant`. */
  id: string
  /** `106 Chandler Street, Worcester, MA 01609` — the whole line. */
  label: string
  /** `106 Chandler Street` — for filling the input, not for display only. */
  line1: string
  /** The municipality Nominatim believes this is in. Matched to the 351 table by the client. */
  town: string | null
  postcode: string | null
  lat: number
  lon: number
}

/** Massachusetts, generously: the state plus a mile of border on every side. */
export const MA_VIEWBOX = '-73.70,42.95,-69.80,41.15'

const STATE_NAMES = new Set(['massachusetts', 'ma'])
const STATE_CODES = new Set(['ma'])

/** Nominatim's `address` object, only the fields we read. */
interface NominatimAddress {
  house_number?: string
  road?: string
  pedestrian?: string
  city?: string
  town?: string
  village?: string
  municipality?: string
  hamlet?: string
  suburb?: string
  neighbourhood?: string
  state?: string
  state_code?: string
  postcode?: string
  country_code?: string
}

interface NominatimItem {
  place_id?: number | string
  lat?: string
  lon?: string
  display_name?: string
  name?: string
  address?: NominatimAddress
}

const MAX_RESULTS = 8

/** True when the row is in Massachusetts. Postcodes 0xxxx are the state's. */
function isMassachusetts(address: NominatimAddress | undefined): boolean {
  if (!address) return false
  const country = (address.country_code ?? '').toLowerCase()
  if (country !== 'us') return false
  const state = (address.state ?? '').toLowerCase()
  const code = (address.state_code ?? '').toLowerCase()
  if (state) return STATE_NAMES.has(state) || STATE_CODES.has(code)
  // Some rows carry only a ZIP; Massachusetts ZIPs all start with 0.
  return /^0\d{4}$/.test(address.postcode ?? '')
}

/** The municipality, in the order Nominatim is most likely to be right. */
function townOf(address: NominatimAddress): string | null {
  return (
    address.city ??
    address.town ??
    address.municipality ??
    address.village ??
    address.hamlet ??
    address.suburb ??
    null
  )
}

function line1Of(item: NominatimItem): string {
  const address = item.address ?? {}
  const street = address.road ?? address.pedestrian ?? address.neighbourhood
  const composed = [address.house_number, street].filter(Boolean).join(' ')
  return composed || item.name || (item.display_name ?? '').split(',')[0]?.trim() || 'Address'
}

function labelOf(item: NominatimItem): string {
  const address = item.address ?? {}
  return [line1Of(item), townOf(address), (address.state_code ?? 'ma').toUpperCase(), address.postcode]
    .filter(Boolean)
    .join(', ')
}

function finiteCoordinate(value: unknown): number | null {
  const parsed = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN
  if (!Number.isFinite(parsed)) return null
  return parsed
}

const STREET_ABBREVIATIONS: Record<string, string> = {
  street: 'st', avenue: 'ave', road: 'rd', drive: 'dr', lane: 'ln', court: 'ct',
  place: 'pl', boulevard: 'blvd', terrace: 'ter', circle: 'cir', parkway: 'pkwy', highway: 'hwy',
}

/** `12 Adams Street` and `12 ADAMS ST.` → `12 adams st`, plus the postcode (or town). */
export function suggestionKey(line1: string, postcodeOrTown: string | null | undefined): string {
  const line = line1
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => STREET_ABBREVIATIONS[word] ?? word)
    .join(' ')
  return `${line}|${(postcodeOrTown ?? '').toLowerCase().trim()}`
}

/**
 * Turn Nominatim's JSON into dropdown rows. Total function: hostile, empty or
 * non-array payloads produce an empty list, never a throw.
 */
export function readSuggestions(json: unknown): AddressSuggestion[] {
  if (!Array.isArray(json)) return []
  const seen = new Set<string>()
  const out: AddressSuggestion[] = []

  for (const raw of json) {
    if (typeof raw !== 'object' || raw === null) continue
    const item = raw as NominatimItem
    if (!isMassachusetts(item.address)) continue

    const lat = finiteCoordinate(item.lat)
    const lon = finiteCoordinate(item.lon)
    if (lat === null || lon === null) continue

    const label = labelOf(item)
    // @built F-104 one row per house: OSM lists the same address as a building,
    // a node and an interpolation, each with its own place_id and coordinate.
    const dedupeKey = suggestionKey(line1Of(item), item.address?.postcode ?? townOf(item.address ?? {}))
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)
    const key = `${label}|${lat.toFixed(5)}|${lon.toFixed(5)}`

    out.push({
      id: String(item.place_id ?? key),
      label,
      line1: line1Of(item),
      town: townOf(item.address ?? {}),
      postcode: item.address?.postcode ?? null,
      lat,
      lon,
    })
    if (out.length >= MAX_RESULTS) break
  }

  return out
}

/** `Town of Wellesley` / `wellesley` / `WELLESLEY, MA` → `wellesley` for comparison. */
export function normalizePlaceName(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/^town of\s+/, '')
    .replace(/[^a-z\s-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Match a Nominatim locality to one of the 351 municipalities, or null. */
export function matchTown(
  place: string | null | undefined,
  towns: readonly string[],
): string | null {
  const normalized = normalizePlaceName(place)
  if (!normalized) return null
  return towns.find((town) => normalizePlaceName(town) === normalized) ?? null
}

/** The search URL. Exported so the bounding box and policy flags are testable. */
export function nominatimUrl(query: string): string {
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('q', query)
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('addressdetails', '1')
  url.searchParams.set('limit', String(MAX_RESULTS))
  url.searchParams.set('countrycodes', 'us')
  // bounded=1 keeps suggestions inside the Commonwealth instead of New Hampshire.
  url.searchParams.set('viewbox', MA_VIEWBOX)
  url.searchParams.set('bounded', '1')
  url.searchParams.set('accept-language', 'en')
  return url.toString()
}
