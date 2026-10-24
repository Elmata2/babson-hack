import { describe, expect, it } from 'vitest'

import { computeVerdict } from '@/lib/calc'
import type { VerdictResult } from '@/lib/calc/types'

import { inventedNumbers } from '../explain'
import { usd } from '../format'
import { verdictHeadline, type Part } from '../headline'
import { entryFor, provenanceFor, type SourceRef } from '../provenance'

const rates = { heatPumpRate: 0.235, standardRate: 0.305 }

const oilNow = computeVerdict(
  { fuel: 'oil', annualUnits: 800, unitPrice: 6.23, hdd65: 5_600 },
  { tier: 'enhanced', installYear: 2027, installCost: 22_000, ...rates },
) as VerdictResult
const propane = computeVerdict(
  { fuel: 'propane', annualUnits: 1_100, unitPrice: 3.85, hdd65: 5_600 },
  { tier: 'whole', installYear: 2026, installCost: 22_000, ...rates },
) as VerdictResult
const gas = computeVerdict(
  { fuel: 'gas', annualUnits: 1_000, unitPrice: 1.9, hdd65: 5_641 },
  { tier: 'whole', installYear: 2026, installCost: 22_000, ...rates },
) as VerdictResult

const withFields = (base: VerdictResult, patch: Partial<VerdictResult>): VerdictResult => ({ ...base, ...patch })
const slow = withFields(oilNow, {
  annualSavings: 180,
  monthlySavings: 15,
  paybackYears: 31.2,
  verdict: 'DO_NOT_SWITCH_YET',
})

const text = (parts: readonly Part[]): string => parts.map((p) => (typeof p === 'string' ? p : p.text)).join('')

describe('verdict headline', () => {
  it('SWITCH_NOW with savings leads with the money and says switch', () => {
    expect(oilNow.verdict).toBe('SWITCH_NOW')
    const h = verdictHeadline(oilNow)
    expect(h.case).toBe('save_switch')
    expect(h.sentence).toBe(`You’d save ${usd(oilNow.annualSavings)} a year on heating.`)
    expect(h.action).toBe('Switch.')
    expect(h.money.sign).toBe('save')
  })

  it('SWITCH_BEFORE_DEC31 names the deadline and puts the rebate drop first', () => {
    expect(propane.verdict).toBe('SWITCH_BEFORE_DEC31')
    const h = verdictHeadline(propane)
    expect(h.case).toBe('save_before_deadline')
    expect(h.action).toBe('Switch before 31 December.')
    expect(h.why[0]).toContain(usd(propane.cliffCost))
    expect(h.why[0]).toContain('1 January')
  })

  it('a loss renders as a loss, never as $0 or a negative sign', () => {
    expect(gas.verdict).toBe('DO_NOT_SWITCH_YET')
    expect(gas.annualSavings).toBeLessThan(0)
    const h = verdictHeadline(gas)
    expect(h.case).toBe('lose_stay')
    expect(h.sentence).toBe(`You’d pay ${usd(-gas.annualSavings)} a year more.`)
    expect(h.sentence).not.toContain('-')
    expect(h.action).toBe('Stay with what you have.')
    expect(h.money.sign).toBe('lose')
    expect(h.money.annualUsd).toBeCloseTo(-gas.annualSavings)
    expect(h.why.join(' ')).toContain('only wins if electricity costs less than')
    expect(text(h.parts.monthly)).toMatch(/^about \$\d+ a month more$/)
  })

  it('positive savings with a payback past the limit says wait and gives the years', () => {
    const h = verdictHeadline(slow)
    expect(h.case).toBe('save_but_wait')
    expect(h.sentence).toBe('You’d save $180 a year, but it takes 31.2 years to pay back.')
    expect(h.action).toBe('Wait.')
    expect(h.parts.monthly).toEqual(['about ', { id: 'monthlySavings', text: '$15' }, ' a month'])
  })

  it('a null payback says it does not pay back', () => {
    const h = verdictHeadline(withFields(slow, { paybackYears: null }))
    expect(h.sentence).toBe('You’d save $180 a year, but it does not pay back.')
  })

  it('a zero or non-finite saving never prints $0 as a money claim', () => {
    for (const savings of [0, Number.NaN]) {
      const h = verdictHeadline(withFields(gas, { annualSavings: savings, verdict: 'DO_NOT_SWITCH_YET' }))
      expect(h.sentence).toBe('Heating would cost about the same.')
    }
  })

  it('keeps two to three reasons, each figure tied to a provenance id', () => {
    for (const result of [oilNow, propane, gas, slow]) {
      const h = verdictHeadline(result)
      expect(h.why.length).toBeGreaterThanOrEqual(2)
      expect(h.why.length).toBeLessThanOrEqual(3)
      expect(h.parts.sentence.some((p) => typeof p !== 'string')).toBe(true)
      expect(h.parts.why.flat().some((p) => typeof p !== 'string')).toBe(true)
    }
  })

  it('never invents a number, in any case', () => {
    for (const result of [oilNow, propane, gas, slow, withFields(slow, { paybackYears: null })]) {
      const h = verdictHeadline(result)
      const all = [h.sentence, h.action.replace('31 December', 'the deadline'), text(h.parts.monthly), ...h.why].join(' ')
      expect(inventedNumbers(all, result)).toEqual([])
    }
  })

  it('uses no banned words and no exclamation marks', () => {
    for (const result of [oilNow, propane, gas, slow]) {
      const h = verdictHeadline(result)
      expect([h.sentence, h.action, ...h.why].join(' ')).not.toMatch(/!|revolutionary|seamless|empower|unlock|leverage/i)
    }
  })

  it('prints a sub-year payback with a decimal, not as 0 years', () => {
    const h = verdictHeadline(withFields(slow, { paybackYears: 0.4 }))
    expect(h.sentence).toContain('0.4 years')
  })

  it('does not print a 0.0 year payback when the rebate covers the install', () => {
    const h = verdictHeadline(withFields(oilNow, { netCost: 0, paybackYears: 0 }))
    const text = [h.sentence, h.action, ...h.why].join(' ')
    expect(text).not.toContain('0.0 years')
    expect(text).toContain('pays for itself immediately')
  })

  it('branches on raw savings: a rounded-to-zero win under SWITCH_NOW still says switch', () => {
    const h = verdictHeadline(withFields(oilNow, { annualSavings: 0.3, monthlySavings: 0.02 }))
    expect(h.action).toBe('Switch.')
    expect(h.sentence).toBe('You’d save less than $1 a year on heating.')
  })

  it('adds a standard-rate hedge only when savings hold at the standard rate', () => {
    const holds = withFields(oilNow, { annualSavingsAtStandardRate: 900 })
    expect(text(verdictHeadline(holds).parts.hedge)).toBe('At the standard rate you’d save $900 a year.')
    expect(verdictHeadline(withFields(oilNow, { annualSavingsAtStandardRate: -50 })).parts.hedge).toEqual([])
    expect(verdictHeadline(gas).parts.hedge).toEqual([])
  })

  it('every figure id in the text resolves to a drawer entry, and the drawer agrees with the sentence', () => {
    const source: SourceRef = { publisher: 'p', document: 'd', asOf: 'a' }
    const ctx = {
      fuelSource: source,
      electricitySource: source,
      heatPumpRateSource: source,
      climateSource: source,
      rebateSource: source,
      installCostSource: source,
      equipmentSource: source,
    }
    for (const result of [oilNow, propane, gas, slow]) {
      const h = verdictHeadline(result)
      const entries = provenanceFor(result, ctx)
      const parts = [...h.parts.sentence, ...h.parts.monthly, ...h.parts.why.flat(), ...h.parts.hedge]
      for (const part of parts) {
        if (typeof part === 'string') continue
        const entry = entryFor(entries, part.id)
        expect(entry, part.id).not.toBeNull()
        if (['savings', 'oldCost', 'netCost', 'rebate2026', 'rebate2027', 'cliff'].includes(part.id)) {
          expect(entry?.value).toBe(part.text)
        }
        if (part.id === 'payback') expect(entry?.value).toContain(part.text)
      }
    }
    const loss = provenanceFor(gas, ctx)
    expect(entryFor(loss, 'savings')?.value).not.toContain('-')
    expect(entryFor(loss, 'monthlySavings')?.value).not.toContain('-')
  })
})
