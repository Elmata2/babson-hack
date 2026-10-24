import { describe, expect, it } from 'vitest'

import { consentGate, operatorGate } from '../operator'
import { originKind } from '../same-origin'

function headers(entries: Record<string, string>): Headers {
  return new Headers(entries)
}

describe('originKind', () => {
  it('trusts Fetch Metadata when the browser says same-origin', () => {
    expect(originKind(headers({ 'sec-fetch-site': 'same-origin' }))).toBe('same-origin')
  })

  it('refuses a cross-site fetch even when an Origin header is absent', () => {
    expect(originKind(headers({ 'sec-fetch-site': 'cross-site' }))).toBe('cross-origin')
  })

  it('matches an Origin header against this deployment host', () => {
    expect(originKind(headers({ origin: 'https://switchpoint.example', host: 'switchpoint.example' }))).toBe('same-origin')
    expect(originKind(headers({ origin: 'https://evil.example', host: 'switchpoint.example' }))).toBe('cross-origin')
    expect(originKind(headers({ origin: 'https://switchpoint.example', 'x-forwarded-host': 'switchpoint.example, proxy' }))).toBe(
      'same-origin',
    )
  })

  it('treats a null or unparseable Origin as cross-origin', () => {
    expect(originKind(headers({ origin: 'null' }))).toBe('cross-origin')
    expect(originKind(headers({ origin: 'not a url' }))).toBe('cross-origin')
  })

  it('reports unknown when there is no evidence either way, which is what curl looks like', () => {
    expect(originKind(headers({}))).toBe('unknown')
    expect(originKind(headers({ origin: 'https://a.example' }))).toBe('unknown')
  })
})

describe('consentGate', () => {
  const env = { OPERATOR_KEY: 'correct-horse-battery' } as unknown as NodeJS.ProcessEnv

  it('lets the household’s own tab mint consent without an operator key', () => {
    expect(consentGate(headers({ 'sec-fetch-site': 'same-origin' }), env)).toEqual({ ok: true })
    expect(consentGate(headers({ origin: 'https://app.example', host: 'app.example' }), env)).toEqual({ ok: true })
  })

  it('refuses a third-party page outright, with no key fallback', () => {
    const gate = consentGate(headers({ origin: 'https://evil.example', host: 'app.example' }), env)
    expect(gate).toMatchObject({ ok: false, status: 403, code: 'cross_origin' })
  })

  it('still requires the operator key when the caller gives no origin evidence', () => {
    expect(consentGate(headers({}), env)).toMatchObject({ ok: false, status: 401, code: 'operator_only' })
    expect(consentGate(headers({ 'x-operator-key': 'correct-horse-battery' }), env)).toEqual({ ok: true })
    expect(consentGate(headers({}), {} as unknown as NodeJS.ProcessEnv)).toMatchObject({
      ok: false,
      status: 503,
      code: 'operator_key_not_configured',
    })
  })

  it('leaves the raw operator gate unchanged for the routes that still use it', () => {
    expect(operatorGate(headers({}), env)).toMatchObject({ ok: false, status: 401 })
  })
})
