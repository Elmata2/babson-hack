import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

let fallback: string | null = null

/**
 * The signing secret. `CONSENT_SECRET` in any real deployment. Without it a
 * per-process random secret is used, so tokens and call refs stop verifying on
 * restart and across serverless instances. That is acceptable for dev and the demo.
 */
export function signingSecret(): string {
  const configured = process.env.CONSENT_SECRET
  if (configured && configured.length >= 16) return configured
  if (fallback === null) {
    fallback = randomBytes(32).toString('hex')
    console.warn('CONSENT_SECRET is unset or shorter than 16 characters; signing with a per-process secret.')
  }
  return fallback
}

export function sign(domain: string, message: string): string {
  return createHmac('sha256', signingSecret()).update(`${domain}\n${message}`).digest('hex')
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

/** Production needs a real secret (32+ characters) before anything live is signed or verified. */
export function consentSecretReady(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NODE_ENV !== 'production') return true
  return (env.CONSENT_SECRET?.length ?? 0) >= 32
}
