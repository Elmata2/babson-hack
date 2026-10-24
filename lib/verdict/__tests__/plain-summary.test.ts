/**
 * @built F-50 R14.4 — the plain summary is short, true, and at an 8th-grade level
 *
 * Three things are asserted, and none of them is a vibe:
 *   1. the reading level, computed by `lib/a11y/readability` over the generated
 *      strings of every fixture verdict, is grade 8 or lower;
 *   2. every figure in it is one the verdict already contains (the same guard the
 *      model-written panel passes through);
 *   3. it is not the explanation panel repeated — different sentences, and the
 *      mandated disclaimer is carried verbatim rather than paraphrased.
 */

import { describe, expect, it } from 'vitest'

import { gradeLevel, sentencesIn, wordsIn } from '@/lib/a11y/readability'
import { inventedNumbers } from '@/lib/verdict/explain'
import { usd } from '@/lib/verdict/format'

import { DISCLAIMER } from '../disclaimer'
import { fallbackSentences } from '../explain'
import { plainSummary } from '../plain-summary'
import { BY_VERDICT, FIXTURES } from './fixtures'

describe('plainSummary — R14.4', () => {
  it('covers all three verdict branches', () => {
    for (const verdict of ['SWITCH_NOW', 'SWITCH_BEFORE_DEC31', 'DO_NOT_SWITCH_YET'] as const) {
      expect(BY_VERDICT[verdict].length, `no fixture produces ${verdict}`).toBeGreaterThan(0)
    }
  })

  it('writes short sentences, not a paragraph', () => {
    for (const { name, result } of FIXTURES) {
      const summary = plainSummary(result)
      expect(summary.sentences.length, name).toBeGreaterThanOrEqual(2)
      expect(summary.sentences.length, name).toBeLessThanOrEqual(4)
      for (const sentence of [summary.answer, ...summary.sentences]) {
        expect(sentence.trim(), `${name}: "${sentence}"`).toMatch(/[.!?]$/)
      }
      for (const sentence of summary.sentences) {
        expect(wordsIn(sentence).length, `${name}: "${sentence}"`).toBeLessThanOrEqual(14)
      }
    }
  })

  it('scores at or below grade 8 for every fixture, computed not claimed', () => {
    for (const { name, result } of FIXTURES) {
      const summary = plainSummary(result)
      const grade = gradeLevel(summary.readabilitySample)
      expect(grade, `${name} scored grade ${grade}: ${summary.readabilitySample}`).toBeLessThanOrEqual(8)
      expect(sentencesIn(summary.readabilitySample).length).toBeGreaterThanOrEqual(3)
    }
  })

  it('prints the two annual costs and the gap, and invents no third number', () => {
    for (const { name, result } of FIXTURES) {
      const summary = plainSummary(result)
      const text = [summary.answer, ...summary.sentences].join(' ')
      expect(text, name).toContain(usd(result.oldAnnualCost))
      expect(text, name).toContain(usd(result.newAnnualCostHeatPumpRate))
      expect(inventedNumbers(text, result), `${name}: ${text}`).toEqual([])
    }
  })

  it('says "less" when the heat pump wins and "more" when it loses', () => {
    for (const { name, result } of FIXTURES) {
      const text = plainSummary(result).sentences.join(' ')
      if (result.annualSavings > 0) {
        expect(text, name).toContain('less each year')
        expect(text, name).not.toContain('more each year')
      } else {
        expect(text, name).toContain('more each year')
        expect(text, name).not.toContain('less each year')
      }
    }
  })

  it('gives the loss branch a way out: the break-even price', () => {
    for (const { result } of BY_VERDICT.DO_NOT_SWITCH_YET) {
      if (result.breakEvenElectricPrice === null) continue
      expect(plainSummary(result).sentences.join(' ')).toContain('per kWh')
    }
  })

  it('is not the explanation panel with the same sentences', () => {
    for (const { name, result } of FIXTURES) {
      const summary = plainSummary(result).sentences.join(' ')
      const explain = fallbackSentences(result).join(' ')
      expect(summary, name).not.toBe(explain)
    }
  })

  it('carries the R15.2 disclaimer verbatim, and keeps it out of the readability budget', () => {
    for (const { name, result } of FIXTURES) {
      const summary = plainSummary(result)
      expect(summary.disclaimer, name).toBe(DISCLAIMER)
      expect(summary.readabilitySample, name).not.toContain(DISCLAIMER)
    }
  })

  it('is deterministic: the same result produces the same words', () => {
    for (const { result } of FIXTURES) {
      expect(plainSummary(result)).toEqual(plainSummary(result))
    }
  })

  it('never claims eligibility, approval or a guaranteed saving', () => {
    for (const { name, result } of FIXTURES) {
      const summary = plainSummary(result)
      const text = [summary.answer, ...summary.sentences].join(' ')
      expect(text, name).not.toMatch(/guarantee/i)
      expect(text, name).not.toMatch(/\bapproved\b/i)
      expect(text, name).not.toMatch(/\byou qualify\b/i)
      expect(text, name).not.toMatch(/\bwill save\b/i)
    }
  })
})
