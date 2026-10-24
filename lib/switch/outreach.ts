/**
 * @built F-147 email outreach — Resend, one templated request per provider
 *
 * Email is the degraded-path channel Addendum B adds (§3.6): a templated request
 * with the same allowed facts, sent from a Switchpoint address. Replies go to a
 * per-request alias; this build does not parse them, so a reply is a human reading
 * their inbox, not a `ProviderQuote`.
 *
 * `fetch` is injectable so the route test needs no key and no network. A non-2xx is
 * a typed failure, never a silent success.
 */

/** The slice of `fetch` this module needs, so tests can answer without a network. */
export type EmailFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number }>

export interface EmailInput {
  to: string
  subject: string
  text: string
}

export type SendOutcome = { ok: true } | { ok: false; code: string; message: string }

export interface SendOptions {
  apiKey?: string | undefined
  from?: string | undefined
  fetchImpl?: EmailFetch | undefined
  timeoutMs?: number | undefined
}

/** POST one email through Resend. Missing configuration is a named refusal. */
export async function sendEmail(input: EmailInput, options: SendOptions = {}): Promise<SendOutcome> {
  const apiKey = options.apiKey ?? process.env.RESEND_API_KEY ?? ''
  const from = options.from ?? process.env.RESEND_FROM ?? ''
  if (!apiKey || !from) {
    return {
      ok: false,
      code: 'email_not_configured',
      message: 'Email outreach needs RESEND_API_KEY and RESEND_FROM. Nothing was sent.',
    }
  }

  const fetchImpl: EmailFetch = options.fetchImpl ?? ((url, init) => fetch(url, init))
  let response: { ok: boolean; status: number }
  try {
    response = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ from, to: [input.to], subject: input.subject, text: input.text }),
      signal: AbortSignal.timeout(options.timeoutMs ?? 8_000),
    })
  } catch (error) {
    console.error('outreach email transport failed', error instanceof Error ? error.name : 'unknown')
    return {
      ok: false,
      code: 'email_unreachable',
      message: 'The email service did not answer. Nothing was sent.',
    }
  }

  if (!response.ok) {
    console.error('outreach email rejected', response.status)
    return {
      ok: false,
      code: 'email_rejected',
      message: 'The email service refused the message. Nothing was sent.',
    }
  }
  return { ok: true }
}
