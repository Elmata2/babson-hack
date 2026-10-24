/**
 * @built F-07 typed loaders for the rebate tables and the DOER price snapshot
 *
 * The JSON in `data/rules/` is the only legal carrier of program numbers, and it
 * mirrors `.kiro/steering/mass-save-rules.md` exactly. Imported statically, so
 * there is no I/O, no `fetch`, no filesystem at import time — the bundler inlines
 * it and the module stays pure and synchronous.
 */

import rules2026Json from '../../data/rules/heat-pump-2026.json'
import rules2027Json from '../../data/rules/heat-pump-2027.json'
import fuelSnapshotJson from '../../data/snapshots/fuel-2026-10-19.json'
import type { Fuel, Tier } from './types'

/** One tier of one year's rebate table, as published. */
export interface TierRule {
  /** `per_ton` = $ × tons, capped. `cost_cap` = min(install cost, cap). */
  mode: 'per_ton' | 'cost_cap'
  /** $ per cooling ton, or null for cost-capped tiers. */
  perTonUsd: number | null
  /** Program cap before bonuses, USD. */
  capUsd: number
  /** Program cap after bonuses, USD. */
  capAfterBonusesUsd: number
  /** Bonus amounts, or null when the tier pays no bonuses. */
  bonuses: { weatherizationUsd: number; sizingUsd: number } | null
  /** Pre-existing fuels the tier is open to. */
  eligibleFuels: readonly Fuel[]
}

/** One year of the residential rebate table. */
export interface RebateRules {
  year: 2026 | 2027
  /** ISO dates describing the install window; `to: null` means open-ended. */
  installWindow: { from: string; to: string | null }
  documentationDeadline: string | null
  /** Where these numbers came from, dated. Rendered next to every dollar. */
  source: string
  tiers: Record<Tier, TierRule>
}

/** One fuel's price distribution from the DOER survey. */
export interface FuelPrice {
  label: string
  unit: string
  /** Mean of the survey, $/unit. */
  avg: number
  p10: number
  p90: number
  yearAgo: number
  seasonAverage: number
}

/** The DOER snapshot plus the electricity rates that are dated to other months. */
export interface FuelSnapshot {
  asOf: string
  mode: string
  source: string
  oil: FuelPrice
  propane: FuelPrice
  electricity: {
    label: string
    unit: string
    standardRate: number
    standardRateAsOf: string
    standardRateSource: string
    stateTableRate: number
    stateTableAsOf: string
    stateTableSource: string
    heatPumpRateNote: string
    seasonalDiscountUsdPerKwh: Record<string, number>
  }
  doNotClaim: readonly string[]
}

const FUELS: readonly Fuel[] = ['oil', 'propane', 'gas', 'resistance']
const TIERS: readonly Tier[] = ['whole', 'partial', 'basic', 'enhanced']

/** True when `value` is one of the four fuels the engine can price. */
export function isFuel(value: unknown): value is Fuel {
  return typeof value === 'string' && (FUELS as readonly string[]).includes(value)
}

/** True when `value` is one of the four Mass Save tiers. */
export function isTier(value: unknown): value is Tier {
  return typeof value === 'string' && (TIERS as readonly string[]).includes(value)
}

function fail(file: string, detail: string): never {
  throw new Error(`data/${file}: ${detail} — the table must match mass-save-rules.md`)
}

function parseTierRule(file: string, tier: Tier, raw: unknown): TierRule {
  if (typeof raw !== 'object' || raw === null) fail(file, `tier "${tier}" is not an object`)
  const t = raw as Record<string, unknown>
  const mode = t.mode
  if (mode !== 'per_ton' && mode !== 'cost_cap') fail(file, `tier "${tier}" has no valid mode`)
  const perTonUsd = t.perTonUsd
  if (perTonUsd !== null && typeof perTonUsd !== 'number') fail(file, `tier "${tier}" perTonUsd`)
  const capUsd = t.capUsd
  const capAfter = t.capAfterBonusesUsd
  if (typeof capUsd !== 'number' || capUsd <= 0) fail(file, `tier "${tier}" capUsd`)
  if (typeof capAfter !== 'number' || capAfter < capUsd) fail(file, `tier "${tier}" capAfterBonusesUsd`)
  const bonusesRaw = t.bonuses
  let bonuses: TierRule['bonuses'] = null
  if (bonusesRaw !== null) {
    if (typeof bonusesRaw !== 'object') fail(file, `tier "${tier}" bonuses`)
    const b = bonusesRaw as Record<string, unknown>
    if (typeof b.weatherizationUsd !== 'number' || typeof b.sizingUsd !== 'number') {
      fail(file, `tier "${tier}" bonus amounts`)
    }
    bonuses = { weatherizationUsd: b.weatherizationUsd, sizingUsd: b.sizingUsd }
  }
  const fuelsRaw = t.eligibleFuels
  if (!Array.isArray(fuelsRaw) || fuelsRaw.length === 0) fail(file, `tier "${tier}" eligibleFuels`)
  const eligibleFuels = fuelsRaw.map((f) => {
    if (!isFuel(f)) fail(file, `tier "${tier}" lists unknown fuel ${String(f)}`)
    return f
  })
  return {
    mode,
    perTonUsd: typeof perTonUsd === 'number' ? perTonUsd : null,
    capUsd,
    capAfterBonusesUsd: capAfter,
    bonuses,
    eligibleFuels,
  }
}

function parseRules(file: string, raw: unknown, expectedYear: 2026 | 2027): RebateRules {
  if (typeof raw !== 'object' || raw === null) fail(file, 'root is not an object')
  const r = raw as Record<string, unknown>
  if (r.year !== expectedYear) fail(file, `year is ${String(r.year)}, expected ${expectedYear}`)
  if (typeof r.source !== 'string') fail(file, 'source')
  const window = r.installWindow
  if (typeof window !== 'object' || window === null) fail(file, 'installWindow')
  const w = window as Record<string, unknown>
  if (typeof w.from !== 'string') fail(file, 'installWindow.from')
  if (w.to !== null && typeof w.to !== 'string') fail(file, 'installWindow.to')
  const deadline = typeof r.documentationDeadline === 'string' ? r.documentationDeadline : null
  const tiersRaw = r.tiers
  if (typeof tiersRaw !== 'object' || tiersRaw === null) fail(file, 'tiers')
  const tiersObj = tiersRaw as Record<string, unknown>
  const tiers = {} as Record<Tier, TierRule>
  for (const tier of TIERS) tiers[tier] = parseTierRule(file, tier, tiersObj[tier])
  return {
    year: expectedYear,
    installWindow: { from: w.from, to: typeof w.to === 'string' ? w.to : null },
    documentationDeadline: deadline,
    source: r.source,
    tiers,
  }
}

/** The 2026 table: whole $2,650/ton cap $8,500, partial $1,125/ton, basic $250/ton cap $2,500. */
export const HEAT_PUMP_RULES_2026: RebateRules = parseRules('rules/heat-pump-2026.json', rules2026Json, 2026)

/** The 2027 table: the step-down to $2,350/ton cap $7,500 and $1,000/ton cap $7,500. */
export const HEAT_PUMP_RULES_2027: RebateRules = parseRules('rules/heat-pump-2027.json', rules2027Json, 2027)

/** Both years, keyed by the install year that decides which one applies. */
export const HEAT_PUMP_RULES: Record<2026 | 2027, RebateRules> = {
  2026: HEAT_PUMP_RULES_2026,
  2027: HEAT_PUMP_RULES_2027,
}

/**
 * The table for an install year, or `null` when this engine has no table for it.
 * Input: a calendar year. Guarantee: never invents a rebate for an unknown year.
 */
export function rulesForYear(year: number): RebateRules | null {
  if (year === 2026) return HEAT_PUMP_RULES_2026
  if (year === 2027) return HEAT_PUMP_RULES_2027
  return null
}

/**
 * The rule for one tier, or `null` for an unknown year or tier.
 * Input: year + tier. Guarantee: no partial rule object is ever returned.
 */
export function tierRule(year: number, tier: Tier): TierRule | null {
  const rules = rulesForYear(year)
  if (!rules || !isTier(tier)) return null
  return rules.tiers[tier]
}

/** The DOER snapshot for the week of 2026-10-19, typed. */
export const FUEL_SNAPSHOT_2026_10_19: FuelSnapshot = fuelSnapshotJson as unknown as FuelSnapshot

/**
 * Default unit price for a fuel from the snapshot, or `null` for gas.
 * Input: fuel. Guarantee: natural gas is never defaulted, because steering §5
 * forbids claiming a $/therm figure we have not read off a bill.
 */
export function snapshotPriceUsdPerUnit(fuel: Fuel): number | null {
  if (fuel === 'oil') return FUEL_SNAPSHOT_2026_10_19.oil.avg
  if (fuel === 'propane') return FUEL_SNAPSHOT_2026_10_19.propane.avg
  if (fuel === 'resistance') return FUEL_SNAPSHOT_2026_10_19.electricity.standardRate
  return null
}
