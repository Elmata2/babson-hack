/**
 * @built F-124 the two pieces both call routes need, kept out of the route file
 *
 * A Next route file may only export HTTP verbs and route config, so the record
 * builder and the dynamic-variable builder live here, where a test can import them
 * without dragging the route's runtime along.
 */

import type { CallRecord, CallStatus } from './types'
import type { SwitchProvider } from '../switch/types'

/**
 * `?call=<conversationId>:<providerId>`, repeated. A bare id is accepted too, with
 * the id standing in as its provider key, so a hand-written URL still answers.
 * Guarantee: at most six refs, and an over-long id is dropped rather than truncated.
 */
export interface CallRef {
  conversationId: string
  providerId: string
}

export function parseRefs(url: URL): CallRef[] {
  const refs: CallRef[] = []
  for (const raw of url.searchParams.getAll('call')) {
    const [conversationId, providerId] = raw.split(':')
    if (!conversationId || conversationId.length > 120) continue
    refs.push({ conversationId, providerId: providerId && providerId !== '' ? providerId : conversationId })
    if (refs.length >= 6) break
  }
  return refs
}

/** Milliseconds into the replay, clamped so a hand-edited `t` cannot stage a year. */
export function elapsedOf(url: URL): number {
  const raw = url.searchParams.get('t')
  const parsed = raw === null ? Number.NaN : Number(raw)
  if (Number.isFinite(parsed) && parsed >= 0) return Math.min(parsed, 120_000)
  return 0
}

/** One call as the browser sees it, including the ones that were never placed. */
export function callRecord(
  provider: SwitchProvider,
  status: CallStatus,
  note: string | null,
  extra: Partial<CallRecord> = {},
): CallRecord {
  return {
    providerId: provider.id,
    providerName: provider.name,
    vertical: provider.kind,
    conversationId: '',
    status,
    at: new Date().toISOString(),
    durationSeconds: null,
    excerpts: [],
    quote: null,
    needsCallback: false,
    note,
    ...extra,
  }
}

/**
 * The dynamic variables the agent's prompt may say: R18.1 and nothing else.
 * Guarantee: a null fact is absent, never the string "null"; the prompt renders an
 * absent variable as a question it should not ask, which is the honest behaviour.
 */
export function callVariables(facts: {
  town: string
  zip: string | null
  fuel: string | null
  annualVolume: number | null
  unit: string | null
  deliverySizeGal: number
  tankSizeGal: number | null
  deliveryWindow: string | null
  sqft: number | null
  tons: number | null
}): Record<string, string> {
  const entries: [string, string | null][] = [
    ['town', facts.town],
    ['zip', facts.zip],
    ['fuel', facts.fuel],
    ['annual_volume', facts.annualVolume === null ? null : String(facts.annualVolume)],
    ['unit', facts.unit],
    ['delivery_size_gal', String(facts.deliverySizeGal)],
    ['tank_size_gal', facts.tankSizeGal === null ? null : String(facts.tankSizeGal)],
    ['delivery_window', facts.deliveryWindow === 'any' ? null : facts.deliveryWindow],
    ['sqft', facts.sqft === null ? null : String(facts.sqft)],
    ['tons', facts.tons === null ? null : String(facts.tons)],
  ]
  const out: Record<string, string> = {}
  for (const [key, value] of entries) if (value !== null && value !== '') out[key] = value
  return out
}

/**
 * The variables for one call. The platform's first message is the shared disclosure,
 * "questions about your {fuel} prices", and refuses to start when a hole is unset.
 * An installer is asked about heat pump prices, as its own script says, so `fuel`
 * is the price topic and the household's current fuel travels as `current_fuel`.
 * Guarantee: `town` and `fuel` are always present.
 */
export function spokenVariables(
  variables: Record<string, string>,
  vertical: 'fuel' | 'installer',
): Record<string, string> {
  const { fuel, ...rest } = variables
  if (vertical === 'installer') {
    return { ...rest, ...(fuel ? { current_fuel: fuel } : {}), fuel: 'heat pump' }
  }
  return { ...rest, fuel: fuel ?? 'heating fuel' }
}
