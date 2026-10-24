import { beforeAll, describe, expect, it } from 'vitest'

import { computeVerdict } from '@/lib/calc'
import { getPrices, type Prices } from '@/lib/prices'
import { buildSwitchModel } from '@/lib/switch/model'
import { choicesFor } from '@/lib/switch/choices'
import { parseBillUtility } from '@/lib/intake/params'

import { isVerdictQueryComplete, resolveVerdictInputs, verdictQueryIssue } from '../inputs'
import { leadCaveat } from '../lead-caveat'
import { DEMO_PRESETS } from '../presets'

const EXPECTED_SAVINGS: Record<string, number> = {
  'oil-enhanced': 2724,
  propane: 1775,
  'gas-hold': -267,
}

let prices: Prices

beforeAll(async () => {
  prices = await getPrices({
    bypassCache: true,
    fetchImpl: () => Promise.reject(new Error('offline')),
  })
})

function queryOf(href: string): Record<string, string> {
  return Object.fromEntries(new URL(href, 'https://switchpoint.test').searchParams)
}

describe('resolveVerdictInputs', () => {
  it.each(DEMO_PRESETS)('$key: /verdict and /switch compute the same verdict and choices', (preset) => {
    const params = queryOf(preset.href)
    const inputs = resolveVerdictInputs(params, prices)
    expect(inputs.heating).not.toBeNull()
    expect(inputs.upgrade).not.toBeNull()
    const verdictPath = computeVerdict(inputs.heating!, inputs.upgrade!)
    const verdictChoices = choicesFor({
      verdict: verdictPath?.verdict ?? null,
      fuel: inputs.fuel,
      utility: inputs.utility,
      billUtility: inputs.billUtility,
    })

    const model = buildSwitchModel(params, prices)

    expect(verdictPath).not.toBeNull()
    expect(model.ready).toBe(true)
    expect(model.result).toEqual(verdictPath)
    expect(model.choices).toEqual(verdictChoices)
    expect(verdictPath?.verdict).toBe(preset.expects)
    expect(Math.round(verdictPath?.annualSavings ?? Number.NaN)).toBe(EXPECTED_SAVINGS[preset.key])
  })

  it('defaults the install year and quote when the query omits them', () => {
    const { year: _year, ...params } = queryOf(DEMO_PRESETS[0].href)
    const inputs = resolveVerdictInputs(params, prices)
    expect(inputs.upgrade?.installYear).toBeDefined()
    expect(inputs.upgrade?.installCost).toBeGreaterThan(0)
    expect(buildSwitchModel(params, prices).ready).toBe(true)
  })

  it('reads both spellings of National Grid as the canonical value', () => {
    expect(parseBillUtility('nationalgrid')).toBe('national_grid')
    expect(parseBillUtility('national_grid')).toBe('national_grid')
    expect(parseBillUtility('bogus')).toBeNull()
    const worcester = queryOf(DEMO_PRESETS[1].href)
    expect(worcester.ut).toBe('national_grid')
    expect(resolveVerdictInputs({ ...worcester, ut: 'nationalgrid' }, prices).billUtility).toBe('national_grid')
  })

  it('carries the weatherization and sizing bonuses into the upgrade', () => {
    const params = { ...queryOf(DEMO_PRESETS[0].href), wz: '1', sz: '1' }
    const upgrade = resolveVerdictInputs(params, prices).upgrade
    expect(upgrade?.weatherizationBonus).toBe(true)
    expect(upgrade?.sizingBonus).toBe(true)
    expect(buildSwitchModel(params, prices).result).toEqual(computeVerdict(resolveVerdictInputs(params, prices).heating!, upgrade!))
  })

  describe('seasonal heat pump rate in a mixed-utility town', () => {
    const westport = { ...queryOf(DEMO_PRESETS[0].href), town: 'Westport', er: '0.305' }

    it('applies the billed sponsor adjustment when the bill settles the town', () => {
      const eversource = resolveVerdictInputs({ ...westport, ut: 'eversource' }, prices)
      expect(eversource.seasonal).toEqual({ rate: 0.305 - 0.07, applied: true, rule: -0.07 })
      expect(eversource.upgrade?.heatPumpRate).toBeCloseTo(0.235, 9)
      const grid = resolveVerdictInputs({ ...westport, ut: 'national_grid' }, prices)
      expect(grid.seasonal).toEqual({ rate: 0.305 - 0.04, applied: true, rule: -0.04 })
      const unitil = resolveVerdictInputs({ ...westport, ut: 'unitil' }, prices)
      expect(unitil.seasonal).toEqual({ rate: 0.305, applied: false, rule: null })
    })

    it('settles Unitil only in a town Unitil serves', () => {
      const fitchburgBill = resolveVerdictInputs({ ...westport, town: 'Fitchburg', ut: 'unitil' }, prices)
      expect(fitchburgBill.seasonal.rule).toBe(-0.07)
    })

    it('applies nothing for an unmatched town, whatever the bill names', () => {
      const nowhere = resolveVerdictInputs({ ...westport, town: 'Atlantis', ut: 'eversource' }, prices)
      expect(nowhere.seasonal).toEqual({ rate: 0.305, applied: false, rule: null })
    })

    it('saves as much as the same house in a town with one sponsor', () => {
      const mixed = resolveVerdictInputs({ ...westport, ut: 'eversource' }, prices)
      const single = resolveVerdictInputs({ ...westport, town: 'Framingham', ut: 'eversource' }, prices)
      expect(computeVerdict(mixed.heating!, mixed.upgrade!)?.newAnnualCostHeatPumpRate).toBeCloseTo(
        computeVerdict(single.heating!, single.upgrade!)!.newAnnualCostHeatPumpRate,
        6,
      )
    })

    it('applies nothing while the sponsor is unsettled or a light plant bills', () => {
      expect(resolveVerdictInputs({ ...westport, ut: undefined }, prices).seasonal.applied).toBe(false)
      expect(resolveVerdictInputs({ ...westport, ut: 'municipal' }, prices).seasonal.applied).toBe(false)
    })

    it('keeps Cape Light Compact towns without an adjustment even when the bill names Eversource', () => {
      const truro = resolveVerdictInputs({ ...westport, town: 'Truro', ut: 'eversource' }, prices)
      expect(truro.seasonal).toEqual({ rate: 0.305, applied: false, rule: null })
    })
  })

  it('returns no heating or upgrade for an incomplete query', () => {
    const { units: _units, ...params } = queryOf(DEMO_PRESETS[0].href)
    const inputs = resolveVerdictInputs(params, prices)
    expect(isVerdictQueryComplete(params)).toBe(false)
    expect(inputs.heating).toBeNull()
    expect(inputs.upgrade).toBeNull()
    expect(buildSwitchModel(params, prices).ready).toBe(false)
  })

  it('states income eligibility on /switch only when the query claims it', () => {
    const { inc: _inc, ...params } = queryOf(DEMO_PRESETS[0].href)
    const inputs = resolveVerdictInputs(params, prices)
    expect(inputs.income).toBe('yes')
    expect(buildSwitchModel(params, prices).result).toEqual(computeVerdict(inputs.heating!, inputs.upgrade!))
  })
})

describe('query hardening', () => {
  const base = { fuel: 'oil', units: '800', price: '3.5', town: 'Worcester', tier: 'whole', year: '2026' }

  it('rejects hex and exponent numbers and a blank town', () => {
    expect(isVerdictQueryComplete({ ...base, units: '0x10' })).toBe(false)
    expect(isVerdictQueryComplete({ ...base, units: '1e3' })).toBe(false)
    expect(isVerdictQueryComplete({ ...base, price: 'Infinity' })).toBe(false)
    expect(isVerdictQueryComplete({ ...base, town: ' ' })).toBe(false)
    expect(isVerdictQueryComplete({ ...base, units: ' 800 ' })).toBe(true)
  })

  it('names a year it does not model', () => {
    expect(verdictQueryIssue({ ...base, year: '2028' })).toBe('year')
    expect(verdictQueryIssue({ ...base, year: '2027' })).toBeNull()
    expect(verdictQueryIssue({ ...base, year: '' })).toBeNull()
  })

  it('drops implausible sqft and building units', () => {
    const inputs = resolveVerdictInputs({ ...base, sqft: '1e9', bu: '1000000000' }, prices)
    expect(inputs.sqft).toBeNull()
    expect(inputs.buildingUnits).toBeNull()
  })

  it('leaves the install cost to the engine when there is no quote, so the assumption fires', () => {
    const inputs = resolveVerdictInputs(base, prices)
    expect(inputs.upgrade?.installCost).toBeUndefined()
    const result = computeVerdict(inputs.heating!, inputs.upgrade!)!
    expect(result.assumptions.some((a) => a.field === 'installCost')).toBe(true)
    expect(result.caveats.some((c) => /not a quote/.test(c))).toBe(true)
  })

  it('states the enhanced default as an assumption too', () => {
    const inputs = resolveVerdictInputs({ ...base, tier: 'enhanced' }, prices)
    const result = computeVerdict(inputs.heating!, inputs.upgrade!)!
    expect(result.assumptions.some((a) => a.field === 'installCost')).toBe(true)
  })

  it('an unmatched town says so, not "no town"', () => {
    const inputs = resolveVerdictInputs({ ...base, town: 'Atlantis' }, prices)
    const result = computeVerdict(inputs.heating!, inputs.upgrade!)!
    expect(result.caveats.join(' ')).toContain("couldn't match that town")
    expect(result.caveats.join(' ')).not.toContain('No town supplied')
  })

  it('buildSwitchModel reuses passed inputs and result', () => {
    const inputs = resolveVerdictInputs(base, prices)
    const result = computeVerdict(inputs.heating!, inputs.upgrade!)
    expect(buildSwitchModel(base, prices, { inputs, result }).result).toBe(result)
    expect(buildSwitchModel(base, prices).result?.annualSavings).toBe(result?.annualSavings)
  })
})

describe('first caveat leads with the decisive one', () => {
  const caveatsOf = (query: Record<string, string>) => {
    const inputs = resolveVerdictInputs(query, prices)
    return computeVerdict(inputs.heating!, inputs.upgrade!)!.caveats
  }
  const oil = { fuel: 'oil', units: '900', price: '6.23', town: 'Framingham', tier: 'whole', year: '2026' }
  const costCaveat = /Install cost is the Mass Save average/

  it('Wellesley (municipal) skips the cost average when there is no rebate to price', () => {
    const query = { ...oil, town: 'Wellesley', ut: 'municipal' }
    expect(resolveVerdictInputs(query, prices).billUtility).toBe('municipal')
    const caveats = caveatsOf(query)
    expect(caveats[0]).toMatch(costCaveat)
    expect(leadCaveat(caveats, true)).toMatch(/^Sizing is approximate/)
    expect(leadCaveat(caveats, false)).toBe(caveats[0])
  })

  it('gas with the enhanced tier leads with the eligibility reason', () => {
    const caveats = caveatsOf({ ...oil, fuel: 'gas', units: '1000', price: '1.6', tier: 'enhanced' })
    expect(caveats[0]).not.toMatch(costCaveat)
  })

  it('a normal oil home with no quote leads with the cost average, then sizing', () => {
    const caveats = caveatsOf(oil)
    expect(caveats[0]).toMatch(costCaveat)
    expect(caveats[1]).toMatch(/^Sizing is approximate/)
  })
})
