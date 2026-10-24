/**
 * @built F-123 what this deployment can honestly do when a call is requested
 *
 * R19.8 is the whole point of this file: a real business is dialled only when the
 * server was explicitly told to, and otherwise the only numbers in play are the
 * team's own test lines. A missing agent is not an error state — it is the common
 * case on a laptop, and the screen says so and offers the switch kit.
 */

import type { SwitchProvider } from '../switch/types'

export interface CallAgent {
  apiKey: string | null
  agentId: string | null
  phoneNumberId: string | null
}

export type DialMode = 'off' | 'allowlist' | 'live'

export interface CallPlan {
  mode: DialMode
  /** Why nothing can be dialled, or null. Always rendered when `off`. */
  reason: string | null
  /** The sentence that keeps an allowlist demo honest. */
  notice: string | null
  agent: CallAgent
}

function clean(value: string | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed && trimmed !== '' ? trimmed : null
}

/** The three values an outbound call needs. Read the same way on the route and the page. */
export function agentFrom(env: NodeJS.ProcessEnv = process.env): CallAgent {
  return {
    apiKey: clean(env.ELEVENLABS_API_KEY),
    agentId: clean(env.ELEVENLABS_AGENT_ID),
    phoneNumberId: clean(env.ELEVENLABS_PHONE_NUMBER_ID),
  }
}

export function agentReady(agent: CallAgent): boolean {
  return Boolean(agent.apiKey && agent.agentId && agent.phoneNumberId)
}

/**
 * What a client component is allowed to receive. The plan's `agent` holds the API
 * key, and a React server component hands its props to the browser inside the RSC
 * payload — so passing the plan itself put `"apiKey":"sk_…"` into the page HTML.
 * `mode`, `reason` and `notice` are the only three fields any screen reads.
 *
 * In demo mode the reason is dropped as well: it is written for a deployer
 * ("no voice agent is configured"), and a reader of the demo is told the truth
 * about the replay instead (`demoNotice` in the switch flow). The same applies to
 * a serialized payload nobody reads.
 */
export type PublicCallPlan = Pick<CallPlan, 'mode' | 'reason' | 'notice'>

export function publicPlan(plan: CallPlan, options: { demo?: boolean } = {}): PublicCallPlan {
  if (options.demo) return { mode: plan.mode, reason: null, notice: null }
  return { mode: plan.mode, reason: plan.reason, notice: plan.notice }
}

/**
 * R19.8. `PROVIDER_OUTREACH_ENABLED=true` is the only way a real business is dialled.
 *
 * The documented switch is `PROVIDER_OUTREACH_ENABLED` (design §onboarding-switch says
 * it replaces the older dial-only flag), and `.env.example` publishes only that one. The
 * legacy `PROVIDER_CALLS_ENABLED` is still read so an older deployment that set it does
 * not silently stop dialling — but it is the alias, not the documentation.
 */
function outreachEnabled(env: NodeJS.ProcessEnv): boolean {
  return env.PROVIDER_OUTREACH_ENABLED === 'true' || env.PROVIDER_CALLS_ENABLED === 'true'
}

export function callPlan(providers: readonly SwitchProvider[], env: NodeJS.ProcessEnv = process.env): CallPlan {
  const agent = agentFrom(env)

  if (!agentReady(agent)) {
    return {
      mode: 'off',
      // Household-facing words. Which variable is missing is an operator fact, and
      // `npm run voice:check` (plus the dashboard's readiness card) names it.
      reason:
        'Calling is off here: no voice agent is configured on this deployment, so no number is dialled. The switch kit below has the exact question and the number to call yourself.',
      notice: null,
      agent,
    }
  }

  if (providers.length === 0) {
    return {
      mode: 'off',
      reason:
        'No provider list is configured, and this build will not invent dealer or installer numbers. The switch kit below is the complete path.',
      notice: null,
      agent,
    }
  }

  const realCalls = outreachEnabled(env)
  if (!realCalls) {
    return {
      mode: 'allowlist',
      reason: null,
      notice:
        'Team test lines only — no real business is dialled. PROVIDER_OUTREACH_ENABLED is not set on this deployment.',
      agent,
    }
  }

  return { mode: 'live', reason: null, notice: null, agent }
}

/**
 * Whether one row may be dialled under this plan.
 * Guarantee: `live` dials anything on the list; `allowlist` dials only rows marked
 * as team lines; `off` dials nothing. A refusal carries its own reason.
 */
export function dialable(
  provider: SwitchProvider,
  plan: CallPlan,
): { ok: true } | { ok: false; note: string } {
  if (plan.mode === 'off') {
    return { ok: false, note: plan.reason ?? 'Calling is off on this deployment.' }
  }
  if (!provider.channels.includes('phone') || !provider.phone) {
    return { ok: false, note: `${provider.name} has no phone number on file, so no call is placed.` }
  }
  if (plan.mode === 'allowlist' && !provider.allowlist) {
    return {
      ok: false,
      note: `${provider.name} is a real business. Calls to real businesses need PROVIDER_OUTREACH_ENABLED=true, which this deployment has not set.`,
    }
  }
  return { ok: true }
}

/** E.164 only. A number the platform cannot dial is refused by name, never repaired. */
export function isE164(raw: string | null): boolean {
  return Boolean(raw && /^\+[1-9]\d{7,14}$/.test(raw))
}
