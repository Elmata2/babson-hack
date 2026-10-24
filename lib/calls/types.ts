/**
 * @built F-123 the voice agent's wire vocabulary — one closed shape per call
 * @built F-127 the call board's shapes, typed once so the route and the screen agree
 *
 * Design §12.1. Every field a call can report is nullable and carries the evidence
 * that produced it: the platform's own extraction rationale plus the provider's
 * turns of the transcript. A number without its sentence is not shown as a number,
 * so `Cited<T>` is the unit of everything that crosses this boundary.
 *
 * Nothing here reads the clock, the network or the environment. The route parses an
 * untrusted payload into these shapes (`parse.ts`); the screen renders them; the
 * ranking stays in `lib/switch/quotes.ts`, where it was already tested.
 */

import type { ContactStatus } from '../switch/types'

/**
 * R19.7, plus the two statuses this build can honestly report: `scheduled` for a
 * call outside business hours and `unsupported` for a deployment with no agent.
 * One vocabulary with the email path (`ContactStatus`) so the board and the
 * dashboard cannot disagree about what "done" means.
 */
export type CallStatus = ContactStatus

/** What a call answered, and the sentence it was read from. */
export interface Cited<T> {
  value: T | null
  evidence: string | null
}

export type Vertical = 'fuel' | 'installer'

/** R19.2, fuel dealers. `pricePerGal` is the cash/COD price; the cap is a separate offer. */
export interface FuelQuoteWire {
  vertical: 'fuel'
  providerId: string
  pricePerGal: Cited<number>
  cardSurchargePct: Cited<number>
  minGallons: Cited<number>
  deliveryFee: Cited<number>
  /** Prebuy or price-cap price — shown, never ranked (R20.4). */
  priceCapPerGal: Cited<number>
  priceCapFee: Cited<number>
  earliestDelivery: Cited<string>
  servesTown: Cited<boolean>
  needsCallback: boolean
}

/** R19.2, installers. `ballparkPerTon` is always labelled ballpark. */
export interface InstallerQuoteWire {
  vertical: 'installer'
  providerId: string
  massSaveParticipating: Cited<boolean>
  acceptsHeatLoan: Cited<boolean>
  earliestSiteVisit: Cited<string>
  canInstallByDec31: Cited<boolean>
  ballparkPerTon: Cited<number>
  needsCallback: boolean
}

export type ProviderQuote = FuelQuoteWire | InstallerQuoteWire

/** A cited turn. Capped in `parse.ts`: six turns, 240 characters each. */
export interface TranscriptExcerpt {
  speaker: 'agent' | 'provider'
  text: string
}

/** One call, as the browser receives it. No household detail, no full transcript. */
export interface CallRecord {
  providerId: string
  providerName: string
  vertical: Vertical
  /** The platform's id. The browser holds it; the server keeps nothing (ADR-010). */
  conversationId: string
  status: CallStatus
  /** ISO instant this status was recorded. */
  at: string
  durationSeconds: number | null
  excerpts: TranscriptExcerpt[]
  quote: ProviderQuote | null
  needsCallback: boolean
  note: string | null
}

/** R19.8 + demo: what this deployment can honestly do when a call is requested. */
export type CallMode = 'off' | 'allowlist' | 'demo' | 'live'

export interface CallStart {
  ok: boolean
  mode: CallMode
  /** Always rendered: says what did or did not leave the browser. */
  notice: string
  records: CallRecord[]
}

export interface CallPoll {
  ok: boolean
  mode: CallMode
  notice: string
  records: CallRecord[]
  /** True when no call is still ringing or talking, so the poller can stop. */
  complete: boolean
}
