/** @built F-145 tests for R20: the one comparable number, the gate, and the order */

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import {
  INSTALLER_BAND_PER_TON,
  effectivePerGal,
  plausibleFuelPrice,
  rankFuelQuotes,
  rankInstallerQuotes,
  versusAverage,
  type FuelQuote,
} from '../quotes'

const usage = { annualGallons: 800, deliveryGallons: 150, paysByCard: false }

function quote(overrides: Partial<FuelQuote> = {}): FuelQuote {
  return {
    providerId: 'a',
    providerName: 'Dealer A',
    fuel: 'oil',
    pricePerGal: 6.0,
    deliveryFee: 60,
    minimumGallons: null,
    cardSurchargePct: null,
    offer: 'cash',
    evidence: null,
    saidAt: null,
    ...overrides,
  }
}

describe('effectivePerGal', () => {
  it('adds the delivery fee over the delivery size', () => {
    expect(effectivePerGal({ pricePerGal: 6, deliveryFee: 60, deliveryGallons: 150 })).toBeCloseTo(6.4, 10)
  })
  it('spreads the fee over the dealer minimum when it is higher', () => {
    expect(
      effectivePerGal({ pricePerGal: 6, deliveryFee: 60, deliveryGallons: 150, minimumGallons: 300 }),
    ).toBeCloseTo(6.2, 10)
  })
  it('adds a card surcharge only when paying by card', () => {
    const card = effectivePerGal({
      pricePerGal: 6,
      deliveryFee: 60,
      deliveryGallons: 150,
      cardSurchargePct: 3,
      paysByCard: true,
    })
    expect(card).toBeCloseTo(6.58, 10)
    expect(
      effectivePerGal({ pricePerGal: 6, deliveryFee: 60, deliveryGallons: 150, cardSurchargePct: 3 }),
    ).toBeCloseTo(6.4, 10)
  })
  it('refuses a zero delivery size or price', () => {
    expect(effectivePerGal({ pricePerGal: 6, deliveryFee: 60, deliveryGallons: 0 })).toBeNull()
    expect(effectivePerGal({ pricePerGal: 0, deliveryFee: 60, deliveryGallons: 150 })).toBeNull()
  })
  it('never returns less than the price', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.01, max: 20, noNaN: true }),
        fc.double({ min: 0, max: 500, noNaN: true }),
        fc.double({ min: 1, max: 1000, noNaN: true }),
        (price, fee, gallons) => {
          const result = effectivePerGal({ pricePerGal: price, deliveryFee: fee, deliveryGallons: gallons })
          expect(result).not.toBeNull()
          expect(result as number).toBeGreaterThanOrEqual(price - 1e-9)
        },
      ),
    )
  })
})

describe('plausibleFuelPrice', () => {
  it('uses the R20.3 bands', () => {
    expect(plausibleFuelPrice('oil', 4.5)).toBe(true)
    expect(plausibleFuelPrice('oil', 8.5)).toBe(true)
    expect(plausibleFuelPrice('oil', 4.49)).toBe(false)
    expect(plausibleFuelPrice('propane', 6.01)).toBe(false)
    expect(plausibleFuelPrice('propane', 2.0)).toBe(true)
    expect(plausibleFuelPrice('oil', null)).toBe(false)
  })
})

describe('rankFuelQuotes', () => {
  it('ranks by annual cost at the household usage', () => {
    const ranked = rankFuelQuotes(
      [
        quote({ providerId: 'a', providerName: 'A', pricePerGal: 6.4, deliveryFee: 0 }),
        quote({ providerId: 'b', providerName: 'B', pricePerGal: 5.9, deliveryFee: 60 }),
        quote({ providerId: 'c', providerName: 'C', pricePerGal: 6.2, deliveryFee: 0 }),
      ],
      usage,
    )
    expect(ranked.map((row) => row.providerId)).toEqual(['c', 'b', 'a'])
    expect(ranked[0].annualCost).toBeCloseTo(6.2 * 800, 6)
  })

  it('flags a dealer whose minimum is above the delivery size and ranks at the minimum', () => {
    const ranked = rankFuelQuotes(
      [quote({ pricePerGal: 6, deliveryFee: 60, minimumGallons: 300 })],
      usage,
    )
    expect(ranked[0].note).toContain('Minimum delivery is 300 gal')
    expect(ranked[0].effectivePerGal).toBeCloseTo(6.2, 10)
  })

  it('shows prebuy and price-cap offers but never ranks them', () => {
    const ranked = rankFuelQuotes(
      [quote({ offer: 'prebuy', pricePerGal: 5.5 }), quote({ offer: 'price_cap', pricePerGal: 5.8 })],
      usage,
    )
    expect(ranked.every((row) => row.status === 'not_ranked')).toBe(true)
    expect(ranked.every((row) => row.annualCost === null)).toBe(true)
  })

  it('shows an out-of-band price as unverified with no annual cost', () => {
    const ranked = rankFuelQuotes([quote({ pricePerGal: 0.99 })], usage)
    expect(ranked[0].status).toBe('unverified')
    expect(ranked[0].annualCost).toBeNull()
    expect(ranked[0].note).toContain('Outside the plausible band')
  })

  it('puts ranked rows first, then unverified, then never-ranked offers', () => {
    const ranked = rankFuelQuotes(
      [
        quote({ providerId: 'cap', offer: 'price_cap', pricePerGal: 5.9 }),
        quote({ providerId: 'bad', pricePerGal: 199 }),
        quote({ providerId: 'good', pricePerGal: 6.1 }),
      ],
      usage,
    )
    expect(ranked.map((row) => row.status)).toEqual(['ranked', 'unverified', 'not_ranked'])
  })
})

describe('rankInstallerQuotes', () => {
  it('ranks by total install at the calculated tons', () => {
    const ranked = rankInstallerQuotes(
      [
        { providerId: 'a', providerName: 'A', usdPerTon: 5_000, evidence: null, saidAt: null },
        { providerId: 'b', providerName: 'B', usdPerTon: 4_000, evidence: null, saidAt: null },
      ],
      4,
    )
    expect(ranked[0].providerId).toBe('b')
    expect(ranked[0].totalInstall).toBe(16_000)
  })

  it('gates an out-of-band per-ton number as unverified', () => {
    const ranked = rankInstallerQuotes(
      [{ providerId: 'a', providerName: 'A', usdPerTon: INSTALLER_BAND_PER_TON.max + 1, evidence: null, saidAt: null }],
      4,
    )
    expect(ranked[0].status).toBe('unverified')
    expect(ranked[0].totalInstall).toBeNull()
  })
})

describe('versusAverage', () => {
  it('is signed and annualised', () => {
    expect(versusAverage({ effectivePerGal: 5.82, averagePerGal: 6.23, annualGallons: 800 })).toEqual({
      perGal: expect.closeTo(-0.41, 10),
      annual: expect.closeTo(-328, 6),
    })
  })
  it('returns null rather than dividing by a zero average', () => {
    expect(versusAverage({ effectivePerGal: 6, averagePerGal: 0, annualGallons: 800 })).toBeNull()
  })
})
