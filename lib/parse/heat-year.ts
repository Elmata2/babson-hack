/**
 * @built F-26a the heating-year table, as `annualise` needs it
 * @built F-103 `placeNameFor`: the county's name for user-facing text, never "Boston" by default
 *
 * The numbers come from `data/generated/hdd-monthly-weights.json`, which
 * `scripts/bake-hdd.mjs` computes from the same ERA5 daily means as the county
 * HDD table — one pipeline, two artefacts, no chance of disagreement. This file
 * is the only place in `lib/parse` that knows the table exists; `annualise.ts`
 * stays a pure function of its arguments.
 *
 * Boston (Suffolk) is the default because the design's HDD anchor is Boston and
 * the app falls back to it when a town is not chosen. A caller that knows the
 * county should pass it.
 */

import table from '../../data/generated/hdd-monthly-weights.json'

/** One site's climate: annual degree days and the shape of its heating year. */
export interface HeatYear {
  /** Annual HDD65, base 65 °F, 2015–2024 mean. */
  seasonHdd: number
  /** 12 unitless shares of the heating year, January first. */
  monthShares: readonly number[]
}

interface TableCounty {
  name: string
  seasonHdd: number
  months: number[]
}

/** Boston. `_meta.defaultCounty` in the artefact names the same county. */
export const DEFAULT_COUNTY_FIPS = '25025'

const counties = table.counties as unknown as Record<string, TableCounty>

/** The county table, or null for a FIPS that was not baked. */
export function heatYearFor(countyFips: string | null | undefined): HeatYear | null {
  if (!countyFips) return null
  const county = counties[countyFips]
  if (!county || county.months.length !== 12) return null
  return { seasonHdd: county.seasonHdd, monthShares: county.months }
}

/**
 * What to call the climate behind an estimate in user-facing text. The county's
 * name when the FIPS is baked ("Worcester County"), else "Massachusetts" — the
 * default table is Boston's weather, but we do not tell a Pittsfield household
 * that its year is Boston's.
 */
export function placeNameFor(countyFips: string | null | undefined): string {
  if (!countyFips) return 'Massachusetts'
  const county = counties[countyFips]
  return county ? `${county.name} County` : 'Massachusetts'
}

/** Boston, used when the caller names no county. Never silently per-county wrong. */
export const DEFAULT_HEAT_YEAR: HeatYear = heatYearFor(DEFAULT_COUNTY_FIPS) ?? {
  seasonHdd: 5_693.7,
  monthShares: [0.191, 0.169, 0.152, 0.096, 0.043, 0.008, 0, 0, 0.01, 0.055, 0.113, 0.163],
}

/** The source date of the climate table, for the UI's freshness line. */
export const HEAT_YEAR_SOURCE: { source: string; url: string; fetchedAt: string } = {
  source: table._meta.source,
  url: table._meta.url,
  fetchedAt: table._meta.fetchedAt,
}
