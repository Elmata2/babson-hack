import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { SponsorKey } from '@/lib/elec-label'
import {
  buildEnergyTowns,
  averageHomeKwh,
  averageIncentiveUsd,
  roundIncentiveUsd,
  compareSentence,
  describeTown,
  formatMWh,
  metricMax,
  metricValue,
  sourceLine,
  usageNote,
  type BakedEnergy,
  type TownInput,
} from '../energy-model'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')
const BAKED = JSON.parse(read('public/data/ma-town-energy.json')) as BakedEnergy
const GEO = JSON.parse(read('public/data/ma-towns.json')) as { features: { properties: { town: string; county: string } }[] }

const csvRows = (path: string) => {
  const [header, ...lines] = read(path).trim().split(/\r?\n/)
  const cols = header.split(',')
  return lines.map((l) => Object.fromEntries(l.split(',').map((v, i) => [cols[i], v])))
}

const FIXTURE: BakedEnergy = {
  _meta: BAKED._meta,
  towns: {
    ALPHA: { residentialMWh: 1000, incentivesUsd: 50000, households: 2000, usageStatus: 'reported', solarMW: 2, solarSystems: 10 },
    BETA: { residentialMWh: 3000, incentivesUsd: 90000, households: 4000, usageStatus: 'reported', solarMW: 5, solarSystems: 30 },
    GAMMA: { residentialMWh: null, incentivesUsd: null, households: 800, usageStatus: 'municipal', solarMW: 1, solarSystems: 4 },
    DELTA: { residentialMWh: null, incentivesUsd: null, households: 300, usageStatus: 'suppressed', solarMW: 0.5, solarSystems: 2 },
    EPSILON: { residentialMWh: 500, incentivesUsd: null, households: 100, usageStatus: 'reported', solarMW: 0, solarSystems: 0 },
  },
}
const SPONSORS: Record<string, SponsorKey[]> = {
  ALPHA: ['eversource'],
  BETA: ['eversource', 'nationalgrid'],
  GAMMA: ['municipal'],
  DELTA: ['unitil'],
  EPSILON: [],
}
const INPUTS: TownInput[] = Object.keys(FIXTURE.towns).map((source, i) => ({
  source,
  town: source,
  county: ['Suffolk', 'Barnstable', 'Berkshire', 'Nowhere', 'Worcester'][i],
  centroid: [-71, 42],
  sponsors: SPONSORS[source],
}))
const TOWNS = buildEnergyTowns(INPUTS, FIXTURE)
const byName = (n: string) => TOWNS.find((t) => t.source === n)!

describe('baked data joins the town geometry', () => {
  const names = GEO.features.map((f) => f.properties.town)

  it('has every one of the 351 towns, once', () => {
    expect(names).toHaveLength(351)
    expect(Object.keys(BAKED.towns).sort()).toEqual([...names].sort())
  })

  it('matches the source CSVs', () => {
    const usage = csvRows('data/sources/energy/usage/towns.csv')
    const solar = csvRows('data/sources/energy/solar/solar.csv')
    const reportedMWh = usage.reduce((s, r) => s + (r.status === 'reported' ? Number(r.res_mwh) : 0), 0)
    const baked = Object.values(BAKED.towns)
    expect(baked.reduce((s, t) => s + (t.residentialMWh ?? 0), 0)).toBe(reportedMWh)
    expect(baked.reduce((s, t) => s + t.solarSystems, 0)).toBe(solar.reduce((s, r) => s + Number(r.count), 0))
    expect(baked.reduce((s, t) => s + t.solarMW, 0)).toBeCloseTo(
      solar.reduce((s, r) => s + Number(r.installed_mw), 0),
      6,
    )
  })

  it('splits towns 299 reported, 50 municipal, 2 suppressed, and only reported towns carry MWh', () => {
    const count = (s: string) => Object.values(BAKED.towns).filter((t) => t.usageStatus === s).length
    expect([count('reported'), count('municipal'), count('suppressed')]).toEqual([299, 50, 2])
    for (const t of Object.values(BAKED.towns)) expect(t.residentialMWh === null).toBe(t.usageStatus !== 'reported')
    expect(BAKED.towns.HAWLEY.usageStatus).toBe('suppressed')
    expect(BAKED.towns.WELLESLEY.usageStatus).toBe('municipal')
  })

  it('bakes Mass Save incentives: CSV sum matches, only reported towns carry a figure', () => {
    const usage = csvRows('data/sources/energy/usage/towns.csv')
    const csvTotal = usage.reduce((s, r) => s + (r.res_incentives_usd === '' ? 0 : Number(r.res_incentives_usd)), 0)
    const baked = Object.values(BAKED.towns)
    expect(baked.reduce((s, t) => s + (t.incentivesUsd ?? 0), 0)).toBe(csvTotal)
    for (const t of baked) if (t.usageStatus !== 'reported') expect(t.incentivesUsd).toBeNull()
    expect(BAKED.towns.WORCESTER.incentivesUsd).toBe(5915254)
    expect(BAKED.towns.WELLESLEY.incentivesUsd).toBeNull()
    expect(BAKED.towns.HAWLEY.incentivesUsd).toBeNull()
  })

  it('builds an EnergyTown for every town', () => {
    const inputs = GEO.features.map((f) => ({
      source: f.properties.town,
      town: f.properties.town,
      county: f.properties.county,
      centroid: [-71, 42] as [number, number],
      sponsors: [],
    }))
    expect(buildEnergyTowns(inputs, BAKED)).toHaveLength(351)
  })
})

describe('energy model', () => {
  it('fails loudly on a town with no baked data', () => {
    expect(() => buildEnergyTowns([{ ...INPUTS[0], source: 'NOWHERE' }], FIXTURE)).toThrow(/NOWHERE/)
  })

  it('models usage as a status, not a nullable number', () => {
    expect(byName('ALPHA').usage).toEqual({ status: 'reported', mwh: 1000 })
    expect(byName('GAMMA').usage).toEqual({ status: 'municipal' })
    expect(byName('DELTA').usage).toEqual({ status: 'suppressed' })
  })

  it('gives municipal and suppressed towns no usage column and a reason', () => {
    expect(metricValue(byName('GAMMA'), 'usage')).toBeNull()
    expect(metricValue(byName('DELTA'), 'usage')).toBeNull()
    expect(metricValue(byName('GAMMA'), 'solar')).toBe(1)
    expect(usageNote(byName('GAMMA'))).toBe('Municipal light plant: not reported to Mass Save')
    expect(usageNote(byName('DELTA'))).toBe('Suppressed by Mass Save for privacy')
    expect(usageNote(byName('ALPHA'))).toBeNull()
    expect(describeTown(byName('GAMMA'), 'usage', FIXTURE._meta)).toBe('Municipal light plant: not reported to Mass Save')
    expect(describeTown(byName('ALPHA'), 'usage', FIXTURE._meta)).toBe('1 GWh residential use (Mass Save, 2023)')
    expect(describeTown(byName('BETA'), 'solar', FIXTURE._meta)).toBe('5.0 MW solar installed (MassCEC, Jan 2025)')
  })

  it('finds the tallest column per metric', () => {
    expect(metricMax(TOWNS, 'usage')).toBe(3000)
    expect(metricMax(TOWNS, 'solar')).toBe(5)
  })

  it('averages monthly kWh per household as MWh x 1000 / households / 12', () => {
    expect(averageHomeKwh(byName('ALPHA'))).toEqual({ status: 'ok', kwhPerMonth: (1000 * 1000) / 2000 / 12, households: 2000 })
  })

  it('hides the average for municipal, suppressed and mixed-utility towns, with the reason', () => {
    expect(averageHomeKwh(byName('GAMMA'))).toMatchObject({ status: 'hidden', reason: expect.stringMatching(/municipal light plant/) })
    expect(averageHomeKwh(byName('DELTA'))).toMatchObject({ status: 'hidden', reason: expect.stringMatching(/suppressed/) })
    expect(averageHomeKwh(byName('BETA'))).toMatchObject({ status: 'hidden', reason: expect.stringMatching(/more than one utility/) })
  })

  it('divides Mass Save incentives by households and rounds sensibly', () => {
    expect(averageIncentiveUsd(byName('ALPHA'))).toEqual({ status: 'ok', usdPerHousehold: 25, households: 2000 })
    expect(averageIncentiveUsd({ ...byName('ALPHA'), incentivesUsd: 0 })).toEqual({ status: 'none' })
    expect(roundIncentiveUsd(74.8)).toBe(75)
    expect(roundIncentiveUsd(99.4)).toBe(99)
    expect(roundIncentiveUsd(212)).toBe(210)
    expect(averageIncentiveUsd(byName('GAMMA')).status).toBe('hidden')
    expect(averageIncentiveUsd(byName('DELTA')).status).toBe('hidden')
    expect(averageIncentiveUsd(byName('BETA'))).toMatchObject({ status: 'hidden', reason: expect.stringMatching(/more than one utility/) })
    expect(averageIncentiveUsd(byName('EPSILON'))).toMatchObject({ status: 'hidden', reason: expect.stringMatching(/no incentive total/) })
  })

  it('words the comparison plainly', () => {
    expect(compareSentence(600, 500, 'Worcester')).toBe('You use roughly 20% more than the average home in Worcester.')
    expect(compareSentence(400, 500, 'Worcester')).toBe('You use roughly 20% less than the average home in Worcester.')
    expect(compareSentence(400, 0, 'Hull')).not.toMatch(/Infinity|NaN/)
    expect(compareSentence(505, 500, 'Worcester')).toBe('You use about the same as the average home in Worcester.')
  })

  it('bakes a positive household count for every town', () => {
    for (const [name, t] of Object.entries(BAKED.towns)) expect(Number.isInteger(t.households) && t.households > 0, name).toBe(true)
    expect(BAKED._meta.sources.households.year).toBe(2023)
  })
})

describe('labels', () => {
  it('builds the source line from _meta', () => {
    expect(sourceLine(BAKED._meta)).toBe('Residential use: Mass Save, 2023 · Solar: MassCEC, Jan 2025')
  })

  it('formats energy by magnitude', () => {
    expect(formatMWh(1_359_323)).toBe('1.36 TWh')
    expect(formatMWh(49_255)).toBe('49 GWh')
    expect(formatMWh(480)).toBe('480 MWh')
  })
})
