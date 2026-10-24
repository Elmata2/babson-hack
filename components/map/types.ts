/**
 * Shared contract for /map. The map shell (lenses, search, camera) and the panels
 * (profile, Your bill) are built against these types and nothing else.
 */

import type { SponsorKey } from '@/lib/elec-label'

/** The three ways to look at the same map. */
export type Lens = 'street' | 'energy' | 'heat'

export type HeatingFuel = 'oil' | 'propane' | 'gas' | 'resistance' | 'heat_pump'
export type HomeType = 'single' | 'two_to_four' | 'condo'
export type SupplyChoice = 'basic' | 'aggregation' | 'competitive' | 'unsure'
export type YesNo = 'yes' | 'no'
export type YesNoUnsure = 'yes' | 'no' | 'unsure'

/** "My home". Lives in localStorage only (ADR-003: nothing server-side). */
export interface Profile {
  /** Matched address from /api/geocode, or '' when the user picked a town only. */
  address: string
  /** Display town name as returned by `resolveUtility(...).town`, or ''. */
  town: string
  /** Chosen sponsor for a mixed town; null until the user answers. */
  utility: SponsorKey | null
  fuel: HeatingFuel | null
  home: HomeType | null
  /** Monthly kWh. `kwhIsExample` stays true until the user edits it. */
  kwh: number
  kwhIsExample: boolean
  supply: SupplyChoice | null
  /** Competitive supplier rate, ¢/kWh. */
  supplierRateCents: number | null
  /** ISO date `YYYY-MM-DD`. */
  contractEnd: string | null
  terminationFeeUsd: number | null
  solar: YesNo | null
  ev: YesNo | null
  incomeEligible: YesNoUnsure | null
}

export const EMPTY_PROFILE: Profile = {
  address: '',
  town: '',
  utility: null,
  fuel: null,
  home: null,
  kwh: 600,
  kwhIsExample: true,
  supply: null,
  supplierRateCents: null,
  contractEnd: null,
  terminationFeeUsd: null,
  solar: null,
  ev: null,
  incomeEligible: null,
}

export interface BillPanelProps {
  /** Town currently selected on the map (display name), or null. */
  town: string | null
  profile: Profile
  /** Opens the profile drawer, e.g. to answer "which utility bills you?". */
  onEditProfile: () => void
  /** Injected for tests and for the day counters. */
  today?: Date
}

export interface ProfileDrawerProps {
  open: boolean
  onClose: () => void
  profile: Profile
  onChange: (patch: Partial<Profile>) => void
  onClear: () => void
}
