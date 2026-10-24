import { describe, expect, it } from 'vitest'

import { computeVerdict } from '@/lib/calc'
import type { VerdictResult } from '@/lib/calc/types'

import { cents, count, usd } from '../format'
import { entryFor, provenanceFor, type ProvenanceContext } from '../provenance'

const result = computeVerdict(
  { fuel: 'oil', annualUnits: 800, unitPrice: 6.23, hdd65: 5_600 },
  { tier: 'whole', installYear: 2026, installCost: 22_000, heatPumpRate: 0.235, standardRate: 0.305 },
) as VerdictResult

const SOURCE = { publisher: 'Publisher', document: 'Document', asOf: '19 Oct' }

const ctx: ProvenanceContext = {
  fuelSource: SOURCE,
  electricitySource: SOURCE,
  heatPumpRateSource: SOURCE,
  climateSource: SOURCE,
  rebateSource: SOURCE,
  installCostSource: SOURCE,
  equipmentSource: SOURCE,
  billNote: 'Read from your bill — estimate, 92% confidence',
}

describe('provenance', () => {
  it('covers every figure the screen displays', () => {
    const entries = provenanceFor(result, ctx)
    const ids = entries.map((entry) => entry.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of [
      'hdd',
      'fuelUse',
      'deliveredHeat',
      'designLoad',
      'tons',
      'scop',
      'annualKWh',
      'oldCost',
      'newCostSeasonal',
      'newCostStandard',
      'savings',
      'rebate',
      'netCost',
      'payback',
      'monthlyLoan',
      'monthlySavings',
      'breakEven',
      'cliff',
    ] as const) {
      expect(entryFor(entries, id), `no provenance for ${id}`).not.toBeNull()
    }
  })

  it('never leaves a formula, a substituted value or a source date empty', () => {
    for (const entry of provenanceFor(result, ctx)) {
      expect(entry.label.length, entry.id).toBeGreaterThan(0)
      expect(entry.value.length, entry.id).toBeGreaterThan(0)
      expect(entry.formula.length, entry.id).toBeGreaterThan(0)
      expect(entry.substitutes.length, entry.id).toBeGreaterThan(0)
      expect(entry.source.publisher.length, entry.id).toBeGreaterThan(0)
      expect(entry.source.document.length, entry.id).toBeGreaterThan(0)
      expect(entry.source.asOf.length, entry.id).toBeGreaterThan(0)
    }
  })

  it('prints the same figure the screen prints, because both come from the result', () => {
    const entries = provenanceFor(result, ctx)
    expect(entryFor(entries, 'oldCost')?.value).toBe(usd(result.oldAnnualCost))
    expect(entryFor(entries, 'savings')?.value).toBe(usd(result.annualSavings))
    expect(entryFor(entries, 'netCost')?.value).toBe(usd(result.netCost))
    expect(entryFor(entries, 'annualKWh')?.value).toBe(`${count(result.annualKWh)} kWh`)
    expect(entryFor(entries, 'monthlyLoan')?.value).toBe(`${usd(result.monthlyLoan)}/mo`)
    expect(entryFor(entries, 'breakEven')?.value).toBe(
      result.breakEvenElectricPrice === null ? 'not computable' : `${cents(result.breakEvenElectricPrice)}/kWh`,
    )
  })

  it('carries the bill note onto the figure it came from', () => {
    const entries = provenanceFor(result, ctx)
    expect(entryFor(entries, 'fuelUse')?.note).toContain('Read from your bill')
  })

  it('returns null rather than guessing for a figure it does not know', () => {
    expect(entryFor([], 'netCost')).toBeNull()
  })
})
