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

import type {
  ContactStatus,
  ProviderStatus,
  SharedFacts,
  StoredSwitch,
  SwitchChoice,
  SwitchKind,
  SwitchStage,
} from './types'

export const SWITCH_KEY = 'switchpoint.switch.v1'

const CHOICES: readonly SwitchChoice[] = ['STAY', 'SHOP_FUEL', 'SHOP_SUPPLY', 'SWITCH_HEAT_PUMP']
const KINDS: readonly SwitchKind[] = ['stay', 'fuel', 'supply', 'installer']
const STAGES: readonly SwitchStage[] = ['consented', 'contacting', 'quotes_ready', 'decided', 'introduced', 'switched']

export const STAGE_COPY: Record<SwitchStage, string> = {
  consented: 'You approved what may be said and who may be contacted',
  contacting: 'Contacting the providers you chose',
  quotes_ready: 'Quotes are back and ranked',
  decided: 'You made the call',
  introduced: 'Your details were sent to the provider, with your second consent',
  switched: 'You confirmed the switch',
}

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

function readFacts(value: unknown): SharedFacts | null {
  if (value === null) return null
  if (!isRecord(value)) return null
  if (typeof value.town !== 'string') return null
  if (typeof value.deliverySizeGal !== 'number') return null
  return {
    town: value.town,
    zip: typeof value.zip === 'string' ? value.zip : null,
    fuel: (value.fuel as SharedFacts['fuel']) ?? null,
    annualVolume: typeof value.annualVolume === 'number' ? value.annualVolume : null,
    unit: (value.unit as SharedFacts['unit']) ?? null,
    deliverySizeGal: value.deliverySizeGal,
    tankSizeGal: typeof value.tankSizeGal === 'number' ? value.tankSizeGal : null,
    deliveryWindow: typeof value.deliveryWindow === 'string' ? value.deliveryWindow : null,
    sqft: typeof value.sqft === 'number' ? value.sqft : null,
    tons: typeof value.tons === 'number' ? value.tons : null,
  }
}

function readDecision(value: unknown): StoredSwitch['decision'] {
  if (value === null) return null
  if (!isRecord(value)) return null
  if (value.outcome !== 'declined' && value.outcome !== 'contacting') return null
  if (typeof value.at !== 'string' || Number.isNaN(Date.parse(value.at))) return null
  if (value.providerId !== null && typeof value.providerId !== 'string') return null
  return { providerId: value.providerId, outcome: value.outcome, at: value.at }
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

  const { choice, kind, stage, query, verdict, at, facts, statuses, decision } = parsed
  if (typeof choice !== 'string' || !CHOICES.includes(choice as SwitchChoice)) return null
  if (typeof kind !== 'string' || !KINDS.includes(kind as SwitchKind)) return null
  if (typeof stage !== 'string' || !STAGES.includes(stage as SwitchStage)) return null
  if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) return null
  if (typeof verdict !== 'string' || verdict === '') return null
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
