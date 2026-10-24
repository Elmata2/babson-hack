/** @built F-143 tests for the four best-case rows (Addendum B §3.5) */

import { describe, expect, it } from 'vitest'

import { computeVerdict } from '@/lib/calc'
import type { BasicServiceRate } from '@/lib/supply'
import { allStay, bestCase, type BestCaseInput } from '../best-case'

const basic: BasicServiceRate = {
  centsPerKwh: 17.3,
  period: 'Aug 1 2026 → Jan 2027',
  source: 'Boston.com',
  sourceDate: '2026-07-29',
  url: 'https://example.test/rates',
}

const result = computeVerdict(
  { fuel: 'oil', annualUnits: 800, unitPrice: 6.23, hdd65: 5_599 },
  { tier: 'whole', installYear: 2026, heatPumpRate: 0.235, standardRate: 0.305 },
)

if (!result) throw new Error('the golden case must compute — F-25 depends on it')

const base: BestCaseInput = {
  result,
  fuel: 'oil',
  unitPrice: 6.23,
  marketPrice: 6.23,
  marketPeriod: '2026-10-19',
  annualUnits: 800,
  supplyAvailable: true,
  basicService: basic,
  sponsorLabel: 'Eversource',
  noMassSave: false,
  incomeEligible: false,
  seasonalApplied: true,
}

describe('bestCase', () => {
  it('returns the four categories in the design order for an oil home', () => {
    expect(bestCase(base).map((row) => row.id)).toEqual(['supply', 'fuel', 'heat_pump', 'programs'])
  })

  it('drops the fuel row for gas and resistance homes', () => {
    expect(bestCase({ ...base, fuel: 'gas' }).map((row) => row.id)).toEqual(['supply', 'heat_pump', 'programs'])
    expect(bestCase({ ...base, fuel: 'resistance' }).map((row) => row.id)).toEqual([
      'supply',
      'heat_pump',
      'programs',
    ])
  })

  it('drops the supply row where a municipal light plant serves', () => {
    expect(bestCase({ ...base, supplyAvailable: false }).map((row) => row.id)).not.toContain('supply')
  })

  it('says STAY only when the household is at or below the state average', () => {
    const atAverage = bestCase(base).find((row) => row.id === 'fuel')
    expect(atAverage?.outcome).toBe('stay')

    const above = bestCase({ ...base, unitPrice: 6.8 }).find((row) => row.id === 'fuel')
    expect(above?.outcome).toBe('switch')
    expect(above?.headline).toContain('$0.57/gal more')
    expect(above?.detail).toContain('$456')
  })

  it('turns a missing market price into CHECK, never a guessed STAY', () => {
    const row = bestCase({ ...base, marketPrice: null }).find((entry) => entry.id === 'fuel')
    expect(row?.outcome).toBe('check')
  })

  it('refuses a rebate at a municipal light plant instead of printing one', () => {
    const rows = bestCase({ ...base, supplyAvailable: false, noMassSave: true })
    expect(rows.find((row) => row.id === 'programs')?.outcome).toBe('none')
    expect(rows.find((row) => row.id === 'heat_pump')?.outcome).toBe('check')
  })

  it('surfaces the income path without promising it', () => {
    const programs = bestCase({ ...base, incomeEligible: true }).find((row) => row.id === 'programs')
    expect(programs?.detail).toContain('up to $16,000')
    expect(programs?.detail).toContain('Home Energy Assessment')
  })

  it('turns a DO_NOT_SWITCH_YET verdict into STAY with the break-even price', () => {
    const gas = computeVerdict(
      { fuel: 'gas', annualUnits: 900, unitPrice: 1.8, hdd65: 5_599 },
      { tier: 'whole', installYear: 2026, heatPumpRate: 0.235, standardRate: 0.305 },
    )
    expect(gas?.verdict).toBe('DO_NOT_SWITCH_YET')
    const row = bestCase({ ...base, result: gas, fuel: 'gas' }).find((entry) => entry.id === 'heat_pump')
    expect(row?.outcome).toBe('stay')
    expect(row?.detail).toContain('Break-even')
  })

  it('never says "already best" when a row still needs checking', () => {
    expect(allStay(bestCase(base))).toBe(false)
    expect(
      allStay([
        { ...bestCase(base)[0], outcome: 'stay' },
        { ...bestCase(base)[1], outcome: 'none' },
      ]),
    ).toBe(true)
  })
})
