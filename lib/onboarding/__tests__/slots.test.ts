import { describe, expect, it } from 'vitest'

import type { BillApplied } from '../../parse/contract'
import { isVerdictQueryComplete } from '../../verdict/inputs'
import { defaultInstallYear, tierFor, toQuery } from '../../intake/params'
import {
  EMPTY_SLOT,
  electricEntryErrors,
  electricEntryFacts,
  electricEntryFrom,
  electricForMap,
  heatingEntryFrom,
  heatingFacts,
  isElectricReady,
  isHeatingReady,
  missingNotice,
  slotsReady,
  type ElectricEntry,
  type ElectricSlot,
  type HeatingEntry,
  type HeatingSlot,
} from '../slots'
import { mapProfileFrom, mergeMapProfile } from '../profile-map'

const bill = (over: Partial<BillApplied> = {}): BillApplied => ({
  role: 'heating',
  fuel: 'oil',
  units: '700',
  price: '3.9',
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
const electricBill = (over: Partial<BillApplied> = {}) =>
  bill({ role: 'electricity', fuel: null, units: '7,200', price: '0.31', electricRate: '0.31', utility: 'eversource', ...over })

const heatingBillSlot: HeatingSlot = { kind: 'bill', bill: bill() }
const electricBillSlot: ElectricSlot = { kind: 'bill', bill: electricBill() }
const heatingEntry: HeatingEntry = { fuel: 'propane', units: '600', price: '3.5' }
const heatingManual: HeatingSlot = { kind: 'manual', entry: heatingEntry }
const electricEntry: ElectricEntry = { utility: 'national_grid', rate: '0.28', monthlyKwh: '500' }
const electricManual: ElectricSlot = { kind: 'manual', entry: electricEntry }
const blankElectric: ElectricEntry = { utility: null, rate: '', monthlyKwh: '' }

describe('slotsReady', () => {
  it('opens for all four bill and manual combinations', () => {
    expect(slotsReady(heatingBillSlot, electricBillSlot)).toBe(true)
    expect(slotsReady(heatingBillSlot, electricManual)).toBe(true)
    expect(slotsReady(heatingManual, electricBillSlot)).toBe(true)
    expect(slotsReady(heatingManual, electricManual)).toBe(true)
  })

  it('stays closed while a slot is empty', () => {
    expect(slotsReady(EMPTY_SLOT, EMPTY_SLOT)).toBe(false)
    expect(slotsReady(heatingBillSlot, EMPTY_SLOT)).toBe(false)
    expect(slotsReady(EMPTY_SLOT, electricManual)).toBe(false)
  })

  it('stays closed for unusable typed numbers', () => {
    const noUnits: HeatingSlot = { kind: 'manual', entry: { ...heatingEntry, units: '' } }
    const zeroPrice: HeatingSlot = { kind: 'manual', entry: { ...heatingEntry, price: '0' } }
    const text: HeatingSlot = { kind: 'manual', entry: { ...heatingEntry, units: 'abc' } }
    for (const slot of [noUnits, zeroPrice, text]) expect(isHeatingReady(slot)).toBe(false)
    const badRate: ElectricSlot = { kind: 'manual', entry: { ...electricEntry, rate: '31' } }
    const badKwh: ElectricSlot = { kind: 'manual', entry: { ...electricEntry, monthlyKwh: '-4' } }
    expect(isElectricReady(badRate)).toBe(false)
    expect(isElectricReady(badKwh)).toBe(false)
    expect(slotsReady(heatingBillSlot, badRate)).toBe(false)
  })

  it('accepts an electric entry with every field blank as the statewide average', () => {
    expect(isElectricReady({ kind: 'manual', entry: blankElectric })).toBe(true)
    expect(electricEntryErrors(blankElectric)).toEqual({})
  })
})

describe('missingNotice', () => {
  it('is null when both slots are usable', () => {
    expect(missingNotice(heatingBillSlot, electricManual)).toBeNull()
  })

  it('names only the missing slot', () => {
    expect(missingNotice(EMPTY_SLOT, electricBillSlot)).toBe('Add your heating numbers — upload a bill or type them in.')
    expect(missingNotice(heatingManual, EMPTY_SLOT)).toBe('Add your electricity details — upload a bill or type them in.')
    expect(missingNotice(EMPTY_SLOT, EMPTY_SLOT)).toContain('electricity')
    expect(missingNotice(EMPTY_SLOT, EMPTY_SLOT)).toContain('heating')
  })

  it('asks for a fix, not an upload, when typed numbers are unusable', () => {
    const bad: HeatingSlot = { kind: 'manual', entry: { ...heatingEntry, units: '' } }
    expect(missingNotice(bad, electricBillSlot)).toMatch(/^Fix your heating numbers/)
    expect(missingNotice(bad, electricBillSlot)).not.toMatch(/electricity/)
  })
})

describe('switching to typing', () => {
  it('prefills from the bill that was read', () => {
    const defaults: HeatingEntry = { fuel: 'oil', units: '', price: '4' }
    expect(heatingEntryFrom(heatingBillSlot, defaults)).toEqual({ fuel: 'oil', units: '700', price: '3.9' })
    expect(heatingEntryFrom(EMPTY_SLOT, defaults)).toEqual(defaults)
    expect(heatingEntryFrom(heatingManual, defaults)).toEqual(heatingEntry)
    expect(electricEntryFrom(electricBillSlot)).toEqual({ utility: 'eversource', rate: '0.31', monthlyKwh: '600' })
    expect(electricEntryFrom(EMPTY_SLOT)).toEqual(blankElectric)
  })

  it('drops an implausible read rate rather than prefilling it', () => {
    const slot: ElectricSlot = { kind: 'bill', bill: electricBill({ electricRate: null, price: '9' }) }
    expect(electricEntryFrom(slot).rate).toBe('')
  })
})

describe('facts downstream', () => {
  it('reads heating facts from a bill or valid typed numbers only', () => {
    expect(heatingFacts(heatingBillSlot)).toEqual({ fuel: 'oil', units: '700', price: '3.9' })
    expect(heatingFacts(heatingManual)).toEqual({ fuel: 'propane', units: '600', price: '3.5' })
    expect(heatingFacts({ kind: 'manual', entry: { ...heatingEntry, price: '' } })).toBeNull()
    expect(heatingFacts(EMPTY_SLOT)).toBeNull()
  })

  it('reads electric facts, with a blank rate meaning the average', () => {
    expect(electricEntryFacts(electricManual)).toEqual({ utility: 'national_grid', rate: '0.28', monthlyKwh: 500 })
    expect(electricEntryFacts({ kind: 'manual', entry: blankElectric })).toEqual({
      utility: null,
      rate: '',
      monthlyKwh: null,
    })
    expect(electricEntryFacts(electricBillSlot)).toEqual({ utility: null, rate: '', monthlyKwh: null })
  })

  it('feeds the map profile kWh only when it is known', () => {
    const typed = mapProfileFrom({ town: 'Boston', fuel: 'oil', electric: electricForMap(electricManual), income: 'unsure' })
    expect(typed.kwh).toBe(500)
    expect(typed.utility).toBe('nationalgrid')
    const blank = mapProfileFrom({
      town: 'Boston',
      fuel: 'oil',
      electric: electricForMap({ kind: 'manual', entry: blankElectric }),
      income: 'unsure',
    })
    expect('kwh' in blank).toBe(false)
    const merged = JSON.parse(mergeMapProfile(JSON.stringify({ kwh: 450 }), blank)) as { kwh: number }
    expect(merged.kwh).toBe(450)
    expect(electricForMap(EMPTY_SLOT)).toBeNull()
  })

  it.each([
    ['bill + bill', heatingBillSlot, electricBillSlot],
    ['bill + manual', heatingBillSlot, electricManual],
    ['manual + bill', heatingManual, electricBillSlot],
    ['manual + manual', heatingManual, electricManual],
  ] as const)('%s yields a complete verdict query', (_name, heating, electric) => {
    const facts = heatingFacts(heating)
    const typed = electricEntryFacts(electric)
    expect(facts).not.toBeNull()
    const fuel = facts?.fuel ?? 'oil'
    const query = toQuery({
      fuel,
      units: facts?.units ?? '',
      price: facts?.price ?? '',
      town: 'Boston',
      tier: tierFor('whole', 'unsure', fuel),
      income: 'unsure',
      year: defaultInstallYear(),
      yearBuilt: '',
      sqft: '',
      src: null,
      buildingUnits: null,
      installCost: '',
      method: null,
      methodConfidence: null,
      note: '',
      utility: typed.utility,
      electricRate: typed.rate,
      lowIncome: null,
      weatherizationBonus: false,
      sizingBonus: false,
    })
    expect(isVerdictQueryComplete(Object.fromEntries(query.entries()))).toBe(true)
  })
})
