/**
 * @built F-39 /api/explain — three sentences of plain English, and never a number that is not on the page
 * @built F-49 `?demo=1` or `"demo": true` returns the deterministic sentences from the
 * posted verdict (source `fallback`), with no provider pick and no request
 *
 * The route receives the verdict the page already computed, gives the model only
 * those facts, and then runs the same number guard the client fallback uses. A
 * model sentence that invents a figure is discarded; the deterministic three
 * sentences are returned instead. So the endpoint has no failure mode that leaves
 * the section empty, and no path that puts a new number in front of a household.
 *
 * It never sees the address or the bill: the body is a `VerdictResult`, and the
 * shape is validated before anything is prompted (ADR-005).
 *
 * Next 16 deprecates the edge runtime for route handlers; this runs on the
 * default Node runtime and uses only Web Request/Response.
 *
 * POST /api/explain  { result: VerdictResult } → { ok, sentences, source, reader }
 */

import { demoFromRequest, isDemoFlag } from '@/lib/demo'
import { chatText, pickChatProvider } from '@/lib/net/chat'
import {
  buildExplainPrompt,
  checkedSentences,
  EXPLAIN_MAX_SENTENCES,
  fallbackSentences,
  isVerdictResult,
} from '@/lib/verdict/explain'

export const maxDuration = 15

const NO_STORE = { 'cache-control': 'no-store' } as const

function fail(status: number, code: string, message: string): Response {
  return Response.json({ ok: false, code, message }, { status, headers: NO_STORE })
}

/** The answer that always exists, and the one the route prefers when the writer misbehaves. */
function deterministic(sentences: string[]): Response {
  return Response.json(
    { ok: true, sentences: sentences.slice(0, EXPLAIN_MAX_SENTENCES), source: 'fallback', reader: 'none' },
    { headers: NO_STORE },
  )
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return fail(400, 'bad_request', 'Send JSON in the shape { "result": <VerdictResult> }.')
  }

  const candidate = typeof body === 'object' && body !== null ? (body as { result?: unknown }).result : undefined
  if (!isVerdictResult(candidate)) {
    return fail(400, 'bad_request', 'The body must carry the verdict result this page computed.')
  }

  const fallback = fallbackSentences(candidate)
  const demo =
    demoFromRequest(request) ||
    (typeof body === 'object' && body !== null && isDemoFlag((body as { demo?: unknown }).demo))
  if (demo) {
    // The deterministic sentences are the honest offline answer: they are computed
    // from the posted result, so they cannot invent a number the page does not show.
    return Response.json(
      { ok: true, demo: true, sentences: fallback.slice(0, EXPLAIN_MAX_SENTENCES), source: 'fallback', reader: 'none' },
      { headers: NO_STORE },
    )
  }

  const { provider } = pickChatProvider()
  if (!provider) return deterministic(fallback)

  try {
    const outcome = await chatText(provider, buildExplainPrompt(candidate), { maxTokens: 400, timeoutMs: 8_000 })
    if (!outcome.ok || !outcome.text) return deterministic(fallback)

    const sentences = checkedSentences(outcome.text, candidate)
    if (sentences === null) return deterministic(fallback)

    return Response.json(
      { ok: true, sentences, source: 'model', reader: provider.name },
      { headers: NO_STORE },
    )
  } catch {
    // A writer failure is not the household's problem; the fallback is already written.
    return deterministic(fallback)
  }
}

export function GET(): Response {
  return fail(405, 'bad_request', 'POST only: this endpoint writes an explanation, it does not serve one.')
}
