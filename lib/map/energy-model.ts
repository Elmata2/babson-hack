/**
 * @built F-72 the Energy lens's model of town usage and solar
 * @built F-75 real figures: Mass Save usage, MassCEC solar
 * @built You vs your town: Mass Save use per Census ACS household
 *
 * Every number is read from `public/data/ma-town-energy.json` (see scripts/bake-town-energy.mjs)
 * and carries its source and date in `_meta`. Nothing here estimates. A town that has no
 * residential figure says why instead of getting one.
 *
 * Pure: no clock, no network, no DOM.
 */

import type { SponsorKey } from '@/lib/elec-label'

export type Metric = 'usage' | 'solar'
export type Zone = 'NEMA' | 'SEMA' | 'WCMA'
export type Provider = SponsorKey | 'mixed'

export type UsageStatus = 'reported' | 'municipal' | 'suppressed'

export interface BakedTown {
  residentialMWh: number | null
  /** Mass Save electric incentives paid to residents in 2023, USD; null when not reported. */
  incentivesUsd: number | null
  /** ACS 5-year occupied households (B11001), the denominator for use per home. */
  households: number
  usageStatus: UsageStatus
  solarMW: number
  solarSystems: number
}

export interface EnergyMeta {
  sources: {
    usage: { label: string; url: string; year: number; units: string; note: string }
    households: { label: string; url: string; year: number; period: string; units: string; note: string }
    solar: { label: string; url: string; asOf: string; units: string; note: string }
  }
}

/** The shape of `ma-town-energy.json`, keyed by MassGIS upper-case town name. */
export interface BakedEnergy {
  _meta: EnergyMeta
  towns: Record<string, BakedTown>
}

/** A town's residential electricity use, or the reason there is none. */
export type Usage = { status: 'reported'; mwh: number } | { status: 'municipal' } | { status: 'suppressed' }

/** ISO-NE load zone by county name. Bristol sits in SEMA, as in the prototype. */
export const ZONE_BY_COUNTY: Record<string, Zone> = {
  Suffolk: 'NEMA',
  Middlesex: 'NEMA',
  Essex: 'NEMA',
  Norfolk: 'NEMA',
  Plymouth: 'SEMA',
  Bristol: 'SEMA',
  Barnstable: 'SEMA',
  Dukes: 'SEMA',
  Nantucket: 'SEMA',
  Worcester: 'WCMA',
  Hampden: 'WCMA',
  Hampshire: 'WCMA',
  Franklin: 'WCMA',
  Berkshire: 'WCMA',
}

export const ZONE_LABEL: Record<Zone | 'ALL', string> = {
  ALL: 'All Massachusetts',
  NEMA: 'NEMA · Boston & North Shore',
  SEMA: 'SEMA · South Shore & Cape',
  WCMA: 'WCMA · Central & Western',
}

export const METRIC_LABEL: Record<Metric, string> = { usage: 'Residential use', solar: 'Installed solar' }

export interface TownInput {
  /** MassGIS upper-case name, the key into the baked data. */
  source: string
  /** Display name. */
  town: string
  county: string
  centroid: [number, number]
  /** Sponsors that serve the town. Empty is treated as one unknown sponsor. */
  sponsors: SponsorKey[]
}

export interface EnergyTown extends TownInput {
  zone: Zone
  mixed: boolean
  /** The sole sponsor, or 'mixed'. */
  provider: Provider
  usage: Usage
  /** Installed DC MW. */
  solarMW: number
  solarSystems: number
  /** Mass Save electric incentives paid to residents in 2023, USD, or null. */
  incentivesUsd: number | null
  households: number
}

function usageOf(baked: BakedTown): Usage {
  if (baked.usageStatus === 'reported') {
    if (baked.residentialMWh === null) throw new Error('Reported usage has no value')
    return { status: 'reported', mwh: baked.residentialMWh }
  }
  return { status: baked.usageStatus }
}

export function buildEnergyTowns(inputs: readonly TownInput[], baked: BakedEnergy): EnergyTown[] {
  return inputs.map((t) => {
    const row = baked.towns[t.source]
    if (!row) throw new Error(`No baked energy data for ${t.source}`)
    const sponsors: SponsorKey[] = t.sponsors.length > 0 ? t.sponsors : ['other']
    return {
      ...t,
      sponsors,
      zone: ZONE_BY_COUNTY[t.county] ?? 'WCMA',
      mixed: sponsors.length > 1,
      provider: sponsors.length > 1 ? 'mixed' : sponsors[0],
      usage: usageOf(row),
      solarMW: row.solarMW,
      solarSystems: row.solarSystems,
      incentivesUsd: row.incentivesUsd,
      households: row.households,
    }
  })
}

/** The metric's value for one town, or null when the town has none to draw. */
export function metricValue(t: EnergyTown, metric: Metric): number | null {
  if (metric === 'solar') return t.solarMW
  return t.usage.status === 'reported' ? t.usage.mwh : null
}

export function metricMax(towns: readonly EnergyTown[], metric: Metric): number {
  return towns.reduce((m, t) => Math.max(m, metricValue(t, metric) ?? 0), 0)
}

/** Why a town has no residential figure, or null when it has one. */
export function usageNote(t: EnergyTown): string | null {
  switch (t.usage.status) {
    case 'reported':
      return null
    case 'municipal':
      return 'Municipal light plant: not reported to Mass Save'
    case 'suppressed':
      return 'Suppressed by Mass Save for privacy'
  }
}

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function monthOf(iso: string): number {
  return Number(iso.slice(5, 7)) - 1
}

/** "Residential use: Mass Save, 2023 · Solar: MassCEC, Jan 2025". */
export function sourceLine(meta: EnergyMeta): string {
  const { usage, solar } = meta.sources
  const solarDate = `${MONTH[monthOf(solar.asOf)]} ${solar.asOf.slice(0, 4)}`
  return `Residential use: ${usage.label}, ${usage.year} · Solar: ${solar.label}, ${solarDate}`
}

/** The metric line for a town's tooltip, with the source and date. */
export function describeTown(t: EnergyTown, metric: Metric, meta: EnergyMeta): string {
  const { usage, solar } = meta.sources
  if (metric === 'solar') return `${formatMW(t.solarMW)} solar installed (${solar.label}, ${MONTH[monthOf(solar.asOf)]} ${solar.asOf.slice(0, 4)})`
  return t.usage.status === 'reported'
    ? `${formatMWh(t.usage.mwh)} residential use (${usage.label}, ${usage.year})`
    : (usageNote(t) ?? '')
}

export function formatMW(mw: number): string {
  return mw >= 1000 ? `${(mw / 1000).toFixed(1)} GW` : mw >= 10 ? `${Math.round(mw)} MW` : `${mw.toFixed(1)} MW`
}

export function formatMWh(mwh: number): string {
  return mwh >= 1e6 ? `${(mwh / 1e6).toFixed(2)} TWh` : mwh >= 1e3 ? `${Math.round(mwh / 1e3).toLocaleString('en-US')} GWh` : `${Math.round(mwh)} MWh`
}

export type TownAverage =
  | { status: 'ok'; kwhPerMonth: number; households: number }
  | { status: 'hidden'; reason: string }

/**
 * Average monthly residential kWh per household: Mass Save MWh x 1000 / ACS households / 12.
 * Hidden, with the reason, where the Mass Save figure does not describe the town's homes.
 */
export function averageHomeKwh(t: EnergyTown): TownAverage {
  if (t.usage.status === 'municipal') {
    return { status: 'hidden', reason: `${t.town} is served by a municipal light plant, which does not report to Mass Save.` }
  }
  if (t.usage.status === 'suppressed') {
    return { status: 'hidden', reason: `Mass Save suppressed ${t.town}'s usage for privacy.` }
  }
  if (t.mixed) {
    return {
      status: 'hidden',
      reason: `${t.town} is served by more than one utility, and Mass Save counts only the sponsors' accounts, so the average would not describe the whole town.`,
    }
  }
  return { status: 'ok', kwhPerMonth: (t.usage.mwh * 1000) / t.households / 12, households: t.households }
}

export type TownIncentive =
  | { status: 'ok'; usdPerHousehold: number; households: number }
  | { status: 'none' }
  | { status: 'hidden'; reason: string }

/** Whole dollars under $100, nearest $5 above: a rough guide should not claim cents or false precision. */
export function roundIncentiveUsd(usd: number): number {
  return usd < 100 ? Math.round(usd) : Math.round(usd / 5) * 5
}

/**
 * Mass Save 2023 residential electric incentives divided by ACS households.
 * Hidden under the same rules as the kWh average, and where Mass Save reports no incentive total.
 */
export function averageIncentiveUsd(t: EnergyTown): TownIncentive {
  const avg = averageHomeKwh(t)
  if (avg.status === 'hidden') return avg
  if (t.incentivesUsd === null) {
    return { status: 'hidden', reason: `Mass Save reports no incentive total for ${t.town}.` }
  }
  if (t.incentivesUsd === 0) return { status: 'none' }
  return { status: 'ok', usdPerHousehold: roundIncentiveUsd(t.incentivesUsd / t.households), households: t.households }
}

/** Above this monthly average, seasonal homes dominate and a percentage comparison misleads. */
export const SEASONAL_KWH_PER_MONTH = 1000

/** "You use roughly 20% more than the average home in Worcester." */
export function compareSentence(youKwh: number, avgKwh: number, town: string): string {
  const pct = Math.round((youKwh / avgKwh - 1) * 100)
  if (Math.abs(pct) < 3) return `You use about the same as the average home in ${town}.`
  return `You use roughly ${Math.abs(pct)}% ${pct > 0 ? 'more' : 'less'} than the average home in ${town}.`
}
