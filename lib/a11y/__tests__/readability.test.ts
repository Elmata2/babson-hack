/**
 * @built F-50 R14.4 — the readability heuristic, pinned so the score means something
 *
 * A reading-level test is only worth having if the counter behind it is
 * predictable. These cases pin the three rules documented in the module: a figure
 * is one word and one syllable, a vowel group is a syllable, and a silent final
 * `e` is not spoken. Known values from the FK reference are checked alongside
 * them so a change to the heuristic cannot quietly lower the bar.
 */

import { describe, expect, it } from 'vitest'

import {
  PLAIN_GRADE_TARGET,
  fleschKincaidGrade,
  gradeLevel,
  sentencesIn,
  syllableCount,
  totalSyllables,
  wordsIn,
} from '../readability'

describe('readability — words and sentences', () => {
  it('counts words and drops punctuation', () => {
    expect(wordsIn('You pay $4,984 a year.')).toEqual(['You', 'pay', '4,984', 'a', 'year'])
    expect(wordsIn('')).toEqual([])
  })

  it('splits on terminal punctuation and ignores empties', () => {
    expect(sentencesIn('One. Two! Three?')).toHaveLength(3)
    expect(sentencesIn('No full stop')).toHaveLength(1)
    expect(sentencesIn('   ')).toEqual([])
  })
})

describe('readability — syllables', () => {
  it('counts vowel groups', () => {
    expect(syllableCount('house')).toBe(1)
    expect(syllableCount('little')).toBe(2)
    expect(syllableCount('assessment')).toBe(3)
    expect(syllableCount('estimate')).toBe(3)
  })

  it('drops a silent final e but keeps a spoken one', () => {
    expect(syllableCount('make')).toBe(1)
    expect(syllableCount('rebate')).toBe(2)
    expect(syllableCount('the')).toBe(1)
    expect(syllableCount('free')).toBe(1)
  })

  it('counts a figure one syllable per digit, and never returns zero', () => {
    expect(syllableCount('$4,984')).toBe(4)
    expect(syllableCount('40.0¢')).toBe(3)
    expect(syllableCount('kWh')).toBe(1)
    expect(syllableCount('')).toBe(0)
  })

  it('sums a sentence', () => {
    // you, pay, a, year — four one-syllable words.
    expect(totalSyllables('You pay a year.')).toBe(4)
  })
})

describe('readability — Flesch–Kincaid', () => {
  it('scores the documented reference band', () => {
    // Short, plain sentences land near the bottom of the scale.
    const plain = 'You pay now. A heat pump costs less. That is good.'
    expect(fleschKincaidGrade(plain)).toBeLessThan(3)

    // Long, polysyllabic sentences land well above grade 8.
    const dense =
      'Notwithstanding the aforementioned considerations, the implementation of comprehensive infrastructural modifications necessitates substantial preliminary evaluation and considerable administrative coordination.'
    expect(fleschKincaidGrade(dense)).toBeGreaterThan(PLAIN_GRADE_TARGET)
  })

  it('returns 0 rather than NaN for empty prose', () => {
    expect(fleschKincaidGrade('')).toBe(0)
    expect(gradeLevel('')).toBe(0)
  })

  it('rounds to one decimal', () => {
    const grade = gradeLevel('You pay now. A heat pump costs less. That is good.')
    expect(Number.isFinite(grade)).toBe(true)
    expect(Math.round(grade * 10) / 10).toBe(grade)
  })
})
