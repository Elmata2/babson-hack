/**
 * Unit tests for the two untested pure functions in lib/switch/option-input.ts:
 * `reachableBy` (a predicate over a provider, kind and outreach mode) and
 * `buildOptionInput` (assembles the option-card payload from the switch model).
 */

import { describe, expect, it } from 'vitest'

import { buildOptionInput, reachableBy } from '../option-input'
import type { SwitchModel } from '../model'
import type { SwitchProvider } from '../types'
import type { VerdictResult } from '../../calc/types'

// --- fixtures --------------------------------------------------------------

const fuelProvider = (overrides: Partial<SwitchProvider> = {}): SwitchProvider => ({
  id: 'fuel-a',
  name: 'Fuel Dealer A',
  kind: 'fuel',
  channels: ['email', 'phone'],
  phone: '+15550100001',
  email: 'fuel-a@example.org',
  source: 'Team allowlist',
  asOf: '2026-10-24',
  allowlist: false,
  ...overrides,
})

const installerProvider = (overrides: Partial<SwitchProvider> = {}): SwitchProvider => ({
  id: 'inst-a',
  name: 'Installer A',
  kind: 'installer',
  channels: ['email'],
  phone: null,
  email: 'inst-a@example.org',
  source: 'Team allowlist',
  asOf: '2026-10-24',
  allowlist: false,
  ...overrides,
})

function minimalResult(): VerdictResult {
  return {
    deliveredMMBtu: 88.64,
    designBTUhr: 38_252,
    tons: 3,
    annualKWh: 9_621,
    oldAnnualCost: 4_984,
    newAnnualCostStandard: 2_934,
    newAnnualCostHeatPumpRate: 2_261,
    annualSavings: 2_723,
    annualSavingsAtHeatPumpRate: 2_723,
    annualSavingsAtStandardRate: 2_049,
    totalRebate: 7_950,
    rebateBreakdown: [],
    netCost: 14_050,
    paybackYears: 5.16,
    loanAmount: 14_050,
    monthlyLoan: 167.26,
    monthlySavings: 226.91,
    monthlyCashFlow: 59.65,
    cashFlowPositive: true,
    breakEvenElectricPrice: 0.52,
    rebate2026: 7_950,
    rebate2027: 7_050,
    cliffCost: 900,
    verdict: 'SWITCH_BEFORE_DEC31',
    reasons: ['reason one', 'reason two'],
    caveats: ['caveat'],
    assumptions: [],
    fuel: 'oil',
    tier: 'whole',
    installYear: 2026,
    installCost: 22_000,
    scop: 2.7,
    hdd65: 5_600,
    designTempF: 7,
    annualUnits: 800,
    unitPrice: 6.23,
    heatPumpRate: 0.235,
    standardRate: 0.305,
    rebateEligible: true,
  }
}

function minimalModel(overrides: Partial<SwitchModel> = {}): SwitchModel {
  return {
    ready: true,
    refusalMessage: null,
    query: '?fuel=oil&units=800&price=6.23&town=Boston',
    town: 'Boston',
    fuel: 'oil',
    annualUnits: 800,
    unitPrice: 6.23,
    tons: 3,
    sqft: 2_075,
    result: minimalResult(),
    choices: ['SWITCH_HEAT_PUMP'],
    bestCase: [],
    alreadyBest: false,
    supply: {
      sponsorLabel: 'Eversource',
      basic: null,
      available: true,
      unavailableReason: null,
      aggregationUrl: 'https://example.org',
      energySwitchUrl: 'https://example.org',
    },
    noMassSave: false,
    asksUtility: false,
    utilityReason: null,
    standardRate: 0.305,
    heatPumpRate: 0.235,
    seasonalApplied: true,
    income: 'no',
    market: { price: 6.23, period: '2026-10-19', source: 'DOER', point: null },
    prices: { mode: 'snapshot', asOf: '2026-10-19' },
    ...overrides,
  }
}

// --- reachableBy -----------------------------------------------------------

describe('reachableBy', () => {
  it('returns false when the kind does not match', () => {
    expect(reachableBy(fuelProvider(), 'installer', 'live')).toBe(false)
  })

  it('returns false when the mode is off', () => {
    expect(reachableBy(fuelProvider(), 'fuel', 'off')).toBe(false)
  })

  it('returns the allowlist flag in allowlist mode', () => {
    expect(reachableBy(fuelProvider({ allowlist: true }), 'fuel', 'allowlist')).toBe(true)
    expect(reachableBy(fuelProvider({ allowlist: false }), 'fuel', 'allowlist')).toBe(false)
  })

  it('in live mode requires a non-allowlist provider with email channel and a non-null email', () => {
    expect(reachableBy(fuelProvider({ allowlist: false, email: 'a@b.org' }), 'fuel', 'live')).toBe(true)
    expect(reachableBy(fuelProvider({ allowlist: true, email: 'a@b.org' }), 'fuel', 'live')).toBe(false)
    expect(reachableBy(fuelProvider({ allowlist: false, email: null }), 'fuel', 'live')).toBe(false)
    expect(reachableBy(fuelProvider({ allowlist: false, email: 'a@b.org', channels: ['phone'] }), 'fuel', 'live')).toBe(false)
  })
})

// --- buildOptionInput ------------------------------------------------------

describe('buildOptionInput', () => {
  it('returns null when the model has no result', () => {
    const model = minimalModel({ result: null })
    expect(buildOptionInput(model, [fuelProvider()], { mode: 'live' })).toBeNull()
  })

  it('counts reachable providers by kind in live mode', () => {
    const providers = [
      fuelProvider({ id: 'f1', allowlist: false, email: 'f1@x.org', channels: ['email'] }),
      fuelProvider({ id: 'f2', allowlist: false, email: 'f2@x.org', channels: ['email'] }),
      installerProvider({ id: 'i1', allowlist: false, email: 'i1@x.org', channels: ['email'] }),
      installerProvider({ id: 'i2', allowlist: true, email: 'i2@x.org', channels: ['email'] }),
    ]
    const input = buildOptionInput(minimalModel(), providers, { mode: 'live' })
    expect(input).not.toBeNull()
    if (!input) return
    expect(input.reachable.fuel).toBe(2)
    expect(input.reachable.installer).toBe(1)
    expect(input.plan.mode).toBe('live')
  })

  it('counts only allowlist providers in allowlist mode', () => {
    const providers = [
      fuelProvider({ id: 'f1', allowlist: true, email: null, channels: ['phone'] }),
      fuelProvider({ id: 'f2', allowlist: false, email: 'f2@x.org', channels: ['email'] }),
    ]
    const input = buildOptionInput(minimalModel(), providers, { mode: 'allowlist' })
    expect(input).not.toBeNull()
    if (!input) return
    expect(input.reachable.fuel).toBe(1)
  })

  it('reports zero reachable in off mode', () => {
    const input = buildOptionInput(minimalModel(), [fuelProvider(), installerProvider()], { mode: 'off' })
    expect(input).not.toBeNull()
    if (!input) return
    expect(input.reachable.fuel).toBe(0)
    expect(input.reachable.installer).toBe(0)
  })

  it('threads the supply basic service rate through', () => {
    const model = minimalModel({
      supply: {
        sponsorLabel: 'Eversource',
        basic: { centsPerKwh: 17.3, period: 'Aug 1 2026 – Jan 2027', source: 'Boston.com', sourceDate: '2026-07-29', url: 'https://example.org' },
        available: true,
        unavailableReason: null,
        aggregationUrl: 'https://example.org',
        energySwitchUrl: 'https://example.org',
      },
    })
    const input = buildOptionInput(model, [fuelProvider()], { mode: 'live' })
    expect(input?.basic).toEqual({ centsPerKwh: 17.3, source: 'Boston.com', sourceDate: '2026-07-29' })
  })
})
