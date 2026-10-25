/**
 * Unit tests for the six untested pure string builders in lib/switch/requests.ts.
 *
 * These functions compose the text of an email or a phone script from SharedFacts.
 * They are pure (no Date, fetch, or env) but have no NaN/null guards on numeric
 * facts — the tests below cover the happy path and document the NaN edge case.
 */

import { describe, expect, it } from 'vitest'

import {
  fuelPhoneScript,
  fuelRequestText,
  installerPhoneScript,
  installerRequestText,
  requestSubject,
  supplyKitScript,
} from '../requests'
import type { SharedFacts } from '../types'

function facts(overrides: Partial<SharedFacts> = {}): SharedFacts {
  return {
    town: 'Newton',
    zip: '02458',
    fuel: 'oil',
    annualVolume: 800,
    unit: 'gal',
    deliverySizeGal: 150,
    tankSizeGal: 275,
    deliveryWindow: 'any',
    sqft: 2_075,
    tons: 3,
    ...overrides,
  }
}

describe('fuelRequestText', () => {
  it('includes the town, fuel, annual volume, and delivery size', () => {
    const text = fuelRequestText(facts({ deliveryWindow: 'morning' }))
    expect(text).toContain('Newton')
    expect(text).toContain('heating oil')
    expect(text).toContain('800 gal')
    expect(text).toContain('150 gallons')
    expect(text).toContain('275 gallons')
    expect(text).toContain('mornings')
  })

  it('omits the delivery window line when any time works', () => {
    const text = fuelRequestText(facts({ deliveryWindow: 'any' }))
    expect(text).not.toContain('delivery window')
  })

  it('omits the volume line when annualVolume is null', () => {
    const text = fuelRequestText(facts({ annualVolume: null }))
    expect(text).not.toContain('a year')
  })

  it('omits the tank line when tankSizeGal is null', () => {
    const text = fuelRequestText(facts({ tankSizeGal: null }))
    expect(text).not.toContain('tank')
  })

  it('omits the delivery window when it is null', () => {
    const text = fuelRequestText(facts({ deliveryWindow: null }))
    expect(text).not.toContain('delivery window')
  })

  it('falls back to "heating fuel" when fuel is null', () => {
    const text = fuelRequestText(facts({ fuel: null }))
    expect(text).toContain('heating fuel')
  })

  it('renders NaN in the volume line (known edge case — no guard)', () => {
    const text = fuelRequestText(facts({ annualVolume: Number.NaN }))
    expect(text).toContain('NaN')
  })
})

describe('installerRequestText', () => {
  it('includes the town, square feet, and tonnage', () => {
    const text = installerRequestText(facts())
    expect(text).toContain('Newton')
    expect(text).toContain('2,075 square feet')
    expect(text).toContain('3.0 tons')
    expect(text).toContain('31 December 2026')
  })

  it('omits the size line when tons is null', () => {
    const text = installerRequestText(facts({ tons: null }))
    expect(text).not.toContain('tons')
  })

  it('omits the sqft line when sqft is null', () => {
    const text = installerRequestText(facts({ sqft: null }))
    expect(text).not.toContain('square feet')
  })

  it('renders NaN in the tons line (known edge case — no guard)', () => {
    const text = installerRequestText(facts({ tons: Number.NaN }))
    expect(text).toContain('NaN tons')
  })
})

describe('requestSubject', () => {
  it('returns a fuel subject line', () => {
    expect(requestSubject('fuel', facts())).toBe('Price request: oil in Newton')
  })

  it('returns an installer subject line', () => {
    expect(requestSubject('installer', facts())).toBe('Heat pump quote request: Newton')
  })

  it('uses "heating fuel" when fuel is null', () => {
    expect(requestSubject('fuel', facts({ fuel: null }))).toBe('Price request: heating fuel in Newton')
  })
})

describe('fuelPhoneScript', () => {
  it('reads as a single spoken sentence with the key facts', () => {
    const script = fuelPhoneScript(facts({ deliveryWindow: 'morning' }))
    expect(script).toContain('Newton')
    expect(script).toContain('heating oil')
    expect(script).toContain('800 gal')
    expect(script).toContain('150 gallons')
    expect(script).toContain('275 gallons')
    expect(script).toContain('mornings')
  })

  it('omits the tank when it is null', () => {
    const script = fuelPhoneScript(facts({ tankSizeGal: null }))
    expect(script).not.toContain('tank')
  })

  it('uses "a year" when annualVolume is null', () => {
    const script = fuelPhoneScript(facts({ annualVolume: null }))
    expect(script).toContain('a year')
  })
})

describe('installerPhoneScript', () => {
  it('reads as a single spoken sentence with the key facts', () => {
    const script = installerPhoneScript(facts())
    expect(script).toContain('Newton')
    expect(script).toContain('2,075 square feet')
    expect(script).toContain('3.0 tons')
    expect(script).toContain('31 December 2026')
  })

  it('omits size when tons is null', () => {
    const script = installerPhoneScript(facts({ tons: null }))
    expect(script).not.toContain('tons')
  })

  it('omits area when sqft is null', () => {
    const script = installerPhoneScript(facts({ sqft: null }))
    expect(script).not.toContain('square feet')
  })
})

describe('supplyKitScript', () => {
  it('includes the town name', () => {
    const script = supplyKitScript('Wellesley')
    expect(script).toContain('Wellesley')
    expect(script).toContain('supply')
    expect(script).toContain('rate')
    expect(script).toContain('exit fee')
  })

  it('works with an empty town string (known edge case)', () => {
    const script = supplyKitScript('')
    expect(script).toContain('I am in ')
  })
})
