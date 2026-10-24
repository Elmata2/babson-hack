/**
 * Mass Save facts shared by the Your bill and Next steps panels.
 * Every figure is cited to .kiro/steering/mass-save-rules.md.
 */

import type { SponsorKey } from './elec-label'
import { SEASONAL_RATE_ADJUSTMENT } from './utility'

export const HEAT_LOAN_MAX_USD = 25_000
export const ASSESSMENT_PHONE = '888-714-3990'
export const MASS_SAVE_READ = 'Mass Save · read 2026-10-24'
export const FEDERAL_25C_ENDED = '2025-12-31'

/** True for a Mass Save sponsor, false for a municipal light plant, null when it cannot be told. */
export function massSaveGate(sponsor: SponsorKey | null): boolean | null {
  if (sponsor === 'eversource' || sponsor === 'nationalgrid' || sponsor === 'unitil') return true
  if (sponsor === 'municipal') return false
  return null
}

/** Nov 1 to Apr 30. */
export const SEASONAL_MONTHS = 6

/** Cape Light Compact delivers through Eversource: its rate is Eversource's only when the town also lists it. */
export function rateSponsorFor(sponsor: SponsorKey, townSponsors: readonly SponsorKey[]): SponsorKey {
  return sponsor === 'cape_light' && townSponsors.includes('eversource') ? 'eversource' : sponsor
}

export interface SeasonalRate {
  /** ¢/kWh before the adjustment. */
  fromCents: number
  /** ¢/kWh from Nov 1 to Apr 30. */
  toCents: number
  /** ¢/kWh taken off, positive. */
  offCents: number
}

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * mass-save-rules.md §2: seasonal heat pump rate = your rate − $0.07 (Eversource, Unitil)
 * or − $0.04 (National Grid). Null when the sponsor has no adjustment or no rate is given.
 */
export function seasonalRate(sponsor: SponsorKey, rateCents: number | null): SeasonalRate | null {
  const adjustment = SEASONAL_RATE_ADJUSTMENT[sponsor]
  if (adjustment === null || rateCents === null || !Number.isFinite(rateCents)) return null
  const offCents = round2(Math.abs(adjustment) * 100)
  return { fromCents: rateCents, toCents: round2(rateCents - offCents), offCents }
}

export interface WinterSavings {
  usd: number
  display: string
  formula: string
}

/** Cents off per kWh × monthly kWh × 6 winter months ÷ 100. Assumes the same kWh every month. */
export function winterSavings(offCents: number, monthlyKwh: number): WinterSavings | null {
  if (!(offCents > 0) || !(monthlyKwh > 0) || !Number.isFinite(monthlyKwh)) return null
  const usd = round2((offCents * monthlyKwh * SEASONAL_MONTHS) / 100)
  const display = `$${usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  return { usd, display, formula: `${offCents}¢/kWh × ${monthlyKwh} kWh × ${SEASONAL_MONTHS} months ÷ 100 = ${display}` }
}
