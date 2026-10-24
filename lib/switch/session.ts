/**
 * @built F-146 the switch request a browser keeps — session scoped, no server record
 *
 * There is no database in this build (ADR-004 holds for the anonymous path), so the
 * request lives in `sessionStorage`: it survives navigation to `/dashboard` inside
 * the tab and disappears when the tab closes. The consent snapshot is stored with
 * it — Addendum B §8 overrides R18.5 deliberately, so the household can see later
 * exactly what it agreed to.
 *
 * Reading is defensive: versioned key, enum checks, and a damaged record is ignored
 * rather than half-trusted.
 */

import { VERDICT_META } from '../verdicts'
import { shareableQuery } from '../verdict/share-query'
import {
  DELIVERY_WINDOWS,
  type ContactStatus,
  type DecisionOutcome,
  type OutreachMode,
  type ProviderStatus,
  type SharedFacts,
  type StoredAgentRun,
  type StoredQuoteRow,
  type StoredQuotes,
  type StoredSwitch,
  type SwitchChoice,
  type SwitchKind,
  type SwitchStage,
} from './types'

export const SWITCH_KEY = 'switchpoint.switch.v1'

const CHOICES: readonly SwitchChoice[] = ['STAY', 'SHOP_FUEL', 'SHOP_SUPPLY', 'SWITCH_HEAT_PUMP']
const KINDS: readonly SwitchKind[] = ['stay', 'fuel', 'supply', 'installer']
const STAGES: readonly SwitchStage[] = ['kit', 'consented', 'contacting', 'quotes_ready', 'decided', 'introduced', 'switched']

export const STAGE_COPY: Record<SwitchStage, string> = {
  kit: 'You took the switch kit to do it yourself. Nothing was sent',
  consented: 'You approved what may be said and who may be contacted',
  contacting: 'The agent is contacting the providers you chose',
  quotes_ready: 'Quotes are back and ranked',
  decided: 'You made the call',
  introduced: 'Your details were sent to the provider, with your second consent',
  switched: 'You confirmed the switch',
}

/** The stages the agent path shows. `kit` is its own single-step path. */
export const AGENT_STAGES: readonly SwitchStage[] = ['consented', 'contacting', 'quotes_ready', 'decided', 'introduced', 'switched']

/** Every status in words, so a colour is never the only signal (R14.1). */
export const CONTACT_STATUS_LABEL: Record<ContactStatus, string> = {
  queued: 'Queued',
  scheduled: 'Scheduled',
  sent: 'Sent',
  ringing: 'Ringing',
  in_progress: 'In progress',
  done: 'Done',
  no_answer: 'No answer',
  voicemail: 'Voicemail',
  declined: 'Declined',
  failed: 'Failed',
  unsupported: 'Use the kit',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Stage order, so a screen cannot move a request backwards. */
export function stageRank(stage: SwitchStage): number {
  return STAGES.indexOf(stage)
}

/** The later of two stages. A late poll must not undo a decision. */
export function laterStage(a: SwitchStage, b: SwitchStage): SwitchStage {
  return stageRank(b) > stageRank(a) ? b : a
}

function readStatuses(value: unknown): ProviderStatus[] {
  if (!Array.isArray(value)) return []
  const out: ProviderStatus[] = []
  for (const entry of value) {
    if (!isRecord(entry)) return []
    if (
      typeof entry.providerId !== 'string' ||
      typeof entry.name !== 'string' ||
      (entry.channel !== 'email' && entry.channel !== 'phone') ||
      typeof entry.status !== 'string' ||
      !(entry.status in CONTACT_STATUS_LABEL) ||
      typeof entry.at !== 'string' ||
      Number.isNaN(Date.parse(entry.at))
    ) {
      return []
    }
    out.push({
      providerId: entry.providerId,
      name: entry.name,
      channel: entry.channel,
      status: entry.status as ProviderStatus['status'],
      allowlist: entry.allowlist === true,
      note: typeof entry.note === 'string' ? entry.note : null,
      at: entry.at,
    })
  }
  return out
}

const FUELS: readonly SharedFacts['fuel'][] = ['oil', 'propane', 'gas', 'resistance']
const UNITS: readonly SharedFacts['unit'][] = ['gal', 'therms', 'kWh']

function readFacts(value: unknown): SharedFacts | null {
  if (value === null) return null
  if (!isRecord(value)) return null
  if (typeof value.town !== 'string' || value.town.trim() === '') return null
  if (typeof value.deliverySizeGal !== 'number') return null
  const fuel = FUELS.find((candidate) => candidate === value.fuel) ?? null
  const unit = UNITS.find((candidate) => candidate === value.unit) ?? null
  const positive = (entry: unknown): number | null =>
    typeof entry === 'number' && Number.isFinite(entry) && entry > 0 ? entry : null
  return {
    town: value.town,
    zip: typeof value.zip === 'string' ? value.zip : null,
    fuel,
    annualVolume: positive(value.annualVolume),
    unit,
    deliverySizeGal: value.deliverySizeGal,
    tankSizeGal: positive(value.tankSizeGal),
    // Origin's hardening: only a known window is trusted, never an arbitrary string.
    deliveryWindow: DELIVERY_WINDOWS.find((window) => window === value.deliveryWindow) ?? null,
    sqft: positive(value.sqft),
    tons: positive(value.tons),
  }
}

const OUTCOMES: readonly DecisionOutcome[] = ['declined', 'contacting', 'checked']

function readDecision(value: unknown): StoredSwitch['decision'] {
  if (value === null || value === undefined) return null
  if (!isRecord(value)) return null
  if (typeof value.outcome !== 'string' || !OUTCOMES.includes(value.outcome as DecisionOutcome)) return null
  if (typeof value.at !== 'string' || Number.isNaN(Date.parse(value.at))) return null
  if (value.providerId !== null && typeof value.providerId !== 'string') return null
  return { providerId: value.providerId, outcome: value.outcome as DecisionOutcome, at: value.at }
}

const AGENT_MODES: readonly OutreachMode[] = ['off', 'allowlist', 'demo', 'live']

function readAgent(value: unknown): StoredAgentRun | null {
  if (value === null || value === undefined) return null
  if (!isRecord(value)) return null
  if (value.kind !== 'fuel' && value.kind !== 'installer') return null
  if (value.channel !== 'email' && value.channel !== 'phone') return null
  if (typeof value.mode !== 'string' || !AGENT_MODES.includes(value.mode as OutreachMode)) return null
  if (typeof value.startedAt !== 'string' || Number.isNaN(Date.parse(value.startedAt))) return null
  if (value.sessionId !== null && typeof value.sessionId !== 'string') return null
  if (!Array.isArray(value.providerIds) || !value.providerIds.every((id) => typeof id === 'string')) return null
  return {
    kind: value.kind,
    channel: value.channel,
    mode: value.mode as OutreachMode,
    sessionId: value.sessionId,
    providerIds: value.providerIds as string[],
    startedAt: value.startedAt,
  }
}

function readQuoteRow(value: unknown): StoredQuoteRow | null {
  if (!isRecord(value)) return null
  if (typeof value.providerId !== 'string' || typeof value.providerName !== 'string') return null
  if (value.kind !== 'fuel' && value.kind !== 'installer') return null
  if (value.status !== 'ranked' && value.status !== 'shown') return null
  const figure = typeof value.figure === 'number' && Number.isFinite(value.figure) ? value.figure : null
  const unit = typeof value.unit === 'number' && Number.isFinite(value.unit) ? value.unit : null
  return {
    providerId: value.providerId,
    providerName: value.providerName,
    kind: value.kind,
    status: value.status,
    figure,
    unit,
    note: typeof value.note === 'string' ? value.note : null,
    evidence: typeof value.evidence === 'string' ? value.evidence : null,
    at: typeof value.at === 'string' && !Number.isNaN(Date.parse(value.at)) ? value.at : null,
  }
}

function readQuotes(value: unknown): StoredQuotes | null {
  if (value === null || value === undefined) return null
  if (!isRecord(value)) return null
  if (value.kind !== 'fuel' && value.kind !== 'installer') return null
  if (typeof value.at !== 'string' || Number.isNaN(Date.parse(value.at))) return null
  if (!Array.isArray(value.rows)) return null
  const rows = value.rows.map(readQuoteRow)
  if (rows.some((row) => row === null)) return null
  const best = readBest(value.best)
  return {
    kind: value.kind,
    rows: rows as StoredQuoteRow[],
    best,
    complete: value.complete === true,
    at: value.at,
  }
}

function readBest(value: unknown): StoredQuotes['best'] {
  if (value === null || value === undefined) return null
  if (!isRecord(value)) return null
  if (typeof value.providerId !== 'string' || typeof value.providerName !== 'string') return null
  return {
    providerId: value.providerId,
    providerName: value.providerName,
    figure: typeof value.figure === 'number' && Number.isFinite(value.figure) ? value.figure : null,
    unit: typeof value.unit === 'number' && Number.isFinite(value.unit) ? value.unit : null,
  }
}

/**
 * The same verdict, regardless of how the URL was ordered. `choice`, `mode` and
 * `q` are screen state, not arithmetic, so they never decide whether a stored
 * request belongs to the numbers on screen.
 */
export function switchQueryKey(query: string | null | undefined): string {
  if (!query) return ''
  const params = shareableQuery(query)
  // ZIP is not part of the verdict arithmetic, but it changes who is contacted and
  // what the agent may say. A request for 01701 is not the request for 02474.
  const zip = new URLSearchParams(query).get('zip')
  if (zip) params.set('zip', zip)
  const sorted = [...params.entries()].sort(([a], [b]) => a.localeCompare(b))
  return new URLSearchParams(sorted).toString()
}

/** Parse a stored request, or null when anything is off. */
export function readStoredSwitch(raw: string | null): StoredSwitch | null {
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(parsed)) return null

  const { choice, kind, stage, query, verdict, at, facts, statuses, decision, agent, quotes } = parsed
  if (typeof choice !== 'string' || !CHOICES.includes(choice as SwitchChoice)) return null
  if (typeof kind !== 'string' || !KINDS.includes(kind as SwitchKind)) return null
  if (typeof stage !== 'string' || !STAGES.includes(stage as SwitchStage)) return null
  if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) return null
  if (typeof verdict !== 'string' || !(verdict in VERDICT_META)) return null
  if (typeof query !== 'string') return null

  return {
    choice: choice as SwitchChoice,
    kind: kind as SwitchKind,
    stage: stage as SwitchStage,
    at,
    verdict,
    query,
    facts: readFacts(facts),
    statuses: readStatuses(statuses),
    decision: readDecision(decision),
    agent: readAgent(agent),
    quotes: readQuotes(quotes),
  }
}

/** Assemble a request from values the screen already has. */
export function createSwitch(input: {
  choice: SwitchChoice
  kind: SwitchKind
  stage: SwitchStage
  verdict: string
  query: string
  facts: SharedFacts | null
  statuses?: ProviderStatus[]
  decision?: StoredSwitch['decision']
  agent?: StoredAgentRun | null
  quotes?: StoredQuotes | null
  at: Date
}): StoredSwitch {
  return {
    choice: input.choice,
    kind: input.kind,
    stage: input.stage,
    at: input.at.toISOString(),
    verdict: input.verdict,
    query: input.query,
    facts: input.facts,
    statuses: input.statuses ?? [],
    decision: input.decision ?? null,
    agent: input.agent ?? null,
    quotes: input.quotes ?? null,
  }
}

/**
 * Merge a new record with the one already in the tab.
 *
 * Guarantee: the stage never moves backwards for the same verdict and choice, a
 * later stage's data wins, and a status list or quote board is never wiped by a
 * screen that merely re-rendered. A different verdict or choice is a different
 * request, so the new record replaces the old one.
 */
export function mergeSwitch(previous: StoredSwitch | null, next: StoredSwitch): StoredSwitch {
  if (!previous) return next
  if (switchQueryKey(previous.query) !== switchQueryKey(next.query) || previous.choice !== next.choice) return next
  const stage = laterStage(previous.stage, next.stage)
  const incomingIsLaterOrSame = stageRank(next.stage) >= stageRank(previous.stage)
  return {
    ...next,
    stage,
    facts: next.facts ?? previous.facts,
    statuses: incomingIsLaterOrSame && next.statuses.length > 0 ? next.statuses : previous.statuses,
    decision: next.decision ?? previous.decision,
    agent: next.agent ?? previous.agent,
    quotes: next.quotes ?? previous.quotes,
  }
}

export function serializeSwitch(value: StoredSwitch): string {
  return JSON.stringify(value)
}

// ------------------------------------------------------------- browser store

type Listener = () => void
const listeners = new Set<Listener>()

function emit() {
  for (const listener of listeners) listener()
}

/** A subscription the dashboard can use, with the raw string as the snapshot. */
export function subscribeSwitch(listener: Listener): () => void {
  listeners.add(listener)
  const onStorage = (event: StorageEvent) => {
    if (event.key === SWITCH_KEY || event.key === null) listener()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

export function switchSnapshot(): string | null {
  try {
    return window.sessionStorage.getItem(SWITCH_KEY)
  } catch {
    return null
  }
}

export function serverSwitchSnapshot(): null {
  return null
}

/** Write or forget. A private-mode throw leaves memory only; the flow still finishes. */
export function writeSwitch(raw: string | null): void {
  try {
    if (raw === null) window.sessionStorage.removeItem(SWITCH_KEY)
    else window.sessionStorage.setItem(SWITCH_KEY, raw)
  } catch {
    // Nothing stored, nothing to remove.
  }
  emit()
}
