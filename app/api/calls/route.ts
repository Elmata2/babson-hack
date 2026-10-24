/**
 * @built F-124 POST /api/calls — the one route that can dial a stranger, and it refuses first
 * @built F-129 `?demo=1` replays three staged conversations instead of dialling anything
 *
 * Order matters here, and it is the order R17–R19 asks for:
 *
 *   1. the body is a consent request (same closed fact list as `/api/switch`, R18.1);
 *   2. every provider on it is a phone row this deployment may dial (R19.8);
 *   3. business hours hold, unless the row is a team line (R19.6);
 *   4. the agent exists (R19.1) — otherwise the answer is `off`, never a fake ring.
 *
 * The route stores nothing (ADR-010): the conversation ids go back to the browser,
 * which sends them on every poll and deletes them when it is done. A vendor failure
 * is a typed status per provider, because one dead call must not fail a session.
 */

import { DEMO_MESSAGES, demoFromRequest, isDemoFlag } from '@/lib/demo'
import { startCall } from '@/lib/calls/elevenlabs'
import { fixtureRecord } from '@/lib/calls/fixtures'
import { callPlan, dialable, isE164 } from '@/lib/calls/plan'
import { callRecord, callVariables } from '@/lib/calls/route-model'
import type { CallRecord, CallStart } from '@/lib/calls/types'
import { nextCallWindow, validateOutreachRequest, withinBusinessHours } from '@/lib/switch/consent'
import { directoryFor } from '@/lib/switch/directory'
import type { SwitchProvider } from '@/lib/switch/types'

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
  const payload = validated.value

  const raw = body as { sessionId?: unknown; demo?: unknown }
  const sessionId = typeof raw.sessionId === 'string' ? raw.sessionId : null
  if (sessionId !== null && !SESSION_ID.test(sessionId)) {
    return refuse(400, 'bad_session', 'A session id is 8–64 lowercase letters, digits and hyphens.')
  }

  const demo = demoFromRequest(request) || isDemoFlag(raw.demo)

  const providers = directoryFor(payload.facts.town)
  const byId = new Map(providers.map((provider) => [provider.id, provider]))
  const selected: SwitchProvider[] = []
  for (const choice of payload.providers) {
    const provider = byId.get(choice.id)
    if (!provider) {
      return refuse(400, 'unknown_provider', `"${choice.id}" is not in this deployment's provider list.`)
    }
    if (provider.kind !== payload.kind) {
      return refuse(400, 'wrong_provider_kind', `${provider.name} cannot answer a ${payload.kind} question.`)
    }
    if (!provider.phone) {
      return refuse(400, 'no_phone', `${provider.name} has no phone number on file, so no call can be placed.`)
    }
    selected.push(provider)
  }

  const plan = callPlan(providers)
  const now = new Date()

  // F-129: the replay is staged, not recorded. Nothing leaves the process.
  if (demo) {
    const startedAt = now.toISOString()
    const records = selected.map((provider) => {
      const staged = fixtureRecord(provider.id, 0, startedAt)
      return (
        staged ?? {
          ...callRecord(provider, 'queued', 'Demo mode — this line has no staged conversation, so nothing is dialled.', {
            conversationId: `demo-${provider.id}`,
          }),
        }
      )
    })
    const result: CallStart = { ok: true, mode: 'demo', notice: DEMO_MESSAGES.calls, records }
    return Response.json(result, { headers: NO_STORE })
  }

  if (plan.mode === 'off') {
    const result: CallStart = {
      ok: true,
      mode: 'off',
      notice: plan.reason ?? 'Calling is off here, so nothing was dialled.',
      records: [],
    }
    return Response.json(result, { headers: NO_STORE })
  }

  const agent = plan.agent
  const variables = callVariables(payload.facts)
  const records: CallRecord[] = []

  for (const provider of selected) {
    const allowed = dialable(provider, plan)
    if (!allowed.ok) {
      records.push(callRecord(provider, 'scheduled', allowed.note))
      continue
    }
    if (!isE164(provider.phone)) {
      records.push(
        callRecord(provider, 'failed', 'The number on file is not in a dialable format, so nothing was dialled.'),
      )
      continue
    }
    // R19.6: a team line is exempt so the demo works on a Saturday evening.
    if (!withinBusinessHours(now) && !provider.allowlist) {
      records.push(callRecord(provider, 'scheduled', `Business hours only — the next window is ${nextCallWindow(now)}.`))
      continue
    }

    const started = await startCall(
      { toNumber: provider.phone as string, variables, vertical: payload.kind },
      agent,
    )
    records.push(
      started.ok
        ? callRecord(provider, 'queued', null, { conversationId: started.value.conversationId })
        : callRecord(provider, 'failed', started.message),
    )
  }

  const result: CallStart = {
    ok: true,
    mode: plan.mode,
    notice:
      plan.notice ??
      'Each call asks the questions on the consent screen and nothing else. Every number comes back with its sentence.',
    records,
  }
  return Response.json(result, { headers: NO_STORE })
}

/** Any other verb: a typed refusal, never a stack trace. */
export function GET(): Response {
  return refuse(405, 'bad_method', 'POST only: this endpoint starts calls, it does not list them.')
}
