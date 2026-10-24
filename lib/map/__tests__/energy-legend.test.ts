import { describe, expect, it } from 'vitest'
import { heightLegend } from '@/components/map/energy-legend'
import { heightShare, type EnergyMeta } from '../energy-model'

const meta: EnergyMeta = {
  sources: {
    usage: { label: 'Mass Save', url: '', year: 2023, units: 'MWh', note: '' },
    households: { label: 'ACS', url: '', year: 2023, period: '5y', units: 'households', note: '' },
    solar: { label: 'MassCEC', url: '', asOf: '2025-01-31', units: 'MW', note: '' },
  },
}

describe('heightLegend', () => {
  it('names the usage source, year and unit', () => {
    const l = heightLegend('usage', 1_432_100, meta)
    expect(l.title).toBe('Column height = residential electricity use per year (Mass Save, 2023)')
    expect(l.unit).toBe('MWh per year')
  })

  it('switches to installed solar in MW (DC)', () => {
    const l = heightLegend('solar', 62.4, meta)
    expect(l.title).toBe('Column height = installed solar (MassCEC Jan 2025)')
    expect(l.unit).toBe('MW (DC)')
  })

  it('ticks are the rounded max over 1, 4 and 16, drawn with the shared height share', () => {
    const l = heightLegend('usage', 1_432_100, meta)
    expect(l.ticks.map((t) => t.value)).toEqual([1_400_000, 350_000, 87_500])
    expect(l.ticks[1].value).toBe(l.ticks[0].value / 4)
    expect(l.ticks[1].share).toBe(heightShare(1_400_000 / 4, 1_400_000))
    expect(l.ticks.map((t) => t.share)).toEqual([1, 0.5, 0.25])
  })
})
