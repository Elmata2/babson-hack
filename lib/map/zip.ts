/**
 * @built F-70 ZIP → point + town, a pure lookup over the baked ZCTA table
 *
 * A ZCTA approximates a USPS ZIP and can straddle towns, so the town returned here
 * is the town holding the ZCTA's internal point, not a promise about every address.
 * The caller says so to the user when the typed town differs.
 */

import zctaJson from '../../data/generated/ma-zcta.json'

export interface ZipHit {
  zip: string
  lon: number
  lat: number
  /** Town as baked, uppercase ("WELLESLEY"). Pass through `displayTown` for display. */
  town: string
}

const TABLE = zctaJson as unknown as { _meta: { source: string; fetchedAt: string }; zips: Record<string, [number, number, string]> }

/** Provenance for the freshness line. */
export const ZIP_META = TABLE._meta

/** Exactly five digits, nothing else. */
export function isZip(query: string): boolean {
  return /^\d{5}$/.test(query.trim())
}

/** The ZCTA point and town for a Massachusetts ZIP, or null. No fuzzy matching. */
export function lookupZip(zip: string): ZipHit | null {
  const key = zip.trim()
  if (!/^\d{5}$/.test(key)) return null
  const row = TABLE.zips[key]
  if (!row) return null
  return { zip: key, lon: row[0], lat: row[1], town: row[2] }
}
