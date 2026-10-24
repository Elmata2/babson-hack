/**
 * @built F-10 / F-11 shared JSON transport — one timeout, one typed failure shape
 *
 * Both provider modules need the same four lines of discipline: abort on a
 * deadline, never throw into a route, and distinguish "the network failed" from
 * "the provider answered with garbage". Duplicating that in two files is how the
 * two files drift apart, so it lives here.
 *
 * `lib/prices/eia.ts` predates this file and keeps its own copy. That is a
 * deliberate non-refactor: it is shipped, tested, and green. Unify it if and when
 * a third caller appears.
 */

/** Minimal fetch surface, so tests need no network and no mocking library. */
export type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>

/** Why a call failed. `null` never means "zero" — it means "we do not know". */
export type NetError =
  | { code: 'network'; message: string }
  | { code: 'timeout'; message: string }
  | { code: 'http'; status: number; message: string }
  | { code: 'shape'; message: string }

export type JsonResult =
  | { ok: true; json: unknown }
  | { ok: false; error: NetError }

export interface FetchOptions {
  fetchImpl?: FetchLike
  timeoutMs?: number
  signalFactory?: (ms: number) => AbortSignal
}

/**
 * GET a JSON document without ever throwing.
 * Input: a URL and an optional deadline. Output: `{ ok: true, json }` or a typed
 * error. Guarantee: a hung provider surfaces as `timeout`, not as a pending
 * promise that stalls the route until the platform kills it.
 */
export async function fetchJson(url: string, options: FetchOptions = {}): Promise<JsonResult> {
  const timeoutMs = options.timeoutMs ?? 6_000
  const doFetch: FetchLike = options.fetchImpl ?? ((target, init) => fetch(target, init))
  const signal = options.signalFactory
    ? options.signalFactory(timeoutMs)
    : AbortSignal.timeout(timeoutMs)

  let response: Awaited<ReturnType<FetchLike>>
  try {
    response = await doFetch(url, { signal })
  } catch (cause) {
    const name = cause instanceof Error ? cause.name : ''
    if (name === 'TimeoutError' || name === 'AbortError') {
      return { ok: false, error: { code: 'timeout', message: `timed out after ${timeoutMs}ms` } }
    }
    return { ok: false, error: { code: 'network', message: 'request failed' } }
  }

  let json: unknown
  try {
    json = await response.json()
  } catch {
    return { ok: false, error: { code: 'shape', message: 'response was not JSON' } }
  }

  if (!response.ok) {
    return {
      ok: false,
      error: { code: 'http', status: response.status, message: `provider responded ${response.status}` },
    }
  }

  return { ok: true, json }
}

/** Tiny TTL cache. One process, one isolate, best effort — never a source of truth. */
export interface TtlCache<T> {
  get(key: string, at: number): T | null
  set(key: string, value: T, ttlMs: number, at: number): void
  clear(): void
}

/**
 * Build a TTL cache.
 * Input: none. Output: a cache whose entries expire on read.
 * Guarantee: a hit is only returned while `at - storedAt < ttl`. The clock is a
 * parameter of `get`/`set` rather than captured at construction, because a cache
 * that binds `Date.now` cannot be tested for expiry — it silently ignores the
 * injected clock and every expiry test passes for the wrong reason.
 */
export function ttlCache<T>(): TtlCache<T> {
  const entries = new Map<string, { at: number; ttl: number; value: T }>()
  return {
    get(key, at) {
      const hit = entries.get(key)
      if (!hit) return null
      if (at - hit.at >= hit.ttl) {
        entries.delete(key)
        return null
      }
      return hit.value
    },
    set(key, value, ttlMs, at) {
      entries.set(key, { at, ttl: ttlMs, value })
    },
    clear() {
      entries.clear()
    },
  }
}
