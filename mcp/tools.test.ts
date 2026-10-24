import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { computeVerdict } from '../lib/calc'
import type { HeatingInput, UpgradeInput } from '../lib/calc/types'
import { computeVerdictTool, getFuelSnapshotTool, getProgramRuleTool, lookupSponsorTool } from './tools'

const heating: HeatingInput = { fuel: 'oil', annualUnits: 750, unitPrice: 6.23 }
const upgrade: UpgradeInput = { tier: 'whole', installYear: 2026, heatPumpRate: 0.2349, standardRate: 0.305 }

describe('MCP tool handlers', () => {
  it('compute_verdict returns exactly what the engine returns', () => {
    const reply = computeVerdictTool(heating, upgrade)
    expect(reply.ok).toBe(true)
    expect(reply.data).toEqual(computeVerdict(heating, upgrade))
  })

  it('property: a refusal never carries a verdict, and an answer never carries NaN', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -10, max: 100_000, noNaN: false }),
        fc.double({ min: -5, max: 80, noNaN: false }),
        (units, price) => {
          const reply = computeVerdictTool({ ...heating, annualUnits: units, unitPrice: price }, upgrade)
          const data = reply.data as Record<string, unknown>
          if (!reply.ok) {
            expect(data.refusal).toBeDefined()
            expect(data.verdict).toBeUndefined()
          } else {
            expect(JSON.stringify(data)).not.toMatch(/NaN|Infinity/)
          }
        },
      ),
      { numRuns: 200 },
    )
  })

  it('lookup_sponsor refuses to guess for an unknown town', () => {
    const reply = lookupSponsorTool('Atlantis')
    expect(reply.ok).toBe(false)
    const data = reply.data as { eligibleForMassSave: boolean | null; question: string | null }
    expect(data.eligibleForMassSave).toBeNull()
    expect(data.question).not.toBeNull()
  })

  it('lookup_sponsor answers the municipal-light-plant case', () => {
    const data = lookupSponsorTool('Wellesley').data as { eligibleForMassSave: boolean | null }
    expect(data.eligibleForMassSave).toBe(false)
  })

  it('get_program_rule shows the 2027 step-down and rejects other years', () => {
    const y26 = getProgramRuleTool(2026, 'whole').data as { rule: { perTonUsd: number; capUsd: number } }
    const y27 = getProgramRuleTool(2027, 'whole').data as { rule: { perTonUsd: number; capUsd: number } }
    expect(y26.rule).toMatchObject({ perTonUsd: 2650, capUsd: 8500 })
    expect(y27.rule).toMatchObject({ perTonUsd: 2350, capUsd: 7500 })
    expect(getProgramRuleTool(2028, 'whole').ok).toBe(false)
  })

  it('get_fuel_snapshot carries its date', () => {
    expect((getFuelSnapshotTool().data as { asOf: string }).asOf).toBe('2026-10-19')
  })
})
