import { createHash, randomBytes } from 'node:crypto'

import { safeEqual, sign } from '../security/secret'
import type { OutreachRequest } from './types'

export const CONSENT_TOKEN_TTL_MS = 10 * 60_000

export type ConsentTokenCheck =
  | { ok: true }
  | { ok: false; code: 'missing_consent' | 'bad_consent' | 'expired_consent' }

type Consented = Pick<OutreachRequest, 'kind' | 'choice' | 'facts' | 'providers'>

export type ConsentMode = 'allowlist' | 'live'

const domain = (mode: ConsentMode): string => `consent.${mode}.v1`

function binding(request: Consented, sessionId: string | null, nonce: string): string {
  const f = request.facts
  const facts = [
    f.town,
    f.zip,
    f.fuel,
    f.annualVolume,
    f.unit,
    f.deliverySizeGal,
    f.tankSizeGal,
    f.deliveryWindow,
    f.sqft,
    f.tons,
  ]
  const factsHash = createHash('sha256').update(JSON.stringify(facts)).digest('hex')
  const providers = request.providers
    .map((provider) => `${provider.id}:${provider.channel}`)
    .sort()
    .join(',')
  return [sessionId ?? '', request.kind, request.choice, providers, factsHash, nonce].join('|')
}

export function mintConsentToken(
  request: Consented,
  sessionId: string | null,
  mode: ConsentMode,
  now: Date = new Date(),
): string {
  const issuedAt = now.getTime()
  const nonce = randomBytes(8).toString('hex')
  return `${issuedAt}.${nonce}.${sign(domain(mode), `${binding(request, sessionId, nonce)}|${issuedAt}`)}`
}

export function verifyConsentToken(
  token: unknown,
  request: Consented,
  sessionId: string | null,
  mode: ConsentMode,
  now: Date = new Date(),
): ConsentTokenCheck {
  if (typeof token !== 'string' || token === '') return { ok: false, code: 'missing_consent' }
  const [issued, nonce, mac, extra] = token.split('.')
  const issuedAt = Number(issued)
  if (
    extra !== undefined ||
    !mac ||
    !nonce ||
    !/^[0-9a-f]{16}$/.test(nonce) ||
    !/^\d{10,16}$/.test(issued ?? '') ||
    !Number.isSafeInteger(issuedAt)
  ) {
    return { ok: false, code: 'bad_consent' }
  }
  if (!safeEqual(mac, sign(domain(mode), `${binding(request, sessionId, nonce)}|${issuedAt}`))) {
    return { ok: false, code: 'bad_consent' }
  }
  const age = now.getTime() - issuedAt
  if (age > CONSENT_TOKEN_TTL_MS || age < -30_000) return { ok: false, code: 'expired_consent' }
  return { ok: true }
}

const used = new Map<string, number>()

/** Burn a verified token. False when it was already spent inside its ten minutes. */
export function consumeConsentToken(token: unknown, now: Date = new Date()): boolean {
  if (typeof token !== 'string') return false
  const mac = token.split('.')[2]
  if (!mac) return false
  for (const [key, expires] of used) if (expires <= now.getTime()) used.delete(key)
  if (used.has(mac)) return false
  used.set(mac, now.getTime() + CONSENT_TOKEN_TTL_MS)
  return true
}

export function resetUsedConsentTokensForTests(): void {
  used.clear()
}

export function signCallId(conversationId: string, sessionId: string): string {
  return `${conversationId}.${sign('callref.v1', `${sessionId}|${conversationId}`)}`
}

/** The vendor id inside a signed ref, or null when the ref was not issued for this session. */
export function openCallId(ref: string, sessionId: string): string | null {
  const cut = ref.lastIndexOf('.')
  if (cut <= 0) return null
  const id = ref.slice(0, cut)
  const mac = ref.slice(cut + 1)
  return safeEqual(mac, sign('callref.v1', `${sessionId}|${id}`)) ? id : null
}
