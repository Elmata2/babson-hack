/**
 * @built F-130 R21, the second round — ask the next two to beat a price we already have
 *
 * Two refusals live here, and they are the whole feature:
 *
 *   - There is no target until **two** quotes are ranked. One number is an anecdote,
 *     and a dealer told "someone said $5.79" has been handed a rival's price as if
 *     it were a market fact.
 *   - The number handed to the agent is always the effective price of a **ranked**
 *     quote from this session (property P16). Never an unverified row, never a
 *     number the model produced, never the average.
 *
 * One round per session: this module returns one target and no way to ask for
 * another, and the screen has no second button.
 */

import type { RankedFuelQuote } from '../switch/quotes'

export interface NegotiationTarget {
  /** The price the agent may cite, in dollars per gallon, effective. */
  price: number
  /** Providers to call, by id — the rows that did not produce a usable price. */
  providerIds: string[]
  /** What the call is asked to do, in the caller's own words. */
  note: string
}

/** R21.1: at least two ranked quotes, and never more than two calls. */
export const MAX_NEGOTIATION_CALLS = 2
export const MIN_RANKED_FOR_NEGOTIATION = 2

/**
 * The one target this session gets.
 * Guarantee: `price` equals the `effectivePerGal` of a `ranked` row in `ranked`;
 * the returned `providerIds` never contains the provider whose price is cited.
 */
export function negotiationTarget(
  ranked: readonly RankedFuelQuote[],
  maxCalls: number = MAX_NEGOTIATION_CALLS,
): NegotiationTarget | null {
  const usable = ranked.filter((row) => row.status === 'ranked' && row.effectivePerGal !== null)
  if (usable.length < MIN_RANKED_FOR_NEGOTIATION) return null

  const best = usable[0]
  if (!best || best.effectivePerGal === null) return null

  const targets = ranked
    .filter((row) => row.status !== 'ranked' && row.providerId !== best.providerId)
    .slice(0, Math.max(0, maxCalls))
    .map((row) => row.providerId)

  if (targets.length === 0) return null

  return {
    price: best.effectivePerGal,
    providerIds: targets,
    note: `Ask whether they can beat $${best.effectivePerGal.toFixed(2)} a gallon. Do not name the dealer it came from.`,
  }
}
