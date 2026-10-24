import { plausibleElectricRate } from '../intake/params'
import type { BillApplied, BillUtility } from '../parse/contract'
import type { BillFuel } from '../parse/types'
import { monthlyKwh } from './profile-map'

export const FUEL_VALUES: readonly BillFuel[] = ['oil', 'propane', 'gas', 'resistance']

export interface HeatingEntry {
  fuel: BillFuel
  units: string
  price: string
}

export interface ElectricEntry {
  utility: BillUtility | null
  /** All-in $/kWh. Empty means the statewide average. */
  rate: string
  /** Typed monthly kWh. Empty means unknown. */
  monthlyKwh: string
}

export type Slot<Entry> =
  | { kind: 'empty' }
  | { kind: 'bill'; bill: BillApplied }
  | { kind: 'manual'; entry: Entry }

export type HeatingSlot = Slot<HeatingEntry>
export type ElectricSlot = Slot<ElectricEntry>

export const EMPTY_SLOT = { kind: 'empty' } as const

function positive(raw: string): number | null {
  const value = Number(raw.replace(/[,\s]/g, ''))
  return Number.isFinite(value) && value > 0 ? value : null
}

export type HeatingEntryErrors = Partial<Record<'units' | 'price', string>>
export type ElectricEntryErrors = Partial<Record<'rate' | 'monthlyKwh', string>>

export function heatingEntryErrors(entry: HeatingEntry): HeatingEntryErrors {
  const errors: HeatingEntryErrors = {}
  if (positive(entry.units) === null) errors.units = 'Enter a number above zero.'
  if (positive(entry.price) === null) errors.price = 'Enter a price above zero.'
  return errors
}

export function electricEntryErrors(entry: ElectricEntry): ElectricEntryErrors {
  const errors: ElectricEntryErrors = {}
  if (entry.rate.trim() !== '' && plausibleElectricRate(entry.rate) === null) {
    errors.rate = 'Enter dollars per kWh, like 0.31, or leave it empty.'
  }
  if (entry.monthlyKwh.trim() !== '' && positive(entry.monthlyKwh) === null) {
    errors.monthlyKwh = 'Enter kWh above zero, or leave it empty.'
  }
  return errors
}

function heatingEntryValid(entry: HeatingEntry): boolean {
  return FUEL_VALUES.includes(entry.fuel) && Object.keys(heatingEntryErrors(entry)).length === 0
}

export function isHeatingReady(slot: HeatingSlot): boolean {
  return slot.kind === 'bill' || (slot.kind === 'manual' && heatingEntryValid(slot.entry))
}

export function isElectricReady(slot: ElectricSlot): boolean {
  return slot.kind === 'bill' || (slot.kind === 'manual' && Object.keys(electricEntryErrors(slot.entry)).length === 0)
}

/** Continue is open when each slot holds a read bill or valid typed numbers, in any combination. */
export function slotsReady(heating: HeatingSlot, electric: ElectricSlot): boolean {
  return isHeatingReady(heating) && isElectricReady(electric)
}

/** One sentence naming only what is still missing, or null when both slots are usable. */
export function missingNotice(heating: HeatingSlot, electric: ElectricSlot): string | null {
  const parts: string[] = []
  if (!isElectricReady(electric)) {
    parts.push(
      electric.kind === 'manual'
        ? 'Fix your electricity numbers — the rate or the kWh is not a usable number'
        : 'Add your electricity details — upload a bill or type them in',
    )
  }
  if (!isHeatingReady(heating)) {
    parts.push(
      heating.kind === 'manual'
        ? 'Fix your heating numbers — the yearly amount and the price each need a number above zero'
        : 'Add your heating numbers — upload a bill or type them in',
    )
  }
  return parts.length === 0 ? null : `${parts.join('. ')}.`
}

export function billOf(slot: Slot<unknown>): BillApplied | null {
  return slot.kind === 'bill' ? slot.bill : null
}

/** The starting values for typing by hand: what a bill read when there is one, else the defaults. */
export function heatingEntryFrom(slot: HeatingSlot, defaults: HeatingEntry): HeatingEntry {
  if (slot.kind === 'manual') return slot.entry
  if (slot.kind === 'bill') {
    return { fuel: slot.bill.fuel ?? defaults.fuel, units: slot.bill.units, price: slot.bill.price }
  }
  return defaults
}

const NO_ELECTRIC_ENTRY: ElectricEntry = { utility: null, rate: '', monthlyKwh: '' }

export function electricEntryFrom(slot: ElectricSlot): ElectricEntry {
  if (slot.kind === 'manual') return slot.entry
  if (slot.kind === 'bill') {
    const rate = slot.bill.electricRate ?? slot.bill.price
    const kwh = monthlyKwh(slot.bill)
    return {
      utility: slot.bill.utility,
      rate: plausibleElectricRate(rate) === null ? '' : rate,
      monthlyKwh: kwh === null ? '' : String(kwh),
    }
  }
  return NO_ELECTRIC_ENTRY
}

export interface HeatingFacts {
  fuel: BillFuel | null
  units: string
  price: string
}

/** The fuel, yearly units and price the verdict reads, or null while the slot cannot give them. */
export function heatingFacts(slot: HeatingSlot): HeatingFacts | null {
  if (slot.kind === 'bill') return { fuel: slot.bill.fuel, units: slot.bill.units, price: slot.bill.price }
  if (slot.kind === 'manual' && heatingEntryValid(slot.entry)) {
    return { fuel: slot.entry.fuel, units: slot.entry.units.trim(), price: slot.entry.price.trim() }
  }
  return null
}

export interface ElectricFacts {
  utility: BillUtility | null
  /** Plausible $/kWh as typed or read, else empty (statewide average). */
  rate: string
  monthlyKwh: number | null
}

/** What a typed electric entry contributes; a bill contributes through its own fields instead. */
export function electricEntryFacts(slot: ElectricSlot): ElectricFacts {
  if (slot.kind === 'manual' && Object.keys(electricEntryErrors(slot.entry)).length === 0) {
    const kwh = positive(slot.entry.monthlyKwh)
    return {
      utility: slot.entry.utility,
      rate: plausibleElectricRate(slot.entry.rate) === null ? '' : slot.entry.rate.trim(),
      monthlyKwh: kwh === null ? null : Math.round(kwh),
    }
  }
  return { utility: null, rate: '', monthlyKwh: null }
}

/** The electric slot as `mapProfileFrom` reads it: a bill's own fields, or typed monthly kWh as a yearly figure. */
export function electricForMap(slot: ElectricSlot): Pick<BillApplied, 'units' | 'utility'> | null {
  if (slot.kind === 'bill') return slot.bill
  const facts = electricEntryFacts(slot)
  if (slot.kind === 'empty') return null
  return { units: facts.monthlyKwh === null ? '' : String(facts.monthlyKwh * 12), utility: facts.utility }
}
