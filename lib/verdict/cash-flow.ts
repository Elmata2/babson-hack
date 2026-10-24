/**
 * @built F-37 the 0% HEAT Loan, said in one sentence, either way
 *
 * R7.3 asks for the loan payment next to the monthly saving and a cash-flow
 * sentence that is honest in both directions. The arithmetic lives in
 * `lib/calc/finance.ts`; nothing here divides, multiplies or invents a number.
 * This module only decides which sentence describes the numbers it was handed,
 * so the screen cannot say "in your pocket" over a negative difference.
 *
 * The two branches are deliberately the same length and the same weight. A loss
 * is not a footnote: R6.2 asks for it at the same visual weight as a gain.
 */

/** Which way the monthly difference points. */
export type CashFlowTone = 'ahead' | 'short' | 'level'

/** Everything the cash-flow block renders, decided once. */
export interface CashFlowView {
  tone: CashFlowTone
  /** The short label: what the difference means, in three words or fewer. */
  label: string
  /** Signed monthly difference, USD. Rounded only when rendered. */
  monthlyDelta: number
  /** The sentence under the two figures. Never a promise, never a projection. */
  sentence: string
  /** True when the monthly saving covers the loan payment. */
  covered: boolean
}

/** The subset of the verdict this module needs. */
export interface CashFlowInput {
  /** Net cost after rebate, USD. */
  netCost: number
  monthlyLoan: number
  /** Signed: a heat pump that costs more to run has a negative monthly saving. */
  monthlySavings: number
  monthlyCashFlow: number
  /** Loan term in months. */
  months: number
  /** Loan APR as a fraction, e.g. 0. */
  apr: number
  /** Years to repay the net cost, or `null` when there is nothing to repay it with. */
  paybackYears: number | null
}

/** Whole dollars: the verdict screen's headline treatment for monthly money. */
function usd(value: number): string {
  return Math.abs(value).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  })
}

const EPSILON = 0.005

/**
 * Turn the engine's three monthly figures into the block's copy.
 * Input: the cash-flow fields of a `VerdictResult`. Output: tone, label, the
 * signed difference and one sentence. Guarantee: the tone matches the sign of
 * `monthlyCashFlow`, and every number in the sentence is one of the inputs.
 */
export function cashFlowView(input: CashFlowInput): CashFlowView {
  const { monthlyLoan, monthlySavings, monthlyCashFlow, months, paybackYears } = input
  const delta = Math.round(monthlyCashFlow)
  const covered = monthlyCashFlow >= -EPSILON
  const even = Math.abs(monthlyCashFlow) <= EPSILON
  const loanLine = `${usd(monthlyLoan)} a month for ${months} months at ${(input.apr * 100).toFixed(0)}%`
  const savingLine = `${usd(monthlySavings)} a month`

  if (even) {
    return {
      tone: 'level',
      label: 'Even',
      monthlyDelta: delta,
      covered: true,
      sentence: `The loan is ${loanLine}. Your heat pump saves about ${savingLine}, so the payment and the saving are the same number: the equipment pays for itself as you pay it off.`,
    }
  }

  if (covered) {
    return {
      tone: 'ahead',
      label: 'Ahead every month',
      monthlyDelta: delta,
      covered: true,
      sentence: `The loan is ${loanLine}. Your heat pump saves ${savingLine}, so you are ${usd(monthlyCashFlow)} ahead from the first payment — before any winter price spike.`,
    }
  }

  if (monthlySavings > 0) {
    return {
      tone: 'short',
      label: 'Short each month',
      monthlyDelta: delta,
      covered: false,
      sentence: `The loan is ${loanLine}. Your heat pump saves ${savingLine}, which is ${usd(monthlyCashFlow)} short every month until the loan is repaid in month ${months}. You are buying the winters after that, not a monthly win.`,
    }
  }

  const paybackLine =
    paybackYears === null
      ? ' There is no payback to report, because this heat pump does not save money at the price you pay now.'
      : ''

  return {
    tone: 'short',
    label: 'Costs you monthly',
    monthlyDelta: delta,
    covered: false,
    sentence: `The loan is ${loanLine}. The heat pump also costs ${usd(-monthlySavings)} a month more to run than your current fuel, so the shortfall is ${usd(monthlyCashFlow)} a month.${paybackLine}`,
  }
}
