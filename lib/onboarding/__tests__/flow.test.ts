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
  anyDetailsNeeded,
  billsReady,
  detailsNeeds,
  eyebrowFor,
  fuelFromBill,
  lowIncomeDetected,
  lowIncomeFlag,
  pickUtility,
  serviceTownFrom,
  visibleSteps,
  canLeaveDetails,
  isProfileComplete,
  nextStep,
  normalizePhone,
  positiveNumber,
  previousStep,
  readStoredProfile,
  serializeProfile,
  withoutProfile,
  hasSingleSponsor,
  misplacedBillNote,
  townMismatch,
  validateProfile,
  type Profile,
} from '../flow'
import type { BillApplied } from '../../parse/contract'

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

describe('two bills', () => {
  const bill = (over: Partial<BillApplied>): BillApplied => ({
    role: 'heating',
    fuel: 'gas',
    units: '700',
    price: '1.9',
    note: '',
    method: null,
    methodConfidence: null,
    utility: null,
    lowIncomeSignal: false,
    serviceZip: null,
    serviceTown: null,
    electricRate: null,
    ...over,
  })
  const electric = (over: Partial<BillApplied> = {}) => bill({ role: 'electricity', fuel: null, ...over })
  const none = { heatingByHand: false, electricityByHand: false }

  it('continues only when both bills are in, read or entered by hand', () => {
    expect(billsReady({ heating: bill({}), electricity: null, ...none })).toBe(false)
    expect(billsReady({ heating: null, electricity: electric(), ...none })).toBe(false)
    expect(billsReady({ heating: bill({}), electricity: electric(), ...none })).toBe(true)
    expect(billsReady({ heating: null, electricity: null, heatingByHand: true, electricityByHand: true })).toBe(true)
  })

  it('reads the town from either bill and prefers the electric one', () => {
    const heating = bill({ serviceTown: 'Worcester' })
    expect(serviceTownFrom([electric({ serviceTown: 'boston' }), heating], TOWNS)).toBe('Boston')
    expect(serviceTownFrom([null, heating], TOWNS)).toBe('Worcester')
    expect(serviceTownFrom([bill({ serviceTown: 'Atlantis' }), null], TOWNS)).toBeNull()
  })

  it('takes the fuel from the heating bill and asks only without one', () => {
    expect(fuelFromBill(bill({ fuel: 'oil' }))).toBe('oil')
    expect(fuelFromBill(null)).toBeNull()
  })

  it('detects the discount signal from either bill', () => {
    expect(lowIncomeDetected([bill({}), bill({ lowIncomeSignal: true })])).toBe(true)
    expect(lowIncomeFlag([bill({}), null])).toBe(false)
    expect(lowIncomeFlag([null, null])).toBeNull()
  })

  it('picks a canonical electric utility and never a fuel dealer', () => {
    expect(pickUtility(bill({ utility: 'national_grid' }), bill({ utility: 'eversource' }))).toBe('national_grid')
    expect(pickUtility(null, bill({ utility: 'oil_dealer' }), true)).toBeNull()
    expect(pickUtility(bill({ utility: 'other' }), null)).toBe('other')
  })

  it('falls back to the heating utility only without an electric bill in a single-sponsor town', () => {
    expect(pickUtility(null, bill({ utility: 'eversource' }), true)).toBe('eversource')
    expect(pickUtility(null, bill({ utility: 'eversource' }), false)).toBeNull()
    expect(pickUtility(electric({ utility: null }), bill({ utility: 'eversource' }), true)).toBeNull()
  })

  it('knows whether a town has one sponsor', () => {
    expect(hasSingleSponsor('Boston')).toBe(true)
    expect(hasSingleSponsor('Atlantis')).toBe(false)
  })

  it('reports two different bill towns, electric first', () => {
    expect(townMismatch(electric({ serviceTown: 'Boston' }), bill({ serviceTown: 'Worcester' }), TOWNS)).toEqual({
      used: 'Boston',
      other: 'Worcester',
    })
    expect(townMismatch(electric({ serviceTown: 'Boston' }), bill({ serviceTown: 'boston' }), TOWNS)).toBeNull()
    expect(townMismatch(electric({ serviceTown: 'Boston' }), bill({ serviceTown: null }), TOWNS)).toBeNull()
  })

  it('names the slot a misplaced bill went to', () => {
    expect(misplacedBillNote('heating', 'electricity')).toBe('That looks like an electric bill — we put it in slot 1.')
    expect(misplacedBillNote('electricity', 'heating')).toBe('That looks like a heating bill — we put it in slot 2.')
    expect(misplacedBillNote('heating', 'heating')).toBeNull()
  })

  it('skips the house step when the bills answered everything', () => {
    expect(anyDetailsNeeded(detailsNeeds({ townRead: true, heating: bill({}), incomeDetected: true, numbersReady: true }))).toBe(false)
    expect(detailsNeeds({ townRead: true, heating: bill({}), incomeDetected: false, numbersReady: true }).income).toBe(true)
    expect(detailsNeeds({ townRead: false, heating: bill({}), incomeDetected: true, numbersReady: true }).town).toBe(true)
    const unusable = detailsNeeds({ townRead: true, heating: bill({}), incomeDetected: true, numbersReady: false })
    expect(anyDetailsNeeded(unusable)).toBe(true)
    const byHand = detailsNeeds({ townRead: true, heating: null, incomeDetected: true, numbersReady: true })
    expect(byHand.fuel && byHand.numbers).toBe(true)
  })

  it('walks the visible steps only', () => {
    expect(visibleSteps(false).map((entry) => entry.id)).toEqual(['account', 'bill', 'review'])
    expect(nextStep('bill', false)).toBe('review')
    expect(previousStep('review', false)).toBe('bill')
    expect(eyebrowFor('review', false)).toBe('Step 3 of 3')
    expect(eyebrowFor('review', true)).toBe('Step 4 of 4')
  })
})
