/**
 * @built F-39 plain-English explanation — three sentences, and no number that is not already on screen
 *
 * The model is a writer, not a calculator. It is handed the facts `lib/calc`
 * produced and asked for prose. Everything it returns is then checked against
 * those facts: a sentence containing a figure that is not already in the result
 * is discarded in favour of a deterministic fallback. That guard is the whole
 * point of this module, so it lives here rather than in the route and is tested
 * without a network.
 *
 * The fallback is not a failure state for the reader: it says the same three
 * things, with the same numbers, and works with every route deleted.
 */

import {
  BASE_TEMP_F,
  BTU_PER_KWH,
  BTU_PER_TON_COOLING,
  HEAT_LOAN_MONTHS,
  MAX_PAYBACK_YEARS,
} from '../calc/constants'
import type { Fuel, Tier, Verdict, VerdictResult } from '../calc/types'
import { VERDICT_META } from '../verdicts'
import { cents, one, usd } from './format'

/** R8.3's three sentences; more than this is not an explanation, it is a brochure. */
export const EXPLAIN_MAX_SENTENCES = 3

const FUEL_LABEL: Record<Fuel, string> = {
  oil: 'Heating oil',
  propane: 'Propane',
  gas: 'Natural gas',
  resistance: 'Electric resistance',
}

const TIER_LABEL: Record<Tier, string> = {
  whole: 'whole-home',
  partial: 'partial-home',
  basic: 'basic',
  enhanced: 'income-qualified enhanced',
}

const FUELS: readonly Fuel[] = ['oil', 'propane', 'gas', 'resistance']
const TIERS: readonly Tier[] = ['whole', 'partial', 'basic', 'enhanced']
const VERDICTS: readonly Verdict[] = ['SWITCH_NOW', 'SWITCH_BEFORE_DEC31', 'DO_NOT_SWITCH_YET']

/** The numeric fields the guard knows about. Additive fields join by adding their key. */
const NUMERIC_FIELDS = [
  'deliveredMMBtu',
  'designBTUhr',
  'tons',
  'annualKWh',
  'oldAnnualCost',
  'newAnnualCostStandard',
  'newAnnualCostHeatPumpRate',
  'annualSavings',
  'annualSavingsAtHeatPumpRate',
  'annualSavingsAtStandardRate',
  'totalRebate',
  'netCost',
  'monthlyLoan',
  'monthlySavings',
  'rebate2026',
  'rebate2027',
  'cliffCost',
  'installCost',
  'scop',
  'hdd65',
  'designTempF',
  'annualUnits',
  'unitPrice',
  'heatPumpRate',
  'standardRate',
] as const satisfies readonly (keyof VerdictResult)[]

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

/**
 * Untrusted input from the browser. The route only ever receives a verdict it
 * could have computed itself, so anything that is not that shape is refused
 * rather than coerced: a missing number must not become a zero.
 */
export function isVerdictResult(value: unknown): value is VerdictResult {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  if (!FUELS.includes(candidate.fuel as Fuel)) return false
  if (!TIERS.includes(candidate.tier as Tier)) return false
  if (!VERDICTS.includes(candidate.verdict as Verdict)) return false
  if (candidate.installYear !== 2026 && candidate.installYear !== 2027) return false
  if (candidate.paybackYears !== null && !isFiniteNumber(candidate.paybackYears)) return false
  if (candidate.breakEvenElectricPrice !== null && !isFiniteNumber(candidate.breakEvenElectricPrice)) return false
  for (const field of NUMERIC_FIELDS) {
    if (!isFiniteNumber(candidate[field])) return false
  }
  for (const field of ['reasons', 'caveats'] as const) {
    const list = candidate[field]
    if (!Array.isArray(list) || !list.every((item) => typeof item === 'string')) return false
  }
  if (!Array.isArray(candidate.rebateBreakdown)) return false
  if (!Array.isArray(candidate.assumptions)) return false
  return true
}

/**
 * Every numeric value this verdict is allowed to print: the result's own fields
 * at each rounding the screen or a sentence might use, plus the constants that
 * appear in its formula sheet. A number outside this set is an invention.
 */
export function allowedNumbers(result: VerdictResult): Set<number> {
  const allowed = new Set<number>()
  const add = (value: number): void => {
    if (!Number.isFinite(value)) return
    for (let digits = 0; digits <= 3; digits += 1) allowed.add(Number(value.toFixed(digits)))
    allowed.add(Number((value * 100).toFixed(1)))
  }

  for (const field of NUMERIC_FIELDS) {
    const value = result[field]
    if (isFiniteNumber(value)) {
      add(value)
      // A loss is rendered as its magnitude ("$268 more a year"), so the sign
      // dropped is the same figure, not a new one.
      add(Math.abs(value))
    }
  }
  if (result.paybackYears !== null) add(result.paybackYears)
  if (result.breakEvenElectricPrice !== null) add(result.breakEvenElectricPrice)

  // Numbers a faithful sentence needs because they are in the formula sheet.
  for (const constant of [
    result.installYear,
    2027,
    BASE_TEMP_F,
    HEAT_LOAN_MONTHS,
    MAX_PAYBACK_YEARS,
    BTU_PER_KWH,
    BTU_PER_TON_COOLING,
    12,
    1,
    0,
  ]) {
    add(constant)
  }
  return allowed
}

const NUMBER_TOKEN = /-?\d[\d,]*(?:\.\d+)?/g

/** Every numeric token in a piece of prose, as numbers. */
export function numbersIn(text: string): number[] {
  const matches = text.match(NUMBER_TOKEN) ?? []
  return matches
    .map((token) => Number(token.replace(/,/g, '')))
    .filter((value) => Number.isFinite(value))
}

/** Numbers in the prose that the verdict does not already contain. */
export function inventedNumbers(text: string, result: VerdictResult): number[] {
  const allowed = allowedNumbers(result)
  return numbersIn(text).filter((value) => !allowed.has(value) && !allowed.has(Number(value.toFixed(1))))
}

/** Split prose into sentences without pretending to be a parser. */
export function parseSentences(text: string): string[] {
  return text
    .replace(/```[a-z]*|```/gi, ' ')
    .replace(/[*_#>`]/g, ' ')
    .replace(/^\s*[-•]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0)
}

/**
 * The gate the route uses: one to three sentences, every number already known.
 * `null` means "do not show this to a person" — the caller falls back.
 */
export function checkedSentences(text: string, result: VerdictResult): string[] | null {
  const sentences = parseSentences(text)
  if (sentences.length === 0 || sentences.length > EXPLAIN_MAX_SENTENCES) return null
  if (inventedNumbers(text, result).length > 0) return null
  return sentences
}

/** The deterministic explanation. Three sentences, all arithmetic already checked. */
export function fallbackSentences(result: VerdictResult): string[] {
  const meta = VERDICT_META[result.verdict]
  const fuel = FUEL_LABEL[result.fuel]
  const tier = TIER_LABEL[result.tier]

  const first = `${fuel} costs ${usd(result.oldAnnualCost)} a year today; the same heat from a heat pump is ${usd(result.newAnnualCostHeatPumpRate)} at the seasonal rate and ${usd(result.newAnnualCostStandard)} at the standard rate.`

  let second: string
  if (result.annualSavings <= 0) {
    const breakEven =
      result.breakEvenElectricPrice === null
        ? 'not computable from these numbers'
        : `${cents(result.breakEvenElectricPrice)} per kWh`
    second = `At the seasonal rate that is ${usd(-result.annualSavings)} more a year, and the break-even electricity price is ${breakEven}.`
  } else if (!result.rebateEligible) {
    second = `No ${result.installYear} ${tier} rebate is available here, so ${usd(result.installCost)} is the whole cost.`
  } else {
    const repayment =
      result.paybackYears === null ? 'longer than the limit' : `${one(result.paybackYears)} years`
    second = `The ${result.installYear} ${tier} rebate is ${usd(result.totalRebate)}, leaving ${usd(result.netCost)} to pay, which the savings repay in ${repayment}.`
  }

  return [first, second, meta.detail]
}

/** The prompt. Facts only — the model's job is word choice, not arithmetic. */
export function buildExplainPrompt(result: VerdictResult): string {
  const facts = [
    `Verdict: ${VERDICT_META[result.verdict].headline}`,
    `Existing fuel: ${FUEL_LABEL[result.fuel]} at $${result.unitPrice.toFixed(3)} per unit, ${result.annualUnits} units a year, costing ${usd(result.oldAnnualCost)} a year.`,
    `Heat pump: ${Math.round(result.annualKWh)} kWh a year at SCOP ${result.scop.toFixed(2)}.`,
    `Heat pump cost: ${usd(result.newAnnualCostHeatPumpRate)} at the seasonal rate (${cents(result.heatPumpRate)}/kWh), ${usd(result.newAnnualCostStandard)} at the standard rate (${cents(result.standardRate)}/kWh).`,
    `Annual savings: ${usd(result.annualSavings)} at the seasonal rate, ${usd(result.annualSavingsAtStandardRate)} at the standard rate.`,
    `Rebate: ${usd(result.totalRebate)} for a ${result.installYear} ${TIER_LABEL[result.tier]} install; net cost ${usd(result.netCost)} on a ${usd(result.installCost)} install.`,
    `Payback: ${result.paybackYears === null ? 'none' : `${one(result.paybackYears)} years`}.`,
    `Monthly HEAT Loan payment: ${usd(result.monthlyLoan)}; monthly savings: ${usd(result.monthlySavings)}.`,
    result.breakEvenElectricPrice === null
      ? 'Break-even electricity price: not computable.'
      : `Break-even electricity price: ${cents(result.breakEvenElectricPrice)}/kWh.`,
  ]

  return [
    'Write exactly three short sentences of plain English for a Massachusetts homeowner, explaining this heat-pump verdict.',
    'Use only the figures in the facts below, copied exactly as written. Do not calculate, round differently, or introduce any other number, date, brand, or dollar figure.',
    'No greeting, no bullet points, no advice to call anyone, no promises. Grade 8 reading level. If the verdict is a refusal, say so plainly.',
    '',
    'Facts:',
    ...facts.map((fact) => `- ${fact}`),
    '',
    'Return the three sentences only.',
  ].join('\n')
}
