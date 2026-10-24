/**
 * @built F-109 confirm-panel logic — what to show, what to ask, what to emit
 *
 * Pure so it can be tested without a DOM. `components/bill-upload.tsx` renders;
 * this file decides:
 *   - which fields are shaky enough that a person must touch them (R2.4)
 *   - whether the parse is clean enough to apply without a click
 *   - the plain-language method sentence
 *   - the single `BillApplied` object the form receives
 *
 * Why "touch": a low-confidence number the user scrolled past is a number the
 * user did not check. Editing or explicitly confirming it is the only way off
 * the list.
 */
import type { BillApplied, BillParseExtras, BillRole } from '@/lib/parse/contract'
import type { BillFuel, BillParse } from '@/lib/parse/types'
import { reannualiseWithFills } from '@/lib/parse/plausibility'

/** A parse as the route returns it. Extras are optional so older parses still render. */
export type ParsedBill = BillParse & Partial<BillParseExtras>

export type CheckField = 'fuel' | 'units' | 'price'

/** Below this a field is shown with a dotted outline and "check?". */
export const FIELD_CHECK_BELOW = 0.6

export const UNIT_BY_FUEL: Record<BillFuel, string> = {
  oil: 'gal',
  propane: 'gal',
  gas: 'therms',
  resistance: 'kWh',
}

/** "901.9399999" -> "902"; small numbers keep one decimal; prices keep cents precision. */
export function formatAmount(value: number): string {
  if (!Number.isFinite(value)) return ''
  if (Math.abs(value) >= 100) return String(Math.round(value))
  return String(Math.round(value * 10) / 10)
}

/** $/unit shown to 3 places, trailing zeros trimmed to at least 2. */
export function formatPrice(value: number): string {
  if (!Number.isFinite(value)) return ''
  const fixed = value.toFixed(3)
  return fixed.endsWith('0') ? value.toFixed(2) : fixed
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** Plain-language method, e.g. "from your 13-month chart". */
export function methodPhrase(bill: ParsedBill, fills?: number | null): string {
  const method = bill.annualisation?.method
  if (!method) return 'printed as a full year on the document'
  switch (method) {
    case 'printed_history':
      return 'from the usage chart on your bill'
    case 'degree_days':
      return 'scaled from this ticket’s degree days'
    case 'tank_cadence':
      return fills ? `one delivery × your ${fills} fills a season` : 'one delivery × your fills a season'
    case 'hdd_scaled': {
      const month = bill.documentDate ? Number(bill.documentDate.slice(5, 7)) : NaN
      return month >= 1 && month <= 12 ? `scaled from one ${MONTHS[month - 1]} bill` : 'scaled from one winter bill'
    }
    case 'monthly_x12':
      return 'one month × 12'
  }
}

/** Annual units with the baseload (hot water, cooking) taken out, when known. */
export function spaceHeatingUnits(annual: number, baseload: number | null | undefined): number {
  if (baseload === null || baseload === undefined || !(baseload > 0)) return annual
  const remainder = annual - baseload
  return remainder > 0 ? remainder : annual
}

export function confirmCopy(outstanding: readonly CheckField[]): { button: string; summary: string | null } {
  if (outstanding.length === 0) return { button: 'Use these numbers', summary: null }
  return {
    button: `Use these numbers (${outstanding.length} to check)`,
    summary: `Check before you use them: ${outstanding.join(', ')}`,
  }
}

export interface Evaluation {
  /** Fields a person must edit or confirm before applying. */
  checks: CheckField[]
  /** Apply with no click: confident, complete, nothing to ask. */
  autoApply: boolean
}

const QUESTION_CODES = new Set(['needs_fills', 'summer_month', 'partial_period'])

export function hasQuestion(bill: ParsedBill): boolean {
  return bill.flags.some((flag) => QUESTION_CODES.has(flag.code))
}

/** Apply the household's fill count to already-read document fields. No second vision call. */
export function withFills(bill: ParsedBill, fills: number, countyFips?: string): ParsedBill | string {
  const result = reannualiseWithFills(bill, fills, { countyFips })
  if (!('value' in result)) return result.message
  const flags = bill.flags.filter((flag) =>
    flag.code !== 'needs_fills' &&
    !(flag.field === 'period' && flag.code === 'partial_period') &&
    !(flag.field === 'units' && flag.code === 'missing'))
  const confidence = Math.min(bill.units.confidence || 1, result.confidence)
  return {
    ...bill,
    units: { value: result.value, confidence, derived: true, unit: bill.units.unit },
    annualisation: result,
    flags,
    ready: bill.price.value !== null && flags.every((flag) =>
      ['low_confidence', 'annualised', 'stale_price', 'not_heating_fuel'].includes(flag.code)),
  }
}

export function evaluateBill(bill: ParsedBill): Evaluation {
  const checks: CheckField[] = []
  const electricity = bill.role === 'electricity'
  if (!electricity && (bill.fuel === null || bill.flags.some((flag) => flag.code === 'not_heating_fuel'))) checks.push('fuel')
  const overallLow = bill.confidence === 'low'
  if (bill.units.value === null || bill.units.confidence < FIELD_CHECK_BELOW || overallLow) checks.push('units')
  if (bill.price.value === null || bill.price.confidence < FIELD_CHECK_BELOW || overallLow) checks.push('price')
  const complete = bill.units.value !== null && bill.price.value !== null && (electricity || bill.fuel !== null)
  return { checks, autoApply: complete && checks.length === 0 && bill.ready && !hasQuestion(bill) }
}

export interface AppliedInput {
  bill: ParsedBill
  fuel: BillFuel | ''
  /** Annual units as typed or defaulted. */
  units: string
  price: string
  /** True when the person changed the units field: then it is sent as typed. */
  unitsEdited: boolean
}

function toNumber(text: string): number {
  return Number(text.replace(/,/g, ''))
}

/** Every number the form needs is present and positive. The click on "Use these numbers" is the confirmation. */
export function canUseNumbers(input: { role: BillRole; fuel: BillFuel | ''; units: string; price: string }): boolean {
  return missingNumberReason(input) === null
}

/** The one-line reason "Use these numbers" is disabled, naming the field, or null when it is open. */
export function missingNumberReason({ role, fuel, units, price }: { role: BillRole; fuel: BillFuel | ''; units: string; price: string }): string | null {
  if (role !== 'electricity' && fuel === '') return 'Add the fuel to continue.'
  if (role !== 'electricity' && !(toNumber(units) > 0)) return 'Add the yearly amount to continue.'
  if (!(toNumber(price) > 0)) return 'Add the price to continue.'
  return null
}

/** The one object the form receives, or null while a required number is missing. */
export function buildApplied({ bill, fuel, units, price, unitsEdited }: AppliedInput): BillApplied | null {
  const role = bill.role ?? 'heating'
  const annual = toNumber(units)
  const rate = toNumber(price)
  if (!Number.isFinite(rate) || rate <= 0) return null
  if (role === 'heating' && (fuel === '' || !Number.isFinite(annual) || annual <= 0)) return null

  const baseNote =
    bill.annualisation?.note ?? (role === 'electricity' ? 'read off your electric bill' : 'read straight off the document')
  let sent = Number.isFinite(annual) && annual > 0 ? annual : 0
  let note = baseNote
  if (role === 'heating' && !unitsEdited) {
    const heat = spaceHeatingUnits(annual, bill.baseloadAnnual)
    if (heat !== annual) {
      sent = heat
      note = `${baseNote} ${formatAmount(bill.baseloadAnnual ?? 0)} ${UNIT_BY_FUEL[fuel as BillFuel]} of year-round use (hot water, cooking) was removed to leave space heating.`
    }
  }

  return {
    role,
    fuel: role === 'electricity' ? null : (fuel as BillFuel),
    units: sent > 0 ? formatAmount(sent) : '',
    price: formatPrice(rate),
    note,
    method: bill.annualisation?.method ?? null,
    methodConfidence: bill.annualisation?.confidence ?? null,
    utility: bill.utility ?? null,
    lowIncomeSignal: bill.lowIncomeSignal ?? false,
    discountLine: bill.discountLine ?? false,
    serviceZip: bill.serviceZip ?? null,
    serviceTown: bill.serviceTown ?? null,
    electricRate: role === 'electricity' ? formatPrice(rate) : null,
  }
}

/**
 * Map a failed fetch onto a message. A Vercel 413/504 is an HTML page, not our
 * JSON envelope, so `response.json()` throws — and "did not reach the reader" is
 * the wrong thing to tell someone whose photo did.
 */
export function messageForNonJson(status: number): string {
  if (status === 413) return 'That upload is too big. Send fewer pages, or take a closer photo, and retry.'
  if (status === 504 || status === 408) return 'The reader took too long. Try again, or type the two numbers.'
  if (status >= 500) return 'The reader hit a problem. Try again, or type the two numbers.'
  return 'The reader sent back something we could not use. Try again, or type the two numbers.'
}
