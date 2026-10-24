/**
 * @built F-50 the display edge is wired, not merely available
 *
 * `plainSummary`, `enhancedOffer` and `DISCLAIMER` are only worth testing if the
 * verdict screen actually renders them, and the screen is a server component the
 * test setup cannot mount. These are therefore assertions about the wiring: the
 * page imports the blocks, places the summary inside the verdict section beside
 * the dial, and keeps the explanation panel and the assumptions strip it already
 * had. Removing any of them fails here before it fails a reader.
 */

import { describe, expect, it } from 'vitest'

import { readSource } from '@/lib/a11y/__tests__/source'

const page = readSource('app/verdict/page.tsx')

describe('the verdict screen — R14.3, R14.4, R15.2', () => {
  it('renders the deterministic plain summary inside the verdict section', () => {
    expect(page).toContain("import { PlainSummary } from '@/components/verdict/plain-summary'")
    expect(page).toMatch(/<PlainSummary result=\{result\} \/>/)
    // The summary sits after the dial, before the first figure row: near the answer.
    const dial = page.indexOf('<VerdictDial')
    const summary = page.indexOf('<PlainSummary')
    const figures = page.indexOf('Heating cost a year, before and after')
    expect(dial).toBeGreaterThan(-1)
    expect(summary).toBeGreaterThan(dial)
    expect(figures).toBeGreaterThan(summary)
  })

  it('renders the enhanced-path line when the offer applies', () => {
    expect(page).toContain("import { EnhancedOfferLine } from '@/components/verdict/enhanced-offer'")
    expect(page).toMatch(/const offer = result === null \? null : enhancedOffer\(/)
    expect(page).toMatch(/\{offer \? <EnhancedOfferLine offer=\{offer\} \/> : null\}/)
  })

  it('keeps the assumptions strip visible and drops the second plain-English panel', () => {
    expect(page).toMatch(/<AssumptionsStrip result=\{result\} \/>/)
    expect(page).not.toContain('ExplainPanel')
  })

  it('reads its notes through the R8.3 floor rather than the raw arrays', () => {
    expect(page).toContain('verdictNotes')
    expect(page).not.toMatch(/result\.reasons\.slice/)
  })
})
