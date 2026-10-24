/**
 * @built F-26 /api/parse-bill — one vision call, in memory, nothing stored
 * @built F-77 route options — the household facts the photograph cannot carry
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
 * Failure is typed and boring: no key, unsupported file, too large, upstream down,
 * not a bill. Every one of them leaves the user with manual entry, which is
 * faster than a retry anyway.
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

function fail(status: number, code: string, message: string): Response {
  return Response.json({ ok: false, code, message }, { status })
}

interface VisionContentBlock {
  type: string
  text?: string
}

interface VisionResponse {
  content?: VisionContentBlock[]
}

/** The base64 block for the model, or null when the type is not one we accept. */function mediaBlock(
  mediaType: string,
  data: string,
): { type: 'image' | 'document'; source: { type: 'base64'; media_type: string; data: string } } | null {
  if ((IMAGE_TYPES as readonly string[]).includes(mediaType)) {
    return { type: 'image', source: { type: 'base64', media_type: mediaType, data } }
  }
  if (mediaType === 'application/pdf') {
    return { type: 'document', source: { type: 'base64', media_type: mediaType, data } }
  }
  return null
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
  const apiKey = process.env.ANTHROPIC_API_KEY
  const model = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-5'

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

  const source = mediaBlock(file.type, Buffer.from(await file.arrayBuffer()).toString('base64'))
  if (!source) {
    return fail(
      415,
      'unsupported',
      'Send a JPEG, PNG, WebP or PDF. If it is a scan app export, save it as PDF or a photo.',
    )
  }

  if (!apiKey) {
    return fail(
      503,
      'vision_not_configured',
      'Bill reading is not configured on this deployment. Enter the two numbers instead — it is just as fast.',
    )
  }

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

  let payload: VisionResponse
  try {
    const upstream = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model,
        max_tokens: 1_024,
        temperature: 0,
        messages: [
          {
            role: 'user',
            content: [source, { type: 'text', text: BILL_PROMPT }],
          },
        ],
      }),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    })

    if (!upstream.ok) {
      // The upstream body can echo the request; never forward it to the client.
      return fail(502, 'upstream', 'The reader is unavailable. Enter the numbers by hand and carry on.')
    }
    payload = (await upstream.json()) as VisionResponse
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

  const text = payload.content?.find((block) => block.type === 'text')?.text
  if (!text) {
    return fail(502, 'unreadable', 'The reader returned nothing. Try a clearer photo, or type the numbers.')
  }

  const json = readJsonBody(text)
  if (json === null) {
    return fail(422, 'unreadable', 'The reader did not return usable fields. Type them instead.')
  }

  const result: BillReadResult = readBill(json, Date.now(), options)
  if (!result.ok) {
    return fail(422, result.refusal.code, result.refusal.message)
  }

  // Explicitly no-store: a bill is not a cacheable asset.
  return Response.json({ ok: true, bill: result.bill }, { headers: { 'cache-control': 'no-store' } })
}

export function GET(): Response {
  return fail(405, 'bad_request', 'POST only: this endpoint reads a document, it does not serve one.')
}
