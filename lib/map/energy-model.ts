/**
 * @built F-72 the Energy lens's model of town usage, solar and zonal load
 * @built F-75 real figures: Mass Save usage, MassCEC solar, ISO-NE zonal load
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
  usageStatus: UsageStatus
  solarMW: number
  solarSystems: number
}

/** MW per hour, index 0 = hour ending 1 AM, index 23 = hour ending midnight. */
export type ZoneLoad = Record<Zone, number[]>

export interface EnergyMeta {
  sources: {
    usage: { label: string; url: string; year: number; units: string; note: string }
    solar: { label: string; url: string; asOf: string; units: string; note: string }
    load: { label: string; url: string; days: string[]; units: string; note: string }
  }
}

/** The shape of `ma-town-energy.json`, keyed by MassGIS upper-case town name. */
export interface BakedEnergy {
  _meta: EnergyMeta
  towns: Record<string, BakedTown>
  load: Record<string, ZoneLoad>
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

export interface Totals {
  residentialMWh: number
  reportedTowns: number
  townCount: number
  solarMW: number
  solarSystems: number
  /** Residential MWh by sponsor; a town served by several sponsors is its own 'mixed' bucket. */
  byProvider: Partial<Record<Provider, number>>
}

export function totalsOf(towns: readonly EnergyTown[]): Totals {
  const totals: Totals = { residentialMWh: 0, reportedTowns: 0, townCount: towns.length, solarMW: 0, solarSystems: 0, byProvider: {} }
  for (const t of towns) {
    totals.solarMW += t.solarMW
    totals.solarSystems += t.solarSystems
    if (t.usage.status !== 'reported') continue
    totals.reportedTowns += 1
    totals.residentialMWh += t.usage.mwh
    totals.byProvider[t.provider] = (totals.byProvider[t.provider] ?? 0) + t.usage.mwh
  }
  return totals
}

/** Hourly MW for one zone, or the sum of the three for 'ALL'. */
export function zoneLoad(baked: BakedEnergy, day: string, zone: Zone | 'ALL'): number[] {
  const load = baked.load[day]
  if (!load) throw new Error(`No load baked for ${day}`)
  if (zone !== 'ALL') return load[zone]
  return load.NEMA.map((mw, h) => mw + load.SEMA[h] + load.WCMA[h])
}

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function monthOf(iso: string): number {
  return Number(iso.slice(5, 7)) - 1
}

/** "Jan 15 2026". */
export function formatDay(iso: string): string {
  return `${MONTH[monthOf(iso)]} ${Number(iso.slice(8, 10))} ${iso.slice(0, 4)}`
}

/** "Winter" for Dec to Feb, "Summer" for Jun to Aug, else the date alone. */
export function dayLabel(iso: string): string {
  const m = monthOf(iso)
  const season = m === 11 || m <= 1 ? 'Winter' : m >= 5 && m <= 7 ? 'Summer' : null
  return season ? `${season} · ${formatDay(iso)}` : formatDay(iso)
}

/** "Residential use: Mass Save, 2023 · Solar: MassCEC, Jan 2025 · Load: ISO-NE via EIA-930, Jan 15 2026". */
export function sourceLine(meta: EnergyMeta, day: string): string {
  const { usage, solar, load } = meta.sources
  const solarDate = `${MONTH[monthOf(solar.asOf)]} ${solar.asOf.slice(0, 4)}`
  return `Residential use: ${usage.label}, ${usage.year} · Solar: ${solar.label}, ${solarDate} · Load: ${load.label}, ${formatDay(day)}`
}

/** The metric line for a town's tooltip, with the source and date. */
export function describeTown(t: EnergyTown, metric: Metric, meta: EnergyMeta): string {
  const { usage, solar } = meta.sources
  if (metric === 'solar') return `${formatMW(t.solarMW)} solar installed (${solar.label}, ${MONTH[monthOf(solar.asOf)]} ${solar.asOf.slice(0, 4)})`
  return t.usage.status === 'reported'
    ? `${formatMWh(t.usage.mwh)} residential use (${usage.label}, ${usage.year})`
    : (usageNote(t) ?? '')
}

/** Names the hour that starts at `h`, the hour the EIA series calls "hour ending h + 1". */
export function hourLabel(h: number): string {
  return h === 0 ? '12 AM' : h === 12 ? '12 PM' : h < 12 ? `${h} AM` : `${h - 12} PM`
}

export function formatMW(mw: number): string {
  return mw >= 1000 ? `${(mw / 1000).toFixed(1)} GW` : mw >= 10 ? `${Math.round(mw)} MW` : `${mw.toFixed(1)} MW`
}

export function formatMWh(mwh: number): string {
  return mwh >= 1e6 ? `${(mwh / 1e6).toFixed(2)} TWh` : mwh >= 1e3 ? `${Math.round(mwh / 1e3).toLocaleString('en-US')} GWh` : `${Math.round(mwh)} MWh`
}
