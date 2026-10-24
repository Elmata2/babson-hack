/**
 * @built F-143 the switch flow's shared vocabulary — choices, stages, facts, statuses
 *
 * Addendum B §3.6 (`docs/superpowers/specs/2026-10-24-onboarding-and-switch-design.md`)
 * describes two ways to switch: manual (everything published, plus a switch kit) and
 * agent-assisted (consent → outreach → quotes → decision). Both share the shapes
 * below. They carry no logic: every rule lives in a pure module beside this file so
 * the screen, the route and the tests cannot disagree.
 */

import type { Fuel } from '../calc/types'

/** R17.1, closed set. Ordered as the requirement lists them. */
export type SwitchChoice = 'STAY' | 'SHOP_FUEL' | 'SHOP_SUPPLY' | 'SWITCH_HEAT_PUMP'

const SWITCH_CHOICES: readonly SwitchChoice[] = ['STAY', 'SHOP_FUEL', 'SHOP_SUPPLY', 'SWITCH_HEAT_PUMP']

export function parseSwitchChoice(raw: string | null | undefined): SwitchChoice | null {
  return SWITCH_CHOICES.find((choice) => choice === raw) ?? null
}

/** What a provider contact can be. Email is the degraded-path default; phone is the agent. */
export type OutreachChannel = 'email' | 'phone'

/** What the household is asking an agent to do. */
export type SwitchKind = 'stay' | 'fuel' | 'supply' | 'installer'

/** `kit` is the self-serve path: nothing was consented to and nothing was sent. Addendum B §3.6 step 6: consented → contacting → quotes ready → decided → introduced/switched. */
export type SwitchStage =
  | 'kit'
  | 'consented'
  | 'contacting'
  | 'quotes_ready'
  | 'decided'
  | 'introduced'
  | 'switched'

/** R19.7 statuses, plus one honest value for a channel this build cannot place. */
export type ContactStatus =
  | 'queued'
  | 'scheduled'
  | 'sent'
  | 'ringing'
  | 'in_progress'
  | 'done'
  | 'no_answer'
  | 'voicemail'
  | 'declined'
  | 'failed'
  | 'unsupported'

/** One entry in the provider list. Every row carries its source and date (R22.3). */
export interface SwitchProvider {
  id: string
  name: string
  kind: 'fuel' | 'installer'
  channels: OutreachChannel[]
  phone: string | null
  email: string | null
  /** Where the business line came from, e.g. "Team allowlist". */
  source: string
  /** ISO date the entry was read. */
  asOf: string
  /** True when this is a team test line, not a real business (R19.8). */
  allowlist: boolean
  /**
   * Towns this provider will drive to. Absent or empty means "not restricted", which
   * is what a test line is; a real dealer list is narrowed to where it delivers.
   */
  towns?: string[]
}

export const DELIVERY_WINDOWS = ['any', 'morning', 'afternoon', 'evening'] as const
export type DeliveryWindow = (typeof DELIVERY_WINDOWS)[number]

/**
 * R18.1: every fact the agent may share, and nothing else.
 * `null` means "we do not know it", not "leave it out of the sentence".
 */
export interface SharedFacts {
  town: string
  zip: string | null
  fuel: Fuel | null
  /** Gallons (oil, propane), therms (gas) or kWh (resistance), rounded to 50 gal for gallons. */
  annualVolume: number | null
  unit: 'gal' | 'therms' | 'kWh' | null
  /** Default 150 gal, editable (R18.1). */
  deliverySizeGal: number
  tankSizeGal: number | null
  deliveryWindow: DeliveryWindow | null
  /** Installer questions only, but carried in one object so one validator covers both. */
  sqft: number | null
  tons: number | null
}

/** What the route returns per provider. */
export interface ProviderStatus {
  providerId: string
  name: string
  channel: OutreachChannel
  status: ContactStatus
  /** True when the row is a team test line, so the UI can say so plainly. */
  allowlist: boolean
  /** Plain-English reason for a non-success status, or the schedule for a deferred call. */
  note: string | null
  /** ISO instant the status was recorded. */
  at: string
}

/**
 * How the server reached (or refused to reach) providers.
 * `demo` is F-49: the request was validated, the statuses are baked, and nothing
 * left the process. It is distinct from `off` because the flow is being shown,
 * and from `allowlist` because even the team's test lines were not contacted.
 */
export type OutreachMode = 'off' | 'allowlist' | 'demo' | 'live'

export interface OutreachResult {
  ok: boolean
  mode: OutreachMode
  /** Always rendered: says what did or did not leave the browser. */
  notice: string
  statuses: ProviderStatus[]
}

/** The closed request body. No field here identifies a person (R18.2). */
export interface OutreachRequest {
  kind: 'fuel' | 'installer'
  choice: 'SHOP_FUEL' | 'SWITCH_HEAT_PUMP'
  facts: SharedFacts
  providers: { id: string; channel: OutreachChannel }[]
  consentAt: string
}

/** What the browser keeps for the dashboard. Session scoped; see `session.ts`. */
export interface StoredSwitch {
  choice: SwitchChoice
  kind: SwitchKind
  stage: SwitchStage
  at: string
  verdict: string
  /** The verdict query, so the household can return to the same numbers. */
  query: string
  facts: SharedFacts | null
  statuses: ProviderStatus[]
  decision: { providerId: string | null; outcome: 'declined' | 'contacting'; at: string } | null
}
