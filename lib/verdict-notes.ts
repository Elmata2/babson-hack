/**
 * @built F-143 R8.3 — a verdict reaches the screen with its reasons, or it does not reach it
 *
 * R8.3: every verdict renders at least two supporting reasons and at least one
 * caveat. `computeVerdict` already guarantees both, but this is the display
 * edge: a hand-built result, a future engine change or a filtered list must not
 * be able to strip the screen down to a bare number. The page therefore asks
 * for notes, never for the raw arrays, and this module enforces the floor.
 *
 * The fallbacks invent nothing. They repeat the verdict's own published wording
 * and the mandatory disclaimer from R15.2 — never a dollar figure, never a
 * number the engine did not return.
 */

import type { VerdictResult } from './calc/types'
import { VERDICT_META } from './verdicts'

/** R8.3's floor, exported so the page and the tests cite the same numbers. */
export const MIN_REASONS = 2
export const MIN_CAVEATS = 1

export interface VerdictNotes {
  reasons: string[]
  caveats: string[]
}

/** Trim, drop empties and duplicates, keep the engine's order. */
function clean(values: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const text = value.trim()
    if (!text || seen.has(text)) continue
    seen.add(text)
    out.push(text)
  }
  return out
}

/**
 * The reasons and caveats the screen may show for this result.
 * Guarantee: at least `MIN_REASONS` reasons and `MIN_CAVEATS` caveats,
 * deduplicated, order preserved, and every sentence either the engine's own or
 * the verdict's published wording.
 */
export function verdictNotes(result: VerdictResult): VerdictNotes {
  const reasons = clean(result.reasons)
  const caveats = clean(result.caveats)
  const meta = VERDICT_META[result.verdict]

  // Never triggered by `computeVerdict` — the engine test pins that. This is the
  // guard for every other caller and for the day the engine changes.
  if (reasons.length < MIN_REASONS) {
    const fallbacks = [
      `The calculator chose “${meta.label}”: ${meta.detail}`,
      'Every figure behind this answer is printed below with its formula, its substituted values and its source date.',
    ]
    for (const fallback of fallbacks) {
      if (reasons.length >= MIN_REASONS) break
      if (!reasons.includes(fallback)) reasons.push(fallback)
    }
  }

  if (caveats.length < MIN_CAVEATS) {
    caveats.push('Estimate only. Not a quote. A Home Energy Assessment determines eligibility and sizing.')
  }

  return { reasons, caveats }
}
