/**
 * @built F-147 provider list and outreach mode — R19.8 / R22.3, no invented businesses
 *
 * The repository contains no dealer or installer list, and this build will not
 * invent one: a phone number without a source and a date is exactly the fake the
 * requirements forbid. So the list is configuration. With nothing configured the
 * flow is still complete — published options plus the switch kit — and the screen
 * says so in words.
 *
 * `PROVIDER_ALLOWLIST_JSON` is a JSON array of team test lines. Allowlist rows are
 * marked, never presented as a real business. A real list must carry `source` and
 * `asOf` per entry (R22.3) and requires `PROVIDER_OUTREACH_ENABLED=true`.
 */

import type { OutreachChannel, SwitchProvider } from './types'

const CHANNELS: readonly OutreachChannel[] = ['email', 'phone']
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Parse the configured provider list. Invalid entries are dropped rather than
 * repaired: a half-valid business line is worse than no line. Duplicate ids keep
 * the first row.
 */
export function parseProviders(raw: string | undefined): SwitchProvider[] {
  if (!raw || raw.trim() === '') return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  return parseProviderList(parsed)
}

/** The same validation over an already-parsed list — the committed seed arrives this way. */
export function parseProviderList(parsed: unknown): SwitchProvider[] {
  if (!Array.isArray(parsed)) return []

  const providers: SwitchProvider[] = []
  const seen = new Set<string>()

  for (const entry of parsed) {
    if (!isRecord(entry)) continue
    const id = entry.id
    const name = entry.name
    const kind = entry.kind
    const channels = entry.channels
    const source = entry.source
    const asOf = entry.asOf

    if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]{1,58}$/.test(id) || seen.has(id)) continue
    if (typeof name !== 'string' || name.trim() === '') continue
    if (kind !== 'fuel' && kind !== 'installer') continue
    if (!Array.isArray(channels) || channels.length === 0) continue
    if (!channels.every((channel): channel is OutreachChannel => CHANNELS.includes(channel as OutreachChannel))) continue
    if (typeof source !== 'string' || source.trim() === '') continue
    if (typeof asOf !== 'string' || !ISO_DATE.test(asOf)) continue

    const phone = typeof entry.phone === 'string' && entry.phone.trim() !== '' ? entry.phone.trim() : null
    const email = typeof entry.email === 'string' && entry.email.trim() !== '' ? entry.email.trim() : null
    const typedChannels = channels as OutreachChannel[]
    if (typedChannels.includes('phone') && phone === null) continue
    if (typedChannels.includes('email') && email === null) continue

    seen.add(id)
    const towns = Array.isArray(entry.towns)
      ? entry.towns.filter((town): town is string => typeof town === 'string' && town.trim() !== '').map((town) => town.trim())
      : []
    providers.push({
      id,
      name: name.trim(),
      kind,
      channels: typedChannels,
      phone,
      email,
      source: source.trim(),
      asOf,
      allowlist: entry.allowlist === true,
      ...(towns.length > 0 ? { towns } : {}),
    })
  }

  return providers
}

/** The configured list, read from the environment the same way on the route and the page. */
export function loadProviders(env: NodeJS.ProcessEnv = process.env): SwitchProvider[] {
  return parseProviders(env.PROVIDER_ALLOWLIST_JSON)
}

export interface OutreachPlan {
  mode: 'off' | 'allowlist' | 'live'
  /** Why nothing will be sent, or null when something will. Always rendered. */
  reason: string | null
  /** For allowlist mode: the sentence that keeps the demo honest. */
  notice: string | null
}

function hasEmailSender(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.RESEND_API_KEY && env.RESEND_FROM)
}

/** True when at least one real (non-allowlist) provider can be reached by email. */
function hasLiveChannel(providers: readonly SwitchProvider[], env: NodeJS.ProcessEnv): boolean {
  return hasEmailSender(env) && providers.some((provider) => !provider.allowlist && provider.channels.includes('email'))
}

/**
 * Decide what this deployment can honestly do.
 * Guarantee: `live` only when outreach is enabled, a real provider exists, and the
 * email sender is configured. Phone calls are not implemented in this build, so a
 * phone-only configuration is `off` with a reason — never a queued call that
 * nobody will place.
 */
export function outreachPlan(providers: readonly SwitchProvider[], env: NodeJS.ProcessEnv = process.env): OutreachPlan {
  if (env.PROVIDER_OUTREACH_ENABLED !== 'true') {
    return {
      mode: 'off',
      reason:
        'Outreach is switched off in this build, so nothing is sent anywhere. The switch kit below has the question to ask and what to have ready.',
      notice: null,
    }
  }
  if (providers.length === 0) {
    return {
      mode: 'off',
      reason:
        'No provider list is configured, and this build will not invent dealer or installer numbers. Everything published is on this screen; the switch kit gives you the question to ask.',
      notice: null,
    }
  }
  if (providers.every((provider) => provider.allowlist)) {
    return {
      mode: 'allowlist',
      reason: null,
      notice: 'Team test lines only — no real business is contacted. Every status below is staged for the demo.',
    }
  }
  if (!hasLiveChannel(providers, env)) {
    return {
      mode: 'off',
      reason:
        'No email sender is configured for a real provider, and this build places no phone calls, so nothing is sent. The switch kit below is the complete manual path.',
      notice: null,
    }
  }
  return { mode: 'live', reason: null, notice: null }
}
