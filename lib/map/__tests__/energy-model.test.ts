import { describe, expect, it } from 'vitest'
import type { SponsorKey } from '@/lib/elec-label'
import {
  buildEnergyTowns,
  demandAt,
  MA_ANNUAL_TWH,
  MA_SOLAR_MW,
  solarAt,
  totalsAt,
  valueAt,
  type TownInput,
} from '../energy-model'

const SPONSORS: SponsorKey[][] = [['eversource'], ['nationalgrid'], ['municipal'], ['eversource', 'municipal'], ['unitil'], []]
const INPUTS: TownInput[] = Array.from({ length: 40 }, (_, i) => ({
  town: `Town ${i}`,
  county: ['Suffolk', 'Barnstable', 'Berkshire', 'Nowhere'][i % 4],
  centroid: [-73 + (i % 8) * 0.4, 41.4 + (i % 5) * 0.2] as [number, number],
  areaKm2: 5 + i * 3,
  sponsors: SPONSORS[i % SPONSORS.length],
}))
const TOWNS = buildEnergyTowns(INPUTS)

describe('energy model', () => {
  it('is deterministic', () => {
    expect(buildEnergyTowns(INPUTS)).toEqual(TOWNS)
  })

  it('sums to the statewide constants', () => {
    const annualTWh = TOWNS.reduce((s, t) => s + t.annualMWh, 0) / 1e6
    const solarMW = TOWNS.reduce((s, t) => s + t.solarMW, 0)
    expect(annualTWh).toBeCloseTo(MA_ANNUAL_TWH, 6)
    expect(solarMW).toBeCloseTo(MA_SOLAR_MW, 6)
  })

  it('never reports negative values, and net load never exceeds demand', () => {
    for (const t of TOWNS) {
      for (let h = 0; h < 24; h++) {
        expect(demandAt(t, h)).toBeGreaterThan(0)
        expect(solarAt(t, h)).toBeGreaterThanOrEqual(0)
        const net = valueAt(t, h, 'net')
        expect(net).toBeGreaterThanOrEqual(0)
        expect(net).toBeLessThanOrEqual(demandAt(t, h) + 1e-9)
      }
    }
  })

  it('has no solar at night', () => {
    for (const t of TOWNS) expect(solarAt(t, 0)).toBe(0)
  })

  it('provider shares sum to 1 at every hour', () => {
    for (let h = 0; h < 24; h++) {
      const totals = totalsAt(TOWNS, h)
      const shares = Object.values(totals.byProvider).reduce((s, mw) => s + (mw ?? 0), 0)
      expect(shares / totals.demand).toBeCloseTo(1, 9)
    }
  })

  it('splits a mixed town evenly and labels an unserved town as unknown', () => {
    const mixed = TOWNS.find((t) => t.mixed)
    expect(mixed?.provider).toBe('mixed')
    const totals = totalsAt(mixed ? [mixed] : [], 12)
    expect(totals.byProvider.eversource).toBeCloseTo(totals.byProvider.municipal ?? 0, 9)
    expect(TOWNS.find((t) => t.sponsors[0] === 'other')?.provider).toBe('other')
  })
})
