/**
 * @built F-73 supply-market reader: Basic Service rates, the one allowed calculation, day counts
 *
 * Pure reader over `data/rules/supply-2026.json` (source: supply-market.md §3–4).
 * No clock, no network: callers pass `today`.
 */

import supplyJson from '../data/rules/supply-2026.json'
import type { SponsorKey } from './elec-label'

export interface BasicServiceRate {
  /** ¢/kWh, supply only. `null` when the source publishes no number (Unitil). */
  centsPerKwh: number | null
  period: string
  source: string
  sourceDate: string
  url: string
}

type BasicKey = 'eversource' | 'nationalgrid' | 'unitil'

const SUPPLY = supplyJson as unknown as {
  basicService: Record<BasicKey, BasicServiceRate>
  competitiveOverpayment: { usd: number; period: string; source: string; url: string }
  marketSplit: {
    asOf: string
    aggregationPct: number
    basicServicePct: number
    competitivePctApprox: number
    source: string
    url: string
  }
  links: { municipalAggregation: string; energySwitch: string }
}

export const COMPETITIVE_OVERPAYMENT = SUPPLY.competitiveOverpayment
export const MARKET_SPLIT = SUPPLY.marketSplit
export const SUPPLY_LINKS = SUPPLY.links

/** Basic Service record for a sponsor, or null when the sponsor has none on file. */
export function basicServiceRate(sponsor: SponsorKey): BasicServiceRate | null {
  if (sponsor === 'eversource' || sponsor === 'nationalgrid' || sponsor === 'unitil') {
    return SUPPLY.basicService[sponsor]
  }
  return null
}

export interface MonthlyDifference {
  /** Positive: the customer pays this much more than Basic Service each month. */
  usd: number
  /** "$29.56" for a positive or negative value (sign carried by `usd`). */
  display: string
  /** The formula with the numbers substituted. */
  formula: string
}

/** supply-market.md §4: (supplier − basic) × kWh ÷ 100. */
export function monthlyDifferenceUsd(input: {
  supplierRateCents: number
  basicServiceCents: number
  kwh: number
}): MonthlyDifference {
  const { supplierRateCents, basicServiceCents, kwh } = input
  const usd = ((supplierRateCents - basicServiceCents) * kwh) / 100
  const display = `$${Math.abs(usd).toFixed(2)}`
  const formula = `(${supplierRateCents} − ${basicServiceCents}) ¢/kWh × ${kwh} kWh ÷ 100 = ${usd < 0 ? '−' : ''}${display}`
  return { usd, display, formula }
}

function localMidnight(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/** Whole local-calendar days from `today` to `isoDate` (YYYY-MM-DD). Past is negative; invalid is NaN. */
export function daysUntil(isoDate: string, today: Date): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate)
  if (!m) return Number.NaN
  const target = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime()
  // Round, not floor: a DST change makes a local day 23 or 25 hours.
  return Math.round((target - localMidnight(today)) / 86_400_000)
}
