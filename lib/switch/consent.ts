/**
 * @built F-144 consent rules — exactly what may be said, to whom, and when
 *
 * R18 is a closed list: a fact that is not on it is never said, and the payload
 * that leaves the browser is checked against the list rather than trusted. R19.6
 * is a clock: calls go out Monday–Friday 08:00–17:00 and Saturday 08:00–12:00
 * Eastern, so this module reads Eastern time regardless of where the server runs.
 *
 * Everything here is pure. `buildFacts` is safe to call in the browser; the route
 * calls `validateOutreachRequest` on the way in, so a hand-crafted POST cannot add
 * a name, a street or a phone number to what an agent is allowed to say.
 */

import type { Fuel } from '../calc/types'
import { ALL_TOWNS } from '../utility'
import type { OutreachRequest, SharedFacts } from './types'

/** R18.3: at most six providers per session. */
export const MAX_PROVIDERS_PER_SESSION = 6

/** R18.1: the default delivery size, editable. */
export const DEFAULT_DELIVERY_GALLONS = 150

/** R19.6: the windows, in Eastern minutes after midnight. */
const WEEKDAY_OPEN = 8 * 60
const WEEKDAY_CLOSE = 17 * 60
const SATURDAY_CLOSE = 12 * 60

/** R18.2, verbatim from the steering rule. Rendered on the consent screen. */
export const NEVER_SAID: readonly string[] = [
  'your name',
  'your street address',
  'your phone number',
  'your email address',
  'your account number',
  'payment details',
  'your income',
]

const FUELS: readonly Fuel[] = ['oil', 'propane', 'gas', 'resistance']
const UNITS_BY_FUEL: Record<Fuel, SharedFacts['unit']> = {
  oil: 'gal',
  propane: 'gal',
  gas: 'therms',
  resistance: 'kWh',
}

const TOP_LEVEL_KEYS = new Set(['kind', 'choice', 'facts', 'providers', 'consentAt', 'demo', 'sessionId'])
const FACT_KEYS = new Set([
  'town',
  'zip',
  'fuel',
  'annualVolume',
  'unit',
  'deliverySizeGal',
  'tankSizeGal',
  'deliveryWindow',
  'sqft',
  'tons',
])

/** One decimal-free rounding rule for gallons: 800 → 800, 824 → 850, 826 → 850. */
export function roundVolume(gallons: number): number {
  if (!Number.isFinite(gallons) || gallons <= 0) return 0
  return Math.round(gallons / 50) * 50
}

/** The actual shape the browser sends, assembled from values already on screen. */
export function buildFacts(input: {
  town: string
  zip?: string | null
  fuel: Fuel | null
  annualUnits: number | null
  sqft?: number | null
  tons?: number | null
  deliverySizeGal?: number
  tankSizeGal?: number | null
  deliveryWindow?: string | null
}): SharedFacts {
  const fuel = input.fuel
  const unit = fuel ? UNITS_BY_FUEL[fuel] : null
  const raw = input.annualUnits
  const annualVolume =
    raw === null || !Number.isFinite(raw) || raw <= 0
      ? null
      : unit === 'gal'
        ? roundVolume(raw)
        : Math.round(raw)

  return {
    town: input.town,
    zip: input.zip?.trim() || null,
    fuel,
    annualVolume,
    unit,
    deliverySizeGal: input.deliverySizeGal ?? DEFAULT_DELIVERY_GALLONS,
    tankSizeGal: input.tankSizeGal ?? null,
    deliveryWindow: input.deliveryWindow?.trim() || null,
    sqft: input.sqft ?? null,
    tons: input.tons ?? null,
  }
}

export interface DisclosureRow {
  label: string
  value: string
}

/**
 * R18.1: the facts the agent may say, as rows the household reads before saying
 * yes. Fuel questions do not need the square footage; installer questions do.
 */
export function disclosureRows(facts: SharedFacts, kind: 'fuel' | 'installer'): DisclosureRow[] {
  const rows: DisclosureRow[] = [{ label: 'Town', value: facts.town }]
  if (facts.zip) rows.push({ label: 'ZIP', value: facts.zip })
  if (facts.fuel) rows.push({ label: 'Heating fuel', value: FUEL_LABEL[facts.fuel] })
  if (facts.annualVolume !== null && facts.unit) {
    rows.push({
      label: 'Annual use',
      value: `${facts.annualVolume.toLocaleString('en-US')} ${facts.unit === 'gal' ? 'gal' : facts.unit}`,
    })
  }

  if (kind === 'fuel') {
    rows.push({ label: 'Delivery size', value: `${facts.deliverySizeGal} gal` })
    if (facts.tankSizeGal !== null) rows.push({ label: 'Tank', value: `${facts.tankSizeGal} gal` })
    if (facts.deliveryWindow) rows.push({ label: 'Delivery window', value: facts.deliveryWindow })
  } else {
    if (facts.sqft !== null) rows.push({ label: 'Home size', value: `${facts.sqft.toLocaleString('en-US')} sqft` })
    if (facts.tons !== null) rows.push({ label: 'Estimated size', value: `${facts.tons.toFixed(1)} tons` })
  }

  return rows
}

const FUEL_LABEL: Record<Fuel, string> = {
  oil: 'heating oil',
  propane: 'propane',
  gas: 'natural gas',
  resistance: 'electric resistance',
}

// ------------------------------------------------------------------- the clock

export interface EasternNow {
  /** `Mon` … `Sun`. */
  weekday: string
  /** Minutes after local midnight. */
  minutes: number
}

const EASTERN = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** Eastern weekday and minutes after midnight. `null` only if Intl misbehaves. */
export function easternParts(date: Date): EasternNow | null {
  const parts = EASTERN.formatToParts(date)
  const weekday = parts.find((part) => part.type === 'weekday')?.value
  const hour = Number(parts.find((part) => part.type === 'hour')?.value)
  const minute = Number(parts.find((part) => part.type === 'minute')?.value)
  if (!weekday || !Number.isFinite(hour) || !Number.isFinite(minute)) return null
  return { weekday, minutes: hour * 60 + minute }
}

/** R19.6: is this instant inside a calling window in Eastern time? */
export function withinBusinessHours(date: Date): boolean {
  const et = easternParts(date)
  if (!et) return false
  if (et.weekday === 'Sun') return false
  if (et.weekday === 'Sat') return et.minutes >= WEEKDAY_OPEN && et.minutes < SATURDAY_CLOSE
  return et.minutes >= WEEKDAY_OPEN && et.minutes < WEEKDAY_CLOSE
}

/** "Monday 8:00 a.m. ET" — the next window a deferred call would use. */
export function nextCallWindow(from: Date): string {
  // Scan half-hour slots: cheap, exact across DST, and no timezone arithmetic to
  // get wrong. A week is always enough to reach a window.
  for (let step = 1; step <= 7 * 48; step += 1) {
    const candidate = new Date(from.getTime() + step * 30 * 60_000)
    if (!withinBusinessHours(candidate)) continue
    const et = easternParts(candidate)
    if (!et) continue
    const hour24 = Math.floor(et.minutes / 60)
    const minute = et.minutes % 60
    const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
    const suffix = hour24 < 12 ? 'a.m.' : 'p.m.'
    return `${WEEKDAY_NAME[et.weekday] ?? et.weekday} ${hour12}:${String(minute).padStart(2, '0')} ${suffix} ET`
  }
  return 'the next business window, Eastern time'
}

const WEEKDAY_NAME: Record<string, string> = {
  Mon: 'Monday',
  Tue: 'Tuesday',
  Wed: 'Wednesday',
  Thu: 'Thursday',
  Fri: 'Friday',
  Sat: 'Saturday',
  Sun: 'Sunday',
}

// --------------------------------------------------------------- validation

export type ConsentValidation =
  | { ok: true; value: OutreachRequest }
  | { ok: false; code: string; message: string }

const EMAIL_LIKE = /\S+@\S+\.\S+/
/** A US phone number, or any run of nine or more digits (an account number). */
const PHONE_LIKE = /(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\b\d{3})[\s.-]?\d{3}[\s.-]?\d{4}\b|\b\d{9,}\b/
const STREET_LIKE = /\b\d+\s+\w+(\s+\w+)?\s+(street|st|avenue|ave|road|rd|lane|ln|drive|dr|boulevard|blvd|court|ct)\b/i

/** Any value or key that would identify a person, for the refusal message. */
export function findIdentifyingField(value: unknown): string | null {
  if (typeof value === 'string') {
    if (EMAIL_LIKE.test(value)) return 'an email address'
    if (PHONE_LIKE.test(value)) return 'a phone or account number'
    if (STREET_LIKE.test(value)) return 'a street address'
    return null
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findIdentifyingField(entry)
      if (found) return found
    }
    return null
  }
  if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      if (/^(name|fullname|firstname|lastname|email|phone|street|address|account|payment|income|ssn)$/i.test(key)) {
        return `a "${key}" field`
      }
      const found = findIdentifyingField(entry)
      if (found) return found
    }
  }
  return null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function fail(code: string, message: string): ConsentValidation {
  return { ok: false, code, message }
}

/**
 * Validate a request body against the closed fact list.
 * Guarantee: any key not on R18.1, any identifying string, more than six
 * providers, or a fact outside its plausible range is refused by name. No default
 * is invented for a missing fact.
 */
export function validateOutreachRequest(body: unknown): ConsentValidation {
  if (!isRecord(body)) return fail('bad_body', 'The request was not a JSON object.')

  const identifying = findIdentifyingField(body)
  if (identifying) {
    return fail(
      'personal_fact',
      `This request carries ${identifying}. A provider may hear town, ZIP, fuel, volume, home size and tons — nothing else.`,
    )
  }

  for (const key of Object.keys(body)) {
    if (!TOP_LEVEL_KEYS.has(key)) return fail('unknown_field', `The field "${key}" is not part of a consent request.`)
  }

  if (body.kind !== 'fuel' && body.kind !== 'installer') {
    return fail('bad_kind', 'The request must ask for fuel or installer quotes.')
  }
  if (body.choice !== 'SHOP_FUEL' && body.choice !== 'SWITCH_HEAT_PUMP') {
    return fail('bad_choice', 'Only SHOP_FUEL and SWITCH_HEAT_PUMP reach a provider.')
  }
  if (body.kind === 'fuel' && body.choice !== 'SHOP_FUEL') {
    return fail('bad_choice', 'A fuel request belongs to SHOP_FUEL.')
  }
  if (body.kind === 'installer' && body.choice !== 'SWITCH_HEAT_PUMP') {
    return fail('bad_choice', 'An installer request belongs to SWITCH_HEAT_PUMP.')
  }

  if (typeof body.consentAt !== 'string' || Number.isNaN(Date.parse(body.consentAt))) {
    return fail('bad_consent_time', 'The consent time is missing or unreadable.')
  }

  if (!isRecord(body.facts)) return fail('bad_facts', 'The request has no facts object.')
  for (const key of Object.keys(body.facts)) {
    if (!FACT_KEYS.has(key)) return fail('unknown_fact', `The fact "${key}" is not one an agent may say.`)
  }

  const facts = body.facts
  const town = facts.town
  if (typeof town !== 'string' || !ALL_TOWNS.includes(town)) {
    return fail('bad_town', 'The town must be one of the 351 Massachusetts municipalities.')
  }

  const zip = facts.zip
  if (zip !== null && (typeof zip !== 'string' || !/^\d{5}$/.test(zip))) {
    return fail('bad_zip', 'A ZIP is exactly five digits, or null.')
  }

  const fuel = facts.fuel
  if (fuel !== null && !FUELS.includes(fuel as Fuel)) {
    return fail('bad_fuel', 'The fuel must be oil, propane, gas, electric resistance, or null.')
  }
  const expectedUnit = fuel === null ? null : UNITS_BY_FUEL[fuel as Fuel]
  if (facts.unit !== expectedUnit) {
    return fail('bad_unit', 'The unit must match the fuel: gal for oil and propane, therms for gas, kWh for resistance.')
  }

  const volume = facts.annualVolume
  if (volume !== null && (!Number.isFinite(volume) || (volume as number) <= 0 || (volume as number) > 200_000)) {
    return fail('bad_volume', 'The annual volume must be a positive number, or null.')
  }

  const delivery = facts.deliverySizeGal
  if (!Number.isFinite(delivery) || (delivery as number) < 50 || (delivery as number) > 1_000) {
    return fail('bad_delivery_size', 'The delivery size must be between 50 and 1,000 gallons.')
  }

  const tank = facts.tankSizeGal
  if (tank !== null && (!Number.isFinite(tank) || (tank as number) < 0 || (tank as number) > 5_000)) {
    return fail('bad_tank_size', 'The tank size must be between 0 and 5,000 gallons, or null.')
  }

  const window = facts.deliveryWindow
  if (window !== null) {
    if (typeof window !== 'string') return fail('bad_window', 'The delivery window must be text, or null.')
    if (window.length > 40) return fail('bad_window', 'Keep the delivery window to 40 characters.')
    if (findIdentifyingField(window)) {
      return fail('personal_fact', 'The delivery window must not contain an address, email or phone number.')
    }
  }

  const sqft = facts.sqft
  if (sqft !== null && (!Number.isFinite(sqft) || (sqft as number) < 100 || (sqft as number) > 20_000)) {
    return fail('bad_sqft', 'The home size must be between 100 and 20,000 sqft, or null.')
  }

  const tons = facts.tons
  if (tons !== null && (!Number.isFinite(tons) || (tons as number) < 0.5 || (tons as number) > 10)) {
    return fail('bad_tons', 'The estimated size must be between 0.5 and 10 tons, or null.')
  }

  if (!Array.isArray(body.providers) || body.providers.length === 0) {
    return fail('no_providers', 'Choose at least one provider, or use the switch kit instead.')
  }
  if (body.providers.length > MAX_PROVIDERS_PER_SESSION) {
    return fail('too_many_providers', `At most ${MAX_PROVIDERS_PER_SESSION} calls per session.`)
  }

  const providers: OutreachRequest['providers'] = []
  const seen = new Set<string>()
  for (const entry of body.providers) {
    if (!isRecord(entry)) return fail('bad_provider', 'Each provider needs an id and a channel.')
    const id = entry.id
    const channel = entry.channel
    if (typeof id !== 'string' || id.trim() === '' || id.length > 60) {
      return fail('bad_provider', 'Each provider needs a short id.')
    }
    if (channel !== 'email' && channel !== 'phone') {
      return fail('bad_provider_channel', 'A provider channel is email or phone.')
    }
    if (seen.has(id)) return fail('duplicate_provider', `"${id}" was listed twice.`)
    seen.add(id)
    providers.push({ id, channel })
  }

  return {
    ok: true,
    value: {
      kind: body.kind,
      choice: body.choice,
      facts: {
        town,
        zip: (zip as string | null) ?? null,
        fuel: (fuel as Fuel | null) ?? null,
        annualVolume: (volume as number | null) ?? null,
        unit: (facts.unit as SharedFacts['unit']) ?? null,
        deliverySizeGal: delivery as number,
        tankSizeGal: (tank as number | null) ?? null,
        deliveryWindow: (window as string | null) ?? null,
        sqft: (sqft as number | null) ?? null,
        tons: (tons as number | null) ?? null,
      },
      providers,
      consentAt: body.consentAt,
    },
  }
}
