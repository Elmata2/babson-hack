/**
 * @built F-131 R23.2 — the one server tool the inbound agent may call
 *
 * The agent does not compute. It posts the four facts it heard to this route, and
 * the route runs the same `computeVerdict` the web screen runs, then hands back a
 * finished sentence per language (`lib/voice/line.ts`). The model reads it aloud.
 *
 * Two gates, because this endpoint is reachable from the internet:
 *   - a shared secret (`VOICE_TOOL_SECRET`) in `x-voice-secret`; with no secret
 *     configured the route is off, not open;
 *   - a closed fact list, exactly like the consent screen, so a caller cannot smuggle
 *     a name or an address into the calculation.
 *
 * Prices come from the baked snapshot rather than a live EIA read: a phone answer has
 * three seconds, and R3.4 says a provider failure degrades rather than blocks.
 */

import { computeVerdict } from '@/lib/calc'
import type { Verdict } from '@/lib/calc/types'
import { getPrices } from '@/lib/prices'
import { findIdentifyingField } from '@/lib/switch/consent'
import { ALL_TOWNS } from '@/lib/utility'
import { resolveVerdictInputs } from '@/lib/verdict/inputs'
import { disclaimerLine, decisionLine, parseVoiceLang, verdictLine, VOICE_LANGS } from '@/lib/voice/line'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const NO_STORE = { 'cache-control': 'no-store' }
const FACTS = new Set(['town', 'fuel', 'units', 'price', 'year', 'lang'])

function refuse(status: number, code: string, message: string): Response {
  return Response.json({ ok: false, code, message }, { status, headers: NO_STORE })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.VOICE_TOOL_SECRET
  if (!secret) {
    return refuse(503, 'not_configured', 'The voice verdict tool is off on this deployment: VOICE_TOOL_SECRET is not set.')
  }
  if (request.headers.get('x-voice-secret') !== secret) {
    return refuse(401, 'bad_secret', 'That call did not carry the tool secret, so nothing was computed.')
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return refuse(400, 'bad_json', 'The tool call body was not JSON.')
  }
  if (!isRecord(body)) return refuse(400, 'bad_body', 'The tool call body was not an object.')

  const identifying = findIdentifyingField(body)
  if (identifying) {
    return refuse(400, 'personal_fact', `This tool call carries ${identifying}. It takes a town and four numbers, nothing else.`)
  }
  for (const key of Object.keys(body)) {
    if (!FACTS.has(key)) return refuse(400, 'unknown_field', `"${key}" is not one of the four facts this tool takes.`)
  }

  const lang = parseVoiceLang(typeof body.lang === 'string' ? body.lang : 'en')
  if (!lang) {
    return refuse(400, 'bad_language', `The language must be one of ${VOICE_LANGS.join(', ')}.`)
  }

  const town = typeof body.town === 'string' ? body.town.trim() : ''
  if (!ALL_TOWNS.includes(town)) {
    return refuse(400, 'bad_town', 'The town must be one of the 351 Massachusetts municipalities.')
  }
  if (body.fuel !== 'oil' && body.fuel !== 'propane' && body.fuel !== 'gas' && body.fuel !== 'resistance') {
    return refuse(400, 'bad_fuel', 'The fuel must be oil, propane, gas or electric resistance.')
  }
  const units = Number(body.units)
  const price = Number(body.price)
  if (!Number.isFinite(units) || units <= 0) {
    return refuse(400, 'bad_units', 'The annual volume must be a positive number.')
  }
  if (!Number.isFinite(price) || price <= 0) {
    return refuse(400, 'bad_price', 'The price per unit must be a positive number.')
  }
  const year = body.year === '2027' ? '2027' : '2026'

  const prices = await getPrices({ demo: true })
  const inputs = resolveVerdictInputs(
    {
      town,
      fuel: String(body.fuel),
      units: String(units),
      price: String(price),
      tier: 'enhanced',
      year,
      inc: 'yes',
    },
    prices,
  )
  if (!inputs.heating || !inputs.upgrade) {
    return refuse(422, 'not_computable', 'Those numbers are not enough to compute a verdict. Ask for the annual volume and the price per unit.')
  }

  const result = computeVerdict(inputs.heating, inputs.upgrade)
  if (!result) {
    return refuse(422, 'not_computable', 'Those numbers are outside what this calculator will stand behind, so no verdict is given.')
  }

  const rebateDrop = Math.max(0, result.rebate2026 - result.rebate2027)
  const verdict: Verdict = result.verdict

  return Response.json(
    {
      ok: true,
      verdict,
      line: verdictLine(
        {
          verdict,
          annualSavings: result.annualSavings,
          paybackYears: result.paybackYears,
          breakEvenCents: result.breakEvenElectricPrice === null ? null : result.breakEvenElectricPrice * 100,
          rebateDrop,
        },
        lang,
      ),
      disclaimer: disclaimerLine(lang),
      decision: decisionLine(lang),
      numbers: {
        annualSavings: Math.round(result.annualSavings),
        paybackYears: result.paybackYears,
        rebateDrop,
      },
      source: `Fuel prices: ${prices.asOf} snapshot · Electricity: ${prices.elec.period}`,
    },
    { headers: NO_STORE },
  )
}

export function GET(): Response {
  return refuse(405, 'bad_method', 'POST only: this is an agent tool, not a page.')
}
