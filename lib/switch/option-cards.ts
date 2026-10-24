/**
 * @built F-152 outreach copy — what the agent does in this deployment, as a pure function of the plan
 *
 * What the agent does is read from the outreach plan, so the copy can never promise
 * more than this deployment does: email only, no phone calls, replies not parsed,
 * and nothing at all when outreach is off.
 */

import type { Fuel, VerdictResult } from '../calc/types'
import { MAX_PROVIDERS_PER_SESSION } from './consent'

export interface OptionInput {
  result: VerdictResult
  fuel: Fuel | null
  unitPrice: number | null
  annualUnits: number | null
  market: { price: number | null; period: string | null }
  basic: { centsPerKwh: number | null; source: string; sourceDate: string } | null
  noMassSave: boolean
  plan: { mode: 'off' | 'allowlist' | 'live' }
  /** Providers the agent could actually reach in this mode: email-capable and non-test in live, test lines in allowlist. */
  reachable: { fuel: number; installer: number }
}

export type Who = 'dealers' | 'installers'

function agentMode(input: OptionInput, who: Who): 'off' | 'allowlist' | 'live' {
  const count = input.reachable[who === 'dealers' ? 'fuel' : 'installer']
  return count === 0 ? 'off' : input.plan.mode
}

function agentWhat(input: OptionInput, who: Who): string {
  const mode = agentMode(input, who)
  const count = Math.min(MAX_PROVIDERS_PER_SESSION, input.reachable[who === 'dealers' ? 'fuel' : 'installer'])
  if (mode === 'off') {
    const why =
      input.plan.mode === 'off'
        ? 'The agent is switched off in this build'
        : `No ${who === 'dealers' ? 'dealer' : 'installer'} the agent can reach is configured in this build`
    return `${why}, so nothing is sent. Open this to read exactly what it would say to ${who}, then use the kit to ask them yourself.`
  }
  if (mode === 'allowlist') {
    return 'You tick providers and confirm the facts. The agent then contacts team test lines only, not real businesses, and the statuses are staged for the demo.'
  }
  return `After you consent, the agent emails up to ${count} ${who} you tick, saying only the facts you have read. It places no phone calls and does not read replies. You compare what comes back and choose.`
}

export function outreachCopy(who: Who, input: OptionInput): { live: boolean; what: string } {
  return { live: agentMode(input, who) !== 'off', what: agentWhat(input, who) }
}
