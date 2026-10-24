/**
 * @built F-28 plausibility gate — ranges, unit checks, annualisation, confidence
 * @built F-26a one oil delivery is enough; a summer bill is not
 *
 * The model reads a document; this file decides whether the numbers it claims are
 * possible. Two rules, both from steering:
 *
 *   - An impossible number is never clamped and never "corrected". It becomes
 *     `null` with a flag that quotes what was read, so the human can fix it.
 *   - A number that covers less than a year is never multiplied into an annual
 *     figure silently. Either the document says it is annual (then it passes), or
 *     `annualise` names the method it used and what it assumed, or the field stays
 *     null and the UI asks for the number only the user has.
 *
 * The ranges below are sanity bands for a Massachusetts house, not program
 * numbers. They live here, next to the check, and are not used by `lib/calc`.
 *
 * Two bands, deliberately: the hard band is a misread detector and blocks; the
 * seasonal band is the DOER telephone survey and only warns, because last winter's
 * oil really was $3.55/gal and a correct receipt must not be rejected.
 */

import { annualise, type AnnualRefusal, type AnnualWarning } from './annualise'
import { DEFAULT_HEAT_YEAR, heatYearFor } from './heat-year'
import { isNotABill } from './prompt'
import type {
  BillField,
  BillFlag,
  BillFuel,
  BillParse,
  BillPeriod,
  BillReadResult,
  Confidence,
  DocumentType,
  RateClass,
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

/**
 * The seasonal band: MA DOER telephone survey, week of 2026-10-19
 * (`.kiro/steering/mass-save-rules.md` §4), with ±10% headroom on the survey
 * range. Outside it the number is **kept** and flagged `stale_price` — this is a
 * hint that the document may be from another season, never a rejection.
 *
 * Gas is the softest of the four: MA gas rates swing widely by season and by
 * distributor, so the band is wide on purpose.
 */
export const SEASONAL_PRICE: Record<BillFuel, [number, number]> = {
  oil: [5.2, 7.2], // survey 5.77–6.82
  propane: [3.0, 5.0], // survey 3.19–5.37, clipped to a round band
  gas: [0.8, 3.5], // soft: varies by distributor and season
  resistance: [0.18, 0.5], // 30.49¢/kWh default, EIA July 2026
}

/** The date the seasonal band speaks for. Shown next to a `stale_price` flag. */
export const SEASONAL_PRICE_AS_OF = '2026-10-19'

/** The unit the document must be in for each fuel. */
export const UNIT_BY_FUEL: Record<BillFuel, string> = {
  oil: 'gal',
  propane: 'gal',
  gas: 'therm',
  resistance: 'kWh',
}

const FUELS: readonly BillFuel[] = ['oil', 'propane', 'gas', 'resistance']
const PERIODS: readonly BillPeriod[] = ['delivery', 'month', 'season', 'year']
const DOCUMENT_TYPES: readonly DocumentType[] = [
  'oil_delivery',
  'propane_delivery',
  'electric_bill',
  'gas_bill',
  'unknown',
]
const RATE_CLASSES: readonly RateClass[] = ['R-1', 'R-2', 'heat pump', 'other']

const MODEL_CONFIDENCE: Record<string, number> = { high: 0.9, medium: 0.65, low: 0.4 }

/** Extra facts the caller knows and the document does not: fills, county, intent. */
export interface ReadBillOptions {
  /**
   * Fills per heating season, confirmed by the user. This is the oil path that
   * needs no degree days: one delivery × the household's own cadence.
   */
  deliveriesPerSeason?: number | null
  /**
   * True when this fuel heats the house. Defaults to true: a bill photographed
   * into a heat-pump verdict is about the heat source. Pass false for a gas bill
   * that only covers cooking and hot water.
   */
  heating?: boolean
  /** The user explicitly wants a flat × 12 (electricity baseload). */
  forceMonthlyX12?: boolean
  /** County FIPS for the heating-year shape. Defaults to Boston (Suffolk). */
  countyFips?: string | null
  /** Overrides the baked table. Tests use this; the app does not. */
  seasonHdd?: number
  monthShares?: readonly number[]
}

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

/** The model's own classification, or null. An unknown label is not a default. */
function asDocumentType(value: unknown): DocumentType | null {
  return typeof value === 'string' && (DOCUMENT_TYPES as readonly string[]).includes(value)
    ? (value as DocumentType)
    : null
}

function asRateClass(value: unknown): RateClass | null {
  return typeof value === 'string' && (RATE_CLASSES as readonly string[]).includes(value)
    ? (value as RateClass)
    : null
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
 * A doubt from the annualiser that must reach the UI but must not block. The
 * estimate keeps its number; the flag is the sentence next to it.
 */
function flagForWarning(warning: AnnualWarning): BillFlag {
  return { field: 'annualisation', code: 'low_confidence', message: warning.message }
}

/**
 * Turn the annualiser's refusal into the flags the UI renders as a question.
 * `needs_fills` gets two: one says what is wrong with the period, the other asks
 * the question that fixes it. The product is a prompt here, not a dead end.
 */
function flagsForRefusal(code: AnnualRefusal['code'], message: string): BillFlag[] {
  if (code === 'out_of_range') return [{ field: 'units', code: 'out_of_range', message }]
  if (code === 'partial_period' || code === 'missing_quantity') {
    return [{ field: 'period', code: 'partial_period', message }]
  }
  if (code === 'needs_fills') {
    return [
      {
        field: 'period',
        code: 'partial_period',
        message: 'This document covers one delivery, not a heating year.',
      },
      { field: 'annualisation', code: 'needs_fills', message },
    ]
  }
  return [{ field: 'annualisation', code, message }]
}

/**
 * Validate and annualise one document into the calculator's terms.
 * Total function: every input shape returns either a bill or a typed refusal.
 *
 * `options` carries what the document cannot know — the household's fill count,
 * the county, whether this fuel is the heat source. `now` stays injectable.
 */
export function readBill(json: unknown, now = Date.now(), options: ReadBillOptions = {}): BillReadResult {
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
  const documentType = asDocumentType(record.document_type)
  const rateClass = asRateClass(record.rate_class)
  /** Only an annualisation of a partial period; null when nothing was annualised. */
  let annualisation: BillParse['annualisation'] = null

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
    // The band is annual. A July gas bill is 18 therms, which is below the annual
    // floor but perfectly ordinary for one month, so the floor scales with the
    // period while the ceiling does not. The annual limit is enforced again on
    // whatever the annualiser produces.
    const [documentLow, documentHigh] =
      documentPeriod === 'year' || documentPeriod === 'season' ? [low, high] : [low / 12, high]
    if (rawQuantity < documentLow || rawQuantity > documentHigh) {
      const periodLabel =
        documentPeriod === 'delivery'
          ? 'one delivery'
          : documentPeriod === 'month'
            ? 'one month'
            : 'a Massachusetts house'
      flags.push({
        field: 'units',
        code: 'out_of_range',
        message: `Read ${rawQuantity.toLocaleString('en-US')} ${UNIT_BY_FUEL[fuel]}, which is outside ${documentLow.toLocaleString('en-US', { maximumFractionDigits: 1 })}–${documentHigh.toLocaleString('en-US')} for ${periodLabel}. Check the receipt.`,
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
    } else {
      // A document that covers less than a year goes through the annualiser, which
      // names its method and refuses rather than inventing a winter. One oil
      // delivery is the common case in Massachusetts and is no longer a dead end.
      const heatYear = heatYearFor(options.countyFips) ?? DEFAULT_HEAT_YEAR
      const heating = options.heating ?? true
      const outcome = annualise({
        fuel,
        quantity: rawQuantity,
        documentPeriod,
        documentDate,
        usageHistory: record.usage_history,
        degreeDays: record.degree_days,
        deliveriesPerSeason: options.deliveriesPerSeason,
        tankSizeGal: record.tank_size_gal,
        heating,
        forceMonthlyX12: options.forceMonthlyX12,
        bounds: [low, high],
        seasonHdd: options.seasonHdd ?? heatYear.seasonHdd,
        monthShares: options.monthShares ?? heatYear.monthShares,
      })

      for (const warning of outcome.warnings) {
        flags.push(flagForWarning(warning))
      }

      if (outcome.estimate !== null) {
        const estimate = outcome.estimate
        const confidence = Math.min(modelScore, estimate.confidence)
        unitsField = {
          value: estimate.value,
          confidence,
          // The year was computed here, not printed as a total — even a printed
          // chart is summed by us. `method` is what distinguishes the two.
          derived: true,
          unit: `${UNIT_BY_FUEL[fuel]}/yr`,
        }
        annualisation = estimate
        scores.push(confidence)
        if (estimate.method !== 'printed_history' && estimate.method !== 'degree_days') {
          flags.push({
            field: 'annualisation',
            code: 'annualised',
            message: `${Math.round(estimate.value).toLocaleString('en-US')} ${UNIT_BY_FUEL[fuel]} a year, from ${estimate.method.replace('_', ' ')}. ${estimate.note} Confirm before it counts.`,
          })
        }
      } else if (outcome.refusal !== null) {
        flags.push(...flagsForRefusal(outcome.refusal.code, outcome.refusal.message))
        scores.push(0)
      }
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

      // Second, warning-only band: this season's DOER survey. Outside it the
      // number is kept — last winter's oil really was $3.55/gal — and the user is
      // told it may be an old receipt. This flag never blocks.
      const [softLow, softHigh] = SEASONAL_PRICE[fuel]
      if (rawPrice < softLow || rawPrice > softHigh) {
        const direction = rawPrice < softLow ? 'below' : 'above'
        const suspicion = rawPrice < softLow ? 'it may be an old receipt' : 'check the decimal'
        flags.push({
          field: 'price',
          code: 'stale_price',
          message: `$${rawPrice.toFixed(2)}/${UNIT_BY_FUEL[fuel]} is ${direction} this season's Massachusetts range ($${softLow.toFixed(2)}–$${softHigh.toFixed(2)}, DOER ${SEASONAL_PRICE_AS_OF}) — ${suspicion}.`,
        })
      }
    }
  }

  // ---- the gate -----------------------------------------------------------
  // A bill is ready when both numbers survived and nothing is blocking. Low
  // model confidence alone is not blocking — the user is looking at the numbers
  // and can correct them — but it is flagged. Neither is an annualisation the
  // annualiser named, nor a price outside this season's band: refusing to move is
  // worse than a labelled estimate.
  const confidence = confidenceOf(scores.length ? scores : [0])
  if (confidence === 'low' && unitsField.value !== null && priceField.value !== null) {
    flags.push({
      field: 'document',
      code: 'low_confidence',
      message: 'This document was hard to read. Check both numbers before continuing.',
    })
  }

  const NON_BLOCKING: readonly BillFlag['code'][] = ['low_confidence', 'annualised', 'stale_price']
  const blocking = flags.some((flag) => !NON_BLOCKING.includes(flag.code))
  const bill: BillParse = {
    fuel,
    units: unitsField,
    price: priceField,
    documentPeriod,
    documentDate,
    confidence,
    ready: !blocking && unitsField.value !== null && priceField.value !== null,
    flags,
    documentType,
    rateClass,
    annualisation,
  }

  if (bill.units.value === null && bill.price.value === null) {
    // The user has nothing to edit but a form. Say which number is missing, and
    // never call a summer bill a winter.
    const summer = bill.flags.find((f) => f.code === 'summer_month')
    const partial = bill.flags.find((f) => f.code === 'partial_period' || f.code === 'needs_fills')
    const message = summer
      ? 'That is a summer bill and no price was legible either — it says nothing about a winter. Photograph a winter bill, or type the yearly total and the price.'
      : partial
        ? 'One delivery is not a winter, and no price was legible either. Enter the yearly gallons from your account, or photograph a full-season statement.'
        : 'Neither number was legible. Enter them by hand — it takes ten seconds.'
    return { ok: false, refusal: { code: 'unreadable', message } }
  }

  return { ok: true, bill }
}
