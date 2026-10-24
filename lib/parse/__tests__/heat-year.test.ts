/**
 * @built F-26a the baked heating-year table, as the parser consumes it
 *
 * Two things are worth failing a build over: the table drifting away from the
 * county HDD table it is a share of, and the Boston shape drifting away from the
 * numbers the design note quotes (January 19.1%, July 0.0%).
 *
 * Re-running `node scripts/bake-hdd.mjs --from-cache` must reproduce the file
 * byte for byte; that is checked by hand, because a test that rewrites committed
 * data on every run is worse than no test.
 */

import { describe, expect, it } from 'vitest'

import weights from '../../../data/generated/hdd-monthly-weights.json'
import hdd from '../../../data/generated/hdd-by-county.json'
import { DEFAULT_COUNTY_FIPS, DEFAULT_HEAT_YEAR, HEAT_YEAR_SOURCE, heatYearFor } from '../heat-year'

/** The Boston shape from the design note: Jan 0.191 … Dec 0.163. */
const BOSTON_MONTHS = [0.191, 0.169, 0.152, 0.096, 0.043, 0.008, 0, 0, 0.01, 0.055, 0.113, 0.163]

const counties = weights.counties as unknown as Record<
  string,
  { name: string; seasonHdd: number; months: number[] }
>

describe('hdd-monthly-weights.json', () => {
  it('carries provenance and a method', () => {
    expect(weights._meta.source).toMatch(/ERA5/)
    expect(weights._meta.url).toMatch(/^https:\/\//)
    expect(Number.isNaN(Date.parse(weights._meta.fetchedAt))).toBe(false)
    expect(weights._meta.method).toMatch(/calendar month/i)
  })

  it('has all 14 counties, twelve shares each, summing to one within rounding', () => {
    expect(Object.keys(counties)).toHaveLength(14)
    for (const [fips, county] of Object.entries(counties)) {
      expect(fips).toMatch(/^25\d{3}$/)
      expect(county.months, fips).toHaveLength(12)
      for (const share of county.months) {
        expect(share).toBeGreaterThanOrEqual(0)
        expect(share).toBeLessThanOrEqual(1)
      }
      const sum = county.months.reduce((a, b) => a + b, 0)
      expect(Math.abs(sum - 1), `${county.name} sums to ${sum}`).toBeLessThanOrEqual(0.003)
    }
  })

  it('reproduces the Boston shape the parser is tested against', () => {
    expect(counties[DEFAULT_COUNTY_FIPS].months).toEqual(BOSTON_MONTHS)
    expect(counties[DEFAULT_COUNTY_FIPS].name).toBe('Suffolk')
    expect(DEFAULT_HEAT_YEAR.monthShares).toEqual(BOSTON_MONTHS)
  })

  it('carries the same season HDD as the county table, so the two cannot disagree', () => {
    const countyHdd = hdd.counties as unknown as Record<string, { hdd65: number }>
    for (const [fips, county] of Object.entries(counties)) {
      expect(county.seasonHdd, fips).toBe(countyHdd[fips].hdd65)
    }
    expect(DEFAULT_HEAT_YEAR.seasonHdd).toBeCloseTo(5_693.7, 1)
  })

  it('is zero in July and August, which is why a July bill is refused', () => {
    expect(counties[DEFAULT_COUNTY_FIPS].months[6]).toBe(0)
    expect(counties[DEFAULT_COUNTY_FIPS].months[7]).toBe(0)
  })

  it('offers a statewide fallback that is also a valid shape', () => {
    expect(weights.statewide.months).toHaveLength(12)
    expect(Math.abs(weights.statewide.months.reduce((a, b) => a + b, 0) - 1)).toBeLessThanOrEqual(0.003)
    expect(weights.statewide.seasonHdd).toBeGreaterThan(5_000)
  })
})

describe('heatYearFor', () => {
  it('returns a county by FIPS and Boston when nothing is named', () => {
    expect(heatYearFor('25027')?.seasonHdd).toBeCloseTo(6_443.1, 1)
    expect(heatYearFor(null)).toBeNull()
    expect(heatYearFor('99999')).toBeNull()
    expect(DEFAULT_HEAT_YEAR.monthShares).toHaveLength(12)
  })

  it('exposes the source date for the UI freshness line', () => {
    expect(HEAT_YEAR_SOURCE.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(HEAT_YEAR_SOURCE.source).toMatch(/ERA5/)
  })
})
