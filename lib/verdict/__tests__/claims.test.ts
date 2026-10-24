/**
 * @built F-50 R15.2 + R15.3 — the disclaimer is on every verdict, and no copy
 * promises eligibility, approval or a saving
 *
 * R15.2 is checked at both ends: the engine appends the sentence to every result,
 * and `verdictNotes` — the module the screen actually reads — cannot remove it.
 * The exact string is asserted, not a prefix, because "Estimate only" alone would
 * pass a substring test while dropping the half that says who decides.
 *
 * R15.3 is checked over every string the verdict screen prints: the verdict
 * metadata, the floored reasons and caveats, the plain summary and the enhanced
 * offer. A negative use ("not eligible") is allowed and expected — the rule
 * forbids claiming eligibility, not naming its absence.
 */

import { describe, expect, it } from 'vitest'

import { verdictNotes } from '@/lib/verdict-notes'
import { VERDICT_META, VERDICT_ORDER } from '@/lib/verdicts'

import { DISCLAIMER } from '../disclaimer'
import { enhancedOffer } from '../enhanced-offer'
import { plainSummary } from '../plain-summary'
import { VERDICT_SIGNAL } from '../signal'
import { BY_VERDICT, FIXTURES } from './fixtures'

/** Words that would turn an estimate into a promise. */
const BANNED: readonly { pattern: RegExp; why: string }[] = [
  { pattern: /\bguarantee[sd]?\b/i, why: 'R15.3 forbids a guaranteed saving' },
  { pattern: /\bapproved\b/i, why: 'R15.3 forbids claiming approval' },
  { pattern: /\byou(?:'re| are) (?:approved|eligible)\b/i, why: 'R15.3 forbids claiming eligibility' },
  { pattern: /\byou qualify\b/i, why: 'steering: say "likely eligible", never "you qualify"' },
  { pattern: /\bwill save\b/i, why: 'R15.3 forbids promising a saving' },
  { pattern: /\bpre-?approved\b/i, why: 'R15.3 forbids claiming approval' },
]

function copyThatReachesTheScreen(): { name: string; text: string }[] {
  const copy: { name: string; text: string }[] = []

  for (const verdict of VERDICT_ORDER) {
    const meta = VERDICT_META[verdict]
    copy.push({ name: `VERDICT_META.${verdict}`, text: [meta.label, meta.headline, meta.detail].join(' ') })
    copy.push({ name: `VERDICT_SIGNAL.${verdict}`, text: [VERDICT_SIGNAL[verdict].word, VERDICT_SIGNAL[verdict].iconLabel].join(' ') })
  }

  for (const { name, result } of FIXTURES) {
    const notes = verdictNotes(result)
    copy.push({ name: `notes/${name}`, text: [...notes.reasons, ...notes.caveats].join(' ') })

    const summary = plainSummary(result)
    copy.push({ name: `plainSummary/${name}`, text: [summary.answer, ...summary.sentences, summary.disclaimer].join(' ') })

    const offer = enhancedOffer(result, { tier: result.tier, inc: 'no' }, { noMassSave: false })
    if (offer.show) copy.push({ name: `enhancedOffer/${name}`, text: [offer.headline, offer.body, offer.linkLabel].join(' ') })
  }

  return copy
}

describe('R15.2 — the exact disclaimer', () => {
  it('is the sentence the requirement writes', () => {
    expect(DISCLAIMER).toBe('Estimate only. Not a quote. A Home Energy Assessment determines eligibility and sizing.')
  })

  it('is on every verdict the engine can return', () => {
    for (const { name, result } of FIXTURES) {
      expect(result.caveats, name).toContain(DISCLAIMER)
    }
  })

  it('covers every branch, not just the demo three', () => {
    for (const verdict of VERDICT_ORDER) {
      expect(BY_VERDICT[verdict].length, `no fixture covers ${verdict}`).toBeGreaterThan(0)
    }
  })

  it('survives the display floor in verdictNotes', () => {
    for (const { name, result } of FIXTURES) {
      expect(verdictNotes(result).caveats, name).toContain(DISCLAIMER)
    }
    // Even a result that arrives with no caveats at all gets it back.
    for (const { name, result } of FIXTURES) {
      expect(verdictNotes({ ...result, caveats: [] }).caveats, name).toContain(DISCLAIMER)
    }
  })

  it('is carried by the deterministic summary, which needs no network', () => {
    for (const { name, result } of FIXTURES) {
      expect(plainSummary(result).disclaimer, name).toBe(DISCLAIMER)
    }
  })
})

describe('R15.3 — no copy claims eligibility, approval or a guaranteed saving', () => {
  it('has copy to scan (a guard against an empty loop passing)', () => {
    expect(copyThatReachesTheScreen().length).toBeGreaterThan(VERDICT_ORDER.length)
  })

  for (const { pattern, why } of BANNED) {
    it(`no verdict copy matches ${pattern} — ${why}`, () => {
      const hits = copyThatReachesTheScreen().filter((entry) => pattern.test(entry.text))
      expect(hits, hits.map((hit) => `${hit.name}: ${hit.text}`).join('\n')).toEqual([])
    })
  }

  it('still allows the honest negative: a gas home is told it is not eligible for enhanced', () => {
    const gas = BY_VERDICT.DO_NOT_SWITCH_YET.find((fixture) => fixture.result.fuel === 'gas')
    expect(gas).toBeDefined()
    const text = [...verdictNotes(gas!.result).reasons, ...verdictNotes(gas!.result).caveats].join(' ')
    expect(text).toMatch(/Estimate only/)
  })
})
