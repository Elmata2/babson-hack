/**
 * @built F-124 the only outbound call path — one POST, one number, one refusal path
 * @built F-125 read and delete a conversation; nothing is stored on our side
 *
 * ADR-010: polling, not webhooks, and the browser holds the conversation ids. So
 * this module is three fetches with a timeout and a typed result. It never throws:
 * a provider failure is a `{ ok: false, message }` the route can render, because a
 * dead vendor must degrade to the switch kit rather than a 500.
 *
 * The API shapes are the documented ElevenLabs Convai ones (design §12.3 asked for
 * them to be verified against the live payload). `parse.ts` treats whatever comes
 * back as untrusted regardless of shape.
 */

import type { CallAgent } from './plan'

export const ELEVENLABS_BASE = 'https://api.elevenlabs.io/v1/convai'

export type Result<T> = { ok: true; value: T } | { ok: false; message: string }

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

const TIMEOUT_MS = 8_000

/** A short, non-leaking description of a failed call. Never the API key, never the body. */
function failure(what: string, status: number): string {
  if (status === 401 || status === 403) return `${what} was refused by the voice platform (key not accepted).`
  if (status === 404) return `${what} was not found on the voice platform.`
  if (status === 429) return `${what} was rate-limited by the voice platform. Try again in a minute.`
  if (status >= 500) return `${what} failed on the voice platform (${status}). Nothing was stored.`
  return `${what} was refused (${status}).`
}

async function request(
  path: string,
  init: RequestInit,
  agent: CallAgent,
  fetchImpl: FetchLike,
): Promise<Result<unknown>> {
  if (!agent.apiKey) return { ok: false, message: 'No voice platform key is configured.' }
  try {
    const response = await fetchImpl(`${ELEVENLABS_BASE}${path}`, {
      ...init,
      headers: {
        'xi-api-key': agent.apiKey,
        'content-type': 'application/json',
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!response.ok) return { ok: false, message: `The voice platform answered ${response.status}.` }
    if (response.status === 204) return { ok: true, value: null }
    const text = await response.text()
    if (text.trim() === '') return { ok: true, value: null }
    try {
      return { ok: true, value: JSON.parse(text) }
    } catch {
      return { ok: false, message: 'The voice platform returned something that was not JSON.' }
    }
  } catch {
    return { ok: false, message: 'The voice platform is unreachable from here.' }
  }
}

export interface StartCallInput {
  toNumber: string
  /** R18.1 facts, as dynamic variables the agent's prompt may say. */
  variables: Record<string, string>
  /** The vertical prompt: the agent picks one of two scripts without a redeploy. */
  vertical: 'fuel' | 'installer'
}

/**
 * Place one outbound call (R19.1–19.2).
 * Guarantee: returns the platform's conversation id, or a message. It never retries
 * — a duplicate call to a stranger is worse than a failed one.
 */
export async function startCall(
  input: StartCallInput,
  agent: CallAgent,
  fetchImpl: FetchLike = fetch,
): Promise<Result<{ conversationId: string }>> {
  if (!agent.agentId || !agent.phoneNumberId) {
    return { ok: false, message: 'No agent or phone number is configured on this deployment.' }
  }
  const body = {
    agent_id: agent.agentId,
    agent_phone_number_id: agent.phoneNumberId,
    to_number: input.toNumber,
    conversation_initiation_client_data: {
      conversation_config_override: {
        agent: {
          first_message: null,
          language: 'en',
        },
      },
      dynamic_variables: { ...input.variables, vertical: input.vertical },
    },
  }
  const result = await request('/twilio/outbound-call', { method: 'POST', body: JSON.stringify(body) }, agent, fetchImpl)
  if (!result.ok) {
    return { ok: false, message: result.message === 'The voice platform answered 401.' ? failure('The call', 401) : result.message }
  }
  const payload = result.value
  const conversationId =
    typeof payload === 'object' && payload !== null
      ? ((payload as { conversation_id?: unknown }).conversation_id ?? (payload as { conversationId?: unknown }).conversationId)
      : null
  if (typeof conversationId !== 'string' || conversationId.trim() === '') {
    return { ok: false, message: 'The voice platform accepted the call but returned no conversation id.' }
  }
  return { ok: true, value: { conversationId } }
}

/** Poll one conversation (R19.7). The caller parses it; this only fetches. */
export async function readConversation(
  conversationId: string,
  agent: CallAgent,
  fetchImpl: FetchLike = fetch,
): Promise<Result<unknown>> {
  return request(`/conversations/${encodeURIComponent(conversationId)}`, { method: 'GET' }, agent, fetchImpl)
}

/** R22.2: delete the conversation, best effort. A failure is reported, not hidden. */
export async function deleteConversation(
  conversationId: string,
  agent: CallAgent,
  fetchImpl: FetchLike = fetch,
): Promise<Result<null>> {
  const result = await request(`/conversations/${encodeURIComponent(conversationId)}`, { method: 'DELETE' }, agent, fetchImpl)
  return result.ok ? { ok: true, value: null } : result
}
