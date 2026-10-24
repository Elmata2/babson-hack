/**
 * @built F-09 EIA v2 series reader — one typed parse per series, not a generic one
 *
 * Source of truth: `.kiro/steering/data-sources.md` §"EIA — verified endpoints".
 * The series ids below were checked against a live key on 2026-10-24. Do not
 * "tidy" them into a loop with a shared field name.
 *
 * The trap this file exists to defeat: the petroleum series put the number in
 * `value`, the electricity series puts it in `price` AND expresses it in cents.
 * A generic "read `value`" adapter returns `undefined` for electricity and the
 * screen shows `$NaN`. So the field name and the unit scale are properties of
 * the *series*, not of the response.
 *
 * Nothing here invents a number. Every function returns `null` or a typed error
 * rather than a plausible-looking default.
 */

const EIA_BASE = 'https://api.eia.gov/v2/seriesid'

/** Which JSON field carries the number. Verified per series, never assumed. */
export type EiaField = 'value' | 'price'

/** A series we are allowed to read, with the units it is actually published in. */
export interface EiaSeries {
  /** EIA series id, exactly as it appears in the URL path. */
  readonly id: string
  /** JSON field holding the number for this series. */
  readonly field: EiaField
  /** Unit after scaling, for the UI. */
  readonly unit: 'gal' | 'kWh'
  /** Multiply the published number by this to reach dollars per `unit`. */
  readonly scale: number
  /** Human label, never rendered without its period. */
  readonly label: string
}

/**
 * The three verified series. `scale` is 1 for the petroleum series (already
 * $/gal) and 0.01 for electricity (`price-units: "cents per kilowatt-hour"`).
 */
export const SERIES = {
  oil: {
    id: 'PET.W_EPD2F_PRS_SMA_DPG.W',
    field: 'value',
    unit: 'gal',
    scale: 1,
    label: 'MA No. 2 heating oil, residential, weekly',
  },
  propane: {
    id: 'PET.W_EPLLPA_PRS_SMA_DPG.W',
    field: 'value',
    unit: 'gal',
    scale: 1,
    label: 'MA propane, residential, weekly',
  },
  electricity: {
    id: 'ELEC.PRICE.MA-RES.M',
    field: 'price',
    unit: 'kWh',
    scale: 0.01,
    label: 'MA residential electricity, monthly, all-in',
  },
} as const satisfies Record<string, EiaSeries>

/** One reading, already scaled to dollars, with the period it is actually for. */
export interface Reading {
  /** Dollars per unit. */
  usdPerUnit: number
  /** The period the number describes — `2026-10-19` weekly, `2026-08` monthly. */
  period: string
  label: string
}

/** Why a series could not be read. `null` never means "zero". */
export type ReadError =
  | { code: 'no_key'; message: string }
  | { code: 'http'; status: number; message: string }
  | { code: 'api'; message: string }
  | { code: 'shape'; message: string }
  | { code: 'network'; message: string }

/** Minimal fetch surface, so tests need no network and no mocks library. */
export type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>

export interface ReadOptions {
  apiKey: string
  fetchImpl: FetchLike
  /** Abort the request after this many ms. Steering: 6s. */
  timeoutMs?: number
  /** Injected for tests; defaults to `AbortSignal.timeout`. */
  signalFactory?: (ms: number) => AbortSignal
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * Pull the newest reading out of an EIA v2 series payload.
 * Input: the parsed JSON and one series spec. Output: a scaled `Reading`, or
 * `null` when the payload has no usable row. Guarantee: the number is read from
 * `spec.field` only — a payload whose `price` is present but whose series
 * expects `value` yields `null`, not `undefined` leaking to the screen.
 */
export function readSeries(json: unknown, series: EiaSeries): Reading | null {
  if (!isRecord(json)) return null
  const response = json.response
  if (!isRecord(response)) return null
  const data = response.data
  if (!Array.isArray(data) || data.length === 0) return null

  const row = data[0]
  if (!isRecord(row)) return null

  const period = row.period
  if (typeof period !== 'string' || period.length === 0) return null

  const raw = row[series.field]
  const numeric = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
  if (!Number.isFinite(numeric) || numeric <= 0) return null

  return { usdPerUnit: numeric * series.scale, period, label: series.label }
}

/**
 * Read the EIA error envelope, if this payload is one.
 * Input: parsed JSON. Output: a `ReadError`, or `null` when it is not an error.
 * Guarantee: `API_KEY_INVALID` maps to `no_key` so the caller can distinguish
 * "we are misconfigured" from "the provider is down" in the freshness badge.
 */
export function readApiError(json: unknown): ReadError | null {
  if (!isRecord(json)) return null
  const error = json.error
  if (!isRecord(error)) return null
  const message = typeof error.message === 'string' ? error.message : 'EIA returned an error'
  if (error.code === 'API_KEY_INVALID') return { code: 'no_key', message }
  return { code: 'api', message }
}

/** The sort/limit query EIA v2 needs to hand back exactly one newest row. */
export function seriesUrl(series: EiaSeries, apiKey: string): string {
  const params = new URLSearchParams({
    api_key: apiKey,
    length: '1',
    'sort[0][column]': 'period',
    'sort[0][direction]': 'desc',
  })
  return `${EIA_BASE}/${series.id}?${params.toString()}`
}

/**
 * Fetch and parse one series.
 * Input: a series spec and a key. Output: `{ ok: true, reading }` or
 * `{ ok: false, error }`. Guarantee: every failure mode — missing key, HTTP
 * error, EIA error envelope, timeout, bad shape — is a typed error. It never
 * throws into the route, and it never substitutes a number.
 */
export async function readEiaSeries(
  series: EiaSeries,
  options: ReadOptions,
): Promise<{ ok: true; reading: Reading } | { ok: false; error: ReadError }> {
  if (!options.apiKey) {
    return { ok: false, error: { code: 'no_key', message: 'EIA_API_KEY is not set' } }
  }

  const timeoutMs = options.timeoutMs ?? 6_000
  const signal = options.signalFactory
    ? options.signalFactory(timeoutMs)
    : AbortSignal.timeout(timeoutMs)

  let response: Awaited<ReturnType<FetchLike>>
  try {
    response = await options.fetchImpl(seriesUrl(series, options.apiKey), { signal })
  } catch (cause) {
    const aborted = cause instanceof Error && cause.name === 'TimeoutError'
    return {
      ok: false,
      error: {
        code: 'network',
        message: aborted ? `EIA timed out after ${timeoutMs}ms` : 'EIA request failed',
      },
    }
  }

  let json: unknown
  try {
    json = await response.json()
  } catch {
    return { ok: false, error: { code: 'shape', message: 'EIA returned unparseable JSON' } }
  }

  const apiError = readApiError(json)
  if (apiError) return { ok: false, error: apiError }

  if (!response.ok) {
    return {
      ok: false,
      error: { code: 'http', status: response.status, message: `EIA responded ${response.status}` },
    }
  }

  const reading = readSeries(json, series)
  if (!reading) {
    return {
      ok: false,
      error: { code: 'shape', message: `EIA returned no usable ${series.field} for ${series.id}` },
    }
  }

  return { ok: true, reading }
}
