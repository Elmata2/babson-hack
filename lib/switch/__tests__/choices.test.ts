/** @built F-143 tests for the choice gate (R17.2) */

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import type { Fuel } from '@/lib/calc/types'
import { resolveUtility } from '@/lib/utility'
import { choicesFor, kindOf, supplyChoiceAvailable } from '../choices'

const ARLINGTON = resolveUtility('Arlington')
const WELLESLEY = resolveUtility('Wellesley')
const CAPE_TOWN = resolveUtility('Barnstable')

const base = { verdict: 'SWITCH_NOW' as const, fuel: 'oil' as Fuel, utility: ARLINGTON }

describe('choicesFor', () => {
  it('offers all four to an oil home on an investor-owned utility', () => {
    expect(choicesFor(base)).toEqual(['STAY', 'SHOP_FUEL', 'SHOP_SUPPLY', 'SWITCH_HEAT_PUMP'])
  })

  it('removes the fuel shop for gas and electric resistance', () => {
    expect(choicesFor({ ...base, fuel: 'gas' })).toEqual(['STAY', 'SHOP_SUPPLY', 'SWITCH_HEAT_PUMP'])
    expect(choicesFor({ ...base, fuel: 'resistance' })).toEqual(['STAY', 'SHOP_SUPPLY', 'SWITCH_HEAT_PUMP'])
  })

  it('removes the supply shop where a municipal light plant serves', () => {
    const choices = choicesFor({ ...base, utility: WELLESLEY })
    expect(choices).not.toContain('SHOP_SUPPLY')
    expect(choices).toContain('SWITCH_HEAT_PUMP')
  })

  it('keeps supply for Cape Light Compact towns (it is a Mass Save sponsor)', () => {
    expect(choicesFor({ ...base, utility: CAPE_TOWN })).toContain('SHOP_SUPPLY')
  })

  it('asks before offering supply in a mixed town, and lets the bill settle it', () => {
    const mixed = {
      ...ARLINGTON,
      mixed: true,
      hasMunicipal: true,
      sponsors: ['eversource', 'municipal'] as typeof ARLINGTON.sponsors,
      eligibleForMassSave: null,
    }
    expect(supplyChoiceAvailable({ verdict: null, fuel: 'oil', utility: mixed, billUtility: null })).toBe(false)
    expect(
      supplyChoiceAvailable({ verdict: null, fuel: 'oil', utility: mixed, billUtility: 'eversource' }),
    ).toBe(true)
    expect(supplyChoiceAvailable({ verdict: null, fuel: 'oil', utility: mixed, billUtility: 'municipal' })).toBe(
      false,
    )
  })

  it('never offers supply for an unknown town or a municipal only sponsor', () => {
    expect(supplyChoiceAvailable({ verdict: null, fuel: 'oil', utility: resolveUtility('Nowhere'), billUtility: null })).toBe(
      false,
    )
  })

  it('always starts at STAY, ends at the heat pump, and repeats nothing', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<Fuel>('oil', 'propane', 'gas', 'resistance'),
        fc.constantFrom('Arlington', 'Wellesley', 'Barnstable', 'Lakeville', 'Nowhere'),
        (fuel, town) => {
          const choices = choicesFor({ verdict: 'DO_NOT_SWITCH_YET', fuel, utility: resolveUtility(town) })
          expect(choices[0]).toBe('STAY')
          expect(choices[choices.length - 1]).toBe('SWITCH_HEAT_PUMP')
          expect(new Set(choices).size).toBe(choices.length)
        },
      ),
    )
  })

  it('maps every choice to a panel kind', () => {
    expect(kindOf('STAY')).toBe('stay')
    expect(kindOf('SHOP_FUEL')).toBe('fuel')
    expect(kindOf('SHOP_SUPPLY')).toBe('supply')
    expect(kindOf('SWITCH_HEAT_PUMP')).toBe('installer')
  })
})
