/**
 * Runs one scenario through the same functions the app calls, in the app's order:
 * reader JSON → `readBill` → `buildApplied` (what the upload panel hands the form)
 * → the onboarding wizard's derivations → `toQuery` → `resolveVerdictInputs` →
 * `computeVerdict` → `verdictHeadline` → `buildSwitchModel` → `recommend`.
 *
 * It re-implements nothing. Where the wizard derives a value inline (income, utility,
 * electric rate, town) the same exported helpers are called with the same arguments.
 */
import { computeVerdict } from '../calc'
import type { VerdictResult } from '../calc/types'
import { buildApplied, formatAmount, formatPrice, type ParsedBill } from '../client/bill-confirm'
import { toQuery, tierFor, plausibleElectricRate, type IntakeValues, type Income } from '../intake/params'
import {
  hasSingleSponsor,
  lowIncomeDetected,
  lowIncomeFlag,
  pickUtility,
  serviceTownFrom,
} from '../onboarding/flow'
import { eligibilityFor } from '../onboarding/income'
import type { BillApplied } from '../parse/contract'
import { readBill } from '../parse/plausibility'
import { getPrices } from '../prices'
import { buildSwitchModel, type SwitchModel } from '../switch/model'
import { buildOptionInput } from '../switch/option-input'
import { loadProviders, outreachPlan } from '../switch/providers'
import { ALL_TOWNS } from '../utility'
import { resolveVerdictInputs, type VerdictInputs } from '../verdict/inputs'
import { verdictHeadline, type VerdictHeadline } from '../verdict/headline'
import { recommend, type Recommendation } from '../verdict/recommendation'
import { electricReaderJson, heatingReaderJson, type Scenario } from './scenarios'

export const PIPELINE_NOW = Date.parse('2026-10-24T12:00:00Z')

export interface ScenarioRun {
  scenario: Scenario
  electricApplied: BillApplied
  heatingApplied: BillApplied
  income: Income
  query: string
  inputs: VerdictInputs
  result: VerdictResult | null
  headline: VerdictHeadline | null
  model: SwitchModel
  recommendation: Recommendation | null
}

function applied(json: Record<string, unknown>, heating: boolean): { bill: ParsedBill; applied: BillApplied } {
  const read = readBill(json, PIPELINE_NOW, { heating })
  if (!read.ok) throw new Error(`reader refused: ${read.refusal.message}`)
  const bill: ParsedBill = read.bill
  const result = buildApplied({
    bill,
    fuel: bill.fuel ?? '',
    units: bill.units.value === null ? '' : formatAmount(bill.units.value),
    price: bill.price.value === null ? '' : formatPrice(bill.price.value),
    unitsEdited: false,
  })
  if (!result) throw new Error('bill did not produce an applied object')
  return { bill, applied: result }
}

export async function runScenario(scenario: Scenario): Promise<ScenarioRun> {
  const electricJson = electricReaderJson(scenario)
  const heatingJson = heatingReaderJson(scenario)
  const electricApplied = applied(electricJson, false).applied
  const heatingApplied = applied(heatingJson ?? electricJson, true).applied
  const bills = [electricApplied, heatingApplied] as const

  const fuel = heatingApplied.fuel
  if (fuel === null) throw new Error('heating bill carried no fuel')
  const town = serviceTownFrom(bills, ALL_TOWNS) ?? ''
  const incomeDetected = lowIncomeDetected(bills)
  const income: Income = incomeDetected
    ? 'yes'
    : fuel === 'gas'
      ? 'unsure'
      : scenario.household
        ? eligibilityFor(scenario.household.size, scenario.household.income)
        : 'unsure'
  const electricRate =
    [electricApplied.electricRate, heatingApplied.electricRate].find(
      (rate): rate is string => typeof rate === 'string' && plausibleElectricRate(rate) !== null,
    ) ?? ''

  const values: IntakeValues = {
    fuel,
    units: heatingApplied.units,
    price: heatingApplied.price,
    town,
    tier: tierFor('whole', income, fuel),
    income,
    year: String(scenario.installYear) as '2026' | '2027',
    yearBuilt: '',
    sqft: '',
    src: null,
    buildingUnits: null,
    installCost: scenario.quote === null ? '' : String(scenario.quote),
    method: heatingApplied.method,
    methodConfidence: heatingApplied.methodConfidence,
    note: heatingApplied.note,
    utility: pickUtility(electricApplied, heatingApplied, hasSingleSponsor(town)),
    electricRate,
    lowIncome: lowIncomeFlag(bills),
    weatherizationBonus: false,
    sizingBonus: false,
  }
  const query = toQuery(values)
  query.set('demo', '1')
  const params = Object.fromEntries(query.entries())

  const prices = await getPrices({ demo: true })
  const inputs = resolveVerdictInputs(params, prices)
  if (!inputs.heating || !inputs.upgrade) throw new Error(`verdict query incomplete: ${query.toString()}`)
  const result = computeVerdict(inputs.heating, inputs.upgrade)
  const providers = loadProviders()
  const model = buildSwitchModel(params, prices)
  const option = buildOptionInput(model, providers, outreachPlan(providers))
  return {
    scenario,
    electricApplied,
    heatingApplied,
    income,
    query: query.toString(),
    inputs,
    result,
    headline: result ? verdictHeadline(result) : null,
    model,
    recommendation: option ? recommend({ option, choices: model.choices, query: model.query }) : null,
  }
}
