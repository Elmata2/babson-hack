import { describe, expect, it } from 'vitest'

import { computeVerdict } from '@/lib/calc'
import { hdd65ForTown } from '@/lib/geo'
import { seasonalHeatPumpRate } from '@/lib/utility'

import { loanSentence, loanView, paybackView, rebateCapNote, rejectedQuote } from '../money'

const base = { annualSavings: 2000, netCost: 6000, paybackYears: 3, totalRebate: 16000, installCost: 22000, loanAmount: 6000 }

function oil(installCost: number) {
  const r = computeVerdict(
    { fuel: 'oil', annualUnits: 800, unitPrice: 6.23, hdd65: hdd65ForTown('Framingham') ?? undefined },
    {
      tier: 'enhanced',
      installYear: 2026,
      installCost,
      heatPumpRate: seasonalHeatPumpRate(0.31, 'Framingham').rate,
      standardRate: 0.31,
    },
  )
  if (!r) throw new Error('no verdict')
  return r
}

describe('paybackView', () => {
  it('shows years with one decimal', () => {
    expect(paybackView(base)).toMatchObject({ kind: 'years', value: '3.0 years' })
  })
  it('says immediate when the rebate covers the install', () => {
    expect(paybackView({ ...base, netCost: 0, paybackYears: 0, loanAmount: 0 }).kind).toBe('immediate')
  })
  it('says no payback when savings are not positive, even at zero net cost', () => {
    expect(paybackView({ ...base, annualSavings: -50, paybackYears: null }).kind).toBe('never')
    expect(paybackView({ ...base, annualSavings: 0, netCost: 0, paybackYears: null }).kind).toBe('never')
  })
})

describe('loanView', () => {
  it('applies with savings and a positive amount', () => {
    expect(loanView(base)).toMatchObject({ amount: 6000, remainder: 0, termYears: 7, maxUsd: 25000 })
  })
  it('hides with no savings or nothing to finance', () => {
    expect(loanView({ ...base, annualSavings: -1 })).toBeNull()
    expect(loanView({ ...base, netCost: 0, loanAmount: 0 })).toBeNull()
  })
  it('reports what the cap leaves to pay up front', () => {
    expect(loanView({ ...base, netCost: 30000, loanAmount: 25000 })?.remainder).toBe(5000)
  })
  it('names the program numbers from steering', () => {
    expect(loanSentence()).toContain('$25,000')
    expect(loanSentence()).toContain('We assume')
    expect(loanSentence()).toContain('84 months')
  })
})

describe('engine, install cost sweep', () => {
  it('caps the rebate at the install cost: $2,000 means net 0, no loan', () => {
    const r = oil(2000)
    expect(r.totalRebate).toBe(2000)
    expect(r.netCost).toBe(0)
    expect(rebateCapNote(r)).toContain('enhanced rule')
    expect(paybackView(r).kind).toBe('immediate')
    expect(loanView(r)).toBeNull()
  })
  it('$20,000 keeps the $16,000 enhanced rebate, so payback is short but real', () => {
    const r = oil(20000)
    expect(r.netCost).toBe(4000)
    expect(paybackView(r).value).toBe('1.5 years')
    expect(r.loanAmount).toBe(4000)
  })
  it('finances at most $25,000', () => {
    const r = oil(60000)
    expect(r.loanAmount).toBe(25000)
    expect(r.monthlyLoan).toBeCloseTo(25000 / 84, 6)
    expect(loanView(r)?.remainder).toBe(r.netCost - 25000)
  })
})

describe('rebateCapNote', () => {
  const whole = { totalRebate: 5000, installCost: 5000, tier: 'whole' as const }
  it('labels the per-ton cap as a model assumption', () => {
    expect(rebateCapNote(whole)).toContain('model:')
  })
  it('is silent when the rebate is below the install cost', () => {
    expect(rebateCapNote({ ...whole, installCost: 22000 })).toBeNull()
  })
})

describe('payback past the limit', () => {
  it('says so on the card', () => {
    expect(paybackView({ ...base, netCost: 44000, paybackYears: 16.2 }).note).toContain('15-year limit')
  })
})

describe('reason text above the loan cap', () => {
  it('mentions the up-front remainder', () => {
    const r = oil(50000)
    expect(r.verdict).toBe('SWITCH_NOW')
    expect(r.reasons.join(' ')).toContain('is paid up front')
  })
})

describe('rejectedQuote', () => {
  it('flags values outside the band and ignores blanks and valid values', () => {
    expect(rejectedQuote('500')?.message).toContain('$1,000')
    expect(rejectedQuote('500')?.message).toContain('$22,000')
    expect(rejectedQuote('999999')).not.toBeNull()
    expect(rejectedQuote('abc')).not.toBeNull()
    expect(rejectedQuote('')).toBeNull()
    expect(rejectedQuote(null)).toBeNull()
    expect(rejectedQuote('2000')).toBeNull()
  })
})
