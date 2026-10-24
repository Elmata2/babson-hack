/**
 * @built F-64 /api/address — type-ahead powered by OpenStreetMap Nominatim
 * @built F-49 `?demo=1` returns a typed `demo_unavailable` refusal (200, no
 * Nominatim call, no throttle wait); the combobox falls back to the town list
 *
 * The Census geocoder answers "where is this address". It cannot answer "which
 * Chandler Streets exist in Massachusetts", which is the question a person
 * actually has while typing. Nominatim can, so it powers the dropdown, and the
 * Census geocoder still resolves the chosen row to a tract.
 *
 * Policy, enforced rather than assumed:
 *   - one upstream request per second, serialised through a queue
 *   - identifying User-Agent (the public repo URL)
 *   - 4s timeout, typed failures, empty list instead of a thrown error
 *   - in-process cache only, `no-store` to the browser and the CDN: a street the
 *     user typed is not something this app keeps
 *
 * GET /api/address?q=106+chandler+street
 */

import { nominatimUrl, readSuggestions, type AddressSuggestion } from '@/lib/address/nominatim'
import { DEMO_MESSAGES, demoFromRequest, demoUnavailable } from '@/lib/demo'

const CACHE_TTL_MS = 24 * 60 * 60 * 1_000
const CACHE_MAX_ENTRIES = 200
const MIN_QUERY = 4
const MAX_QUERY = 120
const TIMEOUT_MS = 4_000
const MAX_QUEUE_DEPTH = 8
const USER_AGENT = 'Switchpoint/0.1 (Massachusetts heat-pump verdict; +https://github.com/Elmata2/babson-hack)'

interface CacheEntry {
  at: number
  value: AddressSuggestion[]
}

const cache = new Map<string, CacheEntry>()

/** One request per second to the public instance. Queue, not a comment. */
let queue: Promise<void> = Promise.resolve()
let lastCallAt = 0
let waiting = 0

function throttle(): Promise<void> {
  waiting += 1
  const next = queue.then(async () => {
    const elapsed = Date.now() - lastCallAt
    if (elapsed < 1_000) await new Promise((resolve) => setTimeout(resolve, 1_000 - elapsed))
    lastCallAt = Date.now()
  })
  void next.finally(() => {
    waiting -= 1
  })
  queue = next.catch(() => undefined)
  return next
}

function cached(key: string): AddressSuggestion[] | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() - entry.at > CACHE_TTL_MS) {
    cache.delete(key)
    return null
  }
  return entry.value
}

function remember(key: string, value: AddressSuggestion[]): void {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  cache.set(key, { at: Date.now(), value })
}

function reply(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { 'cache-control': 'no-store' },
  })
}

export async function GET(request: Request): Promise<Response> {
  if (demoFromRequest(request)) {
    // Nominatim has no baked equivalent and its usage policy is real. Demo mode
    // refuses before the throttle, so an offline demo cannot queue for a second.
    return reply(demoUnavailable(DEMO_MESSAGES.address, 'town_list'))
  }

  const query = (new URL(request.url).searchParams.get('q') ?? '').trim()

  if (query.length < MIN_QUERY) {
    return reply({ ok: true, results: [], note: 'Type at least four characters.' })
  }
  if (query.length > MAX_QUERY) {
    return reply({ ok: false, code: 'bad_request', message: 'That query is too long for a street address.' }, 400)
  }

  const key = query.toLowerCase()
  const hit = cached(key)
  if (hit) {
    return reply({ ok: true, results: hit, cached: true, attribution: '© OpenStreetMap contributors' })
  }

  if (waiting >= MAX_QUEUE_DEPTH) {
    return Response.json(
      { ok: false, code: 'busy', message: 'The address search is busy. Pick your town from the list instead.' },
      { status: 429, headers: { 'cache-control': 'no-store', 'retry-after': String(MAX_QUEUE_DEPTH) } },
    )
  }
  await throttle()

  let payload: unknown
  try {
    const upstream = await fetch(nominatimUrl(query), {
      headers: {
        'user-agent': USER_AGENT,
        accept: 'application/json',
        'accept-language': 'en',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    if (!upstream.ok) {
      return reply(
        {
          ok: false,
          code: upstream.status === 429 ? 'rate_limited' : 'upstream',
          message:
            upstream.status === 429
              ? 'The address search is rate-limited right now. Pick your town from the list instead.'
              : 'The address search is unavailable. Pick your town from the list instead.',
        },
        502,
      )
    }
    payload = await upstream.json()
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError'
    return reply(
      {
        ok: false,
        code: timedOut ? 'timeout' : 'upstream',
        message: timedOut
          ? 'The address search took too long. Pick your town from the list instead.'
          : 'The address search is unreachable. Pick your town from the list instead.',
      },
      502,
    )
  }

  const results = readSuggestions(payload)
  remember(key, results)

  return reply({ ok: true, results, attribution: '© OpenStreetMap contributors' })
}
