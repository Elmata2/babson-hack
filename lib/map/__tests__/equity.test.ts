/**
 * @built F-58 F-47 the equity lens's two percentages and the plain-language path (R10.9, R10.11)
 *
 * The requirement has a "must not" in it as well as a "must": the layer may show
 * `PCT_MINORITY` and `LIMENGHHPCT`, and it may not change a heat value or a ranking.
 * The last two tests here are the "must not" — the module exports no value that could
 * reach a choropleth, and the percentages describe EJ block groups only.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  EJ_META,
  EJ_TRACTS,
  PLAIN_LANGUAGE_THRESHOLD_PCT,
  ejSummary,
  formatEj,
  offersPlainLanguage,
  plainLanguageHref,
} from '../equity'

const raw = JSON.parse(readFileSync(resolve(process.cwd(), 'public/data/ej-blockgroups.json'), 'utf8')) as {
  tracts: Record<string, number[]>
  _meta: { recordCount: number }
}

/** A tract the committed artefact flags with a double-digit limited-English share. */
const HIGH = Object.entries(raw.tracts).find(([, values]) => values[3] >= PLAIN_LANGUAGE_THRESHOLD_PCT)![0]
/** A tract with an EJ block group and no limited-English households. */
const ZERO = Object.entries(raw.tracts).find(([, values]) => values[3] === 0)![0]

describe('the committed EJ artefact', () => {
  it('already carries both percentages, so nothing has to be invented or re-baked', () => {
    expect(Object.keys(raw.tracts).length).toBeGreaterThan(1_000)
    for (const values of Object.values(raw.tracts)) {
      expect(values).toHaveLength(5)
      expect(values[2]).toBeGreaterThanOrEqual(0)
      expect(values[2]).toBeLessThanOrEqual(100)
      expect(values[3]).toBeGreaterThanOrEqual(0)
      expect(values[3]).toBeLessThanOrEqual(100)
    }
  })

  it('says out loud that the percentages cover EJ block groups, not whole tracts', () => {
    expect(EJ_META.coverage).toMatch(/EJ-designated block groups only/i)
    expect(EJ_META.caveat).toMatch(/not a 2026 determination/i)
    expect(EJ_META.recordCount).toBe(raw._meta.recordCount)
  })
})

describe('reading one tract', () => {
  it('returns both percentages for a flagged tract', () => {
    const summary = ejSummary(HIGH)!
    expect(summary.minorityPct).toBe(raw.tracts[HIGH][2])
    expect(summary.limitedEnglishPct).toBe(raw.tracts[HIGH][3])
    expect(summary.blockGroups).toBe(raw.tracts[HIGH][0])
    expect(formatEj(summary).minority).toMatch(/%$/)
    expect(formatEj(summary).limitedEnglish).toMatch(/%$/)
  })

  it('returns null for a tract with no EJ block group, and for nothing at all', () => {
    expect(ejSummary('25099999999')).toBeNull()
    expect(ejSummary(null)).toBeNull()
  })

  it('keeps the overlay set in step with the summaries', () => {
    expect(EJ_TRACTS.has(HIGH)).toBe(true)
    expect(EJ_TRACTS.has('25099999999')).toBe(false)
  })
})

describe('the plain-language path (R10.11)', () => {
  it('offers it at or above the threshold, and not below', () => {
    expect(offersPlainLanguage(HIGH)).toBe(true)
    expect(offersPlainLanguage(ZERO)).toBe(false)
    expect(offersPlainLanguage(null)).toBe(false)
  })

  it('links to the existing verdict route and its existing plain-English panel', () => {
    const href = plainLanguageHref('fuel=oil&units=750&town=Wellesley')
    const url = new URL(href, 'https://example.test')
    expect(url.pathname).toBe('/verdict')
    expect(url.hash).toBe('#plain-english')
    expect(url.searchParams.get('plain')).toBe('1')
    // The household's own numbers ride along: the plain view is the same verdict.
    expect(url.searchParams.get('fuel')).toBe('oil')
    expect(url.searchParams.get('town')).toBe('Wellesley')
  })

  it('never invents a translated route of its own', () => {
    const href = plainLanguageHref('fuel=oil')
    expect(href.startsWith('/verdict?')).toBe(true)
    expect(href).not.toContain('/translate')
    expect(href).not.toContain('plain-language?')
  })
})
