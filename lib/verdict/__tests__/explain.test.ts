import { describe, expect, it } from 'vitest'

import { computeVerdict } from '@/lib/calc'
import type { VerdictResult } from '@/lib/calc/types'

import {
  buildExplainPrompt,
  checkedSentences,
  EXPLAIN_MAX_SENTENCES,
  fallbackSentences,
  inventedNumbers,
  isVerdictResult,
  numbersIn,
  parseSentences,
} from '../explain'
import { usd } from '../format'

const oil = computeVerdict(
  { fuel: 'oil', annualUnits: 800, unitPrice: 6.23, hdd65: 5_600 },
  { tier: 'whole', installYear: 2026, installCost: 22_000, heatPumpRate: 0.235, standardRate: 0.305 },
) as VerdictResult

const gas = computeVerdict(
  { fuel: 'gas', annualUnits: 1_000, unitPrice: 1.9, hdd65: 5_641 },
  { tier: 'whole', installYear: 2026, installCost: 22_000, heatPumpRate: 0.235, standardRate: 0.305 },
) as VerdictResult

describe('plain-English explanation', () => {
  it('writes exactly three fallback sentences, for both a gain and a loss', () => {
    for (const result of [oil, gas]) {
      const sentences = fallbackSentences(result)
      expect(sentences).toHaveLength(EXPLAIN_MAX_SENTENCES)
      for (const sentence of sentences) expect(sentence.trim().length).toBeGreaterThan(0)
    }
  })

  it('never invents a number in the fallback', () => {
    for (const result of [oil, gas]) {
      expect(inventedNumbers(fallbackSentences(result).join(' '), result)).toEqual([])
    }
  })

  it('says "the money does not work" in words when savings are negative', () => {
    expect(gas.annualSavings).toBeLessThanOrEqual(0)
    expect(fallbackSentences(gas)[1]).toContain('break-even electricity price')
  })

  it('accepts a faithful sentence and rejects an invented figure', () => {
    const faithful = `You pay ${usd(oil.oldAnnualCost)} a year for oil, and the same heat costs ${usd(oil.newAnnualCostHeatPumpRate)} at the seasonal rate.`
    expect(checkedSentences(faithful, oil)).toHaveLength(1)

    const invented = 'You will save $12,345 a year, guaranteed.'
    expect(inventedNumbers(invented, oil)).toContain(12_345)
    expect(checkedSentences(invented, oil)).toBeNull()
  })

  it('rejects a fourth sentence, because three is the contract', () => {
    const four = 'One. Two. Three. Four.'
    expect(parseSentences(four)).toHaveLength(4)
    expect(checkedSentences(four, oil)).toBeNull()
  })

  it('strips markdown before counting sentences', () => {
    expect(parseSentences('- **One.**\n- Two.')).toEqual(['One.', 'Two.'])
    expect(numbersIn('$1,234 and 5.5¢')).toEqual([1_234, 5.5])
  })

  it('writes a prompt that forbids new arithmetic', () => {
    const prompt = buildExplainPrompt(oil)
    expect(prompt).toContain('Do not calculate')
    expect(prompt).toContain(usd(oil.oldAnnualCost))
    expect(prompt).toContain('Return the three sentences only.')
  })

  describe('untrusted result guard', () => {
    it('accepts a result the engine produced', () => {
      expect(isVerdictResult(oil)).toBe(true)
      expect(isVerdictResult(JSON.parse(JSON.stringify(oil)))).toBe(true)
    })

    it('refuses junk rather than coercing it', () => {
      expect(isVerdictResult(null)).toBe(false)
      expect(isVerdictResult('a verdict')).toBe(false)
      expect(isVerdictResult({})).toBe(false)
      expect(isVerdictResult({ ...oil, verdict: 'SWITCH_MAYBE' })).toBe(false)
      expect(isVerdictResult({ ...oil, netCost: '14050' })).toBe(false)
      expect(isVerdictResult({ ...oil, annualSavings: Number.NaN })).toBe(false)
      expect(isVerdictResult({ ...oil, installYear: 2028 })).toBe(false)
      expect(isVerdictResult({ ...oil, reasons: 'because' })).toBe(false)
    })
  })
})
