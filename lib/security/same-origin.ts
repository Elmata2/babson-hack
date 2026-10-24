/**
 * @built F-165 where a request came from, decided from headers a browser cannot forge
 *
 * The consent screen is the household's own act: they read the facts, tick the
 * providers and press confirm, and `/api/consent` signs exactly that. Gating that
 * press on `OPERATOR_KEY` made the browser path impossible — the key is deliberately
 * never in the browser bundle — so the "one confirm starts the calls" promise could
 * never be kept. What actually needs proving is *who is asking*: a page on this
 * origin, or a script somewhere else.
 *
 * Two headers carry that, and a browser sets both:
 *   - `sec-fetch-site` (Fetch Metadata, every current browser);
 *   - `origin` on any non-GET request.
 *
 * A non-browser client can omit them, and that is the point: `unknown` is not
 * "trusted", it is "prove yourself with `OPERATOR_KEY`". So curl keeps working,
 * a browser tab works, and a third-party page is refused outright.
 */

export type OriginKind = 'same-origin' | 'cross-origin' | 'unknown'

function hostOf(headers: Headers): string | null {
  const forwarded = headers.get('x-forwarded-host')
  const raw = (forwarded && forwarded.trim() !== '' ? forwarded : headers.get('host')) ?? ''
  const first = raw.split(',')[0]?.trim() ?? ''
  return first === '' ? null : first.toLowerCase()
}

/**
 * Classify one request.
 * Guarantee: `same-origin` only when the browser says so or the `origin` header's
 * host equals this deployment's host. Anything else is `cross-origin` (an `origin`
 * we cannot match) or `unknown` (no evidence either way).
 */
export function originKind(headers: Headers): OriginKind {
  const site = (headers.get('sec-fetch-site') ?? '').trim().toLowerCase()
  if (site === 'same-origin') return 'same-origin'
  if (site === 'cross-site') return 'cross-origin'

  const origin = headers.get('origin')
  if (!origin || origin.trim() === '') return 'unknown'
  if (origin.trim() === 'null') return 'cross-origin'

  let originHost: string
  try {
    originHost = new URL(origin).host.toLowerCase()
  } catch {
    return 'cross-origin'
  }
  const host = hostOf(headers)
  if (host === null) return 'unknown'
  return originHost === host ? 'same-origin' : 'cross-origin'
}
