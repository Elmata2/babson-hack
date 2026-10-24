/**
 * @built F-28 plausibility gate — ranges, unit checks, annualisation, confidence
 *
 * The model reads a document; this file decides whether the numbers it claims are
 * possible. Two rules, both from steering:
 *
 *   - An impossible number is never clamped and never "corrected". It becomes
 *     `null` with a flag that quotes what was read, so the human can fix it.
 *   - A number that covers less than a year is never multiplied into an annual
 *     figure silently. Either the document says it is annual (then it passes),
 *     or the field stays null and the UI asks for the yearly number.
 *
 * The ranges below are sanity bands for a Massachusetts house, not program
 * numbers. They live here, next to the check, and are not used by `lib/calc`.
 */

import { isNotABill } from './prompt'
import type {
  BillField,
  BillFlag,
  BillFuel,
  BillParse,
  BillPeriod,
  BillReadResult,
  Confidence,
} from './types'

/** Sanity bands. A value outside these is a misread, not an unusual household. */
export const RANGES: Record<BillFuel, { units: [number, number]; price: [number, number] }> = {
  // gallons/yr, $/gal
  oil: { units: [50, 4_000], price: [1, 12] },
  propane: { units: [50, 4_000], price: [1, 12] },
  // therms/yr, $/therm
  gas: { units: [100, 5_000], price: [0.3, 5] },
  // kWh/yr, $/kWh
  resistance: { units: [500, 40_000], price: [0.05, 1.5] },
}

/** The unit the document must be in for each fuel. */
export const UNIT_BY_FUEL: Record<BillFuel, string> = {
  oil: 'gal',
  propane: 'gal',
  gas: 'therm',
  resistance: 'kWh',
}

const FUELS: readonly BillFuel[] = ['oil', 'propane', 'gas', 'resistance']
const PERIODS: readonly BillPeriod[] = ['delivery', 'month', 'season', 'year']

const MODEL_CONFIDENCE: Record<string, number> = { high: 0.9, medium: 0.65, low: 0.4 }

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function emptyField(unit: string): BillField {
  return { value: null, confidence: 0, derived: false, unit }
}

function asFuel(value: unknown): BillFuel | null {
  return typeof value === 'string' && (FUELS as readonly string[]).includes(value)
    ? (value as BillFuel)
    : null
}

function asPeriod(value: unknown): BillPeriod {
  return typeof value === 'string' && (PERIODS as readonly string[]).includes(value)
    ? (value as BillPeriod)
    : 'unknown'
}

/** A date the document printed, or null. No dates from the future, none from 1970. */
export function asDocumentDate(value: unknown, now = Date.now()): string | null {
  if (typeof value !== 'string') return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const parsed = Date.parse(`${value}T00:00:00Z`)
  if (!Number.isFinite(parsed)) return null
  const year = new Date(parsed).getUTCFullYear()
  if (year < 2000 || year > new Date(now).getUTCFullYear() + 1) return null
  return value
}

function confidenceOf(scores: number[]): Confidence {
  const floor = scores.length ? Math.min(...scores) : 0
  if (floor >= 0.8) return 'high'
  if (floor >= 0.55) return 'medium'
  return 'low'
}

/**
 * Validate and annualise one document into the calculator's terms.
 * Total function: every input shape returns either a bill or a typed refusal.
 */
export function readBill(json: unknown, now = Date.now()): BillReadResult {
  if (isNotABill(json)) {
    return {
      ok: false,
      refusal: {
        code: 'not_a_bill',
        message: 'That does not look like an energy bill or an oil delivery receipt.',
      },
    }
  }
  if (typeof json !== 'object' || json === null) {
    return {
      ok: false,
      refusal: { code: 'unreadable', message: 'The document could not be read. Enter the two numbers instead.' },
    }
  }

  const record = json as Record<string, unknown>
  const flags: BillFlag[] = []
  const scores: number[] = []
  const fuel = asFuel(record.fuel)
  const unit = typeof record.unit === 'string' ? record.unit : null
  const modelScore = MODEL_CONFIDENCE[String(record.confidence)] ?? 0.5
  const documentPeriod = asPeriod(record.billing_period)
  const documentDate = asDocumentDate(record.document_date, now)

  if (documentDate === null && record.document_date !== null && record.document_date !== undefined) {
    flags.push({
      field: 'document',
      code: 'out_of_range',
      message: 'The date on the document is not a date we can use, so none is shown.',
    })
  }

  // ---- fuel ---------------------------------------------------------------
  if (fuel === null) {
    flags.push({ field: 'fuel', code: 'missing', message: 'The fuel was not legible. Tell us what the house burns.' })
  }

  // ---- quantity -----------------------------------------------------------
  const rawQuantity = finiteNumber(record.quantity)
  let unitsField: BillField = emptyField(fuel ? `${UNIT_BY_FUEL[fuel]}/yr` : 'per year')

  if (rawQuantity === null) {
    flags.push({ field: 'units', code: 'missing', message: 'No quantity was legible on the document.' })
  } else if (fuel !== null && unit !== null && unit !== UNIT_BY_FUEL[fuel]) {
    flags.push({
      field: 'units',
      code: 'unit_mismatch',
      message: `The document is in ${unit}, but ${fuel} is priced per ${UNIT_BY_FUEL[fuel]}.`,
    })
    scores.push(0)
  } else if (fuel !== null) {
    const [low, high] = RANGES[fuel].units
    if (rawQuantity < low || rawQuantity > high) {
      flags.push({
        field: 'units',
        code: 'out_of_range',
        message: `Read ${rawQuantity.toLocaleString('en-US')} ${UNIT_BY_FUEL[fuel]}, which is outside ${low.toLocaleString('en-US')}–${high.toLocaleString('en-US')} for a Massachusetts house. Check the receipt.`,
      })
      scores.push(0)
    } else if (documentPeriod === 'year' || documentPeriod === 'season') {
      unitsField = {
        value: rawQuantity,
        confidence: modelScore,
        derived: false,
        unit: `${UNIT_BY_FUEL[fuel]}/yr`,
      }
      scores.push(modelScore)
    } else if (documentPeriod === 'month') {
      // A monthly bill is one twelfth of a heating year. Multiplying is arithmetic
      // on an assumption, so it is marked derived and the confidence is capped.
      const confidence = Math.min(modelScore, 0.6)
      unitsField = {
        value: rawQuantity * 12,
        confidence,
        derived: true,
        unit: `${UNIT_BY_FUEL[fuel]}/yr`,
      }
      flags.push({
        field: 'units',
        code: 'annualised',
        message: `Monthly figure × 12 — ${(rawQuantity * 12).toLocaleString('en-US')} ${UNIT_BY_FUEL[fuel]} a year. Confirm before it counts.`,
      })
      scores.push(confidence)
    } else {
      // One delivery, or a period we cannot see: we will not guess the year.
      flags.push({
        field: 'period',
        code: 'partial_period',
        message: 'This covers less than a heating year. Give the yearly total from your account, or a full season of deliveries.',
      })
      scores.push(0)
    }
  }

  // ---- price --------------------------------------------------------------
  const rawPrice = finiteNumber(record.price_per_unit)
  let priceField: BillField = emptyField(fuel ? `$/${UNIT_BY_FUEL[fuel]}` : '$/unit')

  if (rawPrice === null) {
    flags.push({ field: 'price', code: 'missing', message: 'No unit price was legible on the document.' })
  } else if (fuel === null) {
    priceField = { value: rawPrice, confidence: 0.4, derived: false, unit: '$/unit' }
    scores.push(0.4)
  } else {
    const [low, high] = RANGES[fuel].price
    if (rawPrice < low || rawPrice > high) {
      flags.push({
        field: 'price',
        code: 'out_of_range',
        message: `Read $${rawPrice.toFixed(2)} per ${UNIT_BY_FUEL[fuel]}, outside $${low}–$${high} for Massachusetts. Check the document.`,
      })
      scores.push(0)
    } else {
      priceField = {
        value: rawPrice,
        confidence: modelScore,
        derived: false,
        unit: `$/${UNIT_BY_FUEL[fuel]}`,
      }
      scores.push(modelScore)
    }
  }

  // ---- the gate -----------------------------------------------------------
  // A bill is ready when both numbers survived and nothing is blocking. Low
  // model confidence alone is not blocking — the user is looking at the numbers
  // and can correct them — but it is flagged.
  const confidence = confidenceOf(scores.length ? scores : [0])
  if (confidence === 'low' && unitsField.value !== null && priceField.value !== null) {
    flags.push({
      field: 'document',
      code: 'low_confidence',
      message: 'This document was hard to read. Check both numbers before continuing.',
    })
  }

  const blocking = flags.some((flag) => flag.code !== 'low_confidence' && flag.code !== 'annualised')
  const bill: BillParse = {
    fuel,
    units: unitsField,
    price: priceField,
    documentPeriod,
    documentDate,
    confidence,
    ready: !blocking && unitsField.value !== null && priceField.value !== null,
    flags,
  }

  if (bill.units.value === null && bill.price.value === null) {
    return {
      ok: false,
      refusal: bill.flags.find((f) => f.code === 'partial_period')
        ? {
            code: 'unreadable',
            message:
              'One delivery is not a winter. Enter the yearly gallons from your account, or photograph a full-season statement.',
          }
        : { code: 'unreadable', message: 'Neither number was legible. Enter them by hand — it takes ten seconds.' },
    }
  }

  return { ok: true, bill }
}
