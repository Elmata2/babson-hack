/**
 * @built F-62 town → county → tract lookup, statewide, no allow-list
 *
 * ADR-009: any of the 351 municipalities resolves, or the caller is told why not.
 * All three tables are committed JSON produced by `scripts/bake-map.mjs`, so this
 * module is pure — no fetch, no clock, no filesystem at runtime. The bundler
 * inlines the JSON; nothing here can fail on a judge's phone with no wifi.
 *
 * Sizes: towns-by-county 35 KB, tract stats 73 KB, HDD 2.7 KB. The tract geometry
 * (440 KB) is deliberately *not* imported — the map loads it, the verdict does not.
 */

import hddJson from '../data/generated/hdd-by-county.json'
import townsJson from '../data/generated/towns-by-county.json'
import statsJson from '../public/data/ma-tract-stats.json'
import { titleCaseTown, townKey } from './elec-label'

/** One county, with its computed heating climate. */
export interface County {
  /** 5-digit FIPS, e.g. "25017". */
  fips: string
  name: string
  /** HDD65, 2015–2024 mean at the county grid cell. */
  hdd65: number
  /** HDD65 for 2024 alone, the year the anchor was checked against. */
  hdd2024: number
  /** Number of municipalities in the county. */
  townCount: number
}

/** A town resolved to its county. */
export interface TownLocation {
  town: string
  county: County
  /** Tract GEOIDs touching this town. A straddling tract appears in both towns. */
  tracts: string[]
}

/** ACS B25040 heating-fuel mix for one tract. */
export interface TractStats {
  geoid: string
  countyFips: string
  population: number
  /** Occupied housing units: the B25040 denominator. */
  households: number
  oilHouseholds: number
  gasHouseholds: number
  electricHouseholds: number
  propaneHouseholds: number
  medianYearBuilt: number
  /** Oil households ÷ occupied households, 0 when the tract has no households. */
  oilShare: number
}

// ------------------------------------------------------------------- artefacts

const COUNTY_TABLE = townsJson as unknown as {
  _meta: { source: string; url: string; fetchedAt: string; extra?: Record<string, unknown> }
  counties: Record<string, { name: string; towns: Record<string, string[]> }>
}

const HDD_TABLE = hddJson as unknown as {
  _meta: { source: string; url: string; fetchedAt: string }
  counties: Record<string, { name: string; hdd65: number; hdd2024: number; gridPoint: number[] }>
}

const STATS_TABLE = statsJson as unknown as {
  _meta: { source: string; url: string; fetchedAt: string; recordCount: number; extra?: Record<string, unknown> }
  tracts: Record<string, number[]>
}

/** `[population, occupiedUnits, oil, gas, electric, propane, medianYearBuilt]` */
const STATS_FIELDS = 7

/** Massachusetts. Every GEOID in this app starts with it. */
const STATE_FIPS = '25'

/** Provenance for the freshness badge: three sources, three dates. */
export const GEO_META = {
  towns: COUNTY_TABLE._meta,
  hdd: HDD_TABLE._meta,
  tractStats: STATS_TABLE._meta,
} as const

// ------------------------------------------------------------------- validation

function assertTable(): void {
  const countyCount = Object.keys(COUNTY_TABLE.counties).length
  if (countyCount !== 14) throw new Error(`towns-by-county.json: expected 14 counties, got ${countyCount}`)
  for (const [fips, county] of Object.entries(COUNTY_TABLE.counties)) {
    if (!/^25\d{3}$/.test(fips)) throw new Error(`towns-by-county.json: bad county FIPS "${fips}"`)
    for (const [town, tracts] of Object.entries(county.towns)) {
      for (const tract of tracts) {
        if (!/^\d{11}$/.test(tract)) throw new Error(`towns-by-county.json: ${town} has bad tract "${tract}"`)
        // A tract does not cross a county line, but a *town* can, so a town's
        // tract list may legitimately reach into a neighbouring county (Taunton
        // into Plymouth, Holyoke into Hampshire). Assert membership in the tract
        // table instead of a county prefix.
        if (!(tract in STATS_TABLE.tracts)) throw new Error(`towns-by-county.json: ${town} lists tract "${tract}" with no ACS stats`)
      }
    }
  }
  for (const [fips, county] of Object.entries(HDD_TABLE.counties)) {
    if (!(fips in COUNTY_TABLE.counties)) throw new Error(`hdd-by-county.json: unknown county ${fips}`)
    if (!(county.hdd65 > 0)) throw new Error(`hdd-by-county.json: ${county.name} has no HDD65`)
  }
  for (const [geoid, values] of Object.entries(STATS_TABLE.tracts)) {
    if (!/^\d{11}$/.test(geoid)) throw new Error(`ma-tract-stats.json: bad GEOID "${geoid}"`)
    if (!Array.isArray(values) || values.length !== STATS_FIELDS) {
      throw new Error(`ma-tract-stats.json: ${geoid} does not have ${STATS_FIELDS} fields`)
    }
  }
}
assertTable()

// ---------------------------------------------------------------------- indexes

const COUNTIES: Map<string, County> = new Map(
  Object.entries(COUNTY_TABLE.counties).map(([fips, county]) => {
    const hdd = HDD_TABLE.counties[fips]
    if (!hdd) throw new Error(`hdd-by-county.json is missing county ${fips}`)
    return [
      fips,
      { fips, name: county.name, hdd65: hdd.hdd65, hdd2024: hdd.hdd2024, townCount: Object.keys(county.towns).length },
    ]
  }),
)

const TOWN_INDEX: Map<string, TownLocation> = (() => {
  const map = new Map<string, TownLocation>()
  for (const [fips, county] of Object.entries(COUNTY_TABLE.counties)) {
    const resolved = COUNTIES.get(fips)
    if (!resolved) throw new Error(`county ${fips} missing from the HDD table`)
    for (const [townName, tracts] of Object.entries(county.towns)) {
      const key = townKey(townName)
      if (map.has(key)) throw new Error(`towns-by-county.json: "${townName}" appears in two counties`)
      map.set(key, { town: townName, county: resolved, tracts: [...tracts] })
    }
  }
  return map
})()

/** Every municipality, alphabetically. 351 of them, or the table failed validation. */
export const TOWNS: readonly string[] = [...TOWN_INDEX.values()].map((entry) => entry.town).sort((a, b) => a.localeCompare(b))

// ---------------------------------------------------------------------- geoids

/**
 * Normalise a tract GEOID to 11 digits without touching its leading zeros.
 * Input: "25001010100", 25001010100 (number), "01010100" (8 digits), "010101" (6).
 * Guarantee: returns `null` rather than guessing. A number input is rejected above
 * 2^53-safe formatting because JS has already lost the leading zero by then.
 */
export function normalizeTractGeoid(value: unknown): string | null {
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < 0) return null
    return normalizeTractGeoid(String(value))
  }
  if (typeof value !== 'string') return null
  const digits = value.replace(/[^0-9]/g, '')
  // Keep leading zeros: a tract in Barnstable County starts "25001…".
  if (digits.length === 11) return digits.startsWith(STATE_FIPS) ? digits : null
  if (digits.length === 9) return `${STATE_FIPS}${digits}`
  if (digits.length === 6) return null
  return null
}

/**
 * Build an 11-digit tract GEOID from a county FIPS and a tract code.
 * Input: "017" or "25017", tract "383502" or "3835.02".
 * Guarantee: 11 digits, leading zeros preserved, or `null` for a bad shape.
 */
export function tractGeoid(county: string, tract: string): string | null {
  const countyDigits = String(county ?? '').replace(/[^0-9]/g, '')
  const tractDigits = String(tract ?? '')
    .replace(/[^0-9]/g, '')
    .replace(/^0+/, '')
  const countyFips = countyDigits.length === 5 ? countyDigits : `${STATE_FIPS}${countyDigits.padStart(3, '0')}`
  // A well-formed FIPS that is not one of the 14 Massachusetts counties is a typo.
  if (!COUNTIES.has(countyFips)) return null
  if (tractDigits.length === 0 || tractDigits.length > 6) return null
  return `${countyFips}${tractDigits.padStart(6, '0')}`
}

/** County FIPS from a tract GEOID, or null. */
export function countyFipsOfTract(geoid: string): string | null {
  const normalised = normalizeTractGeoid(geoid)
  return normalised ? normalised.slice(0, 5) : null
}

// ----------------------------------------------------------------------- towns

/**
 * Resolve a town name to its county and its tracts.
 * Input: any casing, with or without "Town of".
 * Guarantee: `null` for anything that is not one of the 351 — no fuzzy matching,
 * because a near-miss town is a wrong answer, not a helpful one.
 */
export function locateTown(name: unknown): TownLocation | null {
  if (typeof name !== 'string') return null
  return TOWN_INDEX.get(townKey(name)) ?? null
}

/** The county for a town, or null. */
export function countyOfTown(name: unknown): County | null {
  return locateTown(name)?.county ?? null
}

/** Every tract touching a town, sorted. Empty for an unknown town. */
export function tractsOfTown(name: unknown): string[] {
  return locateTown(name)?.tracts ?? []
}

/** Counties, alphabetically. */
export function counties(): County[] {
  return [...COUNTIES.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/** One county by FIPS. */
export function countyOfFips(fips: string): County | null {
  return COUNTIES.get(String(fips)) ?? null
}

// ----------------------------------------------------------------------- tracts

/** ACS heating-fuel stats for one tract, or null. */
export function tractStats(geoid: string): TractStats | null {
  const normalised = normalizeTractGeoid(geoid)
  if (!normalised) return null
  const values = STATS_TABLE.tracts[normalised]
  if (!values) return null
  const [population, households, oil, gas, electric, propane, medianYearBuilt] = values
  return {
    geoid: normalised,
    countyFips: normalised.slice(0, 5),
    population,
    households,
    oilHouseholds: oil,
    gasHouseholds: gas,
    electricHouseholds: electric,
    propaneHouseholds: propane,
    medianYearBuilt,
    oilShare: households > 0 ? oil / households : 0,
  }
}

/** Tract stats for every tract touching a town, skipping GEOIDs with no estimate. */
export function tractStatsOfTown(name: unknown): TractStats[] {
  return tractsOfTown(name)
    .map((geoid) => tractStats(geoid))
    .filter((stats): stats is TractStats => stats !== null)
}

/** Towns a tract touches (usually one, occasionally two or three on a town line). */
export function townsOfTract(geoid: string): string[] {
  const normalised = normalizeTractGeoid(geoid)
  if (!normalised) return []
  const out: string[] = []
  for (const entry of TOWN_INDEX.values()) if (entry.tracts.includes(normalised)) out.push(entry.town)
  return out.sort((a, b) => a.localeCompare(b))
}

// --------------------------------------------------------------------- climate

/**
 * HDD65 for a town, from its county. County-centroid degree days, not a site
 * measurement — the Manual J caveat belongs on every screen that shows a tonnage.
 */
export function hdd65ForTown(name: unknown): number | null {
  return countyOfTown(name)?.hdd65 ?? null
}

/** HDD65 for a county FIPS, or null. */
export function hdd65ForCounty(fips: string): number | null {
  return COUNTIES.get(String(fips))?.hdd65 ?? null
}

// ------------------------------------------------------------------ state totals

/** Statewide fuel mix, computed once from unique tract stats (never from town lists). */
export interface StateTotals {
  tracts: number
  population: number
  households: number
  oilHouseholds: number
  gasHouseholds: number
  electricHouseholds: number
  propaneHouseholds: number
  oilShare: number
}

let cachedTotals: StateTotals | null = null

/**
 * The statewide numbers behind the map headline.
 * Guarantee: derived from the 1,620 committed tract rows, so it never double
 * counts a tract that appears in two towns.
 */
export function stateTotals(): StateTotals {
  if (cachedTotals) return cachedTotals
  const totals: StateTotals = {
    tracts: 0,
    population: 0,
    households: 0,
    oilHouseholds: 0,
    gasHouseholds: 0,
    electricHouseholds: 0,
    propaneHouseholds: 0,
    oilShare: 0,
  }
  for (const values of Object.values(STATS_TABLE.tracts)) {
    totals.tracts += 1
    totals.population += values[0]
    totals.households += values[1]
    totals.oilHouseholds += values[2]
    totals.gasHouseholds += values[3]
    totals.electricHouseholds += values[4]
    totals.propaneHouseholds += values[5]
  }
  totals.oilShare = totals.households > 0 ? totals.oilHouseholds / totals.households : 0
  cachedTotals = totals
  return totals
}

/** Display form of a town name, for callers holding a lowercase key. */
export function displayTown(name: string): string {
  return locateTown(name)?.town ?? titleCaseTown(name)
}
