/**
 * @built F-36 one plain sentence under each money figure, with the numbers in it
 *
 * A card that says "$5,200" and "on $22,000 installed" still leaves the reader to
 * work out what was subtracted from what. These three lines state the arithmetic in
 * words, using the same rounded figures the card shows, so the eye in the corner can
 * be for the full formula rather than for the basic idea.
 *
 * Invariants, tested:
 *   - a sentence never shows a number the card does not show;
 *   - a loss is called a loss, and a missing payback is never rendered as a year;
 *   - in a municipal light plant town the rebate line says *why* it is missing
 *     instead of quietly saying zero.
 */

import type { Tier, VerdictResult } from '../calc/types'
import { cents, one, usd } from './format'

/** The three lines the money cards render, in card order. */
export interface MoneySummary {
  rebate: string
  netCost: string
  payback: string
}

type SummaryInput = Pick<
  VerdictResult,
  | 'totalRebate'
  | 'installCost'
  | 'netCost'
  | 'annualSavings'
  | 'paybackYears'
  | 'breakEvenElectricPrice'
  | 'tier'
  | 'installYear'
  | 'tons'
>

const TIER_WORD: Record<Tier, string> = {
  enhanced: 'enhanced',
  whole: 'whole-home',
  partial: 'partial-home',
  basic: 'standard',
}

/** "2026 install · enhanced tier · 3.0 tons", the three facts the rebate rests on. */
export function rebateBasis(result: Pick<SummaryInput, 'tier' | 'installYear' | 'tons'>): string {
  return `${result.installYear} rules · ${TIER_WORD[result.tier]} tier · ${one(result.tons)} tons`
}

/**
 * The three sentences.
 * `utilityName` is spoken only in the municipal-light-plant case, where the reader
 * needs to know who to ask instead of Mass Save.
 */
export function moneySummary(
  result: SummaryInput,
  options: { noMassSave?: boolean; utilityName?: string | null } = {},
): MoneySummary {
  const noMassSave = options.noMassSave === true
  const saving = result.annualSavings

  if (noMassSave) {
    // "Municipal light plant is not…" reads like a typo, so the plain case gets its
    // own sentence and only a named utility is addressed directly.
    const named =
      options.utilityName && options.utilityName.trim().toLowerCase() !== 'municipal light plant' ? options.utilityName : null
    const rebate = named
      ? `Nothing available: ${named} is not a Mass Save electric sponsor, so no rebate is quoted here.`
      : 'Nothing available: this town is served by a municipal light plant, which is not a Mass Save electric sponsor — so no rebate is quoted here.'
    return {
      rebate,
      netCost: `Without a rebate you would pay the whole ${usd(result.installCost)} — which is why the net cost is not shown.`,
      payback: 'A payback needs a rebate to pay back, so it is left blank rather than estimated.',
    }
  }

  const rebate =
    result.totalRebate >= result.installCost
      ? `The program pays the whole ${usd(result.installCost)} install: ${rebateBasis(result)}.`
      : `${usd(result.totalRebate)} back on a ${usd(result.installCost)} install — ${rebateBasis(result)}.`

  const netCost = `${usd(result.installCost)} install − ${usd(result.totalRebate)} rebate = ${usd(result.netCost)} you pay.`

  let payback: string
  if (saving <= 0) {
    const breakEven =
      result.breakEvenElectricPrice === null ? null : `electricity would need to be under ${cents(result.breakEvenElectricPrice)}`
    payback =
      saving < 0
        ? `No payback: running costs rise about ${usd(Math.abs(saving))} a year${breakEven ? `; ${breakEven}` : ''}.`
        : `No payback: the running cost is a wash${breakEven ? `; ${breakEven}` : ''}.`
  } else if (result.netCost <= 0) {
    payback = `Nothing to pay back: the rebate already covers the install, and you save ${usd(saving)} a year.`
  } else if (result.paybackYears === null) {
    payback = `No payback is calculated, even though the heat pump saves ${usd(saving)} a year.`
  } else {
    payback = `${usd(result.netCost)} ÷ ${usd(saving)} a year = ${one(result.paybackYears)} years to break even.`
  }

  return { rebate, netCost, payback }
}
