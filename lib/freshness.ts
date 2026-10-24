/**
 * @built F-14 freshness is derived, never asserted
 *
 * Every number on screen carries where it came from and when. This module turns a
 * price payload into the one thing the badge needs, so a screen cannot claim
 * "live" when the adapter fell back to the snapshot.
 */

import type { Prices } from './prices'

/** What kind of provenance a badge may claim. */
export type FreshnessKind = 'live' | 'snapshot' | 'assessor' | 'manual' | 'baked'

export interface Freshness {
  kind: FreshnessKind
  /** ISO date or ISO month the number describes, when it has one. */
  date: string | null
}

/**
 * `mode` is the adapter's own verdict on itself: `live` means the live series
 * answered, `partial` means some did, `snapshot` means none did. We never upgrade
 * a partial to live.
 */
export function priceFreshness(prices: Pick<Prices, 'mode' | 'asOf'>): Freshness {
  return { kind: prices.mode === 'live' ? 'live' : 'snapshot', date: prices.asOf }
}

/** `2026-10-19` → `19 Oct`. `2026-07` → `Jul 2026`. Unparseable stays as-is. */
export function formatDateShort(value: string | null): string | null {
  if (!value) return null
  const monthOnly = /^(\d{4})-(\d{2})$/.exec(value)
  if (monthOnly) {
    const date = new Date(Date.UTC(Number(monthOnly[1]), Number(monthOnly[2]) - 1, 1))
    return new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date)
  }
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) return value
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(parsed)
}
