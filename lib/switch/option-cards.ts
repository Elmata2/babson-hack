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
  town: string
  plan: { mode: 'off' | 'allowlist' | 'live' }
  /** What the dial plan can do, when it differs from the email plan. */
  call?: { mode: 'off' | 'allowlist' | 'live' }
  /** The demo replays the agent beat; it is live for the reader without sending anything. */
  demo?: boolean
  /** Providers the agent could actually reach in this mode: email-capable and non-test in live, test lines in allowlist. */
  reachable: { fuel: number; installer: number }
}

export type Who = 'dealers' | 'installers'

function agentMode(input: OptionInput, who: Who): 'off' | 'allowlist' | 'live' {
  if (input.demo) return 'live'
  const count = input.reachable[who === 'dealers' ? 'fuel' : 'installer']
  if (count > 0) return input.plan.mode
  // No email-reachable provider is not the same as no contact path: the dial plan
  // can still call a phone row. With no dial plan either, the answer is off.
  return input.call?.mode ?? 'off'
}

function agentWhat(input: OptionInput, who: Who): string {
  const mode = agentMode(input, who)
  const count = Math.min(
    MAX_PROVIDERS_PER_SESSION,
    input.reachable[who === 'dealers' ? 'fuel' : 'installer'] || 2,
  )
  const noun = who === 'dealers' ? 'dealer' : 'installer'
  if (input.demo) {
    return `Demo mode: the agent calls up to ${count} ${noun}s from a fixture, in the same order every run. Nothing is dialled. You still read and approve the exact facts first, and the ranking is computed from what the fixture said.`
  }
  if (mode === 'off') {
    const why =
      input.plan.mode === 'off' && (input.call?.mode ?? 'off') === 'off'
        ? 'The agent is switched off in this build'
        : `No ${noun} the agent can reach is configured in this build`
    return `${why}, so nothing is sent. Open this to read exactly what it would say to ${who}, then use the kit to ask them yourself.`
  }
  if (mode === 'allowlist') {
    return 'You confirm the facts. The agent then calls team test lines only — no real business is dialled or emailed — and the statuses are staged for the demo.'
  }
  return `After you consent, the agent calls up to ${count} ${noun}s you pick (and emails where a line is configured), saying only the facts you have read. It never says your name, street, phone, email or income. You compare what comes back and choose.`
}

export function outreachCopy(who: Who, input: OptionInput): { live: boolean; what: string } {
  return { live: agentMode(input, who) !== 'off', what: agentWhat(input, who) }
}
