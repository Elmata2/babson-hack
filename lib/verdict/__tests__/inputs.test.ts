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
