/**
 * @built F-13 polite build-time HTTP, cache and size reporting for the bake scripts
 *
 * House rules (data-sources.md, "Hard rules"):
 *   - 30s timeout per call, 2 retries with backoff, never a hot loop.
 *   - Every artefact carries `_meta` so the UI can render freshness.
 *   - Committed JSON is minified; a bake is idempotent and can rebuild from cache.
 *
 * Nothing here runs at request time. This module is build-only.
 */

import { brotliCompressSync, gzipSync, constants as zlibConstants } from 'node:zlib'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'

/** Per-call ceiling. Open-Meteo answers in ~0.9s; 30s leaves room for a slow ArcGIS. */
export const TIMEOUT_MS = 30_000
/** Total attempts = 1 + RETRIES. Backoff is quadratic, never parallel. */
export const RETRIES = 2

const UA = 'switchpoint-bake/1.0 (+https://github.com/hackachusetts/switchpoint; build-time only)'

/** Backoff between retries, ms. Quadratic so 3 attempts span ~3s, not 30. */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * GET a JSON document politely.
 * @param {string} url
 * @param {{label?: string, timeoutMs?: number, retries?: number}} [opts]
 * @returns {Promise<{data: any, bytes: number, ms: number}>}
 */
export async function fetchJson(url, opts = {}) {
  const label = opts.label ?? url
  const timeoutMs = opts.timeoutMs ?? TIMEOUT_MS
  const retries = opts.retries ?? RETRIES
  /** @type {unknown} */
  let lastError = null

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const started = Date.now()
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { accept: 'application/json', 'user-agent': UA },
      })
      const text = await res.text()
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText} — ${text.slice(0, 120)}`)
      }
      if (!text.trim()) throw new Error('empty response body')
      /** @type {any} */
      let data
      try {
        data = JSON.parse(text)
      } catch {
        throw new Error(`response is not JSON — ${text.slice(0, 120)}`)
      }
      return { data, bytes: Buffer.byteLength(text), ms: Date.now() - started }
    } catch (error) {
      lastError = error
      if (attempt < retries) await sleep(600 * (attempt + 1) ** 2)
    }
  }
  const reason = lastError instanceof Error ? lastError.message : String(lastError)
  throw new Error(`${label}: ${reason}`)
}

/** Fetch with a cache file, so a re-run never re-asks a free public service. */
export async function fetchJsonCached(cachePath, url, opts = {}) {
  const { useCache = false } = opts
  if (useCache) {
    const cached = await readCache(cachePath)
    if (cached) {
      console.log(`  cache  ${relative(process.cwd(), cachePath)}`)
      return { ...cached, fromCache: true }
    }
    console.log(`  cache  miss for ${relative(process.cwd(), cachePath)}`)
  }
  const result = await fetchJson(url, opts)
  const envelope = {
    _meta: { url, fetchedAt: new Date().toISOString(), bytes: result.bytes },
    body: result.data,
  }
  await writeJson(cachePath, envelope)
  console.log(`  fetch  ${opts.label ?? url} — ${(result.bytes / 1024).toFixed(0)} KB in ${result.ms} ms`)
  return { data: result.data, bytes: result.bytes, ms: result.ms, fetchedAt: envelope._meta.fetchedAt, fromCache: false }
}

/** Read a cache envelope, or null when it is missing/unreadable. */
export async function readCache(cachePath) {
  try {
    const text = await readFile(cachePath, 'utf8')
    const parsed = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object' || !('body' in parsed)) return null
    return { data: parsed.body, bytes: Buffer.byteLength(text), fetchedAt: parsed._meta?.fetchedAt ?? null }
  } catch {
    return null
  }
}

/** Minified JSON write — committed artefacts are measured to the byte. */
export async function writeJson(path, value) {
  const absolute = resolve(path)
  await mkdir(dirname(absolute), { recursive: true })
  const body = `${JSON.stringify(value)}\n`
  await writeFile(absolute, body)
  return Buffer.byteLength(body)
}

/** The `_meta` block every artefact carries. Extra keys are allowed and documented. */
export function meta({ source, url, fetchedAt, recordCount, extra = {} }) {
  return {
    source,
    url,
    fetchedAt: fetchedAt ?? new Date().toISOString(),
    recordCount,
    ...extra,
  }
}

/** raw / gzip / brotli sizes for one file. */
export async function sizesOf(path) {
  const buf = await readFile(resolve(path))
  return {
    raw: buf.byteLength,
    gzip: gzipSync(buf, { level: 9 }).byteLength,
    brotli: brotliCompressSync(buf, {
      params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 },
    }).byteLength,
  }
}

/** KB with one decimal, for reports. */
export const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`

/**
 * Print one artefact's size against its budget.
 * @returns {boolean} true when inside the budget
 */
export function reportSize(label, sizes, budget, { brotliBudget } = {}) {
  const rawOk = sizes.raw <= budget
  const brotliOk = brotliBudget === undefined || sizes.brotli <= brotliBudget
  const ok = rawOk && brotliOk
  const budgetText = brotliBudget === undefined
    ? `budget ${kb(budget)}`
    : `budget ${kb(budget)} raw / ${kb(brotliBudget)} br`
  console.log(
    `${ok ? '  ok   ' : '  OVER '} ${label.padEnd(34)} ${kb(sizes.raw).padStart(9)} raw  ${kb(sizes.gzip).padStart(9)} gz  ${kb(sizes.brotli).padStart(9)} br   (${budgetText})`,
  )
  return ok
}

/** Create the cache dir path used by every bake script. */
export const cachePath = (...parts) => resolve('.bake-cache', ...parts)
