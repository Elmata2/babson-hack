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
  /** The sentence above the heading, so the person knows where they are. */
  eyebrow: string
}

export const STEPS: readonly StepMeta[] = [
  { id: 'account', label: 'Your profile', eyebrow: 'Step one of four' },
  { id: 'bill', label: 'Your bill', eyebrow: 'Step two of four' },
  { id: 'details', label: 'Your house', eyebrow: 'Step three of four' },
  { id: 'review', label: 'Review', eyebrow: 'Step four of four' },
]

export function stepIndex(step: Step): number {
  const index = STEPS.findIndex((entry) => entry.id === step)
  return index === -1 ? 0 : index
}

export function nextStep(step: Step): Step {
  return STEPS[Math.min(STEPS.length - 1, stepIndex(step) + 1)].id
}

export function previousStep(step: Step): Step {
  return STEPS[Math.max(0, stepIndex(step) - 1)].id
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

/** The JSON to store, or null when the profile is not yet usable. `now` is injected so tests do not sleep. */
export function serializeProfile(profile: Profile, now: Date): string | null {
  if (!isProfileComplete(profile)) return null
  const stored: StoredProfile = {
    name: profile.name.trim(),
    email: profile.email.trim(),
    phone: profile.phone.trim(),
    consentAt: now.toISOString(),
  }
  return JSON.stringify(stored)
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
