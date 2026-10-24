/**
 * @built F-167 what a page may honestly say about the voice path, decided on the server
 *
 * The dashboard and the switch screen both have to answer "can this deployment place
 * the call, and if not, what exactly is missing?" before anyone presses a button. The
 * answer is configuration, so it is read once on the server and passed down as a
 * small plain object — the key itself never leaves the server.
 */

import { agentFrom, agentReady } from './plan'

export interface VoiceReadiness {
  /** The three platform values, as booleans: a page needs to know, not to have them. */
  apiKey: boolean
  agentId: boolean
  phoneNumberId: boolean
  /** `PROVIDER_OUTREACH_ENABLED` (or the legacy `PROVIDER_CALLS_ENABLED`). */
  outreachEnabled: boolean
  /** True only when all three values exist and outreach is switched on. */
  canDial: boolean
  /** The environment variable names a deployer still has to set, in the order to set them. */
  missing: string[]
}

const NAMES = {
  apiKey: 'ELEVENLABS_API_KEY',
  agentId: 'ELEVENLABS_AGENT_ID',
  phoneNumberId: 'ELEVENLABS_PHONE_NUMBER_ID',
} as const

export function voiceReadiness(env: NodeJS.ProcessEnv = process.env): VoiceReadiness {
  const agent = agentFrom(env)
  const outreachEnabled = env.PROVIDER_OUTREACH_ENABLED === 'true' || env.PROVIDER_CALLS_ENABLED === 'true'
  const missing: string[] = []
  if (!agent.apiKey) missing.push(NAMES.apiKey)
  if (!agent.agentId) missing.push(NAMES.agentId)
  if (!agent.phoneNumberId) missing.push(NAMES.phoneNumberId)
  if (!outreachEnabled) missing.push('PROVIDER_OUTREACH_ENABLED')
  return {
    apiKey: Boolean(agent.apiKey),
    agentId: Boolean(agent.agentId),
    phoneNumberId: Boolean(agent.phoneNumberId),
    outreachEnabled,
    canDial: agentReady(agent) && outreachEnabled,
    missing,
  }
}

/**
 * What a client component may receive. Same rule as `publicPlan`: a server component
 * serializes its props into the page, so the deployer's variable names are only sent
 * to a screen that asks for them.
 */
export interface PublicVoiceReadiness {
  canDial: boolean
  missing: string[]
}

export function publicReadiness(readiness: VoiceReadiness, options: { demo?: boolean; debug?: boolean } = {}): PublicVoiceReadiness {
  const keep = options.debug === true && options.demo !== true
  return { canDial: readiness.canDial, missing: keep ? readiness.missing : [] }
}

/**
 * The one sentence a screen shows, and only when calling is actually available.
 * A deployment with no number does not advertise calling at all: the switch kit is
 * the path, and the kit says so in its own words.
 */
export function readinessLine(readiness: PublicVoiceReadiness, options: { demo?: boolean } = {}): string {
  if (options.demo) {
    return 'Demo mode: the agent beat is replayed from a fixture in this tab. Nothing is dialled, no installer hears anything.'
  }
  if (readiness.canDial) {
    return 'The agent is ready to call. Nothing is dialled until you approve the facts on the consent screen.'
  }
  return 'The switch kit below has the exact question and the number to call yourself.'
}
