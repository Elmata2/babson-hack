/**
 * @built F-50 R14.1 — no verdict is carried by its colour alone
 *
 * The dial's whole claim is that a reader who cannot distinguish green from amber
 * still gets the answer, because every stop also has a word and a shape. This test
 * asserts that for the closed set of verdicts, and that the three carriers are
 * actually distinct: no two verdicts share a word, a tone or a shape, and none of
 * the carriers is empty.
 */

import { describe, expect, it } from 'vitest'

import { VERDICT_ORDER, VERDICT_META } from '@/lib/verdicts'

import { VERDICT_SIGNAL } from '../signal'

describe('VERDICT_SIGNAL — R14.1', () => {
  it('gives every verdict a word, a tone and a shape', () => {
    for (const verdict of VERDICT_ORDER) {
      const signal = VERDICT_SIGNAL[verdict]
      expect(signal.word.trim(), verdict).not.toBe('')
      expect(signal.tone.trim(), verdict).not.toBe('')
      expect(signal.shape.trim(), verdict).not.toBe('')
      expect(signal.iconLabel.trim(), verdict).not.toBe('')
    }
  })

  it('uses the verdict’s published word and tone, not a second copy', () => {
    for (const verdict of VERDICT_ORDER) {
      expect(VERDICT_SIGNAL[verdict].word).toBe(VERDICT_META[verdict].label)
      expect(VERDICT_SIGNAL[verdict].tone).toBe(VERDICT_META[verdict].tone)
    }
  })

  it('makes every carrier distinct across the closed set', () => {
    const words = VERDICT_ORDER.map((verdict) => VERDICT_SIGNAL[verdict].word)
    const tones = VERDICT_ORDER.map((verdict) => VERDICT_SIGNAL[verdict].tone)
    const shapes = VERDICT_ORDER.map((verdict) => VERDICT_SIGNAL[verdict].shape)

    expect(new Set(words).size).toBe(VERDICT_ORDER.length)
    expect(new Set(tones).size).toBe(VERDICT_ORDER.length)
    expect(new Set(shapes).size).toBe(VERDICT_ORDER.length)
  })
})
