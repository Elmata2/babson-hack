/**
 * POST /api/consent — the server's receipt for the consent screen.
 *
 * The household approved a closed fact list for a named set of providers. This
 * route validates that exact body and signs it with the time, so `/api/calls` and
 * `/api/switch` can tell an approved request from a hand-made one. The token is
 * good for ten minutes and for nothing else: change a provider or a fact and it
 * stops verifying.
 */

import { isDemoFlag, demoFromRequest } from '@/lib/demo'
import { operatorGate, outreachMode } from '@/lib/security/operator'
import { consentSecretReady } from '@/lib/security/secret'
import { validateOutreachRequest } from '@/lib/switch/consent'
import { mintConsentToken } from '@/lib/switch/consent-token'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const NO_STORE = { 'cache-control': 'no-store' }
const SESSION_ID = /^[a-z0-9][a-z0-9-]{7,63}$/

function refuse(status: number, code: string, message: string): Response {
  return Response.json({ ok: false, code, message }, { status, headers: NO_STORE })
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return refuse(400, 'bad_json', 'The request body was not JSON.')
  }

  const validated = validateOutreachRequest(body)
  if (!validated.ok) return refuse(400, validated.code, validated.message)

  const raw = body as { sessionId?: unknown; consentToken?: unknown; demo?: unknown }
  if (raw.consentToken !== undefined) return refuse(400, 'unknown_field', 'A consent request carries no token.')
  const sessionId = typeof raw.sessionId === 'string' ? raw.sessionId : null
  if (sessionId === null || !SESSION_ID.test(sessionId)) {
    return refuse(400, 'bad_session', 'A session id is 8–64 lowercase letters, digits and hyphens.')
  }

  if (demoFromRequest(request) || isDemoFlag(raw.demo)) {
    return Response.json({ ok: true, demo: true }, { headers: NO_STORE })
  }

  const mode = outreachMode(validated.value.facts.town)
  if (mode === 'off') return Response.json({ ok: true, mode: 'off' }, { headers: NO_STORE })

  if (!consentSecretReady()) {
    return refuse(503, 'consent_secret_not_configured', 'Live outreach needs CONSENT_SECRET (32+ characters). Nothing was sent.')
  }
  const gate = operatorGate(request.headers)
  if (!gate.ok) return refuse(gate.status, gate.code, gate.message)

  const now = new Date()
  return Response.json(
    { ok: true, mode, consentToken: mintConsentToken(validated.value, sessionId, mode, now), issuedAt: now.toISOString() },
    { headers: NO_STORE },
  )
}

export function GET(): Response {
  return refuse(405, 'bad_method', 'POST only.')
}
