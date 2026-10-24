/**
 * @built F-50 R14.3 — the enhanced path is a line on the screen, not a footnote
 *
 * The income-qualified tier is the largest amount of money this product knows
 * about, and the household most likely to need it is the least likely to go
 * looking for it. So the verdict screen offers it in place, next to the answer,
 * with the real cap read out of the rebate table (not typed into the copy) and a
 * link that switches the same URL to the enhanced tier.
 *
 * The rule for showing it is deliberately conservative:
 *   - not already on the enhanced tier (nothing to offer);
 *   - the displaced fuel is one the table lists for that tier (gas is not);
 *   - and Mass Save electric rebates exist at this address (a municipal light
 *     plant means no Mass Save programme to be income-qualified inside).
 *
 * The copy never claims eligibility. It says what the award can reach and that an
 * assessment decides — which is R15.3's line, in the words the rules file's own
 * `copyRules` asks for ("likely eligible, not you qualify").
 *
 * Pure: the link is built from the query string the page already has.
 */

import { tierRule } from '../calc/rules'
import type { Tier, VerdictResult } from '../calc/types'
import { usd } from './format'

export interface EnhancedOffer {
  show: boolean
  /** One line: what the offer is. */
  headline: string
  /** Two sentences: what it can pay, and who decides. Never a claim of eligibility. */
  body: string
  linkLabel: string
  /** `/verdict?…` with the enhanced tier and the income answer set, or `null` when not shown. */
  href: string | null
}

/** The query shape the page receives. Same as `lib/intake/params` reads. */
export type QueryParams = Record<string, string | string[] | undefined>

const HIDDEN: EnhancedOffer = { show: false, headline: '', body: '', linkLabel: '', href: null }

/**
 * The offer for this household, or a hidden offer with no link.
 * Input: the result, the raw query, and whether Mass Save applies at this address.
 */
export function enhancedOffer(
  result: Pick<VerdictResult, 'fuel' | 'tier' | 'installYear'>,
  params: QueryParams,
  options: { noMassSave: boolean },
): EnhancedOffer {
  if (options.noMassSave) return HIDDEN
  if (result.tier === 'enhanced') return HIDDEN

  const rule = tierRule(result.installYear, 'enhanced')
  if (!rule) return HIDDEN
  if (!rule.eligibleFuels.includes(result.fuel)) return HIDDEN

  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    const first = Array.isArray(value) ? value[0] : value
    if (first !== undefined) query.set(key, first)
  }
  query.set('tier', OFFER_TIER)
  query.set('inc', 'yes')

  return {
    show: true,
    headline: 'The enhanced path may pay more.',
    body: `If your household income is under the Mass Save limit, the income-qualified award can reach ${usd(
      rule.capUsd,
    )}, or cover the whole job as a no-cost turnkey install. A Home Energy Assessment decides, and the income limits are not published. Nothing here is a decision.`,
    linkLabel: 'See the enhanced path',
    href: `/verdict?${query.toString()}`,
  }
}

/** The tier the offer switches to. Exported so a test can read it without parsing copy. */
export const OFFER_TIER: Tier = 'enhanced'
