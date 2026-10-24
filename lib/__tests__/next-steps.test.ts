import { describe, expect, it } from 'vitest'
import { parseNextStepsQuery, safeBackPath } from '../map/next-steps-query'
import { rateSponsorFor, seasonalRate, winterSavings } from '../mass-save'
import { buildQuoteRequest } from '../quote-request'
import { mergeForStorage } from '../../components/map/use-profile'
import { EMPTY_PROFILE } from '../../components/map/types'

const q = (s: string) => parseNextStepsQuery(new URLSearchParams(s))

describe('next-steps query', () => {
  it('parses the verdict hand-off', () => {
    expect(q('town=Worcester&fuel=oil&save=1240&back=%2Fverdict%3Ffuel%3Doil')).toEqual({
      town: 'Worcester',
      fuel: 'oil',
      saveUsd: 1240,
      back: '/verdict?fuel=oil',
    })
  })
  it('accepts a negative save and an empty query', () => {
    expect(q('save=-300').saveUsd).toBe(-300)
    expect(q('')).toEqual({ town: null, fuel: null, saveUsd: null, back: null })
  })
  it('drops junk values', () => {
    expect(q('town=<script>&fuel=coal&save=1e9&back=x')).toEqual({ town: null, fuel: null, saveUsd: null, back: null })
    expect(q('save=12.5').saveUsd).toBeNull()
    expect(q('save=99999999').saveUsd).toBeNull()
    expect(q(`town=${'a'.repeat(80)}`).town).toBeNull()
  })
  it.each([
    'https://evil.example/verdict',
    '//evil.example/verdict',
    '/\\evil.example/verdict',
    'javascript:alert(1)',
    '/verdictx',
    '/verdict/../admin',
    '/verdict%2f..%2f..',
    '/other',
    '/verdict\n/x',
    ' /verdict',
    '/verdict?x=1 2',
    `/verdict?${'a'.repeat(600)}`,
  ])('rejects back=%s', (raw) => {
    expect(safeBackPath(raw)).toBeNull()
  })
  it('keeps same-origin verdict paths', () => {
    expect(safeBackPath('/verdict')).toBe('/verdict')
    expect(safeBackPath('/verdict/abc?fuel=oil&save=1#top')).toBe('/verdict/abc?fuel=oil&save=1#top')
  })
})

describe('seasonal rate and winter savings', () => {
  it('takes 7 cents off Eversource Basic Service', () => {
    expect(seasonalRate('eversource', 17.3)).toEqual({ fromCents: 17.3, toCents: 10.3, offCents: 7 })
  })
  it('takes 4 cents off National Grid', () => {
    expect(seasonalRate('nationalgrid', 16.074)).toEqual({ fromCents: 16.074, toCents: 12.07, offCents: 4 })
  })
  it('gives nothing without an adjustment or a rate', () => {
    expect(seasonalRate('municipal', 17.3)).toBeNull()
    expect(seasonalRate('cape_light', 17.3)).toBeNull()
    expect(seasonalRate('unitil', null)).toBeNull()
  })
  it('multiplies cents off by monthly kWh and six months', () => {
    const w = winterSavings(7, 600)
    expect(w?.usd).toBe(252)
    expect(w?.formula).toBe('7¢/kWh × 600 kWh × 6 months ÷ 100 = $252.00')
    expect(winterSavings(7, 0)).toBeNull()
    expect(winterSavings(0, 600)).toBeNull()
  })
  it('uses Eversource rates for Cape Light only when the town lists Eversource', () => {
    expect(rateSponsorFor('cape_light', ['cape_light', 'eversource'])).toBe('eversource')
    expect(rateSponsorFor('cape_light', ['cape_light'])).toBe('cape_light')
  })
})

describe('quote request', () => {
  const facts = { town: 'Worcester', fuel: 'oil' as const, home: 'single' as const, utility: 'National Grid', monthlyKwh: 540 }
  it('is deterministic and carries only the given facts', () => {
    const a = buildQuoteRequest(facts)
    expect(buildQuoteRequest(facts)).toEqual(a)
    expect(a.subject).toBe('Heat pump quote request, Worcester, MA')
    for (const line of ['Town: Worcester', 'Home: single-family house', 'Current heating: heating oil', 'Electric utility: National Grid', 'about 540 kWh a month']) {
      expect(a.body).toContain(line)
    }
  })
  it('leaves out unknown facts, and has no address, name, phone or email field', () => {
    const a = buildQuoteRequest({ town: 'Worcester', fuel: null, home: null, utility: null, monthlyKwh: null })
    expect(a.body).not.toMatch(/Home:|Current heating:|Electric utility:|kWh/)
    expect(a.body).not.toMatch(/@|\bphone\b|\d{3}-\d{3}-\d{4}|Name:|Address:/i)
    expect(Object.keys(buildQuoteRequest(facts)).sort()).toEqual(['body', 'mailto', 'subject'])
  })
  it('builds a mailto with an empty To and encoded subject and body', () => {
    const a = buildQuoteRequest(facts)
    expect(a.mailto.startsWith('mailto:?subject=')).toBe(true)
    const params = new URL(a.mailto).searchParams
    expect(params.get('subject')).toBe(a.subject)
    expect(params.get('body')).toBe(a.body)
  })
})

describe('profile storage next to the onboarding wizard', () => {
  const onboarding = JSON.stringify({ name: 'Ada', email: 'ada@example.com', phone: '', consentAt: '2026-10-24T00:00:00.000Z' })
  it('keeps onboarding fields when an empty map profile is written', () => {
    expect(JSON.parse(mergeForStorage(onboarding, { ...EMPTY_PROFILE }) as string)).toEqual(JSON.parse(onboarding))
  })
  it('adds map fields without dropping onboarding fields', () => {
    const merged = JSON.parse(mergeForStorage(onboarding, { ...EMPTY_PROFILE, town: 'Worcester' }) as string)
    expect(merged.name).toBe('Ada')
    expect(merged.email).toBe('ada@example.com')
    expect(merged.town).toBe('Worcester')
  })
  it('removes the entry when nothing is left, and tolerates corrupt storage', () => {
    expect(mergeForStorage(null, { ...EMPTY_PROFILE })).toBeNull()
    expect(mergeForStorage('{oops', { ...EMPTY_PROFILE })).toBeNull()
    expect(mergeForStorage('[1,2]', { ...EMPTY_PROFILE, town: 'Worcester' })).toContain('Worcester')
  })
})
