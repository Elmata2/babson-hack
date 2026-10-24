/**
 * @built F-26 /api/parse-bill — one vision call, in memory, nothing stored
 * @built F-77 route options — the household facts the photograph cannot carry
 * @built F-79 two readers — a console API key or an OpenRouter key, same contract
 *
 * The privacy rule from steering: the image is read in this request and discarded.
 * No filesystem, no blob store, no cache key, no log line that contains the image,
 * the response text, or an address. The model is asked for eleven fields plus an
 * optional printed usage chart; the validator in `lib/parse` decides whether they
 * are possible, and annualises only by a named method.
 *
 * Optional form fields carry what no photograph contains:
 *   deliveriesPerSeason (2–8)  one oil ticket × the household's own fill cadence
 *   heating (true|false)       a gas bill that only covers cooking is not a heat source
 *   forceMonthlyX12 (true)     the user explicitly wants a flat ×12
 *   countyFips (25001–25027)   shapes the heating year; defaults to Suffolk/Boston
 *
 * Readers, in order of preference:
 *   anthropic   a real console key (`sk-ant-api03-…`), if one is configured
 *   openrouter  any vision model by slug; the default is gemma-3-12b at ~$0.00003 a bill
 *
 * `sk-ant-oat01-…` is a Claude Code OAuth token. It authenticates with a bearer
 * header and then answers every request with 429 rate_limit_error, because it has
 * no API quota. It is deliberately not accepted here: a credential that can only
 * fail is worse than a clear "not configured".
 *
 * Failure is typed and boring: no key, unsupported file, too large, upstream down,
 * rate-limited, not a bill. Every one of them leaves the user with manual entry,
 * which is faster than a retry anyway.
 *
 * POST multipart/form-data, field `file`. GET is a 405.
 */

import { readBill, type ReadBillOptions } from '@/lib/parse/plausibility'
import { BILL_PROMPT, readJsonBody } from '@/lib/parse/prompt'
import type { BillReadResult } from '@/lib/parse/types'

/** The same ceiling `next.config.ts` sets for a server action body. */
const MAX_BYTES = 12 * 1024 * 1024

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const

/** A vision call is the slowest thing in the app; the design budget is 6s of UI. */
const UPSTREAM_TIMEOUT_MS = 20_000

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
/** Cheap, fast, and it read a 12-bar usage chart off a photographed bill on 2026-10-24. */
const OPENROUTER_DEFAULT_MODEL = 'google/gemma-3-12b-it'

type ProviderName = 'anthropic' | 'openrouter'

interface Provider {
  name: ProviderName
  key: string
}

/** Either the model's text, or a ready-to-return failure. */
type ReadOutcome =
  | { ok: true; text: string }
  | { ok: false; status: number; code: string; message: string }

function fail(status: number, code: string, message: string): Response {
  return Response.json({ ok: false, code, message }, { status })
}

interface VisionContentBlock {
  type: string
  text?: string
}

/** Anthropic's envelope. OpenRouter uses the OpenAI chat shape instead. */
interface AnthropicResponse {
  content?: VisionContentBlock[]
}

interface OpenRouterResponse {
  choices?: { message?: { content?: string | null } }[]
}

function isImage(mediaType: string): boolean {
  return (IMAGE_TYPES as readonly string[]).includes(mediaType)
}

/**
 * Which reader this deployment has. Documented rather than clever: a console key
 * wins, an OpenRouter key is the fallback, an OAuth token is refused with a reason
 * the operator can act on.
 */
function pickProvider(): { provider: Provider | null; reason: string } {
  const anthropic = process.env.ANTHROPIC_API_KEY?.trim() ?? ''
  if (anthropic.startsWith('sk-ant-api')) {
    return { provider: { name: 'anthropic', key: anthropic }, reason: '' }
  }

  const openrouter = process.env.OPENROUTER_API_KEY?.trim() ?? ''
  if (openrouter) {
    return { provider: { name: 'openrouter', key: openrouter }, reason: '' }
  }

  if (anthropic.startsWith('sk-ant-oat')) {
    return {
      provider: null,
      reason:
        'The configured Anthropic credential is a Claude Code OAuth token, which has no API quota. Add a console API key (sk-ant-api03-…) or an OPENROUTER_API_KEY.',
    }
  }
  return {
    provider: null,
    reason: 'Bill reading is not configured on this deployment. Enter the two numbers instead — it is just as fast.',
  }
}

/** Map an upstream status onto a typed failure the UI can act on. */
function upstreamFailure(status: number): ReadOutcome {
  if (status === 401 || status === 403) {
    return {
      ok: false,
      status: 503,
      code: 'vision_credentials',
      message: 'Bill reading is not authorised on this deployment. Enter the two numbers instead.',
    }
  }
  if (status === 429) {
    return {
      ok: false,
      status: 429,
      code: 'vision_rate_limited',
      message: 'Bill reading is rate-limited right now. Type the two numbers instead — it takes ten seconds.',
    }
  }
  // The upstream body can echo the request; never forward it to the client.
  return {
    ok: false,
    status: 502,
    code: 'upstream',
    message: 'The reader is unavailable. Enter the numbers by hand and carry on.',
  }
}

async function readWithAnthropic(provider: Provider, mediaType: string, data: string): Promise<ReadOutcome> {
  const model = process.env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-4-5'
  const isPdf = mediaType === 'application/pdf'
  if (!isImage(mediaType) && !isPdf) {
    return { ok: false, status: 415, code: 'unsupported', message: 'Send a JPEG, PNG, WebP or PDF.' }
  }

  const block = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: mediaType, data } }
    : { type: 'image', source: { type: 'base64', media_type: mediaType, data } }

  const upstream = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'anthropic-version': ANTHROPIC_VERSION,
      'x-api-key': provider.key,
    },
    body: JSON.stringify({
      model,
      max_tokens: 1_024,
      temperature: 0,
      messages: [{ role: 'user', content: [block, { type: 'text', text: BILL_PROMPT }] }],
    }),
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  })

  if (!upstream.ok) return upstreamFailure(upstream.status)

  const payload = (await upstream.json()) as AnthropicResponse
  const text = payload.content?.find((part) => part.type === 'text')?.text
  return text
    ? { ok: true, text }
    : { ok: false, status: 502, code: 'unreadable', message: 'The reader returned nothing. Try a clearer photo, or type the numbers.' }
}

async function readWithOpenRouter(provider: Provider, mediaType: string, data: string): Promise<ReadOutcome> {
  // OpenRouter's image_url takes images. A PDF has to be photographed or exported
  // as one — better a straight answer than a confusing 400 from a provider.
  if (!isImage(mediaType)) {
    return {
      ok: false,
      status: 415,
      code: 'unsupported',
      message: 'The OpenRouter reader takes images. Photograph the bill, or export the PDF page as a photo.',
    }
  }

  const model = process.env.OPENROUTER_MODEL?.trim() || OPENROUTER_DEFAULT_MODEL
  const upstream = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${provider.key}`,
      'content-type': 'application/json',
      // OpenRouter attributes traffic by these; both are optional and harmless.
      'x-title': 'Switchpoint',
    },
    body: JSON.stringify({
      model,
      max_tokens: 700,
      temperature: 0,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:${mediaType};base64,${data}` } },
            { type: 'text', text: BILL_PROMPT },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  })

  if (!upstream.ok) return upstreamFailure(upstream.status)

  const payload = (await upstream.json()) as OpenRouterResponse
  const text = payload.choices?.[0]?.message?.content ?? ''
  return text.trim()
    ? { ok: true, text }
    : { ok: false, status: 502, code: 'unreadable', message: 'The reader returned nothing. Try a clearer photo, or type the numbers.' }
}

/**
 * The document alone is not always enough to reach an annual figure. These three
 * optional form fields carry what only the household knows, and each one is
 * validated before it reaches the parser — junk becomes absent, never a guess.
 */
function optionalInt(value: FormDataEntryValue | null, low: number, high: number): number | null {
  if (typeof value !== 'string' || value.trim() === '') return null
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < low || parsed > high) return null
  return parsed
}

function optionalBool(value: FormDataEntryValue | null): boolean | undefined {
  if (typeof value !== 'string') return undefined
  const normalised = value.trim().toLowerCase()
  if (normalised === 'false' || normalised === '0' || normalised === 'no') return false
  if (normalised === 'true' || normalised === '1' || normalised === 'yes') return true
  return undefined
}

/** Massachusetts counties are 25001–25027; anything else is not a county we can shape. */
function optionalCounty(value: FormDataEntryValue | null): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return /^250\d\d$/.test(trimmed) ? trimmed : null
}

export async function POST(request: Request): Promise<Response> {
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return fail(400, 'bad_request', 'Send the bill as multipart/form-data in a `file` field.')
  }

  const file = form.get('file')
  if (!(file instanceof File)) {
    return fail(400, 'bad_request', 'No file in the request. Attach one image or PDF in `file`.')
  }
  if (file.size === 0) {
    return fail(400, 'bad_request', 'The file is empty.')
  }
  if (file.size > MAX_BYTES) {
    return fail(413, 'too_large', 'That file is over 12 MB. A phone photo is usually under 4 MB.')
  }

  const mediaType = file.type || 'application/octet-stream'
  if (!isImage(mediaType) && mediaType !== 'application/pdf') {
    return fail(
      415,
      'unsupported',
      'Send a JPEG, PNG, WebP or PDF. If it is a scan app export, save it as PDF or a photo.',
    )
  }

  const { provider, reason } = pickProvider()
  if (!provider) return fail(503, 'vision_not_configured', reason)

  // What the pixels cannot tell us. Absent fields stay absent so the parser's own
  // defaults and refusal paths still apply: a missing fill count must produce a
  // question, not a fabricated annual figure.
  const options: ReadBillOptions = {}
  const fills = optionalInt(form.get('deliveriesPerSeason'), 2, 8)
  if (fills !== null) options.deliveriesPerSeason = fills
  const heating = optionalBool(form.get('heating'))
  if (heating !== undefined) options.heating = heating
  const forceMonthlyX12 = optionalBool(form.get('forceMonthlyX12'))
  if (forceMonthlyX12 !== undefined) options.forceMonthlyX12 = forceMonthlyX12
  const countyFips = optionalCounty(form.get('countyFips'))
  if (countyFips !== null) options.countyFips = countyFips

  const data = Buffer.from(await file.arrayBuffer()).toString('base64')

  let outcome: ReadOutcome
  try {
    outcome =
      provider.name === 'anthropic'
        ? await readWithAnthropic(provider, mediaType, data)
        : await readWithOpenRouter(provider, mediaType, data)
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError'
    return fail(
      timedOut ? 504 : 502,
      timedOut ? 'timeout' : 'upstream',
      timedOut
        ? 'The reader took too long. Enter the two numbers instead.'
        : 'The reader is unreachable. Enter the two numbers instead.',
    )
  }

  if (!outcome.ok) return fail(outcome.status, outcome.code, outcome.message)

  const json = readJsonBody(outcome.text)
  if (json === null) {
    return fail(422, 'unreadable', 'The reader did not return usable fields. Type them instead.')
  }

  const result: BillReadResult = readBill(json, Date.now(), options)
  if (!result.ok) {
    return fail(422, result.refusal.code, result.refusal.message)
  }

  // `reader` is provenance for the UI: which machine read the bill is a privacy
  // claim the user is entitled to see.
  return Response.json(
    { ok: true, bill: result.bill, reader: provider.name },
    { headers: { 'cache-control': 'no-store' } },
  )
}

export function GET(): Response {
  return fail(405, 'bad_request', 'POST only: this endpoint reads a document, it does not serve one.')
}
