import type { SponsorKey } from '../elec-label'
import type { Income } from '../intake/params'
import type { BillApplied } from '../parse/contract'
import type { BillFuel } from '../parse/types'
import { sponsorFromBill } from '../utility'

export interface MapProfileFields {
  town: string
  utility: SponsorKey | null
  fuel: BillFuel
  /** The heating numbers the review step used, so the verdict can be rebuilt later. */
  units?: number
  price?: number
  kwh?: number
  kwhIsExample?: false
  supply: 'basic' | 'competitive' | null
  supplierRateCents: number | null
  incomeEligible: Income
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
  /** Heating use and unit price from the review step, when the household has them. */
  units?: number | null
  price?: number | null
}): MapProfileFields {
  const kwh = monthlyKwh(input.electric)
  const units = typeof input.units === 'number' && Number.isFinite(input.units) && input.units > 0 ? input.units : undefined
  const price = typeof input.price === 'number' && Number.isFinite(input.price) && input.price > 0 ? input.price : undefined
  return {
    town: input.town,
    utility: sponsorFromBill(input.electric?.utility ?? null),
    fuel: input.fuel,
    ...(units === undefined ? {} : { units }),
    ...(price === undefined ? {} : { price }),
    ...(kwh === null ? {} : { kwh, kwhIsExample: false as const }),
    supply: null,
    supplierRateCents: null,
    incomeEligible: input.income,
  }
}

const TOWN_BOUND = ['utility', 'kwh', 'kwhIsExample', 'supply', 'supplierRateCents']

function normalTown(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
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
  const storedTown = normalTown(base.town)
  if (storedTown !== '' && storedTown !== normalTown(fields.town)) for (const key of TOWN_BOUND) delete base[key]
  const storedIncome = base.incomeEligible === 'yes' || base.incomeEligible === 'no'
  const known = Object.fromEntries(
    Object.entries(fields).filter(
      ([key, value]) =>
        value !== undefined && value !== null && !(key === 'incomeEligible' && value === 'unsure' && storedIncome),
    ),
  )
  return JSON.stringify({ ...base, ...known })
}
