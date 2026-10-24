import { describe, expect, it } from 'vitest'

import { computeVerdict } from '@/lib/calc'
import { DEFAULT_INSTALL_COST_USD } from '@/lib/calc/constants'
import type { Fuel, Tier, VerdictResult } from '@/lib/calc/types'
import { hdd65ForTown } from '@/lib/geo'
import { seasonalHeatPumpRate } from '@/lib/utility'

import { plainSummary } from '../plain-summary'
import { DEMO_PRESETS } from '../presets'
import { verdictNotes, MIN_REASONS, MIN_CAVEATS } from '../../verdict-notes'

/**
 * The presets are demo links, so they are tested through the same arithmetic a
 * household's link uses: parse the URL, let `lib/calc` decide. A preset whose
 * answer drifts is a demo that lies on stage.
 */
function verdictFor(href: string, standardRate: number): VerdictResult | null {
  const params = new URL(href, 'https://switchpoint.test').searchParams
  const town = params.get('town') ?? ''
  const fuel = params.get('fuel') as Fuel
  const tier = params.get('tier') as Tier
  const installYear = Number(params.get('year')) as 2026 | 2027

  return computeVerdict(
    {
      fuel,
      annualUnits: Number(params.get('units')),
      unitPrice: Number(params.get('price')),
      hdd65: hdd65ForTown(town) ?? undefined,
    },
    {
      tier,
      installYear,
      installCost: DEFAULT_INSTALL_COST_USD,
      heatPumpRate: seasonalHeatPumpRate(standardRate, town).rate,
      standardRate,
    },
  )
}

describe('demo presets', () => {
  it('has exactly three, one of each answer', () => {
    expect(DEMO_PRESETS).toHaveLength(3)
    expect(new Set(DEMO_PRESETS.map((preset) => preset.expects))).toEqual(
      new Set(['SWITCH_NOW', 'SWITCH_BEFORE_DEC31', 'DO_NOT_SWITCH_YET']),
    )
  })

  it('every link carries the query the verdict screen needs', () => {
    for (const preset of DEMO_PRESETS) {
      const url = new URL(preset.href, 'https://switchpoint.test')
      expect(url.pathname).toBe('/verdict')
      for (const key of ['fuel', 'units', 'price', 'town', 'tier', 'year']) {
        expect(url.searchParams.get(key), `${preset.key} is missing ${key}`).toBeTruthy()
      }
    }
  })

  it.each(DEMO_PRESETS.map((preset) => [preset.key, preset] as const))(
    '%s produces its promised verdict at a typical Massachusetts electric price',
    (_key, preset) => {
      const result = verdictFor(preset.href, 0.3)
      expect(result).not.toBeNull()
      expect(result?.verdict).toBe(preset.expects)
    },
  )

  it('keeps the promised verdict across a plausible electric-price band', () => {
    for (const rate of [0.22, 0.26, 0.3, 0.34, 0.38]) {
      for (const preset of DEMO_PRESETS) {
        const result = verdictFor(preset.href, rate)
        expect(result, `${preset.key} at ${rate}/kWh`).not.toBeNull()
        expect(result?.verdict, `${preset.key} at ${rate}/kWh`).toBe(preset.expects)
      }
    }
  })

  it('R8.3: the In short card renders the reasons and the page renders a caveat for every preset', () => {
    for (const preset of DEMO_PRESETS) {
      const result = verdictFor(preset.href, 0.3)
      expect(result, preset.key).not.toBeNull()
      if (!result) continue
      expect(plainSummary(result).parts.length, preset.key).toBeGreaterThanOrEqual(MIN_REASONS)
      expect(verdictNotes(result).caveats.length, preset.key).toBeGreaterThanOrEqual(MIN_CAVEATS)
    }
  })
})
