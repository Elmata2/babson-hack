/**
 * @built F-137 the onboarding wizard's rules, kept out of the component
 * @built F-141 profile validation, the four-step machine and its storage round-trip
 *
 * The wizard is four steps and two decisions: is the profile usable, and are the
 * numbers usable. Both are pure functions here so the screen cannot disagree with
 * the tests, and so the same answer can later guard a server route when profiles
 * get a real home.
 *
 * What this module deliberately does NOT do: invent an account. There is no
 * database in this build, so `serializeProfile` writes to the browser and the
 * screen says so in words. A real auth provider replaces the two storage helpers
 * and nothing else.
 */

import { matchTown } from '../address/nominatim'
import { parseBillUtility } from '../intake/params'
import type { BillApplied, BillRole, BillUtility } from '../parse/contract'
import { resolveUtility } from '../utility'
import type { BillFuel } from '../parse/types'

export interface Profile {
  name: string
  email: string
  /** Optional at signup. Required only for text notifications. */
  phone: string
  consent: boolean
}

export interface StoredProfile {
  name: string
  email: string
  phone: string
  /** ISO instant the household agreed to the privacy summary. */
  consentAt: string
}

export type ProfileField = 'name' | 'email' | 'phone' | 'consent'

export type ProfileErrors = Partial<Record<ProfileField, string>>

/** Where a browser keeps the demo profile. Versioned so an old shape is ignored, not migrated. */
export const PROFILE_KEY = 'switchpoint.profile.v1'

const NAME_MIN = 2
const NAME_MAX = 80
const EMAIL_MAX = 254

/** A deliberately plain address check: one @, a dot in the domain, no spaces. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/** US numbers as people type them: `(617) 555-0142`, `617-555-0142`, `+1 617 555 0142`. */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[\s().-]/g, '')
  const national = /^(?:\+?1)?(\d{10})$/.exec(digits)
  return national ? national[1] : null
}

export function validateProfile(profile: Profile): ProfileErrors {
  const errors: ProfileErrors = {}
  const name = profile.name.trim()
  if (name.length < NAME_MIN) errors.name = 'Tell us what to call you — at least two characters.'
  else if (name.length > NAME_MAX) errors.name = 'That name is longer than this field can keep.'

  const email = profile.email.trim()
  if (email === '') errors.email = 'We need an email — it is the only contact the profile keeps.'
  else if (email.length > EMAIL_MAX || !EMAIL.test(email)) errors.email = 'That address is missing an @ or a domain.'

  if (profile.phone.trim() !== '' && normalizePhone(profile.phone) === null) {
    errors.phone = 'A US number is 10 digits. Leave it empty if you do not want texts.'
  }

  if (!profile.consent) errors.consent = 'Tick the box so we know the privacy summary was read.'
  return errors
}

export function isProfileComplete(profile: Profile): boolean {
  return Object.keys(validateProfile(profile)).length === 0
}

// --------------------------------------------------------------------- steps

export type Step = 'account' | 'bill' | 'details' | 'review'

export interface StepMeta {
  id: Step
  label: string
}

export const STEPS: readonly StepMeta[] = [
  { id: 'account', label: 'Your profile' },
  { id: 'bill', label: 'Your bills' },
  { id: 'details', label: 'Your house' },
  { id: 'review', label: 'Review' },
]

/** The steps a household walks: the house step drops out when the bills answered everything. */
export function visibleSteps(detailsNeeded: boolean): readonly StepMeta[] {
  return detailsNeeded ? STEPS : STEPS.filter((entry) => entry.id !== 'details')
}

export function eyebrowFor(step: Step, detailsNeeded: boolean): string {
  const steps = visibleSteps(detailsNeeded)
  const index = Math.max(0, steps.findIndex((entry) => entry.id === step))
  return `Step ${index + 1} of ${steps.length}`
}

export function nextStep(step: Step, detailsNeeded = true): Step {
  const steps = visibleSteps(detailsNeeded)
  const index = Math.max(0, steps.findIndex((entry) => entry.id === step))
  return steps[Math.min(steps.length - 1, index + 1)].id
}

export function previousStep(step: Step, detailsNeeded = true): Step {
  const steps = visibleSteps(detailsNeeded)
  const index = Math.max(0, steps.findIndex((entry) => entry.id === step))
  return steps[Math.max(0, index - 1)].id
}

// --------------------------------------------------------------------- bills

export interface BillSlots {
  heating: BillApplied | null
  electricity: BillApplied | null
  heatingByHand: boolean
  electricityByHand: boolean
}

/** Both bills are in, each either read and confirmed or entered by hand. */
export function billsReady(slots: BillSlots): boolean {
  return (slots.heating !== null || slots.heatingByHand) && (slots.electricity !== null || slots.electricityByHand)
}

/** The service town the bills printed, matched to the 351; the electric bill wins. */
export function serviceTownFrom(
  bills: readonly (Pick<BillApplied, 'serviceTown'> | null)[],
  towns: readonly string[],
): string | null {
  for (const bill of bills) {
    const matched = matchTown(bill?.serviceTown, towns)
    if (matched) return matched
  }
  return null
}

/** The heating fuel the heating bill proves, or null when it has to be asked. */
export function fuelFromBill(heating: Pick<BillApplied, 'fuel'> | null): BillFuel | null {
  return heating?.fuel ?? null
}

/** True when either bill carries the discount-rate signal (R-2/R-4 or a discount line). */
export function lowIncomeDetected(bills: readonly (Pick<BillApplied, 'lowIncomeSignal'> | null)[]): boolean {
  return bills.some((bill) => bill?.lowIncomeSignal === true)
}

/** `true` when a bill was read and showed no discount, `null` when nothing was read. */
export function lowIncomeFlag(bills: readonly (Pick<BillApplied, 'lowIncomeSignal'> | null)[]): boolean | null {
  if (lowIncomeDetected(bills)) return true
  return bills.some((bill) => bill !== null) ? false : null
}

const DEALERS: readonly BillUtility[] = ['oil_dealer', 'propane_dealer']

/** True when exactly one sponsor serves the town, so a gas bill's utility cannot name the wrong electric sponsor. */
export function hasSingleSponsor(town: string): boolean {
  const resolution = resolveUtility(town)
  return resolution.found && !resolution.mixed && resolution.sponsors.length === 1
}

/**
 * The electric utility in canonical form (`national_grid`), from the electric bill.
 * The heating bill's utility is used only when no electric bill was read and the town has one sponsor.
 */
export function pickUtility(
  electric: Pick<BillApplied, 'utility'> | null,
  heating: Pick<BillApplied, 'utility'> | null,
  singleSponsorTown = false,
): BillUtility | null {
  if (electric) return parseBillUtility(electric.utility)
  const fromHeating = parseBillUtility(heating?.utility)
  return singleSponsorTown && fromHeating && !DEALERS.includes(fromHeating) ? fromHeating : null
}

export interface TownMismatch {
  used: string
  other: string
}

/** Both bills named a town and they differ: the electric bill's wins. */
export function townMismatch(
  electric: Pick<BillApplied, 'serviceTown'> | null,
  heating: Pick<BillApplied, 'serviceTown'> | null,
  towns: readonly string[],
): TownMismatch | null {
  const used = matchTown(electric?.serviceTown, towns)
  const other = matchTown(heating?.serviceTown, towns)
  return used && other && used !== other ? { used, other } : null
}

/** What to say when a bill landed in the other slot, or null when it fit. */
export function misplacedBillNote(slot: BillRole, actual: BillRole): string | null {
  if (slot === actual) return null
  return actual === 'electricity'
    ? 'That looks like an electric bill — we put it in slot 1.'
    : 'That looks like a heating bill — we put it in slot 2.'
}

export interface DetailsNeeds {
  town: boolean
  fuel: boolean
  numbers: boolean
  income: boolean
}

/** What the bills did not answer. Every key false means the house step is skipped. */
export function detailsNeeds(input: {
  townRead: boolean
  heating: BillApplied | null
  incomeDetected: boolean
  numbersReady: boolean
}): DetailsNeeds {
  return {
    town: !input.townRead,
    fuel: fuelFromBill(input.heating) === null,
    numbers: input.heating === null || !input.numbersReady,
    income: !input.incomeDetected && fuelFromBill(input.heating) !== 'gas',
  }
}

export function anyDetailsNeeded(needs: DetailsNeeds): boolean {
  return needs.town || needs.fuel || needs.numbers || needs.income
}

// ------------------------------------------------------------------- details

export interface DetailsInput {
  fuel: string
  units: string
  price: string
  town: string
  towns: readonly string[]
}

/** `1,200` and ` 1200 ` are the same number; `0`, `` and `abc` are not numbers we can use. */
export function positiveNumber(raw: string): number | null {
  const value = Number(raw.replace(/[,\s]/g, ''))
  return Number.isFinite(value) && value > 0 ? value : null
}

export function canLeaveDetails(input: DetailsInput): boolean {
  if (!input.towns.includes(input.town)) return false
  if (!['oil', 'propane', 'gas', 'resistance'].includes(input.fuel)) return false
  return positiveNumber(input.units) !== null && positiveNumber(input.price) !== null
}

// ------------------------------------------------------------------- storage

/**
 * The stored shape, or null when anything is off. A stored profile is only worth
 * keeping if it would still pass today's validation — otherwise the next visit
 * loads a half-valid record and the form shows an error nobody typed.
 */
export function readStoredProfile(raw: string | null): StoredProfile | null {
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const record = parsed as Record<string, unknown>
  if (typeof record.name !== 'string' || typeof record.email !== 'string' || typeof record.phone !== 'string') {
    return null
  }
  if (typeof record.consentAt !== 'string' || Number.isNaN(Date.parse(record.consentAt))) return null

  const profile: Profile = {
    name: record.name,
    email: record.email,
    phone: record.phone,
    consent: true,
  }
  if (!isProfileComplete(profile)) return null

  return {
    name: profile.name.trim(),
    email: profile.email.trim(),
    phone: profile.phone.trim(),
    consentAt: record.consentAt,
  }
}

const OWNED_FIELDS = ['name', 'email', 'phone', 'consentAt']

/** Stored fields this module does not own (the map profile shares the key). */
function foreignFields(existing: string | null): Record<string, unknown> {
  if (!existing) return {}
  try {
    const parsed: unknown = JSON.parse(existing)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    return Object.fromEntries(Object.entries(parsed).filter(([k]) => !OWNED_FIELDS.includes(k)))
  } catch {
    return {}
  }
}

/** What stays in storage after the user forgets the onboarding profile: fields it does not own, or null. */
export function withoutProfile(existing: string | null): string | null {
  const foreign = foreignFields(existing)
  return Object.keys(foreign).length === 0 ? null : JSON.stringify(foreign)
}

/**
 * The JSON to store, or null when the profile is not yet usable. `now` is injected so tests do not sleep.
 * `existing` is what storage holds now; fields this module does not own are carried over.
 */
export function serializeProfile(profile: Profile, now: Date, existing: string | null = null): string | null {
  if (!isProfileComplete(profile)) return null
  const stored: StoredProfile = {
    name: profile.name.trim(),
    email: profile.email.trim(),
    phone: profile.phone.trim(),
    consentAt: now.toISOString(),
  }
  return JSON.stringify({ ...foreignFields(existing), ...stored })
}

// ------------------------------------------------------------- browser store

type Listener = () => void
const listeners = new Set<Listener>()

function emit() {
  for (const listener of listeners) listener()
}

/**
 * The stored profile, as React can subscribe to it. `useSyncExternalStore` needs a
 * snapshot function that returns a stable value, so this returns the raw string and
 * the screen parses it — no effect, no cascading render, no hydration mismatch
 * (the server snapshot is always null).
 */
export function subscribeProfile(listener: Listener): () => void {
  listeners.add(listener)
  const onStorage = (event: StorageEvent) => {
    if (event.key === PROFILE_KEY || event.key === null) listener()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

export function profileSnapshot(): string | null {
  try {
    return window.localStorage.getItem(PROFILE_KEY)
  } catch {
    return null
  }
}

export function serverProfileSnapshot(): null {
  return null
}

/** Write or forget. `null` removes the key; a throw (private mode) leaves memory-only. */
export function writeProfile(raw: string | null): void {
  try {
    if (raw === null) window.localStorage.removeItem(PROFILE_KEY)
    else window.localStorage.setItem(PROFILE_KEY, raw)
  } catch {
    // Nothing stored, nothing to remove — the flow still finishes.
  }
  emit()
}
