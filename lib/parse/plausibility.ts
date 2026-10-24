/**
 * @built F-28 plausibility gate — ranges, unit checks, annualisation, confidence
 * @built F-26a one oil delivery is enough; a summer bill is not
 * @built F-102 v3 validator: price computed in code, CCF to therms, role, low-income signal, season is not a year
 * @built F-103 period-weighted annualisation inputs, county name, `reannualiseWithFills`
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
import type { BillRole, BillUtility } from './contract'
import { DEFAULT_HEAT_YEAR, heatYearFor, placeNameFor } from './heat-year'
import { isNotABill } from './prompt'
import type {
  BillField,
  BillFlag,
  BillFuel,
  BillParse,
  BillPeriod,
  BillReadResult,
  AnnualEstimate,
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
const RATE_CLASSES: readonly RateClass[] = ['R-1', 'R-2', 'R-3', 'R-4', 'heat pump', 'other']
const UTILITIES: readonly BillUtility[] = [
  'eversource', 'national_grid', 'unitil', 'liberty', 'berkshire_gas', 'municipal',
  'oil_dealer', 'propane_dealer', 'other',
]

/** Gas distributors print CCF; a therm is CCF × the heat content they print on the bill. */
export const DEFAULT_THERM_FACTOR = 1.037
/** A period shorter than this is a season or a month, not a year. */
export const FULL_YEAR_MIN_DAYS = 330
const DAY_MS = 86_400_000

const MODEL_CONFIDENCE: Record<string, number> = { high: 0.9, medium: 0.65, low: 0.4 }

/** Extra facts the caller knows and the document does not: fills, county, intent. */
export interface ReadBillOptions {
  /**
   * Fills per heating season, confirmed by the user. This is the oil path that
   * needs no degree days: one delivery × the household's own cadence.
   */
  deliveriesPerSeason?: number | null
  /**
   * True when this fuel heats the house. For an electric bill, anything but
   * `true` (and a bill that does not say it heats the home) makes it the
   * `electricity` role. For a gas bill a printed R-3/R-4 outranks this and R-1/R-2
   * means not heating; with no class it defaults to true.
   */
  heating?: boolean
  /** The user explicitly wants a flat × 12 (electricity baseload). */
  forceMonthlyX12?: boolean
  /** County FIPS for the heating-year shape. Defaults to Boston (Suffolk) weather, named "Massachusetts". */
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

function asUtility(value: unknown): BillUtility | null {
  return typeof value === 'string' && (UTILITIES as readonly string[]).includes(value)
    ? (value as BillUtility)
    : null
}

function asString(value: unknown, max = 80): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 && trimmed.length <= max ? trimmed : null
}

/** Dollars as printed: finite and not negative. A credit is not a total. */
function asMoney(value: unknown): number | null {
  const n = finiteNumber(value)
  return n !== null && n >= 0 ? n : null
}

function asZip(value: unknown): string | null {
  return typeof value === 'string' && /^\d{5}$/.test(value.trim()) ? value.trim() : null
}

function spanDays(start: string | null, end: string | null): number | null {
  if (start === null || end === null) return null
  const a = Date.parse(`${start}T00:00:00Z`)
  const b = Date.parse(`${end}T00:00:00Z`)
  return b >= a ? Math.round((b - a) / DAY_MS) + 1 : null
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
  const modelFuel = asFuel(record.fuel)
  let unit = typeof record.unit === 'string' ? record.unit : null
  const modelScore = MODEL_CONFIDENCE[String(record.confidence)] ?? 0.5
  const rawPeriod = asPeriod(record.billing_period)
  const documentDate = asDocumentDate(record.document_date, now)
  const documentType = asDocumentType(record.document_type)
  const rateClass = asRateClass(record.rate_class)
  const periodStart = asDocumentDate(record.period_start, now)
  const periodEnd = asDocumentDate(record.period_end, now)
  const printedDays = finiteNumber(record.days)
  const days =
    printedDays !== null && Number.isInteger(printedDays) && printedDays >= 1 && printedDays <= 400
      ? printedDays
      : spanDays(periodStart, periodEnd)

  // A document the model could not classify and read no fuel from has nothing
  // for us to work with; say so the same way as a non-bill.
  if (documentType === 'unknown' && modelFuel === null) {
    return {
      ok: false,
      refusal: {
        code: 'not_a_bill',
        message: 'That does not look like an energy bill or an oil delivery receipt.',
      },
    }
  }

  // ---- role ---------------------------------------------------------------
  // An electric bill is the household's electricity, not its heating fuel, unless
  // the caller (or the bill's own heating rate) says it heats the home.
  const billSaysHeats = record.heat_source_hint === 'this bill heats the home'
  const heatingIntent = options.heating ?? (billSaysHeats ? true : undefined)
  const role: BillRole =
    documentType === 'electric_bill' && heatingIntent !== true && rateClass !== 'heat pump'
      ? 'electricity'
      : 'heating'
  // Output fuel: none for the electricity role. Band fuel: what the bands judge.
  // An electric bill that does heat the home is resistance/heat-pump electricity.
  const heatingFuel: BillFuel | null = modelFuel ?? (documentType === 'electric_bill' ? 'resistance' : null)
  const fuel = role === 'electricity' ? null : heatingFuel
  const bandFuel: BillFuel | null = role === 'electricity' ? 'resistance' : heatingFuel
  // Gas R-3/R-4 is the heating rate; R-1/R-2 is cooking and hot water.
  const gasHeatingByClass =
    bandFuel === 'gas' || documentType === 'gas_bill'
      ? rateClass === 'R-3' || rateClass === 'R-4'
        ? true
        : rateClass === 'R-1' || rateClass === 'R-2'
          ? false
          : null
      : null
  const heating =
    role === 'electricity' ? false : (gasHeatingByClass ?? options.heating ?? true)
  const lowIncomeSignal =
    rateClass === 'R-2' || rateClass === 'R-4' || record.discount_line_present === true
  // `season` is a partial period unless the dates span nearly a year.
  const span = spanDays(periodStart, periodEnd) ?? days
  const documentPeriod: BillPeriod = rawPeriod
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
  if (role === 'heating' && fuel === null) {
    flags.push({ field: 'fuel', code: 'missing', message: 'The fuel was not legible. Tell us what the house burns.' })
  }
  if (bandFuel === 'gas' && gasHeatingByClass === false) {
    flags.push({
      field: 'fuel',
      code: 'not_heating_fuel',
      message: `Rate class ${rateClass} is a non-heating gas rate: gas here is cooking and hot water, not the heat source.`,
    })
  }

  // ---- quantity -----------------------------------------------------------
  let rawQuantity = finiteNumber(record.quantity)
  let thermAssumption: string | null = null
  // CCF is volume; every band and price here is per therm. Convert in code with
  // the factor the bill printed, else the standard one — and say which.
  if (rawQuantity !== null && unit !== null && unit.toLowerCase() === 'ccf') {
    const printed = finiteNumber(record.therm_factor)
    const factor = printed !== null && printed > 0.9 && printed < 1.2 ? printed : DEFAULT_THERM_FACTOR
    const therms = rawQuantity * factor
    thermAssumption =
      factor === printed
        ? `Converted ${rawQuantity} CCF to ${therms.toFixed(1)} therms with the therm factor printed on the bill (${factor}).`
        : `Converted ${rawQuantity} CCF to ${therms.toFixed(1)} therms with the standard factor ${DEFAULT_THERM_FACTOR}; the bill's own factor was not legible.`
    rawQuantity = therms
    unit = 'therm'
    flags.push({ field: 'units', code: 'low_confidence', message: thermAssumption })
  }
  const documentQuantity = rawQuantity
  let unitsField: BillField = emptyField(bandFuel ? `${UNIT_BY_FUEL[bandFuel]}/yr` : 'per year')

  if (rawQuantity === null) {
    flags.push({ field: 'units', code: 'missing', message: 'No quantity was legible on the document.' })
  } else if (bandFuel !== null && unit !== null && unit !== UNIT_BY_FUEL[bandFuel]) {
    flags.push({
      field: 'units',
      code: 'unit_mismatch',
      message: `The document is in ${unit}, but ${bandFuel} is priced per ${UNIT_BY_FUEL[bandFuel]}.`,
    })
    scores.push(0)
  } else if (bandFuel !== null) {
    const [low, high] = RANGES[bandFuel].units
    // The band is annual. A July gas bill is 18 therms, which is below the annual
    // floor but perfectly ordinary for one month, so the floor scales with the
    // period while the ceiling does not. The annual limit is enforced again on
    // whatever the annualiser produces.
    const fullYear =
      documentPeriod === 'year' || (documentPeriod === 'season' && span !== null && span >= FULL_YEAR_MIN_DAYS)
    const [documentLow, documentHigh] = fullYear ? [low, high] : [low / 12, high]
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
        message: `Read ${rawQuantity.toLocaleString('en-US')} ${UNIT_BY_FUEL[bandFuel]}, which is outside ${documentLow.toLocaleString('en-US', { maximumFractionDigits: 1 })}–${documentHigh.toLocaleString('en-US')} for ${periodLabel}. Check the receipt.`,
      })
      scores.push(0)
    } else if (fullYear) {
      unitsField = {
        value: rawQuantity,
        confidence: modelScore,
        derived: false,
        unit: `${UNIT_BY_FUEL[bandFuel]}/yr`,
      }
      scores.push(modelScore)
    } else {
      // A document that covers less than a year goes through the annualiser, which
      // names its method and refuses rather than inventing a winter. One oil
      // delivery is the common case in Massachusetts and is no longer a dead end.
      const heatYear = heatYearFor(options.countyFips) ?? DEFAULT_HEAT_YEAR
      const outcome = annualise({
        fuel: bandFuel,
        quantity: rawQuantity,
        documentPeriod,
        documentDate,
        periodStart,
        periodEnd,
        historyKind: record.history_kind === 'numbers' || record.history_kind === 'bars' ? record.history_kind : null,
        placeName: placeNameFor(options.countyFips),
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
          unit: `${UNIT_BY_FUEL[bandFuel]}/yr`,
        }
        if (thermAssumption !== null) estimate.assumptions.push(thermAssumption)
        annualisation = estimate
        scores.push(confidence)
        if (documentPeriod === 'season' && !fullYear) {
          flags.push({
            field: 'period',
            code: 'partial_period',
            message: 'This covers one season, not a full year, so the year below is worked out from it.',
          })
        }
        if (estimate.method !== 'printed_history' && estimate.method !== 'degree_days') {
          flags.push({
            field: 'annualisation',
            code: 'annualised',
            message: `${Math.round(estimate.value).toLocaleString('en-US')} ${UNIT_BY_FUEL[bandFuel]} a year, from ${estimate.method.replace('_', ' ')}. ${estimate.note} Confirm before it counts.`,
          })
        }
      } else if (outcome.refusal !== null) {
        flags.push(...flagsForRefusal(outcome.refusal.code, outcome.refusal.message))
        scores.push(0)
      }
    }
  }

  // ---- price --------------------------------------------------------------
  // ADR-005: the model copies the printed total and quantity; the division is
  // ours. A printed per-unit price (oil, propane) is used only when there is no
  // total to divide. "Amount due" is never read: budget billing levelises it.
  const totalCharge = asMoney(record.total_charge)
  const derivedPrice =
    totalCharge !== null && documentQuantity !== null && documentQuantity > 0 && totalCharge > 0
      ? totalCharge / documentQuantity
      : null
  const printedPrice = finiteNumber(record.price_per_unit)
  const rawPrice = derivedPrice ?? printedPrice
  const priceDerived = derivedPrice !== null
  const priceNote = priceDerived ? 'total ÷ quantity' : undefined
  let priceField: BillField = emptyField(bandFuel ? `$/${UNIT_BY_FUEL[bandFuel]}` : '$/unit')

  if (rawPrice === null) {
    flags.push({ field: 'price', code: 'missing', message: 'No unit price was legible on the document.' })
  } else if (bandFuel === null) {
    priceField = { value: rawPrice, confidence: 0.4, derived: priceDerived, unit: '$/unit', note: priceNote }
    scores.push(0.4)
  } else {
    const [low, high] = RANGES[bandFuel].price
    if (rawPrice < low || rawPrice > high) {
      flags.push({
        field: 'price',
        code: 'out_of_range',
        message: `Read $${rawPrice.toFixed(2)} per ${UNIT_BY_FUEL[bandFuel]}, outside $${low}–$${high} for Massachusetts. Check the document.`,
      })
      scores.push(0)
    } else {
      priceField = {
        value: rawPrice,
        confidence: modelScore,
        derived: priceDerived,
        unit: `$/${UNIT_BY_FUEL[bandFuel]}`,
        ...(priceNote ? { note: priceNote } : {}),
      }
      scores.push(modelScore)

      // Second, warning-only band: this season's DOER survey. Outside it the
      // number is kept — last winter's oil really was $3.55/gal — and the user is
      // told it may be an old receipt. This flag never blocks.
      const [softLow, softHigh] = SEASONAL_PRICE[bandFuel]
      if (rawPrice < softLow || rawPrice > softHigh) {
        const direction = rawPrice < softLow ? 'below' : 'above'
        const suspicion = rawPrice < softLow ? 'it may be an old receipt' : 'check the decimal'
        flags.push({
          field: 'price',
          code: 'stale_price',
          message: `$${rawPrice.toFixed(2)}/${UNIT_BY_FUEL[bandFuel]} is ${direction} this season's Massachusetts range ($${softLow.toFixed(2)}–$${softHigh.toFixed(2)}, DOER ${SEASONAL_PRICE_AS_OF}) — ${suspicion}.`,
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

  const NON_BLOCKING: readonly BillFlag['code'][] = ['low_confidence', 'annualised', 'stale_price', 'not_heating_fuel']
  const blocking = flags.some((flag) => !NON_BLOCKING.includes(flag.code))
  // Two independent checks can raise the same caution (a low-confidence document
  // also having an annualised number, for instance). Show each caution once.
  const uniqueFlags = flags.filter(
    (flag, index) => flags.findIndex((other) => other.field === flag.field && other.code === flag.code) === index,
  )
  const bill: BillParse = {
    fuel,
    units: unitsField,
    price: priceField,
    documentPeriod,
    documentDate,
    confidence,
    ready: !blocking && unitsField.value !== null && priceField.value !== null,
    flags: uniqueFlags,
    documentType,
    rateClass,
    documentQuantity,
    tankSizeGal: asMoney(record.tank_size_gal),
    annualisation,
    // ---- BillParseExtras: null when the bill did not show it, never a default.
    role,
    utility: asUtility(record.utility),
    serviceZip: asZip(record.service_zip),
    serviceTown: asString(record.service_town),
    periodStart,
    periodEnd,
    days,
    totalCharge,
    supplyCharge: asMoney(record.supply_charge),
    deliveryCharge: asMoney(record.delivery_charge),
    supplierName: asString(record.supplier_name),
    rateClassV3: rateClass,
    lowIncomeSignal,
    readType: record.read_type === 'actual' || record.read_type === 'estimated' ? record.read_type : null,
    budgetBilling: record.budget_billing === true,
    baseloadAnnual: annualisation?.baseloadAnnual ?? null,
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

/**
 * Re-annualise one delivery once the user has answered "fills per season".
 * Pure and client-safe: no fetch, no clock, nothing server-only. The UI calls
 * this instead of sending the photo to the model a second time.
 */
export function reannualiseWithFills(
  parse: BillParse,
  fills: number,
  options: { countyFips?: string | null } = {},
): AnnualEstimate | AnnualRefusal {
  const fuel: BillFuel | null = parse.role === 'electricity' ? 'resistance' : parse.fuel
  if (fuel === null || parse.documentQuantity === null) {
    return {
      code: 'missing_quantity',
      message: 'There is no quantity on this document to multiply, so type the yearly total instead.',
    }
  }
  const heatYear = heatYearFor(options.countyFips) ?? DEFAULT_HEAT_YEAR
  const outcome = annualise({
    fuel,
    quantity: parse.documentQuantity,
    documentPeriod: 'delivery',
    documentDate: parse.documentDate,
    periodStart: parse.periodStart,
    periodEnd: parse.periodEnd,
    placeName: placeNameFor(options.countyFips),
    usageHistory: null,
    degreeDays: null,
    deliveriesPerSeason: fills,
    tankSizeGal: parse.tankSizeGal,
    heating: parse.role === 'heating',
    bounds: RANGES[fuel].units,
    seasonHdd: heatYear.seasonHdd,
    monthShares: heatYear.monthShares,
  })
  return (
    outcome.estimate ??
    outcome.refusal ?? { code: 'needs_fills', message: 'Fills per season must be a whole number from 2 to 8.' }
  )
}
