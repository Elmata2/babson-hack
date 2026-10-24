/**
 * @built F-137 the wizard's rules, tested where they are decided
 *
 * The failure these tests exist to prevent is a screen that lets someone walk to
 * the verdict with an email that cannot receive anything, a town that is not in
 * Massachusetts, or a "0" in the units field. Each of those reaches `lib/calc`
 * as an invented number.
 */

import { describe, expect, it } from 'vitest'

import {
  PROFILE_KEY,
  STEPS,
  canLeaveDetails,
  isProfileComplete,
  nextStep,
  normalizePhone,
  positiveNumber,
  previousStep,
  readStoredProfile,
  serializeProfile,
  withoutProfile,
  stepIndex,
  validateProfile,
  type Profile,
} from '../flow'

const VALID: Profile = {
  name: 'Alex Rivera',
  email: 'alex@example.com',
  phone: '',
  consent: true,
}

const TOWNS = ['Boston', 'Worcester', 'Framingham'] as const

describe('a usable profile', () => {
  it('accepts a name, an email and a consent tick with no phone', () => {
    expect(validateProfile(VALID)).toEqual({})
    expect(isProfileComplete(VALID)).toBe(true)
  })

  it('requires at least two characters of name, after trimming', () => {
    expect(validateProfile({ ...VALID, name: ' A ' }).name).toBeTruthy()
    expect(validateProfile({ ...VALID, name: '  Al  ' })).toEqual({})
  })

  it('refuses an address without an @ or a domain dot', () => {
    expect(validateProfile({ ...VALID, email: 'alex.example.com' }).email).toBeTruthy()
    expect(validateProfile({ ...VALID, email: 'alex@example' }).email).toBeTruthy()
    expect(validateProfile({ ...VALID, email: 'alex @example.com' }).email).toBeTruthy()
    expect(validateProfile({ ...VALID, email: 'alex@example.co' })).toEqual({})
  })

  it('keeps the email case as typed rather than inventing a different mailbox', () => {
    const raw = serializeProfile({ ...VALID, email: 'Alex@Example.COM' }, new Date('2026-10-24T12:00:00Z'))
    expect(raw).not.toBeNull()
    expect(readStoredProfile(raw)?.email).toBe('Alex@Example.COM')
  })

  it('accepts the ways people type a US number, and refuses the rest', () => {
    expect(normalizePhone('(617) 555-0142')).toBe('6175550142')
    expect(normalizePhone('617.555.0142')).toBe('6175550142')
    expect(normalizePhone('+1 617 555 0142')).toBe('6175550142')
    expect(normalizePhone('617-555-014')).toBeNull()
    expect(validateProfile({ ...VALID, phone: '617 five' }).phone).toBeTruthy()
    expect(validateProfile({ ...VALID, phone: '(617) 555-0142' })).toEqual({})
  })

  it('will not proceed without the consent tick', () => {
    expect(validateProfile({ ...VALID, consent: false }).consent).toBeTruthy()
    expect(isProfileComplete({ ...VALID, consent: false })).toBe(false)
  })
})

describe('storing the profile', () => {
  const now = new Date('2026-10-24T16:30:00.000Z')

  it('round-trips a valid profile and records when consent was given', () => {
    const raw = serializeProfile({ ...VALID, phone: ' (617) 555-0142 ' }, now)
    expect(raw).not.toBeNull()
    expect(readStoredProfile(raw)).toEqual({
      name: 'Alex Rivera',
      email: 'alex@example.com',
      phone: '(617) 555-0142',
      consentAt: now.toISOString(),
    })
  })

  it('refuses to write a profile that would not pass validation tomorrow', () => {
    expect(serializeProfile({ ...VALID, email: 'nope' }, now)).toBeNull()
    expect(serializeProfile({ ...VALID, consent: false }, now)).toBeNull()
  })

  it('ignores an empty key, garbage JSON and a record without consent', () => {
    expect(readStoredProfile(null)).toBeNull()
    expect(readStoredProfile('')).toBeNull()
    expect(readStoredProfile('{')).toBeNull()
    expect(readStoredProfile('"a string"')).toBeNull()
    expect(readStoredProfile(JSON.stringify({ name: 'Alex', email: 'alex@example.com', phone: '' }))).toBeNull()
    expect(
      readStoredProfile(
        JSON.stringify({ name: 'Alex', email: 'alex@example.com', phone: '', consentAt: 'not a date' }),
      ),
    ).toBeNull()
  })

  it('drops unknown keys instead of carrying them into the next build', () => {
    const raw = JSON.stringify({
      name: 'Alex',
      email: 'alex@example.com',
      phone: '',
      consentAt: now.toISOString(),
      ssn: '000-00-0000',
      plan: 'gold',
    })
    expect(readStoredProfile(raw)).toEqual({
      name: 'Alex',
      email: 'alex@example.com',
      phone: '',
      consentAt: now.toISOString(),
    })
  })

  it('names one versioned key, so a shape change starts clean', () => {
    expect(PROFILE_KEY).toBe('switchpoint.profile.v1')
  })
})

describe('the numbers the details step may leave with', () => {
  it('reads thousands separators and stray spaces, and refuses zero or words', () => {
    expect(positiveNumber('1,200')).toBe(1200)
    expect(positiveNumber(' 800 ')).toBe(800)
    expect(positiveNumber('0')).toBeNull()
    expect(positiveNumber('')).toBeNull()
    expect(positiveNumber('abc')).toBeNull()
  })

  it('needs a Massachusetts town, a known fuel and two positive numbers', () => {
    const input = { fuel: 'oil', units: '800', price: '6.23', town: 'Worcester', towns: TOWNS }
    expect(canLeaveDetails(input)).toBe(true)
    expect(canLeaveDetails({ ...input, town: 'Providence' })).toBe(false)
    expect(canLeaveDetails({ ...input, town: '' })).toBe(false)
    expect(canLeaveDetails({ ...input, fuel: 'wood' })).toBe(false)
    expect(canLeaveDetails({ ...input, units: '0' })).toBe(false)
    expect(canLeaveDetails({ ...input, price: '' })).toBe(false)
  })
})

describe('the step order', () => {
  it('runs account → bill → details → review', () => {
    expect(STEPS.map((entry) => entry.id)).toEqual(['account', 'bill', 'details', 'review'])
    expect(nextStep('account')).toBe('bill')
    expect(nextStep('bill')).toBe('details')
    expect(nextStep('details')).toBe('review')
  })

  it('clamps at both ends instead of running off the list', () => {
    expect(nextStep('review')).toBe('review')
    expect(previousStep('account')).toBe('account')
    expect(previousStep('review')).toBe('details')
  })

  it('counts from one for the progress text', () => {
    expect(stepIndex('account')).toBe(0)
    expect(stepIndex('review')).toBe(3)
  })

  it('keeps fields it does not own when it writes or forgets, so the map profile survives', () => {
    const existing = JSON.stringify({ town: 'Worcester', fuel: 'oil', name: 'Old', email: 'old@example.com', phone: '', consentAt: '2026-01-01T00:00:00.000Z' })
    const raw = serializeProfile(VALID, new Date('2026-10-24T12:00:00Z'), existing)
    const stored = JSON.parse(raw as string)
    expect(stored.town).toBe('Worcester')
    expect(stored.fuel).toBe('oil')
    expect(stored.name).toBe(VALID.name)
    expect(JSON.parse(withoutProfile(existing) as string)).toEqual({ town: 'Worcester', fuel: 'oil' })
    expect(withoutProfile(serializeProfile(VALID, new Date()))).toBeNull()
    expect(withoutProfile(null)).toBeNull()
  })
})
