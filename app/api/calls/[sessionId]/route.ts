/**
 * @built F-125 GET + DELETE a session's calls — poll by id, delete by id, store nothing
 *
 * ADR-010 in one sentence: the browser holds the conversation ids, so this route is
 * told what to read on every poll and keeps no session of its own. `sessionId` in
 * the path is the browser's own nonce — it makes the URL honest about which tab it
 * belongs to and gives a place for the deletion sweep to hang, nothing more.
 *
 * Demo ids (`demo-…`) are replay fixtures: they are computed from `t`, never fetched
 * from the vendor (R13.1), and deleting one is a no-op that still says so.
 */

import { DEMO_MESSAGES, demoFromRequest } from '@/lib/demo'
import { deleteConversation, readConversation } from '@/lib/calls/elevenlabs'
import { fixtureRecord, isDemoConversationId } from '@/lib/calls/fixtures'
import { parseConversation } from '@/lib/calls/parse'
import { agentReady, agentFrom, callPlan } from '@/lib/calls/plan'
import { callRecord, elapsedOf, parseRefs, type CallRef } from '@/lib/calls/route-model'
import type { CallPoll, CallRecord, Vertical } from '@/lib/calls/types'
import { openCallId } from '@/lib/switch/consent-token'
import { directoryFor } from '@/lib/switch/directory'
import type { SwitchProvider } from '@/lib/switch/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const NO_STORE = { 'cache-control': 'no-store' }
const SESSION_ID = /^[a-z0-9][a-z0-9-]{7,63}$/

type OpenRef = CallRef & { signed: string }

function badRef(): Response {
  return Response.json(
    { ok: false, code: 'bad_call_ref', message: 'That call reference was not issued for this session.' },
    { status: 403, headers: NO_STORE },
  )
}

/** Vendor ids for refs this session issued; null if any ref is foreign. Demo ids pass through. */
function openRefs(refs: CallRef[], sessionId: string): OpenRef[] | null {
  const opened: OpenRef[] = []
  for (const ref of refs) {
    if (isDemoConversationId(ref.conversationId)) {
      opened.push({ ...ref, signed: ref.conversationId })
      continue
    }
    const id = openCallId(ref.conversationId, sessionId)
    if (id === null) return null
    opened.push({ ...ref, conversationId: id, signed: ref.conversationId })
  }
  return opened
}

/** An ISO-8601 instant within a week of now, normalised; anything else is now. */
function sinceOf(raw: string | null): string {
  const parsed = raw === null ? Number.NaN : Date.parse(raw)
  return Number.isNaN(parsed) || Math.abs(parsed - Date.now()) > 7 * 24 * 60 * 60_000
    ? new Date().toISOString()
    : new Date(parsed).toISOString()
}

function providerFor(ref: CallRef, town: string): SwitchProvider | null {
  return directoryFor(town).find((provider) => provider.id === ref.providerId) ?? null
}

function verticalOf(provider: SwitchProvider | null): Vertical {
  return provider?.kind ?? 'fuel'
}

export async function GET(request: Request, ctx: { params: Promise<{ sessionId: string }> }): Promise<Response> {
  const { sessionId } = await ctx.params
  if (!SESSION_ID.test(sessionId)) return badRef()
  const url = new URL(request.url)
  const parsedRefs = parseRefs(url)
  const town = url.searchParams.get('town') ?? ''
  const startedAt = sinceOf(url.searchParams.get('since'))
  const elapsed = elapsedOf(url)
  const demo = demoFromRequest(request) || parsedRefs.some((ref) => isDemoConversationId(ref.conversationId))

  if (parsedRefs.length === 0) {
    return Response.json(
      { ok: false, code: 'no_calls', message: 'Send the conversation ids to poll: ?call=<id>:<providerId>.' },
      { status: 400, headers: NO_STORE },
    )
  }

  const refs: OpenRef[] | null = demo
    ? parsedRefs.map((ref) => ({ ...ref, signed: ref.conversationId }))
    : openRefs(parsedRefs, sessionId)
  if (refs === null) return badRef()

  if (demo) {
    const records = refs.map((ref) => {
      const staged = fixtureRecord(ref.providerId, elapsed, startedAt)
      if (staged) return staged
      const provider = providerFor(ref, town)
      return {
        ...callRecord(provider ?? stubProvider(ref.providerId), 'queued', 'Demo mode — nothing was dialled.'),
        conversationId: ref.conversationId,
      }
    })
    const result: CallPoll = {
      ok: true,
      mode: 'demo',
      notice: DEMO_MESSAGES.calls,
      records,
      complete: records.every((record) => !['queued', 'ringing', 'in_progress'].includes(record.status)),
    }
    return Response.json(result, { headers: NO_STORE })
  }

  const agent = agentFrom()
  if (!agentReady(agent)) {
    const result: CallPoll = {
      ok: true,
      mode: 'off',
      notice: 'Calling is off here, so there is nothing to poll. The switch kit still works.',
      records: [],
      complete: true,
    }
    return Response.json(result, { headers: NO_STORE })
  }

  const records: CallRecord[] = []
  for (const ref of refs) {
    const provider = providerFor(ref, town)
    const fetched = await readConversation(ref.conversationId, agent)
    if (!fetched.ok) {
      records.push({
        ...callRecord(provider ?? stubProvider(ref.providerId), 'failed', fetched.message),
        conversationId: ref.signed,
      })
      continue
    }
    const parsed = parseConversation(fetched.value, {
      providerId: ref.providerId,
      vertical: verticalOf(provider),
    })
    records.push({
      providerId: ref.providerId,
      providerName: provider?.name ?? ref.providerId,
      vertical: verticalOf(provider),
      conversationId: ref.signed,
      status: parsed.status,
      at: new Date().toISOString(),
      durationSeconds: parsed.durationSeconds,
      excerpts: parsed.excerpts,
      quote: parsed.status === 'done' ? parsed.quote : null,
      needsCallback: parsed.needsCallback,
      note: null,
    })
  }

  const plan = callPlan(directoryFor(town))
  const result: CallPoll = {
    ok: true,
    mode: plan.mode === 'live' ? 'live' : 'allowlist',
    notice: plan.notice ?? 'Every number below came from a call this session placed.',
    records,
    complete: records.every((record) => !['queued', 'ringing', 'in_progress'].includes(record.status)),
  }
  return Response.json(result, { headers: NO_STORE })
}

export async function DELETE(request: Request, ctx: { params: Promise<{ sessionId: string }> }): Promise<Response> {
  const { sessionId } = await ctx.params
  if (!SESSION_ID.test(sessionId)) return badRef()
  const url = new URL(request.url)
  const parsedRefs = parseRefs(url)
  if (parsedRefs.length === 0) {
    return Response.json(
      { ok: false, code: 'no_calls', message: 'Name the conversations to delete: ?call=<conversationId>.' },
      { status: 400, headers: NO_STORE },
    )
  }

  const refs = openRefs(parsedRefs, sessionId)
  if (refs === null) return badRef()

  const agent = agentFrom()
  const deleted: string[] = []
  const skipped: string[] = []
  const failed: { conversationId: string; message: string }[] = []

  for (const ref of refs) {
    if (isDemoConversationId(ref.conversationId)) {
      skipped.push(ref.signed)
      continue
    }
    if (!agentReady(agent)) {
      failed.push({ conversationId: ref.signed, message: 'No voice platform key is configured on this deployment.' })
      continue
    }
    const result = await deleteConversation(ref.conversationId, agent)
    if (result.ok) deleted.push(ref.signed)
    else failed.push({ conversationId: ref.signed, message: result.message })
  }

  return Response.json({ ok: failed.length === 0, deleted, skipped, failed }, { headers: NO_STORE })
}

/** A typed page for a verb this route does not answer. */
export function POST(): Response {
  return Response.json(
    { ok: false, code: 'bad_method', message: 'Poll with GET, forget with DELETE. Calls start at POST /api/calls.' },
    { status: 405, headers: NO_STORE },
  )
}

/** A provider row for an id this deployment does not know (a stale tab, a moved list). */
function stubProvider(id: string): SwitchProvider {
  return {
    id,
    name: id,
    kind: 'fuel',
    channels: ['phone'],
    phone: null,
    email: null,
    source: 'unknown',
    asOf: '1970-01-01',
    allowlist: true,
  }
}
