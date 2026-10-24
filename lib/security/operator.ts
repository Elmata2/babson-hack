import { createHash, timingSafeEqual } from 'node:crypto'

import { callPlan } from '../calls/plan'
import { directoryFor } from '../switch/directory'
import { loadProviders, outreachPlan } from '../switch/providers'

export type Gate = { ok: true } | { ok: false; status: 401 | 503; code: string; message: string }

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
