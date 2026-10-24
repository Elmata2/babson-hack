/**
 * @built F-56 sponsor → seasonal rate rule + Mass Save eligibility gate
 *
 * This is a correctness gate, not a lookup. Mass Save electric rebates are paid by
 * the sponsor that serves the account, and municipal light plant customers are not
 * served by Mass Save at all. Every dollar this app shows depends on getting that
 * right, so the module has three answers and refuses to invent a fourth:
 *
 *   true  → the town is served by an investor-owned Mass Save sponsor
 *   false → a municipal light plant serves the town; rebates do not apply
 *   null  → we cannot tell (two sponsors, or a town we do not have): ask the user
 *
 * `seasonalRateRule` is the Mass Save seasonal heat pump rate adjustment for
 * Nov 1 – Apr 30 (mass-save-rules.md §2): −$0.07/kWh for Eversource and Unitil,
 * −$0.04/kWh for National Grid, and `null` where no adjustment applies or where
 * two sponsors disagree.
 *
 * Pure: reads one committed JSON artefact, no clock, no network.
 */

import utilitiesJson from '../data/generated/utilities.json'
import type { SponsorKey } from './elec-label'
import type { BillUtility } from './parse/contract'
import { SPONSOR_LABEL, townKey } from './elec-label'

export type { SponsorKey }

/** Seasonal heat pump rate adjustment, USD per kWh, by sponsor. `null` = no adjustment. */
export const SEASONAL_RATE_ADJUSTMENT: Record<SponsorKey, number | null> = {
  eversource: -0.07,
  unitil: -0.07,
  nationalgrid: -0.04,
  municipal: null,
  cape_light: null,
  other: null,
}

/** Mass Save sponsor names, for a badge. */
export const SPONSOR_NAME = SPONSOR_LABEL

/** One baked row: the eight labels MassGIS publishes, reduced to sponsors. */
interface UtilityRecord {
  sponsors: SponsorKey[]
  hasMunicipal: boolean
  mixed: boolean
  /** True when the sponsor was inferred (Cape Light Compact), not read from the dataset. */
  inferred: boolean
}

/** What `resolveUtility` answers. `question` is non-null exactly when the app must ask. */
export interface UtilityResolution {
  /** Display name of the town, or the caller's string when the town is unknown. */
  town: string
  /** True when the town exists in the 351-town table. */
  found: boolean
  sponsors: SponsorKey[]
  hasMunicipal: boolean
  mixed: boolean
  /** true = Mass Save serves this town, false = it does not, null = ask the user. */
  eligibleForMassSave: boolean | null
  /** USD/kWh to subtract for Nov 1 – Apr 30, or null when there is no single answer. */
  seasonalRateRule: number | null
  /** True when the sponsor came from the county inference, not the source dataset. */
  inferred: boolean
  /** Human reason for a `false` or a `null` eligibility. Never a guess. */
  reason: string | null
  /** The question to put to the user when the data cannot decide. */
  question: string | null
}

const ARTEFACT = utilitiesJson as unknown as {
  _meta: { source: string; url: string; fetchedAt: string; recordCount: number }
  towns: Record<string, UtilityRecord>
}

const SPONSOR_KEYS: readonly SponsorKey[] = ['eversource', 'nationalgrid', 'unitil', 'cape_light', 'municipal', 'other']

function parseRecord(town: string, raw: unknown): UtilityRecord {
  if (typeof raw !== 'object' || raw === null) throw new Error(`utilities.json: "${town}" is not an object`)
  const record = raw as Record<string, unknown>
  if (!Array.isArray(record.sponsors)) throw new Error(`utilities.json: "${town}" has no sponsors[]`)
  const sponsors = record.sponsors.map((sponsor) => {
    if (typeof sponsor !== 'string' || !(SPONSOR_KEYS as readonly string[]).includes(sponsor)) {
      throw new Error(`utilities.json: "${town}" lists unknown sponsor ${String(sponsor)}`)
    }
    return sponsor as SponsorKey
  })
  return {
    sponsors,
    hasMunicipal: record.hasMunicipal === true,
    mixed: record.mixed === true,
    inferred: record.inferred === true,
  }
}

const INDEX: Map<string, { town: string; record: UtilityRecord }> = (() => {
  const map = new Map<string, { town: string; record: UtilityRecord }>()
  for (const [town, raw] of Object.entries(ARTEFACT.towns ?? {})) {
    const record = parseRecord(town, raw)
    // A malformed key would silently shadow another town; fail at import instead.
    const key = townKey(town)
    if (map.has(key)) throw new Error(`utilities.json: duplicate town key "${key}"`)
    map.set(key, { town, record })
  }
  if (map.size === 0) throw new Error('utilities.json: no towns — run scripts/bake-utilities.mjs')
  return map
})()

/** Provenance of the committed table, for the freshness badge. */
export const UTILITY_META = ARTEFACT._meta

/** Every municipality in the table, alphabetically — the town picker's source. */
export const ALL_TOWNS: readonly string[] = [...INDEX.values()].map((entry) => entry.town).sort((a, b) => a.localeCompare(b))

/** The single sponsor when exactly one serves the town, else null. */
function soleSponsor(sponsors: SponsorKey[]): SponsorKey | null {
  return sponsors.length === 1 ? sponsors[0] : null
}

function sponsorList(sponsors: SponsorKey[]): string {
  const names = sponsors.map((sponsor) => SPONSOR_LABEL[sponsor])
  if (names.length <= 1) return names[0] ?? 'no utility on file'
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/**
 * Resolve one town to its sponsors, its Mass Save gate and its seasonal rate rule.
 * Input: any town string ("Wellesley", "town of wellesley", "WELLESLEY").
 * Guarantee: total — an unknown town returns `found: false` with a question, never
 * a default sponsor, never an eligibility guess.
 */
export function resolveUtility(town: string): UtilityResolution {
  const display = typeof town === 'string' ? town.trim() : ''
  const entry = INDEX.get(townKey(display))

  if (!entry) {
    return {
      town: display,
      found: false,
      sponsors: [],
      hasMunicipal: false,
      mixed: false,
      eligibleForMassSave: null,
      seasonalRateRule: null,
      inferred: false,
      reason: `No utility record for "${display}". The table covers all 351 Massachusetts municipalities.`,
      question: `Which utility bills you? We could not match "${display}" to a Massachusetts town — check the spelling or pick the town from the list.`,
    }
  }

  const { record } = entry
  const sponsors = record.sponsors
  const sole = soleSponsor(sponsors)

  // ---- two or more sponsors: the rate rule differs by sponsor, so ask --------
  if (record.mixed || sponsors.length > 1) {
    return {
      town: entry.town,
      found: true,
      sponsors,
      hasMunicipal: record.hasMunicipal,
      mixed: true,
      eligibleForMassSave: null,
      seasonalRateRule: null,
      inferred: record.inferred,
      reason: `${sponsorList(sponsors)} both serve ${entry.town}. The Mass Save sponsor and the seasonal rate depend on which one bills this address.`,
      question: `Which utility bills you: ${sponsorList(sponsors)}?`,
    }
  }

  // ---- one sponsor ----------------------------------------------------------
  if (sole === 'municipal') {
    return {
      town: entry.town,
      found: true,
      sponsors,
      hasMunicipal: true,
      mixed: false,
      eligibleForMassSave: false,
      seasonalRateRule: null,
      inferred: record.inferred,
      reason: `${entry.town} is served by a municipal light plant. Municipal light plant customers are not served by Mass Save electric rebates — the town's own program may still offer something, so ask the municipally owned utility directly. The seasonal heat pump rate does not apply, and no Mass Save rebate is quoted.`,
      question: null,
    }
  }

  if (sole === 'cape_light') {
    // Cape Light Compact IS a Mass Save Electric Sponsor (masssave.com footer), so
    // the rebate applies. What is not published is the seasonal rate adjustment,
    // which covers only Eversource, Unitil and National Grid — so we invent none,
    // and we say where the sponsor came from when we inferred it from the county.
    return {
      town: entry.town,
      found: true,
      sponsors,
      hasMunicipal: false,
      mixed: false,
      eligibleForMassSave: true,
      seasonalRateRule: null,
      inferred: record.inferred,
      reason: record.inferred
        ? `Cape Light Compact is the Mass Save sponsor for ${entry.town}. This was inferred from Barnstable/Dukes county membership because the source dataset omits CLC — verify with Cape Light Compact. The seasonal heat pump rate adjustment is not published for CLC, so the standard rate is used.`
        : `Cape Light Compact serves ${entry.town}. The seasonal heat pump rate adjustment is not published for CLC, so the standard rate is used.`,
      question: null,
    }
  }

  if (sole === 'other' || sole === null) {
    return {
      town: entry.town,
      found: true,
      sponsors,
      hasMunicipal: record.hasMunicipal,
      mixed: false,
      eligibleForMassSave: null,
      seasonalRateRule: null,
      inferred: record.inferred,
      reason: `${entry.town}'s utility could not be matched to a Mass Save sponsor. No rebate is quoted until that is resolved.`,
      question: 'Which utility bills you?',
    }
  }

  if (sole === 'eversource' || sole === 'unitil' || sole === 'nationalgrid') {
    const rule = SEASONAL_RATE_ADJUSTMENT[sole]
    return {
      town: entry.town,
      found: true,
      sponsors,
      hasMunicipal: false,
      mixed: false,
      eligibleForMassSave: true,
      seasonalRateRule: rule,
      inferred: record.inferred,
      reason: null,
      question: null,
    }
  }

  // Unreachable for a typed SponsorKey, kept exhaustive so a new key cannot slip by.
  return {
    town: entry.town,
    found: true,
    sponsors,
    hasMunicipal: record.hasMunicipal,
    mixed: record.mixed,
    eligibleForMassSave: null,
    seasonalRateRule: null,
    inferred: record.inferred,
    reason: 'Unrecognised sponsor.',
    question: 'Which utility bills you?',
  }
}

const SPONSOR_OF: Record<BillUtility, SponsorKey | null> = {
  eversource: 'eversource',
  national_grid: 'nationalgrid',
  unitil: 'unitil',
  municipal: 'municipal',
  liberty: 'other',
  berkshire_gas: 'other',
  other: 'other',
  oil_dealer: null,
  propane_dealer: null,
}

/** The sponsor a bill's sender maps to, or null when the sender sells no electricity. */
export function sponsorFromBill(billUtility: BillUtility | null): SponsorKey | null {
  return billUtility === null ? null : SPONSOR_OF[billUtility]
}

/**
 * The seasonal heat pump rate for a town, from the customer's own all-in rate.
 * Input: $/kWh standard residential rate + town + the sponsor the bill names, if any.
 * Guarantee: returns the standard rate unchanged when no single adjustment applies,
 * and reports whether it was applied. The billed sponsor settles only a town whose
 * own sponsors disagree and include it; a settled town (Cape Light Compact included)
 * keeps its rule, and a bill naming a sponsor the town does not list settles nothing.
 */
export function seasonalHeatPumpRate(
  standardRate: number,
  town: string,
  billSponsor: SponsorKey | null = null,
): { rate: number; applied: boolean; rule: number | null } {
  const resolution = resolveUtility(town)
  const rule =
    resolution.eligibleForMassSave === null && billSponsor !== null && resolution.sponsors.includes(billSponsor)
      ? SEASONAL_RATE_ADJUSTMENT[billSponsor]
      : resolution.seasonalRateRule
  if (rule === null) return { rate: standardRate, applied: false, rule: null }
  return { rate: standardRate + rule, applied: true, rule }
}
