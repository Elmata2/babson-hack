/**
 * @built F-62 tests for the statewide geography lookup
 *
 * The point of these tests is coverage, not spot checks: every one of the 351
 * towns must resolve to a county and at least one real tract, and every GEOID must
 * survive formatting with its leading zeros intact. A demo borough would pass a
 * spot check; this suite would not.
 */

import { describe, expect, it } from 'vitest'
import hddJson from '../../data/generated/hdd-by-county.json'
import {
  GEO_META,
  TOWNS,
  counties,
  countyOfFips,
  countyOfTown,
  countyFipsOfTract,
  displayTown,
  hdd65ForCounty,
  hdd65ForTown,
  locateTown,
  normalizeTractGeoid,
  stateTotals,
  townsOfTract,
  tractGeoid,
  tractStats,
  tractStatsOfTown,
  tractsOfTown,
} from '../geo'

describe('town resolution, statewide', () => {
  it('lists all 351 municipalities across 14 counties', () => {
    expect(TOWNS).toHaveLength(351)
    expect(counties()).toHaveLength(14)
    expect(counties().reduce((sum, county) => sum + county.townCount, 0)).toBe(351)
  })

  it('resolves every town to a county with a real climate', () => {
    for (const town of TOWNS) {
      const located = locateTown(town)
      expect(located).not.toBeNull()
      expect(located?.county.fips).toMatch(/^25\d{3}$/)
      expect(located?.county.hdd65).toBeGreaterThan(4_400)
      expect(located?.county.hdd65).toBeLessThan(7_600)
    }
  })

  it('resolves every town to at least one tract that exists in the stats table', () => {
    const empty = TOWNS.filter((town) => tractsOfTown(town).length === 0)
    expect(empty).toEqual([])
    for (const town of TOWNS) {
      for (const geoid of tractsOfTown(town)) {
        expect(geoid).toMatch(/^\d{11}$/)
        expect(tractStats(geoid)).not.toBeNull()
      }
    }
  })

  it('resolves Framingham to Middlesex, and its Census tract to Framingham', () => {
    expect(locateTown('Framingham')?.county.name).toBe('Middlesex')
    expect(locateTown('Town of Framingham')?.county.fips).toBe('25017')
    expect(tractsOfTown('Framingham')).toContain('25017383502')
    expect(townsOfTract('25017383502')).toContain('Framingham')
  })

  it('is case and whitespace insensitive, and null for a non-town', () => {
    expect(locateTown('  wELLESLEY ')?.town).toBe('Wellesley')
    expect(locateTown('Atlantis')).toBeNull()
    expect(locateTown(42)).toBeNull()
    expect(tractsOfTown('Atlantis')).toEqual([])
    expect(displayTown('atlantis')).toBe('Atlantis')
  })

  it('resolves island and hill towns that a one-winner spatial join would lose', () => {
    for (const town of ['Aquinnah', 'Chilmark', 'Gosnold', 'Heath', 'Wellfleet', 'Boxborough']) {
      expect(tractsOfTown(town).length).toBeGreaterThan(0)
    }
  })
})

describe('tract statistics', () => {
  it('reads a tract with a plausible fuel mix', () => {
    const stats = tractStats('25017383502')
    expect(stats).not.toBeNull()
    expect(stats?.geoid).toBe('25017383502')
    expect(stats?.households).toBeGreaterThan(0)
    expect(stats?.oilShare).toBeGreaterThanOrEqual(0)
    expect(stats?.oilShare).toBeLessThanOrEqual(1)
    const accounted =
      (stats?.oilHouseholds ?? 0) + (stats?.gasHouseholds ?? 0) + (stats?.electricHouseholds ?? 0) + (stats?.propaneHouseholds ?? 0)
    expect(accounted).toBeLessThanOrEqual(stats?.households ?? 0)
  })

  it('returns null for a tract that is not in the table', () => {
    expect(tractStats('25999999999')).toBeNull()
    expect(tractStats('nonsense')).toBeNull()
  })

  it('gives every town at least one tract with households', () => {
    const empty = TOWNS.filter((town) => tractStatsOfTown(town).reduce((sum, stats) => sum + stats.households, 0) === 0)
    expect(empty).toEqual([])
  })

  it('reports statewide totals once, without double-counting straddling tracts', () => {
    const totals = stateTotals()
    expect(totals.tracts).toBe(1_620)
    expect(totals.households).toBeGreaterThan(2_000_000)
    expect(totals.households).toBeLessThan(3_500_000)
    expect(totals.oilShare).toBeGreaterThan(0.1)
    expect(totals.oilShare).toBeLessThan(0.45)
    // Memoised: same object, same numbers.
    expect(stateTotals()).toBe(totals)
  })
})

describe('GEOID formatting', () => {
  it('keeps 11 digits and never drops a leading zero', () => {
    expect(normalizeTractGeoid('25001011200')).toBe('25001011200')
    expect(normalizeTractGeoid('25001011200'.padStart(11, '0'))).toBe('25001011200')
    // Barnstable County is 001: the zeros are load-bearing.
    expect(normalizeTractGeoid(' 25001010100 ')).toBe('25001010100')
    expect(normalizeTractGeoid('25001010100')?.slice(0, 5)).toBe('25001')
  })

  it('builds a GEOID from county + tract with the zeros restored', () => {
    expect(tractGeoid('001', '011200')).toBe('25001011200')
    expect(tractGeoid('25001', '11200')).toBe('25001011200')
    expect(tractGeoid('25017', '383502')).toBe('25017383502')
    expect(tractGeoid('017', '3835.02')).toBe('25017383502')
    expect(countyFipsOfTract('25001011200')).toBe('25001')
  })

  it('rejects shapes it cannot format instead of padding blindly', () => {
    expect(normalizeTractGeoid('123')).toBeNull()
    expect(normalizeTractGeoid('')).toBeNull()
    expect(normalizeTractGeoid(null)).toBeNull()
    expect(normalizeTractGeoid('99001010100')).toBeNull() // not Massachusetts
    expect(tractGeoid('017', '')).toBeNull()
    expect(tractGeoid('017', '1234567')).toBeNull()
    expect(tractGeoid('099', '123456')).toBeNull() // county is not 25-prefixed
    expect(countyFipsOfTract('nonsense')).toBeNull()
  })

  it('accepts the numeric form only when it is still 11 digits', () => {
    expect(normalizeTractGeoid(25001010100)).toBe('25001010100')
    expect(normalizeTractGeoid(-1)).toBeNull()
  })
})

describe('county climate lookups', () => {
  it('reads HDD from the committed table, not from a constant', () => {
    expect(countyOfFips('25017')?.name).toBe('Middlesex')
    expect(hdd65ForCounty('25017')).toBe(MiddlesexHdd())
    expect(hdd65ForTown('Framingham')).toBe(MiddlesexHdd())
    expect(hdd65ForCounty('99999')).toBeNull()
    expect(hdd65ForTown('Atlantis')).toBeNull()

    function MiddlesexHdd(): number {
      return hddJson.counties['25017'].hdd65
    }
  })

  it('carries provenance for the freshness badge', () => {
    for (const meta of [GEO_META.towns, GEO_META.hdd, GEO_META.tractStats]) {
      expect(typeof meta.source).toBe('string')
      expect(typeof meta.fetchedAt).toBe('string')
      expect(Number.isNaN(Date.parse(meta.fetchedAt))).toBe(false)
    }
  })

  it('maps a town to its county for all 14 counties', () => {
    const seen = new Set(TOWNS.map((town) => countyOfTown(town)?.fips))
    expect(seen.size).toBe(14)
  })
})
