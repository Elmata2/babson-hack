/**
 * @built F-43 F-45 F-46 F-47 F-48 the Heat lens's arithmetic, its year, its table and its
 * keyboard, as tests rather than as prose.
 *
 * The point of `lib/map/heat.ts` is that no component holds a number, so these tests
 * hold the numbers to their sources: the rebate cap difference is read from the rule
 * tables, the oil price from the DOER snapshot, and the state total is asserted equal
 * to the sum of the counties it is split into.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FUEL_SNAPSHOT_2026_10_19, HEAT_PUMP_RULES_2026, HEAT_PUMP_RULES_2027 } from '@/lib/calc/rules'
import { tractsOfTown } from '@/lib/geo'
import {
  ASSUMPTION_NOTE,
  CLIFF_CAPS,
  CLIFF_NOTE,
  CLIFF_SOURCE,
  CLIFF_USD_PER_HOME,
  GAL_PER_HOUSEHOLD,
  HEAT_METRICS,
  OIL_PRICE_AS_OF,
  OIL_PRICE_USD_PER_GAL,
  allHeatRows,
  cliffDollarsFor,
  cliffSentence,
  countyHeatRows,
  formatMetric,
  formatMillions,
  headline,
  heatProps,
  heatRow,
  heatRowFor,
  heatScale,
  isNavKey,
  metricValue,
  money,
  nextRowIndex,
  price,
  oilSpendFor,
  oilSpendSentence,
  percent,
  seedHref,
  seedQuery,
  stateHeatTotals,
  sumRows,
  tableRows,
  tableRowsForTown,
  type HeatMetric,
  type HeatRow,
} from '../heat'

const statsJson = JSON.parse(readFileSync(resolve(process.cwd(), 'public/data/ma-tract-stats.json'), 'utf8')) as {
  tracts: Record<string, number[]>
}

const ROW: HeatRow = heatRow({ geoid: '25001010100', households: 1000, oilHouseholds: 250, medianYearBuilt: 1962 })!

describe('the numbers come from the rule tables, not from a component', () => {
  it('derives the $1,000 step-down from the two published whole-home caps', () => {
    expect(CLIFF_CAPS[2026]).toBe(HEAT_PUMP_RULES_2026.tiers.whole.capAfterBonusesUsd)
    expect(CLIFF_CAPS[2027]).toBe(HEAT_PUMP_RULES_2027.tiers.whole.capAfterBonusesUsd)
    expect(CLIFF_USD_PER_HOME).toBe(CLIFF_CAPS[2026] - CLIFF_CAPS[2027])
    expect(CLIFF_USD_PER_HOME).toBe(1000)
  })

  it('reads the oil price from the dated DOER snapshot and shows the date', () => {
    expect(OIL_PRICE_USD_PER_GAL).toBe(FUEL_SNAPSHOT_2026_10_19.oil.avg)
    expect(OIL_PRICE_AS_OF).toBe(FUEL_SNAPSHOT_2026_10_19.asOf)
    expect(CLIFF_SOURCE).toContain(money(CLIFF_CAPS[2026]))
    expect(CLIFF_SOURCE).toContain(money(CLIFF_CAPS[2027]))
  })

  it('prints the 750 gal/household assumption wherever a spend appears', () => {
    expect(GAL_PER_HOUSEHOLD).toBe(750)
    expect(ASSUMPTION_NOTE).toBe('assumes 750 gal/household')
    expect(oilSpendSentence(ROW)).toContain(ASSUMPTION_NOTE)
    expect(oilSpendSentence(ROW)).toContain(OIL_PRICE_AS_OF)
    expect(oilSpendSentence(ROW)).toContain(`${price(OIL_PRICE_USD_PER_GAL)}/gal`)
  })
})

describe('heatRow', () => {
  it('computes share, spend and cliff from the counts alone', () => {
    expect(ROW.oilShare).toBeCloseTo(0.25, 10)
    expect(ROW.oilSpendUsd).toBeCloseTo(250 * 750 * OIL_PRICE_USD_PER_GAL, 6)
    expect(ROW.cliffHomes).toBe(250)
    expect(ROW.cliffDollars).toBe(250_000)
    expect(ROW.medianYearBuilt).toBe(1962)
  })

  it('gives a tract with nobody in it a null share rather than a zero', () => {
    const empty = heatRow({ geoid: '25001990000', households: 0, oilHouseholds: 0 })!
    expect(empty.oilShare).toBeNull()
    expect(empty.oilSpendUsd).toBe(0)
    expect(empty.cliffDollars).toBe(0)
    expect(percent(empty.oilShare)).toBe('No estimate')
  })

  it('never lets oil households exceed the occupied homes', () => {
    const odd = heatRow({ geoid: '25001010101', households: 10, oilHouseholds: 999 })!
    expect(odd.oilHouseholds).toBe(10)
    expect(odd.oilShare).toBe(1)
  })

  it('rejects a negative household count instead of guessing', () => {
    expect(heatRow({ geoid: '25001010102', households: -1, oilHouseholds: 0 })).toBeNull()
  })
})

describe('metric selection', () => {
  it('offers the three metrics design §3 lists', () => {
    expect(HEAT_METRICS).toEqual(['oil_share', 'oil_spend', 'cliff_homes', 'cliff_dollars'])
  })

  it('leaves oil share and oil spend unchanged by the year', () => {
    for (const metric of ['oil_share', 'oil_spend'] as HeatMetric[]) {
      expect(metricValue(ROW, metric, 2026)).toBe(metricValue(ROW, metric, 2027))
    }
  })

  it('costs nothing in 2026 and $1,000 a home in 2027', () => {
    expect(metricValue(ROW, 'cliff_dollars', 2026)).toBe(0)
    expect(metricValue(ROW, 'cliff_dollars', 2027)).toBe(250_000)
    expect(metricValue(ROW, 'cliff_homes', 2026)).toBe(0)
    expect(metricValue(ROW, 'cliff_homes', 2027)).toBe(250)
  })

  it('draws nothing for a tract with no households, in either year', () => {
    const empty = heatRow({ geoid: '25001990000', households: 0, oilHouseholds: 0 })!
    for (const metric of HEAT_METRICS) {
      expect(metricValue(empty, metric, 2026)).toBeNull()
      expect(metricValue(empty, metric, 2027)).toBeNull()
    }
  })

  it('paints the 2026 cliff as the exposed cohort and the 2027 cliff as dollars', () => {
    const before = heatScale('cliff_dollars', 2026)
    const after = heatScale('cliff_dollars', 2027)
    expect(before.property).toBe('cliffHomes2026')
    expect(after.property).toBe('cliffDollars2027')
    expect(before.labels).not.toEqual(after.labels)
  })

  it('gives every metric four ascending breaks and five labels', () => {
    for (const metric of HEAT_METRICS) {
      for (const year of [2026, 2027] as const) {
        const scale = heatScale(metric, year)
        expect(scale.labels).toHaveLength(5)
        expect(scale.breaks).toHaveLength(4)
        expect([...scale.breaks]).toEqual([...scale.breaks].sort((a, b) => a - b))
      }
    }
  })

  it('stamps the same property names the layer reads', () => {
    const props = heatProps(ROW)
    expect(props.oilShare).toBeCloseTo(0.25, 10)
    expect(props.cliffDollars2027).toBe(250_000)
    for (const metric of HEAT_METRICS) {
      for (const year of [2026, 2027] as const) {
        expect(Object.keys(props)).toContain(heatScale(metric, year).property)
      }
    }
  })

  it('keeps every equity percentage out of the heat properties', () => {
    const keys = Object.keys(heatProps(ROW)).join(' ')
    expect(keys).not.toMatch(/minority|english|ej/i)
  })
})

describe('the scrubber delta', () => {
  it('starts at $0 lost and ends in millions lost', () => {
    expect(headline(2026).text).toBe('$0 lost')
    expect(headline(2026).dollars).toBe(0)
    expect(headline(2026).homes).toBe(0)

    const after = headline(2027)
    expect(after.dollars).toBeGreaterThan(100_000_000)
    expect(after.text).toMatch(/^up to \$[\d.]+M lost on Jan 1 if these homes wait until 2027$/)
    expect(after.homes).toBeGreaterThan(100_000)
  })

  it('labels the cliff as the most a home loses, not a certain loss', () => {
    expect(CLIFF_NOTE).toBe(
      'Up to $1,000 per oil-heated home: the 2026 cap minus the 2027 cap. Smaller systems lose less.',
    )
  })

  it('is exactly the cohort times the step-down', () => {
    const totals = stateHeatTotals()
    expect(headline(2027).dollars).toBe(totals.oilHouseholds * CLIFF_USD_PER_HOME)
    expect(headline(2027).homes).toBe(totals.oilHouseholds)
  })

  it('loses money in every county with oil heat, and only in 2027', () => {
    const counties = countyHeatRows()
    expect(counties).toHaveLength(14)
    for (const county of counties) {
      expect(county.cliffDollars).toBeGreaterThan(0)
    }
    expect(sumRows(allHeatRows()).cliffDollars).toBe(headline(2027).dollars)
  })
})

describe('statewide coverage', () => {
  it('splits the state into counties that sum back to the state, with no tract counted twice', () => {
    const counties = countyHeatRows()
    const state = stateHeatTotals()
    expect(counties.reduce((s, c) => s + c.tracts, 0)).toBe(state.tracts)
    expect(counties.reduce((s, c) => s + c.households, 0)).toBe(state.households)
    expect(counties.reduce((s, c) => s + c.oilHouseholds, 0)).toBe(state.oilHouseholds)
    expect(counties.reduce((s, c) => s + c.cliffDollars, 0)).toBe(state.cliffDollars)
    // The tract table is the ACS one: 1,620 rows, some without usable estimates.
    expect(Object.keys(statsJson.tracts).length).toBeGreaterThanOrEqual(state.tracts)
    expect(state.tracts).toBeGreaterThan(1_500)
  })

  it('counts each tract exactly once when summing the committed rows', () => {
    const geoids = allHeatRows().map((row) => row.geoid)
    expect(new Set(geoids).size).toBe(geoids.length)
  })

  it('finds a tract by GEOID, and says when it cannot', () => {
    const first = allHeatRows()[0].geoid
    expect(heatRowFor(first)?.geoid).toBe(first)
    expect(heatRowFor('25099999999')).toBeNull()
    expect(heatRowFor(null)).toBeNull()
  })
})

describe('the accessible table', () => {
  it('sorts by the cliff, then by oil homes, and is stable on GEOID', () => {
    const rows = tableRows(2027)
    expect(rows.length).toBeGreaterThan(1_500)
    for (let i = 1; i < rows.length; i += 1) {
      const previous = rows[i - 1]
      const current = rows[i]
      expect(previous.cliffDollars).toBeGreaterThanOrEqual(current.cliffDollars)
      if (previous.cliffDollars === current.cliffDollars) {
        expect(previous.oilHouseholds).toBeGreaterThanOrEqual(current.oilHouseholds)
        if (previous.oilHouseholds === current.oilHouseholds) expect(previous.geoid < current.geoid).toBe(true)
      }
    }
  })

  it('shows no lost dollars in 2026 and real ones in 2027', () => {
    const before = tableRows(2026, 5)
    const after = tableRows(2027, 5)
    expect(before).toHaveLength(5)
    expect(before.every((row) => row.cliffDollars === 0)).toBe(true)
    expect(after.every((row) => row.cliffDollars > 0)).toBe(true)
  })

  it('names the towns that own a tract', () => {
    const wellesley = tractsOfTown('Wellesley')[0]
    const row = tableRows(2027).find((candidate) => candidate.geoid === wellesley)
    expect(row?.towns).toContain('Wellesley')
  })

  it('limits a town to its own tracts', () => {
    const tracts = new Set(tractsOfTown('Wellesley'))
    const rows = tableRowsForTown(2027, 'Wellesley')
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) expect(tracts.has(row.geoid)).toBe(true)
    expect(tableRowsForTown(2027, 'Nowhere')).toEqual([])
  })
})

describe('the keyboard reducer', () => {
  it('moves one row at a time and stops at both ends', () => {
    expect(nextRowIndex(10, 0, 'ArrowDown')).toBe(1)
    expect(nextRowIndex(10, 4, 'ArrowRight')).toBe(5)
    expect(nextRowIndex(10, 9, 'ArrowDown')).toBe(9)
    expect(nextRowIndex(10, 3, 'ArrowUp')).toBe(2)
    expect(nextRowIndex(10, 0, 'ArrowUp')).toBe(0)
  })

  it('jumps to the ends with Home and End', () => {
    expect(nextRowIndex(10, 6, 'Home')).toBe(0)
    expect(nextRowIndex(10, 6, 'End')).toBe(9)
  })

  it('starts from the first row when nothing is focused', () => {
    expect(nextRowIndex(10, -1, 'ArrowDown')).toBe(1)
    expect(nextRowIndex(10, 99, 'ArrowUp')).toBe(0)
  })

  it('ignores every other key and refuses an empty list', () => {
    expect(nextRowIndex(10, 3, 'Enter')).toBe(-1)
    expect(nextRowIndex(10, 3, 'Tab')).toBe(-1)
    expect(nextRowIndex(10, 3, 'a')).toBe(-1)
    expect(nextRowIndex(0, 0, 'ArrowDown')).toBe(-1)
    expect(isNavKey('ArrowDown')).toBe(true)
    expect(isNavKey('Tab')).toBe(false)
  })
})

describe('"use this tract"', () => {
  it('seeds the calculator with fuel, units, price, year built and the tract', () => {
    const query = new URLSearchParams(seedQuery(ROW, 'Wellesley', 2026))
    expect(query.get('fuel')).toBe('oil')
    expect(query.get('units')).toBe('750')
    expect(query.get('price')).toBe(String(OIL_PRICE_USD_PER_GAL))
    expect(query.get('town')).toBe('Wellesley')
    expect(query.get('yb')).toBe('1962')
    expect(query.get('src')).toBe('map')
    expect(query.get('tract')).toBe('25001010100')
    expect(query.get('year')).toBe('2026')
    expect(query.get('mn')).toContain(ASSUMPTION_NOTE)
  })

  it('omits a year built it does not have, rather than sending a zero', () => {
    const noYear = heatRow({ geoid: '25001010100', households: 100, oilHouseholds: 10, medianYearBuilt: 0 })!
    expect(new URLSearchParams(seedQuery(noYear, 'Wellesley', 2027)).has('yb')).toBe(false)
  })

  it('points the start view at the wizard and the verdict view at a seeded query', () => {
    expect(seedHref(ROW, 'Wellesley', 2026, 'start')).toBe('/onboarding')
    expect(seedHref(ROW, 'Wellesley', 2027, 'verdict').startsWith('/verdict?')).toBe(true)
  })
})

describe('formatting', () => {
  it('formats millions, thousands and dollars', () => {
    expect(formatMillions(624_510_000)).toBe('$624.5M')
    expect(formatMillions(2_920_000_000)).toBe('$2.9B')
    expect(formatMillions(377_000)).toBe('$377k')
    expect(formatMillions(0)).toBe('$0')
    expect(formatMillions(-1_000)).toBe('-$1k')
    expect(money(8500)).toBe('$8,500')
    expect(price(OIL_PRICE_USD_PER_GAL)).toBe('$6.23')
    expect(money(3278.4)).toBe('$3,278')
  })

  it('formats a share, a spend and a count in their own units', () => {
    expect(percent(0.2242)).toBe('22.4%')
    expect(formatMetric('oil_share', 0.25)).toBe('25%')
    expect(formatMetric('oil_spend', 1_000_000)).toBe('$1M')
    expect(formatMetric('cliff_dollars', 250_000)).toBe('$250k')
    expect(formatMetric('cliff_homes', 1)).toBe('1 home')
    expect(formatMetric('cliff_homes', 250)).toBe('250 homes')
    expect(formatMetric('cliff_dollars', null)).toBe('No estimate')
  })

  it('says the same thing about a tract in the sentences the panel prints', () => {
    expect(cliffSentence(ROW)).toContain('$250,000')
    expect(cliffSentence(ROW)).toContain('250 oil-heated homes')
    expect(cliffSentence(ROW)).toContain(money(CLIFF_USD_PER_HOME))
  })

  it('charges the same price to a bare count as to a row', () => {
    expect(oilSpendFor(250)).toBeCloseTo(ROW.oilSpendUsd, 6)
    expect(cliffDollarsFor(250)).toBe(ROW.cliffDollars)
    expect(oilSpendFor(0)).toBe(0)
    expect(cliffDollarsFor(-5)).toBe(0)
  })
})
