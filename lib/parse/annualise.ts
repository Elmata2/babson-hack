/**
 * @built F-76 annualise — five named methods, one refusal, no silent multiplication
 * @built F-26a annualise — one document into one heating year, and name the method
 * @built F-103 hdd_scaled weights the real service days; baseload from summer bars; bars cap at 0.75
 *
 * The rule this file exists for: **`month × 12` is not how a heating year works.**
 * In Boston, January is 19.1% of the heating year and July is 0.0%. Multiplying a
 * January bill by twelve overstates the year by ~2.3×, and multiplying a July gas
 * bill invents a winter out of cooking and hot water.
 *
 * So annualisation is a *decision*, ordered from the most evidence to the least:
 *
 *   1. printed_history  12+ months of usage printed on the document — exact
 *   2. degree_days      the ticket prints degree days — one ratio, one assumption
 *   3. tank_cadence     the user's own fill count — their number, not ours
 *   4. hdd_scaled       a winter month divided by its share of the heating year
 *   5. monthly_x12      flat × 12, only for fuel that is not the heat source
 *
 * And a sixth outcome: **refuse**. A May–September heating bill says nothing
 * about a winter, so it returns no number and asks for one. That refusal is a
 * feature; the alternative is a fabricated annual figure in a verdict.
 *
 * Purity: no clock, no fetch, no environment. The month comes from the ISO date
 * the document printed; the climate table is injected by `heat-year.ts`.
 */

import type { AnnualEstimate, AnnualMethod, AnnualRefusal, BillPeriod } from './types'

export type { AnnualEstimate, AnnualMethod, AnnualRefusal } from './types'

/**
 * The ceiling on each method's confidence. A method can never claim more than
 * this, whatever the model said about its own reading.
 */
export const METHOD_CONFIDENCE: Record<AnnualMethod, number> = {
  printed_history: 0.95,
  degree_days: 0.7,
  tank_cadence: 0.55,
  hdd_scaled: 0.5,
  monthly_x12: 0.4,
}

/** Below this share of the heating year, one month cannot stand in for a winter. */
export const MIN_HEATING_SHARE = 0.08

/** Degree days outside this band cannot describe a single delivery. */
export const MIN_DEGREE_DAYS = 100
export const MAX_DEGREE_DAYS = 3_000

/** Fills per heating season a household can plausibly confirm. */
export const MIN_DELIVERIES_PER_SEASON = 2
export const MAX_DELIVERIES_PER_SEASON = 8

/** A printed chart shorter than this is not a year; 13 bars means one is dropped. */
export const MIN_HISTORY_MONTHS = 12
export const MAX_HISTORY_MONTHS = 13

/**
 * May–September. In Boston those five months carry 6.1% of the heating year
 * between them, and July and August carry 0.0%.
 */
export const SUMMER_MONTHS: readonly number[] = [5, 6, 7, 8, 9]

/** How a tank size and a fill count are allowed to disagree before we say so. */
export const TANK_TOLERANCE = 0.5

export const MONTH_NAMES: readonly string[] = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

/** Everything the decision is allowed to look at. All model values arrive as `unknown`. */
export interface AnnualiseInput {
  fuel: string
  /** The quantity the document printed, in the fuel's unit. */
  quantity: unknown
  documentPeriod: BillPeriod
  /** ISO `YYYY-MM-DD` from the document. The only source of the month. */
  documentDate: string | null
  /** ISO start/end of the service period, when the bill printed them. */
  periodStart?: string | null
  periodEnd?: string | null
  /** `numbers` = a printed table (0.95); `bars` or unknown = read by eye (0.75). */
  historyKind?: 'numbers' | 'bars' | null
  /** Name used in user-facing text: "Worcester County", else "Massachusetts". */
  placeName?: string | null
  /** Monthly bars from the bill's usage chart, oldest first, or null. */
  usageHistory: unknown
  /** Degree days the document printed for its own period, or null. */
  degreeDays: unknown
  /** Fills per heating season, confirmed by the user. */
  deliveriesPerSeason: unknown
  /** Tank size in gallons, when the document prints it. */
  tankSizeGal: unknown
  /** True when this fuel is the house's heat source. */
  heating: boolean
  /** The caller explicitly wants a flat × 12 (electricity baseload, say). */
  forceMonthlyX12?: boolean
  /** The fuel's annual sanity band from `RANGES[fuel].units`. */
  bounds: readonly [number, number]
  /** Annual HDD65 for the site — the denominator of the degree-day ratio. */
  seasonHdd: number
  /** 12 shares of the heating year, January first. */
  monthShares: readonly number[]
}

/** A doubt that does not stop the estimate but must be visible in the UI. */
export interface AnnualWarning {
  code: 'tank_mismatch' | 'history_unusable'
  message: string
}

/** The decision: an estimate, a refusal, or (impossibly) neither. */
export interface AnnualiseOutcome {
  estimate: AnnualEstimate | null
  refusal: AnnualRefusal | null
  warnings: AnnualWarning[]
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function inside(value: number, bounds: readonly [number, number]): boolean {
  return Number.isFinite(value) && value >= bounds[0] && value <= bounds[1]
}

function count(value: number): string {
  return value.toLocaleString('en-US')
}

/**
 * The month the document covers, 1–12, from the ISO date it printed. `null` when
 * there is no usable date — we will not guess the season.
 */
export function monthOf(documentDate: string | null): number | null {
  if (typeof documentDate !== 'string') return null
  const match = /^\d{4}-(\d{2})-\d{2}$/.exec(documentDate)
  if (!match) return null
  const month = Number(match[1])
  return month >= 1 && month <= 12 ? month : null
}

const DAY_MS = 86_400_000

function parseIso(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const t = Date.parse(`${value}T00:00:00Z`)
  return Number.isFinite(t) ? t : null
}

function isoOf(t: number): string {
  return new Date(t).toISOString().slice(0, 10)
}

/** The days a bill actually covers. `assumed` is true when we had to guess them. */
export interface ServiceWindow {
  start: string
  end: string
  /** Inclusive day count. */
  days: number
  assumed: boolean
}

/** Longest period we accept as one bill. Beyond this the dates are a misread. */
export const MAX_WINDOW_DAYS = 62
/** Bills are dated after the period they cover; this is the usual gap. */
export const BILL_LAG_DAYS = 3
export const ASSUMED_PERIOD_DAYS = 30

/**
 * The service days of a bill. Printed start/end win. With only a document date
 * we assume the ~30 days ending 3 days before it, because a bill is dated after
 * its period — the statement month is the wrong month for a bill dated Feb 5.
 */
export function serviceWindow(
  periodStart: string | null | undefined,
  periodEnd: string | null | undefined,
  documentDate: string | null | undefined,
): ServiceWindow | null {
  const start = parseIso(periodStart)
  const end = parseIso(periodEnd)
  if (start !== null && end !== null && end >= start) {
    const days = Math.round((end - start) / DAY_MS) + 1
    if (days <= MAX_WINDOW_DAYS) return { start: isoOf(start), end: isoOf(end), days, assumed: false }
  }
  const doc = parseIso(documentDate)
  if (doc === null) return null
  const assumedEnd = doc - BILL_LAG_DAYS * DAY_MS
  const assumedStart = assumedEnd - (ASSUMED_PERIOD_DAYS - 1) * DAY_MS
  return { start: isoOf(assumedStart), end: isoOf(assumedEnd), days: ASSUMED_PERIOD_DAYS, assumed: true }
}

/**
 * The share of the heating year the window carries: for each month overlapped,
 * that month's share × (window days in it ÷ days in it). A 25-day and a 35-day
 * bill at the same daily rate normalise to the same year.
 */
export function heatingShareOfWindow(window: ServiceWindow, monthShares: readonly number[]): number | null {
  if (monthShares.length !== 12) return null
  const start = parseIso(window.start)
  const end = parseIso(window.end)
  if (start === null || end === null) return null
  let share = 0
  for (let t = start; t <= end; t += DAY_MS) {
    const d = new Date(t)
    const m = d.getUTCMonth()
    const dim = new Date(Date.UTC(d.getUTCFullYear(), m + 1, 0)).getUTCDate()
    const monthShare = finite(monthShares[m])
    if (monthShare === null || monthShare < 0) return null
    share += monthShare / dim
  }
  return share
}

/** The summer floor of a printed history, as annual units. See `baseloadFromHistory`. */
export function baseloadFromHistory(
  history: readonly number[],
  endMonth: number | null,
): { annual: number; aligned: boolean } | null {
  if (history.length === 0) return null
  let pool: number[] = [...history]
  let aligned = false
  if (endMonth !== null) {
    const summer = history.filter((_, idx) => {
      const month = ((((endMonth - 1 - (history.length - 1 - idx)) % 12) + 12) % 12) + 1
      return month >= 6 && month <= 8
    })
    if (summer.length > 0) {
      pool = summer
      aligned = true
    }
  }
  return { annual: Math.min(...pool) * 12, aligned }
}

/** That month's share of the heating year, or null when the table has no answer. */
export function heatingShareOfMonth(
  month: number | null,
  monthShares: readonly number[],
): number | null {
  if (month === null || monthShares.length !== 12) return null
  const share = finite(monthShares[month - 1])
  return share !== null && share >= 0 ? share : null
}

/**
 * A printed usage chart, or null. Every bar must be a finite, non-negative
 * number: a null or a string in the array means the chart was misread, and a
 * misread chart is not coerced into a total.
 */
export function sanitiseHistory(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null
  if (value.length < MIN_HISTORY_MONTHS || value.length > MAX_HISTORY_MONTHS) return null
  const bars: number[] = []
  for (const bar of value) {
    const reading = finite(bar)
    if (reading === null || reading < 0) return null
    bars.push(reading)
  }
  return bars
}

/** A whole number of fills a season, or null. Floors nothing. */
export function sanitiseDeliveries(value: unknown): number | null {
  const fills = finite(value)
  if (fills === null || !Number.isInteger(fills)) return null
  if (fills < MIN_DELIVERIES_PER_SEASON || fills > MAX_DELIVERIES_PER_SEASON) return null
  return fills
}

function refuse(
  code: AnnualRefusal['code'],
  message: string,
  warnings: AnnualWarning[] = [],
): AnnualiseOutcome {
  return { estimate: null, refusal: { code, message }, warnings }
}

function choose(
  method: AnnualMethod,
  value: number,
  assumptions: string[],
  note: string,
  warnings: AnnualWarning[] = [],
  extra: Partial<Pick<AnnualEstimate, 'confidence' | 'baseloadAnnual' | 'spaceHeating'>> = {},
): AnnualiseOutcome {
  return {
    estimate: {
      value,
      method,
      confidence: extra.confidence ?? METHOD_CONFIDENCE[method],
      assumptions,
      note,
      ...(extra.baseloadAnnual !== undefined
        ? { baseloadAnnual: extra.baseloadAnnual, spaceHeating: extra.spaceHeating }
        : {}),
    },
    refusal: null,
    warnings,
  }
}

/**
 * Decide how this document becomes a year.
 *
 * Total: every input shape returns either an estimate with its method, or a
 * refusal with a question. It never returns a number outside `bounds`, and it
 * never returns a number whose arithmetic it cannot describe.
 */
export function annualise(input: AnnualiseInput): AnnualiseOutcome {
  const warnings: AnnualWarning[] = []
  const quantity = finite(input.quantity)
  const bounds = input.bounds
  // The service days, not the statement month: a bill dated Feb 5 covers January.
  const window = serviceWindow(input.periodStart, input.periodEnd, input.documentDate)
  const midpoint = window ? (parseIso(window.start)! + parseIso(window.end)!) / 2 : null
  const month = midpoint !== null ? new Date(midpoint).getUTCMonth() + 1 : monthOf(input.documentDate)
  const share = window
    ? heatingShareOfWindow(window, input.monthShares)
    : heatingShareOfMonth(month, input.monthShares)
  const summer = month !== null && SUMMER_MONTHS.includes(month)
  const place = input.placeName ?? 'Massachusetts'

  if (quantity === null || quantity <= 0) {
    return refuse('missing_quantity', 'No usable quantity was legible on the document, so there is no year to give.')
  }

  // A chart that is present but unusable is worth saying out loud: the user can
  // photograph the page again, and a silent fallback would hide a missed year.
  const history = sanitiseHistory(input.usageHistory)
  if (history === null && input.usageHistory !== null && input.usageHistory !== undefined) {
    const bars = Array.isArray(input.usageHistory) ? input.usageHistory.length : 0
    warnings.push({
      code: 'history_unusable',
      message:
        bars > 0 && bars < MIN_HISTORY_MONTHS
          ? `The usage chart shows ${bars} months, which is not a year, so the year was not taken from it.`
          : 'The usage chart on the document could not be read cleanly, so the year was not taken from it.',
    })
  }

  // 1 — printed history. The only path with no arithmetic on an assumption.
  if (history !== null) {
    const used = history.length > 12 ? history.slice(-12) : history
    const value = used.reduce((total, bar) => total + bar, 0)
    const assumptions =
      history.length > 12
        ? ['The chart prints 13 months; the oldest bar is left out so the total is exactly one year.']
        : []
    // A numeric table is read; bar heights are eyeballed. Only the first gets 0.95.
    const numbers = input.historyKind === 'numbers'
    if (!numbers) assumptions.push('Monthly usage was read from bar heights, so each month is approximate.')
    if (inside(value, bounds)) {
      const extra: Parameters<typeof choose>[5] = { confidence: numbers ? METHOD_CONFIDENCE.printed_history : 0.75 }
      if (input.heating && ['gas', 'oil', 'propane'].includes(input.fuel)) {
        const endMonth = window ? Number(window.end.slice(5, 7)) : null
        const base = baseloadFromHistory(history, endMonth)
        if (base !== null) {
          const baseload = Math.min(base.annual, value)
          extra.baseloadAnnual = baseload
          extra.spaceHeating = Math.max(0, value - baseload)
          assumptions.push(
            base.aligned
              ? 'Baseload (hot water, cooking) is the lowest of the June, July and August months times 12; the last month on the chart is taken to be the bill month.'
              : 'Baseload (hot water, cooking) is the lowest month on the chart times 12; the months could not be lined up.',
          )
        }
      }
      return choose(
        'printed_history',
        value,
        assumptions,
        numbers
          ? `Printed on the document: ${used.length} months of usage, added up. Nothing here is estimated.`
          : `Read from the bar chart on the document: ${used.length} months of usage, added up. Bars are read by eye, so treat it as close, not exact.`,
        warnings,
        extra,
      )
    }
    warnings.push({
      code: 'history_unusable',
      message: `The usage chart adds up to ${count(Math.round(value))}, which is not a Massachusetts house. Check the chart, or type the yearly total.`,
    })
  }

  // 2 — degree days. One ratio from two numbers the ticket printed.
  const degreeDays = finite(input.degreeDays)
  if (degreeDays !== null && degreeDays >= MIN_DEGREE_DAYS && degreeDays <= MAX_DEGREE_DAYS) {
    const seasonHdd = finite(input.seasonHdd)
    if (seasonHdd !== null && seasonHdd > 0) {
      const value = quantity * (seasonHdd / degreeDays)
      if (!inside(value, bounds)) {
        return refuse(
          'out_of_range',
          `Degree days on the ticket scale this to ${count(Math.round(value))} a year, which is outside what a Massachusetts house uses. Check the quantity.`,
          warnings,
        )
      }
      return choose(
        'degree_days',
        value,
        ['Degree days printed on this document cover exactly the fuel on this document.'],
        `Scaled from the ${count(Math.round(degreeDays))} degree days printed on the ticket to a ${count(Math.round(seasonHdd))} degree-day heating season.`,
        warnings,
      )
    }
  }

  // 3 — tank cadence. The user's number, not ours.
  const fills = sanitiseDeliveries(input.deliveriesPerSeason)
  if (fills !== null) {
    const value = quantity * fills
    if (!inside(value, bounds)) {
      return refuse(
        'out_of_range',
        `${count(quantity)} × ${fills} fills a season is ${count(Math.round(value))} a year, which is outside what a Massachusetts house uses. Check the quantity and the number of fills.`,
        warnings,
      )
    }
    const tankSize = finite(input.tankSizeGal)
    if (tankSize !== null && tankSize > 0) {
      const tanksPerYear = value / tankSize
      const low = fills * (1 - TANK_TOLERANCE)
      const high = fills * (1 + TANK_TOLERANCE)
      if (tanksPerYear < low || tanksPerYear > high) {
        warnings.push({
          code: 'tank_mismatch',
          message: `${fills} fills of ${count(quantity)} is ${count(Math.round(value))} a year — ${tanksPerYear.toFixed(1)} tankfuls of ${count(tankSize)} gal. Check the number of fills.`,
        })
      }
    }
    return choose(
      'tank_cadence',
      value,
      [`You receive ${fills} fills in a heating season.`],
      `${count(quantity)} a fill × ${fills} fills — your own delivery rhythm, not a model.`,
      warnings,
    )
  }

  // 4 — a winter month divided by its share of the heating year. Only a bill that
  //     says it is a month can be scaled this way: a delivery ticket's date is the
  //     day the truck came, not the period the fuel covers.
  if (input.heating && input.documentPeriod === 'month' && month !== null && share !== null) {
    if (summer && input.forceMonthlyX12 !== true) {
      return refuse(
        'summer_month',
        `A ${MONTH_NAMES[month - 1]} bill says nothing about your heating year — photograph a winter bill, or type the yearly total.`,
        warnings,
      )
    }
    const value = share >= MIN_HEATING_SHARE ? quantity / share : null
    if (value !== null && window !== null) {
      if (!inside(value, bounds)) {
        return refuse(
          'out_of_range',
          `${count(quantity)} over ${window.days} days scales to ${count(Math.round(value))} a year, which is outside what a Massachusetts house uses. Check the quantity.`,
          warnings,
        )
      }
      const assumptions = [
        'All usage on this bill is heating; a summer bill would separate baseload.',
        `The ${window.days} service days carry ${(share * 100).toFixed(1)}% of a ${place} heating year (2015–2024 average, each day weighted by its own month).`,
      ]
      if (window.assumed) {
        assumptions.unshift(
          `No service dates were printed, so the period is taken as the ${ASSUMED_PERIOD_DAYS} days ending ${BILL_LAG_DAYS} days before the document date (${window.start} to ${window.end}).`,
        )
      }
      return choose(
        'hdd_scaled',
        value,
        assumptions,
        `${MONTH_NAMES[month - 1]} is ${(share * 100).toFixed(1)}% of a ${place} heating year, so this bill implies this year.`,
        warnings,
      )
    }
    if (value !== null) {
      // Unreachable while a month implies a window, kept so the type narrows.
      return refuse('partial_period', 'The service period could not be placed in the year.', warnings)
    }
  }

  // 5 — flat × 12, for fuel that is not the heat source (or a shoulder month).
  if (input.documentPeriod === 'month') {
    const flatAllowed =
      input.forceMonthlyX12 === true || !input.heating || (month !== null && !summer)
    if (flatAllowed) {
      const value = quantity * 12
      if (!inside(value, bounds)) {
        return refuse(
          'out_of_range',
          `${count(quantity)} a month × 12 is ${count(Math.round(value))} a year, which is outside what a Massachusetts house uses. Check the quantity.`,
          warnings,
        )
      }
      const shoulder = input.heating
      const shoulderNote =
        month === null
          ? `${count(quantity)} × 12 — a flat year, because the caller asked for one.`
          : `${count(quantity)} × 12. ${MONTH_NAMES[month - 1]} is a shoulder month, so a real winter is higher.`
      return choose(
        'monthly_x12',
        value,
        shoulder
          ? [
              'This is a shoulder month, not a winter month, so ×12 understates the heating season.',
              'No degree days, usage chart or fill count was available to do better.',
            ]
          : ['This fuel is not the heat source, so usage is treated as flat across the year.'],
        shoulder
          ? shoulderNote
          : `${count(quantity)} × 12 — flat across the year, because this fuel is not your heat source.`,
        warnings,
      )
    }
  }

  // Nothing to scale from. Ask for the one number only the user has.
  if (input.documentPeriod === 'delivery') {
    return refuse(
      'needs_fills',
      'One delivery is not a winter. How many fills do you get in a heating season — two to eight? That gives us the year, or type the yearly gallons from your account.',
      warnings,
    )
  }

  return refuse(
    'partial_period',
    'This covers less than a heating year and does not print enough to scale from. Add a winter bill, or type the yearly total from your account.',
    warnings,
  )
}
