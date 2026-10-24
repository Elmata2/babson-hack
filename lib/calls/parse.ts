/**
 * @built F-125 parse a conversation into a quote — the boundary is where trust stops
 *
 * The platform returns a transcript, a status and a set of data-collection results.
 * None of that is trusted: a provider can say "$0.99 a gallon" and the extraction
 * will faithfully report 0.99. This module's job is only to turn shapes into shapes
 * — numbers stay numbers, a missing answer stays null — so the ranking gate in
 * `lib/switch/quotes.ts` can throw the implausible row out and show it unranked.
 *
 * Three rules, because this is the one place a stranger's words enter the app:
 *   1. An unreadable value is `null`, never 0 and never a guess.
 *   2. Every accepted value keeps the rationale (or the sentence) that produced it.
 *   3. The transcript is excerpted, redacted and capped — the drawer shows the turns
 *      that back a number, not the whole conversation (design §12.2).
 */

import type {
  CallStatus,
  Cited,
  FuelQuoteWire,
  InstallerQuoteWire,
  ProviderQuote,
  TranscriptExcerpt,
  Vertical,
} from './types'

const MAX_EXCERPTS = 6
const MAX_EXCERPT_CHARS = 240

/** Anything that looks like contact detail is masked before it can be rendered. */
const EMAIL_LIKE = /\S+@\S+\.\S+/g
const PHONE_LIKE = /(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\b\d{3})[\s.-]?\d{3}[\s.-]?\d{4}\b/g

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The platform's status spellings, mapped to the closed set the UI renders. */
const STATUS_ALIASES: Record<string, CallStatus> = {
  queued: 'queued',
  initiated: 'queued',
  ringing: 'ringing',
  'in-progress': 'in_progress',
  in_progress: 'in_progress',
  processing: 'in_progress',
  done: 'done',
  completed: 'done',
  'no-answer': 'no_answer',
  no_answer: 'no_answer',
  voicemail: 'voicemail',
  declined: 'declined',
  failed: 'failed',
  error: 'failed',
}

export function normaliseStatus(raw: unknown): CallStatus {
  if (typeof raw !== 'string') return 'in_progress'
  return STATUS_ALIASES[raw.trim().toLowerCase()] ?? 'in_progress'
}

/** An excerpt is a quote, so it is trimmed, redacted and capped. */
export function redactExcerpt(text: string): string {
  const collapsed = text.replace(/\s+/g, ' ').trim()
  const masked = collapsed.replace(EMAIL_LIKE, '[redacted]').replace(PHONE_LIKE, '[redacted]')
  return masked.length > MAX_EXCERPT_CHARS ? `${masked.slice(0, MAX_EXCERPT_CHARS - 1)}…` : masked
}

/** Turns from the platform's `transcript[]`, newest last, capped. */
export function excerptsFrom(raw: unknown): TranscriptExcerpt[] {
  if (!Array.isArray(raw)) return []
  const turns: TranscriptExcerpt[] = []
  for (const entry of raw) {
    if (!isRecord(entry)) continue
    const message = entry.message ?? entry.text
    if (typeof message !== 'string' || message.trim() === '') continue
    const speaker = entry.role === 'agent' || entry.role === 'ai' ? 'agent' : 'provider'
    turns.push({ speaker, text: redactExcerpt(message) })
  }
  return turns.slice(-MAX_EXCERPTS)
}

/**
 * One data-collection field. The platform returns `{ value, rationale }`; a
 * hand-built fixture may return `{ value, evidence }` or a bare value. All three
 * are read, and an unreadable value becomes `null`.
 */
function citedNumber(raw: unknown): Cited<number> {
  const { value, evidence } = unwrap(raw)
  if (typeof value === 'number' && Number.isFinite(value)) return { value, evidence }
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[$,\s]/g, ''))
    if (Number.isFinite(parsed)) return { value: parsed, evidence }
  }
  return { value: null, evidence }
}

function citedBoolean(raw: unknown): Cited<boolean> {
  const { value, evidence } = unwrap(raw)
  if (typeof value === 'boolean') return { value, evidence }
  if (typeof value === 'string') {
    const normalised = value.trim().toLowerCase()
    if (['true', 'yes', 'y', '1'].includes(normalised)) return { value: true, evidence }
    if (['false', 'no', 'n', '0'].includes(normalised)) return { value: false, evidence }
  }
  return { value: null, evidence }
}

/** A date is accepted only as a real calendar date, never as a sentence. */
function citedDate(raw: unknown): Cited<string> {
  const { value, evidence } = unwrap(raw)
  if (typeof value !== 'string') return { value: null, evidence }
  const text = value.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return { value: null, evidence }
  const parsed = new Date(`${text}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return { value: null, evidence }
  return { value: text, evidence }
}

function unwrap(raw: unknown): { value: unknown; evidence: string | null } {
  if (isRecord(raw)) {
    const evidence = typeof raw.rationale === 'string' ? raw.rationale : typeof raw.evidence === 'string' ? raw.evidence : null
    return { value: raw.value, evidence }
  }
  return { value: raw, evidence: null }
}

/** The platform's results object, under either of the two shapes the API has used. */
export function dataCollection(raw: unknown): Record<string, unknown> {
  if (!isRecord(raw)) return {}
  const analysis = isRecord(raw.analysis) ? raw.analysis : null
  const fromAnalysis = analysis && isRecord(analysis.data_collection_results) ? analysis.data_collection_results : null
  if (fromAnalysis) return fromAnalysis
  if (isRecord(raw.data_collection_results)) return raw.data_collection_results
  return {}
}

/** Transcript may sit at the top level or under `analysis`. */
function transcriptOf(raw: unknown): unknown {
  if (!isRecord(raw)) return null
  if (Array.isArray(raw.transcript)) return raw.transcript
  const analysis = isRecord(raw.analysis) ? raw.analysis : null
  return analysis && Array.isArray(analysis.transcript) ? analysis.transcript : null
}

export function durationOf(raw: unknown): number | null {
  if (!isRecord(raw)) return null
  const meta = isRecord(raw.metadata) ? raw.metadata : {}
  const candidates = [meta.call_duration_secs, raw.durationSeconds, raw.call_duration_secs]
  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate >= 0) return Math.round(candidate)
  }
  return null
}

/** True when the provider asked to be the one calling back (R18.4). */
function needsCallbackOf(source: Record<string, unknown>): boolean {
  return unwrap(source.needs_callback).value === true
}

/**
 * Parse one conversation.
 * Guarantee: the returned quote always has every field the vertical requires, with
 * `null` for anything unreadable, and a status from the closed set. It never throws.
 */
export function parseConversation(
  raw: unknown,
  ctx: { providerId: string; vertical: Vertical },
): {
  status: CallStatus
  durationSeconds: number | null
  excerpts: TranscriptExcerpt[]
  quote: ProviderQuote
  needsCallback: boolean
} {
  const results = dataCollection(raw)
  const status = normaliseStatus(isRecord(raw) ? raw.status : null)
  const excerpts = excerptsFrom(transcriptOf(raw))

  const quote: ProviderQuote =
    ctx.vertical === 'fuel'
      ? ({
          vertical: 'fuel',
          providerId: ctx.providerId,
          pricePerGal: citedNumber(results.price_per_gal ?? results.pricePerGal),
          cardSurchargePct: citedNumber(results.card_surcharge_pct ?? results.cardSurchargePct),
          minGallons: citedNumber(results.min_gallons ?? results.minGallons),
          deliveryFee: citedNumber(results.delivery_fee ?? results.deliveryFee),
          priceCapPerGal: citedNumber(results.price_cap_per_gal ?? results.priceCapPerGal),
          priceCapFee: citedNumber(results.price_cap_fee ?? results.priceCapFee),
          earliestDelivery: citedDate(results.earliest_delivery ?? results.earliestDelivery),
          servesTown: citedBoolean(results.serves_town ?? results.servesTown),
          needsCallback: false,
        } satisfies FuelQuoteWire)
      : ({
          vertical: 'installer',
          providerId: ctx.providerId,
          massSaveParticipating: citedBoolean(results.mass_save_participating ?? results.massSaveParticipating),
          acceptsHeatLoan: citedBoolean(results.accepts_heat_loan ?? results.acceptsHeatLoan),
          earliestSiteVisit: citedDate(results.earliest_site_visit ?? results.earliestSiteVisit),
          canInstallByDec31: citedBoolean(results.can_install_by_dec31 ?? results.canInstallByDec31),
          ballparkPerTon: citedNumber(results.ballpark_per_ton ?? results.ballparkPerTon),
          needsCallback: false,
        } satisfies InstallerQuoteWire)

  const needsCallback = needsCallbackOf(results)
  quote.needsCallback = needsCallback

  return { status, durationSeconds: durationOf(raw), excerpts, quote, needsCallback }
}
