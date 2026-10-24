/**
 * @built F-152 R8.3 at the display edge: a result with no notes still reaches the screen with
 * two reasons and one caveat, and the fallbacks add no figures of their own.
 */

import { describe, expect, it } from 'vitest'

import { computeVerdict } from '@/lib/calc'
import type { VerdictResult } from '@/lib/calc/types'
import { MIN_CAVEATS, MIN_REASONS, verdictNotes } from '@/lib/verdict-notes'

const BASE: VerdictResult = {
  deliveredMMBtu: 88.64,
  designBTUhr: 38_252.38,
  tons: 3,
  annualKWh: 9_621.42,
  oldAnnualCost: 4_984,
  newAnnualCostStandard: 2_934.5,
  newAnnualCostHeatPumpRate: 2_261.03,
  annualSavings: 2_722.97,
  annualSavingsAtHeatPumpRate: 2_722.97,
  annualSavingsAtStandardRate: 2_049.5,
  totalRebate: 7_950,
  rebateBreakdown: [],
  netCost: 14_050,
  paybackYears: 5.16,
  monthlyLoan: 167.26,
  monthlySavings: 226.91,
  monthlyCashFlow: 226.91 - 167.26,
  cashFlowPositive: true,
  breakEvenElectricPrice: 0.4,
  rebate2026: 7_950,
  rebate2027: 7_050,
  cliffCost: 900,
  verdict: 'SWITCH_NOW',
  reasons: ['Heating oil costs $4,984 a year.', 'The rebate is $7,950 against a $22,000 install.'],
  caveats: ['Sizing is approximate.'],
  assumptions: [],
  fuel: 'oil',
  tier: 'whole',
  installYear: 2026,
  installCost: 22_000,
  scop: 2.7,
  hdd65: 5_600,
  designTempF: 7,
  annualUnits: 800,
  unitPrice: 6.23,
  heatPumpRate: 0.235,
  standardRate: 0.305,
  rebateEligible: true,
}

describe('verdictNotes — R8.3', () => {
  it('keeps a real engine answer unchanged: at least two reasons and one caveat', () => {
    const result = computeVerdict(
      { fuel: 'oil', annualUnits: 800, unitPrice: 6.23 },
      { tier: 'whole', installYear: 2026, heatPumpRate: 0.235, standardRate: 0.305 },
    )
    expect(result).not.toBeNull()
    const notes = verdictNotes(result!)

    expect(notes.reasons.length).toBeGreaterThanOrEqual(MIN_REASONS)
    expect(notes.caveats.length).toBeGreaterThanOrEqual(MIN_CAVEATS)
    expect(notes.reasons).toEqual(result!.reasons)
    expect(notes.caveats).toEqual(result!.caveats)
  })

  it('pads a result that arrives without notes, and invents no numbers doing it', () => {
    const notes = verdictNotes({ ...BASE, reasons: [], caveats: [] })

    expect(notes.reasons).toHaveLength(MIN_REASONS)
    expect(notes.caveats).toHaveLength(MIN_CAVEATS)
    for (const sentence of [...notes.reasons, ...notes.caveats]) {
      expect(sentence).not.toMatch(/[$€£%]|\d/)
    }
    expect(notes.caveats[0]).toContain('Estimate only. Not a quote.')
  })

  it('accepts one reason but still reaches the floor', () => {
    const notes = verdictNotes({ ...BASE, reasons: ['Only one reason.'], caveats: ['One caveat.'] })

    expect(notes.reasons).toHaveLength(MIN_REASONS)
    expect(notes.reasons[0]).toBe('Only one reason.')
    expect(notes.caveats).toEqual(['One caveat.'])
  })

  it('drops blanks and duplicates without reordering what is left', () => {
    const notes = verdictNotes({
      ...BASE,
      reasons: ['  First.  ', 'First.', '', 'Second.', 'Second.'],
      caveats: ['Caveat.', 'Caveat.', ' '],
    })

    expect(notes.reasons).toEqual(['First.', 'Second.'])
    expect(notes.caveats).toEqual(['Caveat.'])
  })

  it('is deterministic: the same result always produces the same notes', () => {
    const once = verdictNotes({ ...BASE, reasons: [], caveats: [] })
    const twice = verdictNotes({ ...BASE, reasons: [], caveats: [] })

    expect(twice).toEqual(once)
  })
})
