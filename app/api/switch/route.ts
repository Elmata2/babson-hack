/**
 * @built F-147 POST /api/switch — the only way a provider is contacted, and it refuses
 * @built F-49 `?demo=1` or `"demo": true` validates the same closed fact list, then
 * returns baked `queued` statuses with mode `demo` — no email, no call, no fetch
 *
 * The route is a gate, not an integration. It validates a closed fact list (R18.1),
 * rejects anything that identifies a person (R18.2), caps the provider count (R18.3),
 * checks business hours for calls (R19.6), and then does exactly one of three things:
 *
 *   off       — nothing is sent, and the notice says so;
 *   allowlist — team test lines only, statuses staged and labelled;
 *   live      — a templated email per provider, and a typed failure otherwise.
 *
 * There is no phone-call implementation in this build. A phone channel therefore
 * returns `unsupported` with the switch kit as the answer, never a fake `ringing`.
 *
 * No storage, no database, no PII. The browser keeps the consent snapshot.
 */

import { DEMO_MESSAGES, demoFromRequest, isDemoFlag } from '@/lib/demo'
import { nextCallWindow, validateOutreachRequest, withinBusinessHours } from '@/lib/switch/consent'
import { sendEmail } from '@/lib/switch/outreach'
import { loadProviders, outreachPlan } from '@/lib/switch/providers'
import { fuelRequestText, installerRequestText, requestSubject } from '@/lib/switch/requests'
import type { OutreachResult, ProviderStatus, SwitchProvider } from '@/lib/switch/types'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'cache-control': 'no-store' }

function refuse(status: number, code: string, message: string): Response {
  return Response.json({ ok: false, code, message }, { status, headers: NO_STORE })
}

function statusFor(
  provider: SwitchProvider,
  channel: 'email' | 'phone',
  status: ProviderStatus['status'],
  note: string | null,
  now: Date,
): ProviderStatus {
  return {
    providerId: provider.id,
    name: provider.name,
    channel,
    status,
    allowlist: provider.allowlist,
    note,
    at: now.toISOString(),
  }
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

  const demo =
    demoFromRequest(request) ||
    (typeof body === 'object' && body !== null && isDemoFlag((body as { demo?: unknown }).demo))

  const providers = loadProviders()
  const byId = new Map(providers.map((provider) => [provider.id, provider]))
  const selected: { provider: SwitchProvider; channel: 'email' | 'phone' }[] = []

  for (const choice of payload.providers) {
    const provider = byId.get(choice.id)
    if (!provider) {
      return refuse(400, 'unknown_provider', `"${choice.id}" is not in this deployment's provider list.`)
    }
    if (provider.kind !== payload.kind) {
      return refuse(400, 'wrong_provider_kind', `${provider.name} cannot answer a ${payload.kind} question.`)
    }
    if (!provider.channels.includes(choice.channel)) {
      return refuse(400, 'channel_unavailable', `${provider.name} is not configured for ${choice.channel}.`)
    }
    selected.push({ provider, channel: choice.channel })
  }

  const plan = outreachPlan(providers)
  const now = new Date()

  // F-49: a demo demonstrates the flow without touching the plan or the network.
  // The request has already passed the same validation as a live one, so the
  // screen shows the real provider names and the real channels — only the send
  // is replaced by a baked status.
  if (demo) {
    const statuses = selected.map(({ provider, channel }) =>
      statusFor(
        provider,
        channel,
        'queued',
        'Demo mode — baked status. Nothing was dialled, emailed or sent.',
        now,
      ),
    )
    const result: OutreachResult = {
      ok: true,
      mode: 'demo',
      notice: DEMO_MESSAGES.switch,
      statuses,
    }
    return Response.json(result, { headers: NO_STORE })
  }

  if (plan.mode === 'off') {
    const result: OutreachResult = {
      ok: true,
      mode: 'off',
      notice: plan.reason ?? 'Nothing was sent.',
      statuses: [],
    }
    return Response.json(result, { headers: NO_STORE })
  }

  if (plan.mode === 'allowlist') {
    const statuses = selected.map(({ provider, channel }) =>
      statusFor(
        provider,
        channel,
        'queued',
        'Team test line — staged for the demo. No real business was dialled or emailed.',
        now,
      ),
    )
    const result: OutreachResult = {
      ok: true,
      mode: 'allowlist',
      notice: plan.notice ?? 'Team test lines only.',
      statuses,
    }
    return Response.json(result, { headers: NO_STORE })
  }

  // ---- live: email only. Phone is stated as unsupported, never simulated. ----
  const text =
    payload.kind === 'fuel' ? fuelRequestText(payload.facts) : installerRequestText(payload.facts)
  const subject = requestSubject(payload.kind, payload.facts)
  const statuses: ProviderStatus[] = []

  for (const { provider, channel } of selected) {
    if (provider.allowlist) {
      statuses.push(
        statusFor(
          provider,
          channel,
          'queued',
          'Team test line — staged for the demo. No real business was dialled or emailed.',
          now,
        ),
      )
      continue
    }

    if (channel === 'phone') {
      statuses.push(
        statusFor(
          provider,
          channel,
          withinBusinessHours(now) ? 'unsupported' : 'scheduled',
          withinBusinessHours(now)
            ? 'This build places no phone calls. The switch kit has the exact question and the number.'
            : `Business hours only — the next window is ${nextCallWindow(now)}. The switch kit has the question now.`,
          now,
        ),
      )
      continue
    }

    if (!provider.email) {
      statuses.push(statusFor(provider, channel, 'failed', 'No email address on file for this provider.', now))
      continue
    }

    const sent = await sendEmail({ to: provider.email, subject, text })
    statuses.push(
      statusFor(
        provider,
        channel,
        sent.ok ? 'sent' : 'failed',
        sent.ok ? 'Templated request sent. A reply is read by a person, not parsed automatically.' : sent.message,
        now,
      ),
    )
  }

  const result: OutreachResult = {
    ok: true,
    mode: 'live',
    notice: 'Email requests only. Nothing identifies the household beyond the facts you approved.',
    statuses,
  }
  return Response.json(result, { headers: NO_STORE })
}

/** Any other verb: a typed refusal, never a stack trace. */
export function GET(): Response {
  return refuse(405, 'bad_method', 'POST only: this endpoint takes a consent request, it does not list providers.')
}
