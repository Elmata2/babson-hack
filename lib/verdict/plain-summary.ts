/**
 * @built F-50 R14.4 — the verdict in short sentences, generated locally, always on screen
 *
 * The plain summary is not a second explanation panel. `lib/verdict/explain`
 * writes three longer sentences about the rebate, the net cost and the payback,
 * and a model may rewrite them. This block is shorter and narrower: the answer in
 * everyday words, then the two annual costs and the gap between them. It is a
 * pure function of the result, so it renders in the first paint, with the network
 * unplugged, and can never be replaced by a model that invents a figure.
 *
 * Every number here comes from `VerdictResult` through the same formatters the
 * rest of the screen uses, and `lib/verdict/explain`'s `inventedNumbers` guard is
 * applied to it in the tests. The wording avoids the three things R15.3 forbids:
 * no claim of eligibility, no approval, no promised saving.
 */

import type { Verdict, VerdictResult } from '../calc/types'
import { DISCLAIMER } from './disclaimer'
import { cents, usd } from './format'

/** The answer in the fewest words that stay true for each branch. */
const PLAIN_ANSWER: Record<Verdict, string> = {
  SWITCH_NOW: 'The heat pump costs less to run at today’s prices.',
  SWITCH_BEFORE_DEC31: 'The heat pump costs less to run, and the rebate drops on 1 January.',
  DO_NOT_SWITCH_YET: 'The heat pump costs more to run at these prices.',
}

/**
 * `DO_NOT_SWITCH_YET` covers two different households: one whose running costs
 * rise, and one whose savings are real but take longer than fifteen years to pay
 * the install back. Saying "costs more to run" on the second contradicts the
 * very next sentence, so the answer is chosen from the arithmetic, not the enum.
 */
function plainAnswer(result: VerdictResult): string {
  if (result.verdict === 'DO_NOT_SWITCH_YET' && result.annualSavings > 0) {
    return 'The heat pump saves money to run, but the install takes too long to pay back.'
  }
  return PLAIN_ANSWER[result.verdict]
}

export interface PlainSummary {
  /** One short line: what the answer means, in everyday words. */
  answer: string
  /** Two to four short sentences. The main number is in the second one. */
  sentences: string[]
  /** R15.2, verbatim. Kept apart because its wording is fixed by the requirement. */
  disclaimer: string
  /**
   * Exactly the prose the readability budget applies to: the answer and the
   * sentences, joined. The disclaimer is excluded because it is mandated wording,
   * not writing the product chooses.
   */
  readabilitySample: string
}

/**
 * The deterministic summary. Same result in, same words out — no clock, no
 * network, no locale beyond the `en-US` the rest of the page formats with.
 */
export function plainSummary(result: VerdictResult): PlainSummary {
  const answer = plainAnswer(result)
  const sentences: string[] = [
    `You pay ${usd(result.oldAnnualCost)} a year to heat this house.`,
    `A heat pump would cost ${usd(result.newAnnualCostHeatPumpRate)} a year at the seasonal rate.`,
  ]

  if (result.annualSavings > 0) {
    sentences.push(`That is ${usd(result.annualSavings)} less each year.`)

    if (result.verdict === 'SWITCH_BEFORE_DEC31' && result.cliffCost > 0) {
      sentences.push(`Waiting until 2027 costs ${usd(result.cliffCost)} more in rebate.`)
    } else if (result.rebateEligible) {
      sentences.push(`The rebate is ${usd(result.totalRebate)} of a ${usd(result.installCost)} install.`)
    }
  } else {
    sentences.push(`That is ${usd(-result.annualSavings)} more each year.`)

    if (result.breakEvenElectricPrice !== null) {
      sentences.push(`It only pays below ${cents(result.breakEvenElectricPrice)} per kWh.`)
    }
  }

  const readabilitySample = [answer, ...sentences].join(' ')

  return {
    answer,
    sentences,
    disclaimer: DISCLAIMER,
    readabilitySample,
  }
}
