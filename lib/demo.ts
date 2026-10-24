/**
 * @built F-49 `?demo=1` — one flag, read in one place, that stops every outbound call
 *
 * R13.1 is a promise about the venue wifi: with `?demo=1` on the URL the app must
 * answer from baked JSON and never open a socket. A promise spread over eight
 * route handlers and six client components is a promise that drifts, so the flag
 * is parsed here and nowhere else.
 *
 * The contract, in one line each:
 *   `isDemo(search)`       — true only for `1|true|yes|on`, never for `0`, `false`
 *                            or an absent key. Accepts a full URL, a leading-`?`
 *                            query, a bare query, `URLSearchParams`, or the
 *                            `Record<string, string | string[] | undefined>` a
 *                            Next 16 page receives as `searchParams`.
 *   `withDemo(href, demo)` — returns the same href with the flag set or removed,
 *                            preserving every other parameter and the hash. The
 *                            demo path has to survive each click, or the second
 *                            screen is the one that dials out.
 *   `demoFromRequest()`    — the server-side reader: query string first, then the
 *                            `x-switchpoint-demo` header, for clients that cannot
 *                            rewrite the URL.
 *   `demoFromLocation()`   — the browser reader for client components. Guarded,
 *                            so a server render cannot touch `window`.
 *   `demoUnavailable()`    — the typed, documented refusal a route returns when
 *                            there is no baked dataset to answer from. It is a
 *                            `200` with `ok: false`, not an error: in demo mode a
 *                            missing provider is expected, and the UI already has
 *                            a manual path for every one of them.
 */

/** The query key, everywhere. */
export const DEMO_PARAM = 'demo'

/** The header a proxy or a fetch wrapper may set instead of touching the URL. */
export const DEMO_HEADER = 'x-switchpoint-demo'

/** Only these spellings mean yes. `demo`, `1.0` and `0` are deliberately not on the list. */
const TRUTHY = new Set(['1', 'true', 'yes', 'on'])

/** A Next 16 page's `searchParams` shape. */
export type DemoParams = Record<string, string | string[] | undefined>

/** Anything the flag can arrive in. */
export type DemoSource = string | URLSearchParams | DemoParams | null | undefined

/**
 * True when a raw form/query/JSON value means "demo". A JSON body may carry the
 * boolean (`{"demo": true}`) while a FormData field can only carry a string, so
 * both are accepted. Every other type — a `File`, `null`, `1` as a number — is
 * not demo.
 */
export function isDemoFlag(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value !== 'string') return false
  return TRUTHY.has(value.trim().toLowerCase())
}

function fromRecord(source: DemoParams): boolean {
  const raw = source[DEMO_PARAM]
  const value = Array.isArray(raw) ? raw[0] : raw
  return isDemoFlag(value)
}

function paramsOf(source: Exclude<DemoSource, null | undefined>): URLSearchParams | null {
  if (source instanceof URLSearchParams) return source
  if (typeof source === 'string') {
    const raw = source.trim()
    if (raw === '') return null
    // A full URL, a path with a query, or a bare query. A path with no `?` has no
    // parameters; parsing it as a query would invent one (`/verdict` → key
    // `/verdict`), so it is handled explicitly.
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) return new URL(raw).searchParams
    if (raw.startsWith('?')) return new URLSearchParams(raw.slice(1))
    if (raw.startsWith('/') || raw.startsWith('#')) {
      const query = raw.indexOf('?')
      return query === -1 ? null : new URLSearchParams(raw.slice(query + 1).split('#')[0])
    }
    return new URLSearchParams(raw)
  }
  return null
}

/**
 * Read the demo flag from a URL, a query string, `URLSearchParams`, or Next's
 * `searchParams` object. Absent, empty and `0` are all false.
 */
export function isDemo(search: DemoSource): boolean {
  if (search === null || search === undefined) return false
  if (typeof search === 'object' && !(search instanceof URLSearchParams)) return fromRecord(search)
  const params = paramsOf(search)
  return params ? isDemoFlag(params.get(DEMO_PARAM)) : false
}

/** `isDemo` for Next 16's page `searchParams` object, named for readability at call sites. */
export function demoFromParams(params: DemoParams | null | undefined): boolean {
  return isDemo(params ?? null)
}

/**
 * Return the href with `demo=1` added (or the flag removed), keeping every other
 * parameter, its order, and any hash. Guarantee: calling it twice is the same as
 * calling it once, and a normal-mode href is untouched.
 */
export function withDemo(href: string, demo: boolean): string {
  if (href === '') return href

  const hashAt = href.indexOf('#')
  const beforeHash = hashAt === -1 ? href : href.slice(0, hashAt)
  const hash = hashAt === -1 ? '' : href.slice(hashAt)
  const queryAt = beforeHash.indexOf('?')
  const path = queryAt === -1 ? beforeHash : beforeHash.slice(0, queryAt)
  const query = queryAt === -1 ? '' : beforeHash.slice(queryAt + 1)

  if (!demo) {
    if (query === '') return href
    const params = new URLSearchParams(query)
    if (!params.has(DEMO_PARAM)) return href
    params.delete(DEMO_PARAM)
    const next = params.toString()
    return next === '' ? `${path}${hash}` : `${path}?${next}${hash}`
  }

  const params = new URLSearchParams(query)
  if (params.get(DEMO_PARAM) === '1') return href
  if (params.has(DEMO_PARAM)) {
    // `demo=0` (or a duplicated value) would otherwise win the `get`, so the
    // existing key is replaced rather than appended.
    params.delete(DEMO_PARAM)
    params.set(DEMO_PARAM, '1')
    return `${path}?${params.toString()}${hash}`
  }
  return query === '' ? `${path}?${DEMO_PARAM}=1${hash}` : `${path}?${query}&${DEMO_PARAM}=1${hash}`
}

/**
 * Server-side reader for route handlers and server code: the query string wins,
 * then the header. Never throws on a malformed URL.
 */
export function demoFromRequest(request: Request): boolean {
  try {
    if (isDemo(new URL(request.url).searchParams)) return true
  } catch {
    // A relative URL in a test still has a readable query via the header path.
  }
  try {
    return isDemoFlag(request.headers.get(DEMO_HEADER))
  } catch {
    return false
  }
}

/** Browser-side reader for client components. Safe during a server render. */
export function demoFromLocation(): boolean {
  if (typeof window === 'undefined') return false
  return isDemo(window.location.search)
}

/** Where the UI goes when a provider is off. Every one of these exists already. */
export type DemoFallback = 'manual_entry' | 'town_list' | 'baked_data'

/**
 * The documented demo refusal. `200` because it is not an outage — the route is
 * behaving exactly as designed — and `ok: false` so every existing caller takes
 * its fallback branch instead of rendering an invented value.
 */
export interface DemoRefusal {
  ok: false
  demo: true
  code: 'demo_unavailable'
  message: string
  fallback: DemoFallback
}

export function demoUnavailable(message: string, fallback: DemoFallback = 'manual_entry'): DemoRefusal {
  return { ok: false, demo: true, code: 'demo_unavailable', message, fallback }
}

/** The messages the routes use, in one place so the UI and the tests share them. */
export const DEMO_MESSAGES = {
  prices: 'Demo mode — the baked 2026-10-19 fuel and electricity snapshot, no network call.',
  geocode:
    'Demo mode: the Census geocoder is off. Pick your town from the list and type the year built — the verdict does not need the coordinate.',
  address: 'Demo mode: the address search is off. Pick your town from the list instead.',
  parcel:
    'Demo mode: the MassGIS parcel lookup is off. Type the year built and floor area — neither changes a price.',
  parseBill:
    'Demo mode: bill reading is off. Type the two numbers — fuel used in a year and what you pay — and the verdict is identical.',
  explain:
    'Demo mode: the plain-English sentences come from the verdict itself. No model is called.',
  switch:
    'Demo mode: nothing was dialled, emailed or sent. These statuses are baked so the flow can be shown offline.',
} as const
