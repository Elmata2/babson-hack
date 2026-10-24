/**
 * @built F-02 display metadata for the three verdicts — label, one line, tone
 *
 * The decision itself is `lib/calc/verdict.ts` and it is the only thing allowed
 * to pick a verdict. This file only says how each answer is presented, so the
 * palette, the wording and the dial can never drift apart. Nothing here
 * computes a number.
 */

import type { Verdict } from './calc/types'

/** Tone keys map to the `--color-*` pairs defined in `app/globals.css`. */
export type VerdictTone = 'switch' | 'deadline' | 'hold'

export interface VerdictMeta {
  /** Short label for a chip or a dial. Sentence case, no shouting entire words. */
  label: string
  /** The answer in one line, as it appears on the verdict screen. */
  headline: string
  /** What the household can do about it. Never a promise, never a number. */
  detail: string
  tone: VerdictTone
}

export const VERDICT_META: Record<Verdict, VerdictMeta> = {
  SWITCH_NOW: {
    label: 'Switch now',
    headline: 'Switch now',
    detail: 'The economics work at today’s prices, and waiting buys you nothing.',
    tone: 'switch',
  },
  SWITCH_BEFORE_DEC31: {
    label: 'Before 31 Dec',
    headline: 'Switch before 31 December',
    detail: 'The economics work, and the rebate step-down on 1 January costs you money if you wait.',
    tone: 'deadline',
  },
  DO_NOT_SWITCH_YET: {
    label: 'Don’t switch yet',
    headline: 'Don’t switch yet',
    detail: 'Not at these prices, for this house. You get the break-even electricity price and what would change the answer.',
    tone: 'hold',
  },
}

/** Presentation order: the good answer, the deadline, then the refusal. */
export const VERDICT_ORDER: readonly Verdict[] = [
  'SWITCH_NOW',
  'SWITCH_BEFORE_DEC31',
  'DO_NOT_SWITCH_YET',
]
