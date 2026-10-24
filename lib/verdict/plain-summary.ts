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
import type { Part } from './headline'
import type { FigureId } from './provenance'

const fig = (id: FigureId, text: string): Part => ({ id, text })

const flat = (parts: readonly Part[]): string =>
  parts.map((part) => (typeof part === 'string' ? part : part.text)).join('')

/** The answer in the fewest words that stay true for each branch. */
const PLAIN_ANSWER: Record<Verdict, string> = {
  SWITCH_NOW: 'The heat pump costs less to run at today’s prices.',
  SWITCH_BEFORE_DEC31: 'The heat pump costs less to run, and the rebate drops on 1 January.',
  DO_NOT_SWITCH_YET: 'The heat pump costs more to run at these prices.',
}

export interface PlainSummary {
  /** One short line: what the answer means, in everyday words. */
  answer: string
  /** Two to four short sentences. The main number is in the second one. */
  sentences: string[]
  /** The same sentences with each figure tagged by its provenance id. */
  parts: Part[][]
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
  const answer = PLAIN_ANSWER[result.verdict]
  const parts: Part[][] = [
    ['You pay ', fig('oldCost', usd(result.oldAnnualCost)), ' a year to heat this house.'],
    [
      'A heat pump would cost ',
      fig('newCostSeasonal', usd(result.newAnnualCostHeatPumpRate)),
      ' a year at the seasonal rate.',
    ],
  ]

  if (result.annualSavings > 0) {
    parts.push(['That is ', fig('savings', usd(result.annualSavings)), ' less each year.'])

    if (result.verdict === 'SWITCH_BEFORE_DEC31' && result.cliffCost > 0) {
      parts.push(['Waiting until 2027 costs ', fig('cliff', usd(result.cliffCost)), ' more in rebate.'])
    } else if (result.rebateEligible) {
      parts.push([
        'The rebate is ',
        fig('rebate', usd(result.totalRebate)),
        ` of a ${usd(result.installCost)} install.`,
      ])
    }
  } else {
    parts.push(['That is ', fig('savings', usd(-result.annualSavings)), ' more each year.'])

    if (result.breakEvenElectricPrice !== null) {
      parts.push(['It only pays below ', fig('breakEven', cents(result.breakEvenElectricPrice)), ' per kWh.'])
    }
  }

  const sentences = parts.map(flat)

  const readabilitySample = [answer, ...sentences].join(' ')

  return {
    answer,
    sentences,
    parts,
    disclaimer: DISCLAIMER,
    readabilitySample,
  }
}
