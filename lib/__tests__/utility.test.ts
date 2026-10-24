/**
 * @built F-56 tests for the Mass Save eligibility gate and the seasonal rate rule
 *
 * These are the tests that decide whether the app can quote a number at all. A
 * municipal light plant town must refuse; a `mixed` town must ask; an investor
 * utility must carry the right cents. Every one of the 351 towns is swept, so a
 * bake regression cannot pass by fixing one fixture.
 */

import { describe, expect, it } from 'vitest'
import { ALL_TOWNS, SEASONAL_RATE_ADJUSTMENT, UTILITY_META, resolveUtility, seasonalHeatPumpRate } from '../utility'

describe('utility table coverage', () => {
  it('covers all 351 Massachusetts municipalities', () => {
    expect(ALL_TOWNS).toHaveLength(351)
    expect(new Set(ALL_TOWNS.map((town) => town.toLowerCase())).size).toBe(351)
    expect(UTILITY_META.recordCount).toBe(351)
  })

  it('resolves every town to at least one sponsor', () => {
    const missing = ALL_TOWNS.filter((town) => resolveUtility(town).sponsors.length === 0)
    expect(missing).toEqual([])
  })

  it('keeps the three answers consistent across the whole state', () => {
    for (const town of ALL_TOWNS) {
      const resolved = resolveUtility(town)
      expect(resolved.found).toBe(true)
      // null eligibility and a question are the same state, by construction.
      expect(resolved.eligibleForMassSave === null).toBe(resolved.question !== null)
      if (resolved.eligibleForMassSave === true) {
        expect(resolved.seasonalRateRule).not.toBeNull()
        expect(resolved.sponsors).toHaveLength(1)
      }
      if (resolved.eligibleForMassSave === false) {
        expect(resolved.reason).toMatch(/Mass Save/)
      }
      if (resolved.mixed) {
        expect(resolved.eligibleForMassSave).toBeNull()
        expect(resolved.seasonalRateRule).toBeNull()
      }
    }
  })
})

describe('municipal light plants', () => {
  it('refuses Mass Save for Wellesley and says why', () => {
    const resolved = resolveUtility('Wellesley')
    expect(resolved.found).toBe(true)
    expect(resolved.sponsors).toEqual(['municipal'])
    expect(resolved.hasMunicipal).toBe(true)
    expect(resolved.mixed).toBe(false)
    expect(resolved.eligibleForMassSave).toBe(false)
    expect(resolved.seasonalRateRule).toBeNull()
    expect(resolved.reason).toContain('municipal light plant')
    expect(resolved.reason).toContain('not served by Mass Save')
    expect(resolved.question).toBeNull()
  })

  it('treats every municipal-only town the same way', () => {
    const municipalOnly = ALL_TOWNS.map((town) => resolveUtility(town)).filter(
      (resolved) => resolved.sponsors.length === 1 && resolved.sponsors[0] === 'municipal',
    )
    expect(municipalOnly.length).toBeGreaterThanOrEqual(40)
    for (const resolved of municipalOnly) {
      expect(resolved.eligibleForMassSave).toBe(false)
      expect(resolved.seasonalRateRule).toBeNull()
    }
  })

  it('matches Holyoke, the other classic MLP example', () => {
    expect(resolveUtility('Holyoke').eligibleForMassSave).toBe(false)
  })
})

describe('investor-owned sponsors', () => {
  it('gives Eversource and Unitil −$0.07/kWh', () => {
    expect(resolveUtility('Framingham')).toMatchObject({
      sponsors: ['eversource'],
      eligibleForMassSave: true,
      seasonalRateRule: -0.07,
      mixed: false,
    })
    expect(resolveUtility('Fitchburg')).toMatchObject({
      sponsors: ['unitil'],
      eligibleForMassSave: true,
      seasonalRateRule: -0.07,
    })
  })

  it('gives National Grid −$0.04/kWh', () => {
    expect(resolveUtility('Nantucket')).toMatchObject({
      sponsors: ['nationalgrid'],
      eligibleForMassSave: true,
      seasonalRateRule: -0.04,
    })
  })

  it('applies the adjustment to the customer rate and reports that it did', () => {
    const applied = seasonalHeatPumpRate(0.3049, 'Framingham')
    expect(applied.applied).toBe(true)
    expect(applied.rule).toBe(-0.07)
    expect(applied.rate).toBeCloseTo(0.2349, 10)

    const nationalGrid = seasonalHeatPumpRate(0.3049, 'Nantucket')
    expect(nationalGrid.rate).toBeCloseTo(0.2649, 10)

    const municipal = seasonalHeatPumpRate(0.3049, 'Wellesley')
    expect(municipal).toEqual({ rate: 0.3049, applied: false, rule: null })
  })

  it('has a rule only for the three sponsors Mass Save publishes one for', () => {
    expect(SEASONAL_RATE_ADJUSTMENT.eversource).toBe(-0.07)
    expect(SEASONAL_RATE_ADJUSTMENT.unitil).toBe(-0.07)
    expect(SEASONAL_RATE_ADJUSTMENT.nationalgrid).toBe(-0.04)
    expect(SEASONAL_RATE_ADJUSTMENT.municipal).toBeNull()
    expect(SEASONAL_RATE_ADJUSTMENT.cape_light).toBeNull()
  })
})

describe('mixed towns ask, they do not guess', () => {
  it('asks which utility bills a Lakeville address', () => {
    const resolved = resolveUtility('Lakeville')
    expect(resolved.mixed).toBe(true)
    expect(resolved.hasMunicipal).toBe(true)
    expect(resolved.sponsors).toEqual(['municipal', 'eversource'])
    expect(resolved.eligibleForMassSave).toBeNull()
    expect(resolved.seasonalRateRule).toBeNull()
    expect(resolved.question).toContain('Municipal light plant')
    expect(resolved.question).toContain('Eversource')
    expect(resolved.question?.endsWith('?')).toBe(true)
  })

  it('asks when two IOUs split a town, because the cents differ', () => {
    const resolved = resolveUtility('Westport')
    expect(resolved.sponsors).toEqual(['eversource', 'nationalgrid'])
    expect(resolved.mixed).toBe(true)
    expect(resolved.eligibleForMassSave).toBeNull()
    expect(resolved.reason).toContain('seasonal rate')
  })

  it('asks for a municipal + National Grid town', () => {
    const resolved = resolveUtility('Groton')
    expect(resolved.sponsors).toEqual(['municipal', 'nationalgrid'])
    expect(resolved.question).not.toBeNull()
  })

  it('never picks the first sponsor for a mixed town', () => {
    const mixed = ALL_TOWNS.map((town) => resolveUtility(town)).filter((resolved) => resolved.mixed)
    expect(mixed.length).toBeGreaterThan(0)
    for (const resolved of mixed) expect(resolved.sponsors.length).toBeGreaterThan(1)
  })
})

describe('unknown towns', () => {
  it('returns a question, not a default utility', () => {
    const resolved = resolveUtility('Atlantis')
    expect(resolved.found).toBe(false)
    expect(resolved.sponsors).toEqual([])
    expect(resolved.eligibleForMassSave).toBeNull()
    expect(resolved.seasonalRateRule).toBeNull()
    expect(resolved.question).toContain('Which utility bills you')
    expect(resolved.reason).toContain('351')
  })

  it('accepts case and a Town of prefix', () => {
    expect(resolveUtility('town of wellesley').sponsors).toEqual(['municipal'])
    expect(resolveUtility('  FRAMINGHAM ').sponsors).toEqual(['eversource'])
  })
})
