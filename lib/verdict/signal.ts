/**
 * @built F-50 R14.1 — a verdict carries three signals, and colour is only one of them
 *
 * R14.1 says verdict colour is never the only signal. The dial already prints a
 * word and draws an icon beside every stop, but that was three facts living in
 * one component's markup, where a redesign could drop one. This module is the
 * closed set: for each verdict, the tone token, the word and the icon shape. The
 * dial renders all three, and the test asserts every verdict has all three and
 * that no two verdicts share a word, a tone or a shape.
 *
 * `word` and `tone` are the published values from `lib/verdicts` rather than a
 * second copy, so the dial cannot drift from the headline on the page.
 */

import type { Verdict } from '../calc/types'
import { VERDICT_META, type VerdictTone } from '../verdicts'

/** The three icon shapes. A shape, not a colour, is what makes a stop recognisable. */
export type SignalShape = 'arrow' | 'clock' | 'pause'

export interface VerdictSignal {
  /** The palette pair from `app/globals.css`. One of three carriers. */
  tone: VerdictTone
  /** The word printed under the stop. One of three carriers. */
  word: string
  /** The drawn mark beside the word. One of three carriers. */
  shape: SignalShape
  /** How the shape is described to a screen reader, where the shape itself is not visible. */
  iconLabel: string
}

export const VERDICT_SIGNAL: Record<Verdict, VerdictSignal> = {
  SWITCH_NOW: {
    tone: VERDICT_META.SWITCH_NOW.tone,
    word: VERDICT_META.SWITCH_NOW.label,
    shape: 'arrow',
    iconLabel: 'an arrow pointing up and to the right',
  },
  SWITCH_BEFORE_DEC31: {
    tone: VERDICT_META.SWITCH_BEFORE_DEC31.tone,
    word: VERDICT_META.SWITCH_BEFORE_DEC31.label,
    shape: 'clock',
    iconLabel: 'a clock',
  },
  DO_NOT_SWITCH_YET: {
    tone: VERDICT_META.DO_NOT_SWITCH_YET.tone,
    word: VERDICT_META.DO_NOT_SWITCH_YET.label,
    shape: 'pause',
    iconLabel: 'a pause mark',
  },
}
