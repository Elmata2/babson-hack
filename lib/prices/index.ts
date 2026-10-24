/**
 * @built F-09 /api/prices — DOER headline, EIA machine read, snapshot when either fails
 *
 * The contract, from `design.md` §2.3: the route is an *enrichment*. Delete it and
 * the app still returns a verdict. So this module never throws and never invents a
 * value — it returns a typed envelope the client can render or ignore.
 *
 * ADR-002 is the rule that shapes everything below:
 *   "Show the DOER number a resident actually pays; use EIA for programmatic reads.
 *    Divergence > 12% → show DOER, log the gap."
 *
 * So oil and propane **headline** numbers are always the dated DOER survey, never
 * the live EIA series. The live series is carried alongside as a cross-check and
 * surfaces only as a note when the two disagree by more than 12%. Electricity is
 * the exception: DOER publishes no $/kWh, so EIA is the only real source, and it
 * is ~2 months lagged — which is why every point carries the `period` it is for
 * and the UI must render that period rather than "today's rate".
 */

import fuelSnapshotJson from '../../data/snapshots/fuel-2026-10-19.json'
import { readEiaSeries, SERIES, type FetchLike, type EiaSeries, type ReadError } from './eia'

/** Steering ADR-002: a gap wider than this means "show DOER, log the gap". */
export const DIVERGENCE_LIMIT_PCT = 12

/** Steering: EIA cache TTL is 24h. */
export const CACHE_TTL_MS = 24 * 60 * 60 * 1_000

/** A provider outage should not be cached for a day, only long enough to stop a retry storm. */
export const FAILURE_CACHE_TTL_MS = 5 * 60 * 1_000

/** How much of the answer is live. `partial` means some series resolved. */
export type PriceMode = 'live' | 'partial' | 'snapshot'

/** Where one displayed number came from. No point is ever shown without its period. */
export interface PricePoint {
  usdPerUnit: number
  unit: 'gal' | 'kWh'
  /** The period the number describes, e.g. `2026-10-19` or `2026-08`. */
  period: string
  source: 'DOER' | 'EIA' | 'EIA snapshot'
  label: string
}

/** A live reading that did *not* become the headline, kept so the gap is visible. */
export interface Crosscheck {
  usdPerUnit: number
  period: string
  /** Signed percent difference against the DOER headline. */
  divergencePct: number
  /** True when |divergencePct| ≤ 12 — inside the rule, so no note is raised. */
  agrees: boolean
}

export interface Prices {
  mode: PriceMode
  /** Date of the headline (DOER) numbers. Individual points carry their own period. */
  asOf: string
  oil: PricePoint
  propane: PricePoint
  elec: PricePoint
  crosscheck: { oil: Crosscheck | null; propane: Crosscheck | null }
  /** Human-readable, already-safe-to-render explanations of what degraded. */
  notes: string[]
  /** Machine-readable reasons, for the server log only. */
  errors: ReadError[]
}

export interface GetPricesOptions {
  apiKey?: string | undefined
  fetchImpl?: FetchLike
  /** Injected for tests. */
  now?: () => number
  timeoutMs?: number
  cacheTtlMs?: number
  bypassCache?: boolean
}

interface CachedEntry {
  at: number
  ttl: number
  value: Prices
}

let cache: CachedEntry | null = null

/** Drop the in-process cache. For tests, and for the `?fresh=1` debug path. */
export function resetPriceCache(): void {
  cache = null
}

function snapshotPoint(): { oil: PricePoint; propane: PricePoint; elec: PricePoint; asOf: string } {
  const snap = fuelSnapshotJson as unknown as {
    asOf: string
    oil: { label: string; unit: string; avg: number }
    propane: { label: string; unit: string; avg: number }
    electricity: {
      label: string
      standardRate: number
      standardRateAsOf: string
      standardRateSource: string
    }
  }

  return {
    asOf: snap.asOf,
    oil: {
      usdPerUnit: snap.oil.avg,
      unit: 'gal',
      period: snap.asOf,
      source: 'DOER',
      label: snap.oil.label,
    },
    propane: {
      usdPerUnit: snap.propane.avg,
      unit: 'gal',
      period: snap.asOf,
      source: 'DOER',
      label: snap.propane.label,
    },
    elec: {
      usdPerUnit: snap.electricity.standardRate,
      unit: 'kWh',
      period: snap.electricity.standardRateAsOf,
      source: 'EIA snapshot',
      label: snap.electricity.label,
    },
  }
}

/** Signed percent difference of `live` from `headline`; `null` when the base is unusable. */
export function divergencePct(headline: number, live: number): number | null {
  if (!Number.isFinite(headline) || headline <= 0) return null
  if (!Number.isFinite(live) || live <= 0) return null
  return ((live - headline) / headline) * 100
}

function crosscheckFor(headline: number, reading: { usdPerUnit: number; period: string }): Crosscheck {
  const pct = divergencePct(headline, reading.usdPerUnit) ?? 0
  return {
    usdPerUnit: reading.usdPerUnit,
    period: reading.period,
    divergencePct: pct,
    agrees: Math.abs(pct) <= DIVERGENCE_LIMIT_PCT,
  }
}

/** One-line, user-safe note. The numbers are already rounded; no format surprises. */
function gapNote(what: string, headline: number, check: Crosscheck, unit: string): string {
  const sign = check.divergencePct >= 0 ? '+' : ''
  return (
    `${what}: DOER $${headline.toFixed(2)}/${unit} vs EIA $${check.usdPerUnit.toFixed(3)}/${unit} ` +
    `(${check.period}) — ${sign}${check.divergencePct.toFixed(1)}% apart, showing DOER per ADR-002`
  )
}

async function readAll(
  fetcher: EiaSeries,
  options: Required<Pick<GetPricesOptions, 'apiKey' | 'fetchImpl' | 'timeoutMs'>>,
): Promise<
  | { ok: true; reading: { usdPerUnit: number; period: string; label: string } }
  | { ok: false; error: ReadError }
> {
  return readEiaSeries(fetcher, {
    apiKey: options.apiKey,
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs,
  })
}

/**
 * Resolve the price block.
 * Input: an EIA key (absent is fine). Output: a complete `Prices` envelope that is
 * always renderable. Guarantee: `mode === 'snapshot'` means *every* field came from
 * the dated DOER/EIA snapshot; no partial number is ever presented as live.
 */
export async function getPrices(options: GetPricesOptions = {}): Promise<Prices> {
  const now = options.now ?? Date.now
  const cacheTtlMs = options.cacheTtlMs ?? CACHE_TTL_MS

  if (!options.bypassCache && cache && now() - cache.at < cache.ttl) {
    return cache.value
  }

  const base = snapshotPoint()
  const notes: string[] = []
  const errors: ReadError[] = []

  const apiKey = options.apiKey ?? process.env.EIA_API_KEY ?? ''

  async function settle(): Promise<Prices> {
    if (!apiKey) {
      return {
        ...base,
        mode: 'snapshot',
        crosscheck: { oil: null, propane: null },
        notes: [...notes, 'No EIA_API_KEY — fuel and electricity prices come from the 2026-10-19 snapshot.'],
        errors,
      }
    }

    const fetchImpl: FetchLike = options.fetchImpl ?? ((url, init) => fetch(url, init))
    const readOptions = {
      apiKey,
      fetchImpl,
      timeoutMs: options.timeoutMs ?? 6_000,
    }

    const [oil, propane, elec] = await Promise.all([
      readAll(SERIES.oil as EiaSeries, readOptions),
      readAll(SERIES.propane as EiaSeries, readOptions),
      readAll(SERIES.electricity as EiaSeries, readOptions),
    ])

    const resolved = [oil, propane, elec].filter((r) => r.ok).length

    if (!oil.ok) errors.push(oil.error)
    if (!propane.ok) errors.push(propane.error)
    if (!elec.ok) errors.push(elec.error)

    const crossOil = oil.ok ? crosscheckFor(base.oil.usdPerUnit, oil.reading) : null
    const crossPropane = propane.ok ? crosscheckFor(base.propane.usdPerUnit, propane.reading) : null

    if (crossOil && !crossOil.agrees) notes.push(gapNote('Heating oil', base.oil.usdPerUnit, crossOil, 'gal'))
    if (crossPropane && !crossPropane.agrees) {
      notes.push(gapNote('Propane', base.propane.usdPerUnit, crossPropane, 'gal'))
    }

    // Electricity is the one headline EIA may own: DOER publishes no $/kWh.
    const elecPoint: PricePoint = elec.ok
      ? {
          usdPerUnit: elec.reading.usdPerUnit,
          unit: 'kWh',
          period: elec.reading.period,
          source: 'EIA',
          label: elec.reading.label,
        }
      : (() => {
          notes.push(
            `EIA electricity unavailable — showing the ${base.elec.period} snapshot rate. It is lagged, not today's.`,
          )
          return base.elec
        })()

    if (elec.ok) {
      notes.push(
        `Electricity is the ${elec.reading.period} EIA average, about two months lagged — render the period, never "today".`,
      )
    }

    const mode: PriceMode = resolved === 3 ? 'live' : resolved === 0 ? 'snapshot' : 'partial'

    return {
      mode,
      asOf: base.asOf,
      oil: base.oil,
      propane: base.propane,
      elec: elecPoint,
      crosscheck: { oil: crossOil, propane: crossPropane },
      notes,
      errors,
    }
  }

  const value = await settle()

  // Cache wins for a day. A degraded result is cached briefly so a transient
  // outage does not pin the app to the snapshot until tomorrow.
  const ttl = value.mode === 'snapshot' ? Math.min(cacheTtlMs, FAILURE_CACHE_TTL_MS) : cacheTtlMs
  if (!options.bypassCache) cache = { at: now(), ttl, value }

  return value
}
