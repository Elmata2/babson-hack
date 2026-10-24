/**
 * @built F-22 verdictOf — four ordered rules, total function, first match wins
 *
 * Separate from the assembler so the decision can be tested without building a
 * whole result, and so the ordering is visible in one place.
 */

import { MAX_PAYBACK_YEARS } from './constants'
import type { Verdict, VerdictResult } from './types'

/**
 * The decision, from an already-assembled result.
 * Input: a VerdictResult (savings, payback, install year, both rebates).
 * Guarantee: always one of the three verdicts, never throws, never returns a
 * value based on NaN — garbage in is treated as "not yet", not as a win.
 */
export function verdictOf(result: VerdictResult): Verdict {
  const savings = result.annualSavings
  if (!Number.isFinite(savings)) return 'DO_NOT_SWITCH_YET'
  // Rule 1: no savings at all, or a loss.
  if (savings <= 0) return 'DO_NOT_SWITCH_YET'

  // Rule 2: no payback inside a mortgage-length horizon.
  const years = result.paybackYears
  if (years === null || !Number.isFinite(years) || years > MAX_PAYBACK_YEARS) return 'DO_NOT_SWITCH_YET'

  // Rule 3: this year's rebate is worth more than next year's — the cliff.
  if (result.installYear === 2026 && result.rebate2026 > result.rebate2027) return 'SWITCH_BEFORE_DEC31'

  // Rule 4: nothing stands in the way.
  return 'SWITCH_NOW'
}
