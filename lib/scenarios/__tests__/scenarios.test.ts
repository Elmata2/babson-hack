import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { beforeAll, describe, expect, it } from 'vitest'

import { enhancedTierNote } from '@/lib/intake/params'
import { paybackView, loanView } from '@/lib/verdict/money'

import { runScenario, type ScenarioRun } from '../pipeline'
import {
  SCENARIOS,
  electricReaderJson,
  electricTotals,
  heatingReaderJson,
  type Scenario,
  type ScenarioFlag,
} from '../scenarios'

const ROOT = join(__dirname, '../../..')
const BILLS = join(ROOT, 'public/demo-bills/scenarios')

function observedFlags(run: ScenarioRun): ScenarioFlag[] {
  const { scenario, result, model, inputs } = run
  const flags: ScenarioFlag[] = []
  if (result?.tier === 'enhanced') flags.push('enhanced_tier')
  if (result && enhancedTierNote(scenario.fuel, run.income, result.tier) !== null) flags.push('enhanced_declined_for_gas')
  if (result && result.netCost <= 0 && paybackView(result).kind === 'immediate') flags.push('rebate_covers_install')
  if (result && (loanView(result)?.remainder ?? 0) > 0) flags.push('loan_cap_exceeded')
  const basic = model.supply.basic?.centsPerKwh ?? null
  const supplyCents = (electricTotals(scenario.electric).supply / electricTotals(scenario.electric).kWh) * 100
  if (basic !== null && supplyCents > basic + 0.5) flags.push('competitive_above_basic')
  if (model.noMassSave) flags.push('refusal_not_verdict')
  if (model.asksUtility) flags.push('asks_utility')
  if (inputs.utility.mixed && !model.asksUtility) flags.push('bill_settles_mixed_town')
  if (!inputs.seasonal.applied && !model.noMassSave) flags.push('no_seasonal_rate')
  return flags.sort()
}

describe('scenario matrix', () => {
  it('has unique ids and covers every required outcome', () => {
    const ids = SCENARIOS.map((scenario) => scenario.id)
    expect(new Set(ids).size).toBe(ids.length)
    const verdicts = new Set(SCENARIOS.map((scenario) => scenario.expected.verdict))
    expect(verdicts).toEqual(new Set(['SWITCH_NOW', 'SWITCH_BEFORE_DEC31', 'DO_NOT_SWITCH_YET']))
    const cases = new Set(SCENARIOS.map((scenario) => scenario.expected.headlineCase))
    expect(cases).toEqual(new Set(['save_switch', 'save_before_deadline', 'save_but_wait', 'lose_stay']))
    const fuels = new Set(SCENARIOS.map((scenario) => scenario.fuel))
    expect(fuels).toEqual(new Set(['oil', 'propane', 'gas', 'resistance']))
    const sponsors = new Set(SCENARIOS.map((scenario) => scenario.electric.utility))
    expect(sponsors).toEqual(new Set(['eversource', 'national_grid', 'unitil', 'municipal']))
  })
})

describe.each(SCENARIOS.map((scenario) => [scenario.id, scenario] as const))('%s', (_id, scenario: Scenario) => {
  let run: ScenarioRun

  beforeAll(async () => {
    run = await runScenario(scenario)
  })

  it('reads both bills into the facts the scenario names', () => {
    expect(run.electricApplied.role).toBe('electricity')
    expect(run.electricApplied.utility).toBe(scenario.electric.utility)
    expect(run.electricApplied.serviceTown).toBe(scenario.town)
    expect(run.electricApplied.lowIncomeSignal).toBe(scenario.electric.assistance)
    expect(run.heatingApplied.role).toBe('heating')
    expect(run.heatingApplied.fuel).toBe(scenario.fuel)
    expect(Number(run.heatingApplied.units)).toBeGreaterThan(0)
    expect(Number(run.heatingApplied.price)).toBeGreaterThan(0)
  })

  it('carries the bills to a complete verdict query', () => {
    const query = new URLSearchParams(run.query)
    expect(query.get('fuel')).toBe(scenario.fuel)
    expect(query.get('town')).toBe(scenario.town)
    expect(query.get('year')).toBe(String(scenario.installYear))
    expect(query.get('tier')).toBe(scenario.expected.tier)
    expect(run.inputs.heating).not.toBeNull()
    expect(run.result).not.toBeNull()
  })

  it('reaches the expected verdict and headline', () => {
    const { expected } = scenario
    expect(run.result?.verdict).toBe(expected.verdict)
    expect(run.headline?.case).toBe(expected.headlineCase)
    expect(run.headline?.sentence).toMatch(new RegExp(expected.headlinePattern))
    expect(run.result?.tier).toBe(expected.tier)
  })

  it('recommends and offers the expected choices', () => {
    const { expected } = scenario
    expect(run.recommendation?.kind).toBe(expected.recommendation)
    expect(run.model.choices).toEqual(expected.choices)
    expect(run.model.noMassSave).toBe(expected.noMassSave)
  })

  it('shows exactly the special conditions the scenario declares', () => {
    expect(observedFlags(run)).toEqual([...scenario.expected.flags].sort())
  })
})

describe('verdict queries for the report script', () => {
  const file = join(__dirname, '../queries.json')

  it('match what the bills produce (UPDATE_SCENARIO_QUERIES=1 rewrites the file)', async () => {
    const queries: Record<string, string> = {}
    for (const scenario of SCENARIOS) queries[scenario.id] = (await runScenario(scenario)).query
    if (process.env.UPDATE_SCENARIO_QUERIES === '1') writeFileSync(file, `${JSON.stringify(queries, null, 2)}\n`)
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(queries)
  })
})

describe('scenario bills on disk', () => {
  const generated = existsSync(BILLS)

  it.skipIf(!generated).each(SCENARIOS.map((scenario) => [scenario.id, scenario] as const))(
    '%s has HTML, PNG, PDF and reader JSON that match the matrix',
    (_id, scenario: Scenario) => {
      const dir = join(BILLS, scenario.id)
      const heating = heatingReaderJson(scenario)
      const files = ['electric.html', 'electric.png', 'electric.pdf', 'expected/electric.json']
      if (heating) files.push('heating.html', 'heating.png', 'heating.pdf', 'expected/heating.json')
      for (const file of files) expect(existsSync(join(dir, file)), file).toBe(true)

      const electric = JSON.parse(readFileSync(join(dir, 'expected/electric.json'), 'utf8')) as unknown
      expect(electric).toEqual(JSON.parse(JSON.stringify(electricReaderJson(scenario))))
      if (heating) {
        const onDisk = JSON.parse(readFileSync(join(dir, 'expected/heating.json'), 'utf8')) as unknown
        expect(onDisk).toEqual(JSON.parse(JSON.stringify(heating)))
      }
      const html = readFileSync(join(dir, 'electric.html'), 'utf8')
      expect(html).toContain('SAMPLE')
      expect(html).toContain('NOT A REAL BILL')
    },
  )
})
