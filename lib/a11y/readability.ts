/**
 * @built F-50 R14.4 — a readability score the test can compute, not a claim on a slide
 *
 * R14.4 says the verdict screen is written at an 8th-grade reading level. That is
 * only true if something measures it, so this module is a small, documented
 * Flesch–Kincaid implementation plus the two counters it needs. It is
 * deterministic, dependency-free, and deliberately naive: the point is to keep
 * the writing honest, not to model English.
 *
 * The heuristic, stated once so a reader can disagree with it:
 *   - word = a run of letters, or a run of digits/punctuation containing a digit
 *     (`$4,984`, `40.0¢`, `1.4`). A figure counts as one word.
 *   - syllables = vowel groups (a e i o u y) in a word, minus a silent final `e`,
 *     floored at one. A figure counts one syllable per digit.
 *   - sentence = text up to `.`, `!` or `?`.
 *
 * The figure rule is the coarse one: "four thousand nine hundred eighty-four" has
 * seven syllables and `$4,984` is scored as four. That undercounts number-heavy
 * prose, so the budget leans on the rest of the module — the sentences are short
 * and the vocabulary is plain, and the test also asserts every figure is one the
 * verdict already contains, so the reading load cannot come from invented digits.
 *
 * Pure: no DOM, no network, no clock.
 */

/** The target: Flesch–Kincaid grade 8, the usual reading level of a US newspaper. */
export const PLAIN_GRADE_TARGET = 8

const WORD_RE = /[a-z]+|\d[\d.,:/-]*/gi
const SENTENCE_RE = /[^.!?]+[.!?]?/g

/** Every word-like token in `text`, in order. */
export function wordsIn(text: string): string[] {
  return text.match(WORD_RE) ?? []
}

/** Split `text` into sentences on terminal punctuation. Empty fragments are dropped. */
export function sentencesIn(text: string): string[] {
  return (text.match(SENTENCE_RE) ?? []).map((sentence) => sentence.trim()).filter((sentence) => sentence.length > 0)
}

const hasDigit = (word: string): boolean => /\d/.test(word)

/**
 * Syllables in one word, by vowel group. A figure counts one syllable per digit
 * (`$4,984` → 4), which ignores the magnitude words a person actually says
 * ("four thousand nine hundred eighty-four" is 7) — a deliberate undercount that
 * keeps the score focused on the prose rather than on the size of a number. An
 * all-consonant token (`kWh`) counts as one, never zero.
 */
export function syllableCount(word: string): number {
  const token = word.toLowerCase().trim()
  if (token === '') return 0
  if (hasDigit(token)) return Math.max(1, (token.match(/\d/g) ?? []).length)

  const letters = token.replace(/[^a-z]/g, '')
  if (letters === '') return 1

  const groups = letters.match(/[aeiouy]+/g) ?? []
  let count = groups.length

  // `make`, `house`, `price`: the final `e` is not spoken. `the`, `be`, `free` keep theirs.
  // `little`, `table`: a consonant + `le` ending *is* a syllable, so it is not silent.
  const consonantLe = /[^aeiouy]le$/.test(letters)
  if (letters.length > 2 && letters.endsWith('e') && !consonantLe && !/(ee|ye|oe)$/.test(letters)) count -= 1

  return Math.max(1, count)
}

/** Total syllables across a piece of prose. */
export function totalSyllables(text: string): number {
  return wordsIn(text).reduce((sum, word) => sum + syllableCount(word), 0)
}

/**
 * Flesch–Kincaid grade level:
 *   0.39 × (words ÷ sentences) + 11.8 × (syllables ÷ words) − 15.59
 * Empty prose scores 0 rather than NaN, so a test can say "no sentences, no problem".
 */
export function fleschKincaidGrade(text: string): number {
  const words = wordsIn(text).length
  const sentences = sentencesIn(text).length
  if (words === 0 || sentences === 0) return 0
  const syllables = totalSyllables(text)
  return 0.39 * (words / sentences) + 11.8 * (syllables / words) - 15.59
}

/** Rounded to one decimal, the way a grade level is normally quoted. */
export function gradeLevel(text: string): number {
  return Math.round(fleschKincaidGrade(text) * 10) / 10
}
