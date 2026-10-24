import { createLimiter } from './rate-limit'

const DAY_MS = 24 * 60 * 60_000

const perIp = createLimiter({ capacity: 12, refillPerSecond: 12 / 3_600 })

let day = { startedAt: 0, used: 0 }

export function dailyCap(): number {
  const parsed = Number(process.env.OUTBOUND_DAILY_CAP)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 60
}

export type OutboundCheck = { ok: true } | { ok: false; scope: 'ip' | 'daily'; retryAfterSeconds: number }

/** Charge `count` outbound calls or emails to this client and to the global daily budget. Nothing is charged on refusal. */
export function chargeOutbound(ip: string, count: number, now: number = Date.now()): OutboundCheck {
  if (now - day.startedAt >= DAY_MS) day = { startedAt: now, used: 0 }
  if (day.used + count > dailyCap()) {
    return { ok: false, scope: 'daily', retryAfterSeconds: Math.ceil((day.startedAt + DAY_MS - now) / 1_000) }
  }
  const taken = perIp.take(ip, now, count)
  if (!taken.ok) return { ok: false, scope: 'ip', retryAfterSeconds: taken.retryAfterSeconds }
  day.used += count
  return { ok: true }
}

export function resetOutboundForTests(): void {
  day = { startedAt: 0, used: 0 }
}
