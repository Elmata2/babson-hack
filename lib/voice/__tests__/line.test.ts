/**
 * @built F-131 the four languages say the same number, and a loss is never softened
 *
 * R23.1 asks for four languages; the risk in a translated template is not grammar,
 * it is a figure that drifts or a sign that flips. These tests pin the numbers and
 * the direction in all four, and pin the disclaimer to every answer (R15.2).
 */

import { describe, expect, it } from 'vitest'

import { decisionLine, disclaimerLine, parseVoiceLang, verdictLine, VOICE_LANGS } from '../line'

const input = {
  verdict: 'SWITCH_NOW' as const,
  annualSavings: 2_723,
  paybackYears: 4.96,
  breakEvenCents: null,
  rebateDrop: 1_000,
}

describe('parseVoiceLang', () => {
  it('accepts only the four languages R23.1 names', () => {
    for (const lang of VOICE_LANGS) expect(parseVoiceLang(lang)).toBe(lang)
    expect(parseVoiceLang('fr')).toBeNull()
    expect(parseVoiceLang(null)).toBeNull()
  })
})

describe('verdictLine', () => {
  it('puts the same dollar figure and payback in all four languages', () => {
    for (const lang of VOICE_LANGS) {
      const line = verdictLine(input, lang)
      expect(line).toContain('$2,723')
      expect(line).toContain('5.0')
    }
  })

  it('says the rebate drop on the before-December verdict, and the saving too', () => {
    for (const lang of VOICE_LANGS) {
      const line = verdictLine({ ...input, verdict: 'SWITCH_BEFORE_DEC31' }, lang)
      expect(line).toContain('$1,000')
      expect(line).toContain('$2,723')
    }
  })

  it('says a loss as a loss, and gives the break-even price instead of hope', () => {
    const loss = { verdict: 'DO_NOT_SWITCH_YET' as const, annualSavings: -480, paybackYears: null, breakEvenCents: 18.4, rebateDrop: 0 }
    for (const lang of VOICE_LANGS) {
      const line = verdictLine(loss, lang)
      expect(line).toContain('18.4')
      // The negative saving is never restated as a gain in any language.
      expect(line).not.toContain('$480')
      expect(line).not.toContain('2,723')
    }
  })

  it('never invents a payback when there is none', () => {
    const line = verdictLine({ ...input, paybackYears: null }, 'en')
    expect(line.toLowerCase()).not.toContain('pays for itself')
  })

  it('reads the same in an unsupported verdict as the cautious one', () => {
    const fallback = verdictLine({ ...input, verdict: 'SOMETHING_ELSE' as never }, 'en')
    expect(fallback.toLowerCase()).toContain('not yet')
  })
})

describe('the disclaimer and the decision', () => {
  it('carries a disclaimer in every language, and it says estimate', () => {
    for (const lang of VOICE_LANGS) {
      const line = disclaimerLine(lang)
      expect(line.length).toBeGreaterThan(20)
    }
    expect(disclaimerLine('en')).toContain('not a quote')
    expect(disclaimerLine('es')).toContain('no una cotización')
  })

  it('always hands the decision back to the caller (ADR-011)', () => {
    expect(decisionLine('en')).toContain('decision is yours')
    expect(decisionLine('ht')).toContain('se pou ou')
  })
})
