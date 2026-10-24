import { SPONSOR_ORDER, type SponsorKey } from '../elec-label'
import { defaultInstallYear, type Income } from '../intake/params'
import { profileSnapshot, readStoredProfile, serverProfileSnapshot, subscribeProfile, type StoredProfile } from '../onboarding/flow'
import type { BillFuel } from '../parse/types'
import { isVerdictQueryComplete } from '../verdict/inputs'
import { shareableQuery } from '../verdict/share-query'

const FUELS: readonly BillFuel[] = ['oil', 'propane', 'gas', 'resistance']

export interface CompletedProfile {
  account: StoredProfile
  town: string
  fuel: BillFuel
  utility: SponsorKey | null
  kwh: number | null
  income: Income
  /** Heating units and unit price, when storage holds them. Onboarding does not store them today. */
  units: number | null
  price: number | null
}

function positive(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

/** Complete means a valid account plus the town and fuel the onboarding review step stores. */
export function readCompleted(raw: string | null): CompletedProfile | null {
  const account = readStoredProfile(raw)
  if (!account || !raw) return null
  let record: Record<string, unknown>
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
    record = parsed as Record<string, unknown>
  } catch {
    return null
  }
  const fuel = FUELS.find((candidate) => candidate === record.fuel)
  if (typeof record.town !== 'string' || record.town === '' || !fuel) return null
  const utility = SPONSOR_ORDER.find((candidate) => candidate === record.utility) ?? null
  const income: Income = record.incomeEligible === 'yes' || record.incomeEligible === 'no' ? record.incomeEligible : 'unsure'
  return {
    account,
    town: record.town,
    fuel,
    utility,
    kwh: positive(record.kwh),
    income,
    units: positive(record.units),
    price: positive(record.price),
  }
}

/** The verdict link when stored data can answer on its own, otherwise null. */
export function verdictHref(profile: CompletedProfile): string | null {
  if (profile.units === null || profile.price === null) return null
  const query = shareableQuery(
    new URLSearchParams({
      fuel: profile.fuel,
      units: String(profile.units),
      price: String(profile.price),
      town: profile.town,
      tier: 'whole',
      year: defaultInstallYear(),
      inc: profile.income,
    }).toString(),
  )
  return isVerdictQueryComplete(Object.fromEntries(query)) ? `/verdict?${query.toString()}` : null
}

export const completionSnapshot = profileSnapshot
export const serverCompletionSnapshot = serverProfileSnapshot
export const subscribeCompletion = subscribeProfile
