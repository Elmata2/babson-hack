import { createHash, timingSafeEqual } from 'node:crypto'

import { callPlan } from '../calls/plan'
import { directoryFor } from '../switch/directory'
import { loadProviders, outreachPlan } from '../switch/providers'
import { originKind } from './same-origin'

export type Gate = { ok: true } | { ok: false; status: 401 | 403 | 503; code: string; message: string }

export type OutreachMode = 'off' | 'allowlist' | 'live'

/** The most live of the two channels' plans. Off means there is nothing to consent to. */
export function outreachMode(town: string, env: NodeJS.ProcessEnv = process.env): OutreachMode {
  const modes = [outreachPlan(loadProviders(env), env).mode, callPlan(directoryFor(town, env), env).mode]
  if (modes.includes('live')) return 'live'
  return modes.includes('allowlist') ? 'allowlist' : 'off'
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest()
}

/** Live and allowlist outreach is operator-only: the key never reaches the browser bundle. */
export function operatorGate(headers: Headers, env: NodeJS.ProcessEnv = process.env): Gate {
  const expected = env.OPERATOR_KEY ?? ''
  if (expected === '') {
    return { ok: false, status: 503, code: 'operator_key_not_configured', message: 'Live outreach needs OPERATOR_KEY on this deployment. Nothing was sent.' }
  }
  const given = headers.get('x-operator-key') ?? ''
  if (!timingSafeEqual(digest(given), digest(expected))) {
    return { ok: false, status: 401, code: 'operator_only', message: 'Live outreach is operator-only in this build.' }
  }
  return { ok: true }
}

/**
 * The gate in front of minting a consent token — one press of the household's own
 * confirm button, and nothing else.
 *
 * `same-origin` is the household's own tab: accepted. That is the whole product
 * promise, and it cannot be met any other way because `OPERATOR_KEY` is never in the
 * browser bundle. `cross-origin` is refused with no fallback, so a third-party page
 * cannot make this browser sign something. `unknown` (no Fetch Metadata, no Origin:
 * curl, a server) must prove itself with the operator key, exactly as before.
 */
export function consentGate(headers: Headers, env: NodeJS.ProcessEnv = process.env): Gate {
  const kind = originKind(headers)
  if (kind === 'same-origin') return { ok: true }
  if (kind === 'cross-origin') {
    return {
      ok: false,
      status: 403,
      code: 'cross_origin',
      message: 'Consent is signed for this site only, and this request came from another origin. Nothing was sent.',
    }
  }
  return operatorGate(headers, env)
}
