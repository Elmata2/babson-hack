/**
 * @built F-60 tests for the `ELEC_LABEL` parser, including the eight labels MassGIS
 * actually publishes and the hostile strings a future bake might hand it.
 *
 * The Lakeville case is the whole reason this parser exists: "Municipal, NSTAR
 * Electric d/b/a Eversource Energy" must survive as *two* sponsors, because a
 * municipal light plant customer cannot receive a Mass Save rebate.
 */

import { describe, expect, it } from 'vitest'
import { parseElecLabel, SPONSOR_LABEL, titleCaseTown, townKey } from '../elec-label'

describe('parseElecLabel — the labels MassGIS actually returns', () => {
  it('parses an IOU-only label', () => {
    expect(parseElecLabel('NSTAR Electric d/b/a Eversource Energy')).toEqual({
      sponsors: ['eversource'],
      hasMunicipal: false,
      mixed: false,
      unresolved: [],
    })
  })

  it('parses National Grid, including its two d/b/a names', () => {
    expect(parseElecLabel('Massachusetts Electric d/b/a National Grid').sponsors).toEqual(['nationalgrid'])
    expect(parseElecLabel('Nantucket Electric Company d/b/a National Grid').sponsors).toEqual(['nationalgrid'])
  })

  it('parses a bare "Municipal" as a municipal light plant', () => {
    const parsed = parseElecLabel('Municipal')
    expect(parsed).toEqual({ sponsors: ['municipal'], hasMunicipal: true, mixed: false, unresolved: [] })
  })

  it('keeps both sponsors for Lakeville, the mixed case', () => {
    const parsed = parseElecLabel('Municipal, NSTAR Electric d/b/a Eversource Energy')
    expect(parsed.sponsors).toEqual(['municipal', 'eversource'])
    expect(parsed.hasMunicipal).toBe(true)
    expect(parsed.mixed).toBe(true)
  })

  it('keeps both sponsors when two IOUs are named', () => {
    const parsed = parseElecLabel('NSTAR Electric d/b/a Eversource Energy, Massachusetts Electric d/b/a National Grid')
    expect(parsed.sponsors).toEqual(['eversource', 'nationalgrid'])
    expect(parsed.hasMunicipal).toBe(false)
    // Mixed even without a municipal plant: the seasonal rate differs by 3¢.
    expect(parsed.mixed).toBe(true)
  })

  it('parses UNITIL and Mixed municipal/National Grid labels', () => {
    expect(parseElecLabel('UNITIL').sponsors).toEqual(['unitil'])
    expect(parseElecLabel('Municipal, Massachusetts Electric d/b/a National Grid').sponsors).toEqual([
      'municipal',
      'nationalgrid',
    ])
  })

  it('never splits a d/b/a on its slashes', () => {
    // A `/` separator would turn "d/b/a" into three tokens and every town into `other`.
    expect(parseElecLabel('NSTAR Electric d/b/a Eversource Energy').unresolved).toEqual([])
  })
})

describe('parseElecLabel — malformed and hostile input', () => {
  it('returns no sponsors for an empty or whitespace label', () => {
    for (const value of ['', '   ', null, undefined, 42]) {
      expect(parseElecLabel(value)).toEqual({ sponsors: [], hasMunicipal: false, mixed: false, unresolved: [] })
    }
  })

  it('does not guess a sponsor from an unknown label', () => {
    const parsed = parseElecLabel('Unknown Utility Holdings LLC')
    expect(parsed.sponsors).toEqual(['other'])
    expect(parsed.hasMunicipal).toBe(false)
    expect(parsed.mixed).toBe(false)
    expect(parsed.unresolved).toEqual(['Unknown Utility Holdings LLC'])
  })

  it('handles comma-only separators without inventing entries', () => {
    expect(parseElecLabel(' , ,, ').sponsors).toEqual([])
  })

  it('recognises a municipal light department spelled out, and dedupes repeats', () => {
    const parsed = parseElecLabel('Wellesley Municipal Light Plant, Municipal')
    expect(parsed.sponsors).toEqual(['municipal'])
    expect(parsed.mixed).toBe(false)
  })

  it('accepts semicolons and pipes as separators', () => {
    expect(parseElecLabel('Municipal; UNITIL').sponsors).toEqual(['municipal', 'unitil'])
    expect(parseElecLabel('UNITIL | Municipal').sponsors).toEqual(['municipal', 'unitil'])
  })
})

describe('town keys and display names', () => {
  it('normalises prefixes, casing and whitespace without an allow-list', () => {
    expect(townKey('Town of Framingham')).toBe('framingham')
    expect(townKey('CITY OF BOSTON')).toBe('boston')
    expect(townKey('  wellesley  ')).toBe('wellesley')
    expect(townKey('Manchester-by-the-Sea')).toBe('manchester-by-the-sea')
    expect(townKey(undefined)).toBe('')
  })

  it('title-cases hyphens and small words', () => {
    expect(titleCaseTown('MANCHESTER-BY-THE-SEA')).toBe('Manchester-by-the-Sea')
    expect(titleCaseTown('MOUNT WASHINGTON')).toBe('Mount Washington')
    expect(titleCaseTown('NORTH ATTLEBOROUGH')).toBe('North Attleborough')
  })

  it('has a display label for every sponsor key', () => {
    expect(Object.keys(SPONSOR_LABEL).sort()).toEqual(
      ['cape_light', 'eversource', 'municipal', 'nationalgrid', 'other', 'unitil'].sort(),
    )
  })
})
