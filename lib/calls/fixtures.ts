/**
 * @built F-129 three fixture conversations, replayed with staged timing
 *
 * `?demo=1` has to show the whole agent beat with the wifi unplugged (R13.1) and
 * without a vendor account, so the demo is a schedule, not a recording: the same
 * records come back at the same moments every run. The conversation ids are
 * prefixed `demo-` and the switch route refuses to poll them live.
 *
 * The numbers are the readable ones from design §12.6: two dealers and one
 * installer, the best dealer $0.44/gal under the DOER yardstick, and a second
 * dealer whose minimum is above the household's delivery size so the flag is
 * visible on stage. Every quote carries its excerpt and its time (R19.3, R20.5).
 */

import { disclosureFor } from './disclosure'
import { redactExcerpt } from './parse'
import type { CallRecord, CallStatus, FuelQuoteWire, InstallerQuoteWire, TranscriptExcerpt } from './types'

/** Milliseconds after the confirm click. Nothing here touches a network. */
interface Fixture {
  providerId: string
  providerName: string
  vertical: 'fuel' | 'installer'
  conversationId: string
  /** When the phone starts ringing, when it is answered, when the quote lands. */
  ringsAtMs: number
  answersAtMs: number
  doneAtMs: number
  quote: FuelQuoteWire | InstallerQuoteWire
  excerpts: TranscriptExcerpt[]
}

const FUEL_A: Fixture = {
  providerId: 'test-fuel-a',
  providerName: 'Team test line — fuel A',
  vertical: 'fuel',
  conversationId: 'demo-fuel-a',
  ringsAtMs: 300,
  answersAtMs: 1_400,
  doneAtMs: 8_400,
  quote: {
    vertical: 'fuel',
    providerId: 'test-fuel-a',
    pricePerGal: { value: 5.79, evidence: '"Five seventy-nine a gallon, cash or check, today."' },
    cardSurchargePct: { value: 2.5, evidence: '"Card is two and a half percent more."' },
    minGallons: { value: 150, evidence: '"A hundred and fifty minimum for your town."' },
    deliveryFee: { value: 0, evidence: '"No delivery charge at that size."' },
    priceCapPerGal: { value: 5.49, evidence: '"If you cap for the winter it is five forty-nine."' },
    priceCapFee: { value: 75, evidence: '"There is a seventy-five dollar cap fee."' },
    earliestDelivery: { value: '2026-10-27', evidence: '"Tuesday is the first open day."' },
    servesTown: { value: true, evidence: '"Yes, we deliver in Framingham every day."' },
    needsCallback: false,
  },
  excerpts: [
    { speaker: 'agent', text: disclosureFor({ town: 'Framingham', fuel: 'heating oil' }) },
    { speaker: 'provider', text: 'Sure, go ahead.' },
    { speaker: 'provider', text: 'Five seventy-nine a gallon, cash or check, today. Card is two and a half percent more.' },
    { speaker: 'provider', text: 'A hundred and fifty minimum. No delivery charge at that size. Tuesday is the first open day.' },
    { speaker: 'agent', text: 'Thank you — that is everything I needed. The homeowner will call you to order.' },
  ],
}

const FUEL_B: Fixture = {
  providerId: 'test-fuel-b',
  providerName: 'Team test line — fuel B',
  vertical: 'fuel',
  conversationId: 'demo-fuel-b',
  ringsAtMs: 700,
  answersAtMs: 2_200,
  doneAtMs: 12_000,
  quote: {
    vertical: 'fuel',
    providerId: 'test-fuel-b',
    pricePerGal: { value: 6.05, evidence: '"Six and five today."' },
    cardSurchargePct: { value: null, evidence: null },
    minGallons: { value: 200, evidence: '"Two hundred gallon minimum."' },
    deliveryFee: { value: 25, evidence: '"There is a twenty-five dollar delivery fee."' },
    priceCapPerGal: { value: null, evidence: null },
    priceCapFee: { value: null, evidence: null },
    earliestDelivery: { value: '2026-10-28', evidence: '"Wednesday at the earliest."' },
    servesTown: { value: true, evidence: '"We cover the whole county."' },
    needsCallback: false,
  },
  excerpts: [
    { speaker: 'agent', text: disclosureFor({ town: 'Framingham', fuel: 'heating oil' }) },
    { speaker: 'provider', text: 'Six and five today. Two hundred gallon minimum, twenty-five dollar delivery fee.' },
    { speaker: 'provider', text: 'Wednesday at the earliest.' },
  ],
}

const INSTALLER_A: Fixture = {
  providerId: 'test-installer-a',
  providerName: 'Team test line — installer A',
  vertical: 'installer',
  conversationId: 'demo-installer-a',
  ringsAtMs: 1_100,
  answersAtMs: 2_800,
  doneAtMs: 15_000,
  quote: {
    vertical: 'installer',
    providerId: 'test-installer-a',
    massSaveParticipating: { value: true, evidence: '"We are on the Mass Save list."' },
    acceptsHeatLoan: { value: true, evidence: '"We take the zero-interest HEAT Loan."' },
    earliestSiteVisit: { value: '2026-11-03', evidence: '"First visit is November third."' },
    canInstallByDec31: { value: true, evidence: '"We can be done before the end of the year."' },
    ballparkPerTon: { value: 4_400, evidence: '"Ballpark is forty-four hundred a ton installed."' },
    needsCallback: false,
  },
  excerpts: [
    { speaker: 'agent', text: disclosureFor({ town: 'Framingham', fuel: 'heat pump' }) },
    { speaker: 'provider', text: 'We are on the Mass Save list and we take the zero-interest HEAT Loan.' },
    { speaker: 'provider', text: 'First visit is November third, and we can be done before the end of the year. Ballpark is forty-four hundred a ton installed.' },
  ],
}

const FIXTURES: readonly Fixture[] = [FUEL_A, FUEL_B, INSTALLER_A]

/**
 * R19.7: what one fixture looks like at a moment in the demo.
 * Guarantee: the status only moves forward, and a record is `done` with its quote
 * exactly when its `doneAtMs` has passed.
 */
export function demoRecord(fixture: Fixture, elapsedMs: number, startedAt: string): CallRecord {
  const at = new Date(Date.parse(startedAt) + Math.min(elapsedMs, fixture.doneAtMs)).toISOString()
  let status: CallStatus = 'queued'
  if (elapsedMs >= fixture.doneAtMs) status = 'done'
  else if (elapsedMs >= fixture.answersAtMs) status = 'in_progress'
  else if (elapsedMs >= fixture.ringsAtMs) status = 'ringing'

  const answered = elapsedMs >= fixture.answersAtMs
  return {
    providerId: fixture.providerId,
    providerName: fixture.providerName,
    vertical: fixture.vertical,
    conversationId: fixture.conversationId,
    status,
    at,
    durationSeconds: status === 'done' ? Math.round((fixture.doneAtMs - fixture.answersAtMs) / 1000) : null,
    // A turn is only shown once it has been said; the drawer fills in as it goes.
    excerpts: answered
      ? fixture.excerpts
          .slice(0, status === 'done' ? fixture.excerpts.length : 2)
          .map((turn) => ({ speaker: turn.speaker, text: redactExcerpt(turn.text) }))
      : [],
    quote: status === 'done' ? fixture.quote : null,
    needsCallback: false,
    note: null,
  }
}

/** The three records at a given moment, in fixture order. */
export function demoRecords(elapsedMs: number, startedAt: string): CallRecord[] {
  return FIXTURES.map((fixture) => demoRecord(fixture, elapsedMs, startedAt))
}

/** One staged call, when the demo picked a line that has a fixture. */
export function fixtureRecord(providerId: string, elapsedMs: number, startedAt: string): CallRecord | null {
  const fixture = FIXTURES.find((entry) => entry.providerId === providerId)
  return fixture ? demoRecord(fixture, elapsedMs, startedAt) : null
}

/** The fixtures the replay will actually show, so the UI can say how many rows land. */
export function fixtureProviderIds(): string[] {
  return FIXTURES.map((fixture) => fixture.providerId)
}

/** The ids the browser will send back on every poll (ADR-010). */
export function demoConversationIds(): string[] {
  return FIXTURES.map((fixture) => fixture.conversationId)
}

/** True when an id belongs to the replay and must never reach the vendor. */
export function isDemoConversationId(id: string): boolean {
  return id.startsWith('demo-')
}

/** How long the staged beat runs, for the UI's progress line. */
export function demoDurationMs(): number {
  return FIXTURES.reduce((longest, fixture) => Math.max(longest, fixture.doneAtMs), 0)
}
