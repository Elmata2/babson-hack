import type { SponsorKey } from '../elec-label'
import type { Income } from '../intake/params'
import type { BillApplied, BillUtility } from '../parse/contract'
import type { BillFuel } from '../parse/types'

export interface MapProfileFields {
  town: string
  utility: SponsorKey | null
  fuel: BillFuel
  kwh?: number
  kwhIsExample?: false
  supply: 'basic' | 'competitive' | null
  supplierRateCents: number | null
  incomeEligible: Income
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

export function sponsorFromBill(utility: BillUtility | null): SponsorKey | null {
  return utility === null ? null : SPONSOR_OF[utility]
}

/** Monthly kWh from an electric bill's annualised kWh, or null when the bill gave none. */
export function monthlyKwh(electric: Pick<BillApplied, 'units'> | null): number | null {
  const annual = Number((electric?.units ?? '').replace(/,/g, ''))
  return Number.isFinite(annual) && annual > 0 ? Math.round(annual / 12) : null
}

/**
 * The map-profile fields onboarding knows. The parser does not carry the supplier line, so `supply`
 * and `supplierRateCents` stay null, and `mergeMapProfile` leaves any stored value alone.
 */
export function mapProfileFrom(input: {
  town: string
  fuel: BillFuel
  electric: Pick<BillApplied, 'units' | 'utility'> | null
  income: Income
}): MapProfileFields {
  const kwh = monthlyKwh(input.electric)
  return {
    town: input.town,
    utility: sponsorFromBill(input.electric?.utility ?? null),
    fuel: input.fuel,
    ...(kwh === null ? {} : { kwh, kwhIsExample: false as const }),
    supply: null,
    supplierRateCents: null,
    incomeEligible: input.income,
  }
}

/**
 * Merge onto what storage holds. Null and absent fields never erase a stored value, and an
 * `unsure` income never replaces a stored yes or no. Other non-null values from fresh bills overwrite.
 */
export function mergeMapProfile(existing: string | null, fields: MapProfileFields): string {
  let base: Record<string, unknown> = {}
  try {
    const parsed: unknown = existing ? JSON.parse(existing) : null
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      base = parsed as Record<string, unknown>
    }
  } catch {
    base = {}
  }
  const storedIncome = base.incomeEligible === 'yes' || base.incomeEligible === 'no'
  const known = Object.fromEntries(
    Object.entries(fields).filter(
      ([key, value]) =>
        value !== undefined && value !== null && !(key === 'incomeEligible' && value === 'unsure' && storedIncome),
    ),
  )
  return JSON.stringify({ ...base, ...known })
}
