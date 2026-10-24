import { describe, expect, it } from 'vitest'

import { computeVerdict } from '@/lib/calc'
import type { VerdictResult } from '@/lib/calc/types'

import { usd } from '../format'
import type { Part } from '../headline'
import { refusalRunningCost } from '../running-cost'

const flat = (parts: readonly Part[]): string => parts.map((p) => (typeof p === 'string' ? p : p.text)).join('')

const atBillRate = computeVerdict(
  { fuel: 'oil', annualUnits: 900, unitPrice: 6.23, hdd65: 5_600 },
  { tier: 'whole', installYear: 2026, installCost: 22_000, heatPumpRate: 0.4, standardRate: 0.4 },
) as VerdictResult

describe('refusalRunningCost', () => {
  it('compares old cost with the heat pump at the bill rate, tied to provenance ids', () => {
    const parts = refusalRunningCost(atBillRate, 0.4, true)!
    expect(flat(parts)).toBe(
      `At your light plant’s rate from your bill (40.0¢ per kWh), no rebate: heating costs ${usd(atBillRate.oldAnnualCost)} a year now. The same heat from a heat pump costs ${usd(atBillRate.newAnnualCostStandard)} a year.`,
    )
    expect(parts.filter((p) => typeof p !== 'string')).toEqual([
      { id: 'oldCost', text: usd(atBillRate.oldAnnualCost) },
      { id: 'newCostStandard', text: usd(atBillRate.newAnnualCostStandard) },
    ])
  })

  it('does not call the rate a light plant rate unless the bill is known to be municipal', () => {
    expect(flat(refusalRunningCost(atBillRate, 0.4, false)!)).toContain('At the electricity rate from your bill (40.0¢ per kWh), no rebate')
  })

  it('says nothing without a bill rate, so no rate is invented', () => {
    expect(refusalRunningCost(atBillRate, null, true)).toBeNull()
  })
})
