import { beforeAll, describe, expect, it } from 'vitest'

import { computeVerdict } from '@/lib/calc'
import { getPrices, type Prices } from '@/lib/prices'
import { buildSwitchModel } from '@/lib/switch/model'
import { choicesFor } from '@/lib/switch/choices'
import { parseBillUtility } from '@/lib/intake/params'

import { isVerdictQueryComplete, resolveVerdictInputs } from '../inputs'
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
