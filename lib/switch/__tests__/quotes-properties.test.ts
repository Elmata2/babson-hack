/**
 * @built F-121 P13–P16 — the quote ranking's four promises, as properties
 *
 * The design (§14) asks for four properties over `lib/switch/quotes.ts`. They are
 * the four ways a comparison screen can be wrong: order-dependent (a dealer sorts
 * differently on a second render), ranking something unbelievable, inventing money
 * out of fees, or handing the agent a price nobody said. Each one is checked over
 * generated quotes rather than three hand-picked rows.
 */

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { negotiationTarget } from '../../calls/negotiation'
import {
  effectivePerGal,
  OIL_BAND,
  plausibleFuelPrice,
  PROPANE_BAND,
  rankFuelQuotes,
  rankInstallerQuotes,
  type FuelQuote,
} from '../quotes'

const priceArb = fc.double({ min: 0.5, max: 12, noNaN: true, noDefaultInfinity: true })
const gallonsArb = fc.integer({ min: 50, max: 1_000 })

const quoteArb: fc.Arbitrary<FuelQuote> = fc.record({
  providerId: fc.stringMatching(/^[a-z0-9-]{2,8}$/),
  providerName: fc.string({ minLength: 1, maxLength: 20 }),
  fuel: fc.constantFrom('oil', 'propane') as fc.Arbitrary<FuelQuote['fuel']>,
  pricePerGal: fc.option(priceArb, { nil: null }),
  deliveryFee: fc.option(fc.double({ min: 0, max: 200, noNaN: true, noDefaultInfinity: true }), { nil: null }),
  minimumGallons: fc.option(fc.integer({ min: 50, max: 300 }), { nil: null }),
  cardSurchargePct: fc.option(fc.double({ min: 0, max: 5, noNaN: true, noDefaultInfinity: true }), { nil: null }),
  offer: fc.constantFrom('cash', 'prebuy', 'price_cap') as fc.Arbitrary<FuelQuote['offer']>,
  evidence: fc.option(fc.string(), { nil: null }),
  saidAt: fc.option(fc.constant('2026-10-24T15:00:00.000Z'), { nil: null }),
})

const usageArb = fc.record({
  annualGallons: fc.integer({ min: 100, max: 3_000 }),
  deliveryGallons: gallonsArb,
  paysByCard: fc.boolean(),
})

/** Ids must be unique or "the same input" is ambiguous; that is the caller's job. */
function withUniqueIds(quotes: FuelQuote[]): FuelQuote[] {
  return quotes.map((quote, index) => ({ ...quote, providerId: `p${index}`, providerName: `Provider ${index}` }))
}

describe('P13 — ranking is order-independent', () => {
  it('gives the same order for any permutation of the same quotes', () => {
    fc.assert(
      fc.property(fc.array(quoteArb, { minLength: 1, maxLength: 6 }), usageArb, (quotes, usage) => {
        const input = withUniqueIds(quotes)
        const forward = rankFuelQuotes(input, usage).map((row) => row.providerId)
        const backward = rankFuelQuotes([...input].reverse(), usage).map((row) => row.providerId)
        expect(backward).toEqual(forward)
      }),
      { numRuns: 60 },
    )
  })
})

describe('P14 — a quote that fails the plausibility gate never gets a rank', () => {
  it('leaves out-of-band prices unranked, with no annual cost', () => {
    fc.assert(
      fc.property(fc.array(quoteArb, { minLength: 1, maxLength: 6 }), usageArb, (quotes, usage) => {
        const rows = rankFuelQuotes(withUniqueIds(quotes), usage)
        for (const row of rows) {
          const plausible = plausibleFuelPrice(row.fuel, row.pricePerGal)
          if (row.status === 'ranked') expect(plausible).toBe(true)
          if (!plausible) {
            expect(row.annualCost).toBeNull()
            expect(row.effectivePerGal).toBeNull()
          }
        }
      }),
      { numRuns: 80 },
    )
  })

  it('keeps the band edges inside the gate and a cent outside out', () => {
    for (const [fuel, band] of [
      ['oil', OIL_BAND],
      ['propane', PROPANE_BAND],
    ] as const) {
      expect(plausibleFuelPrice(fuel, band.min)).toBe(true)
      expect(plausibleFuelPrice(fuel, band.max)).toBe(true)
      expect(plausibleFuelPrice(fuel, band.min - 0.01)).toBe(false)
      expect(plausibleFuelPrice(fuel, band.max + 0.01)).toBe(false)
    }
  })

  it('never ranks an installer outside $2,000–$12,000 a ton', () => {
    const rows = rankInstallerQuotes(
      [
        { providerId: 'a', providerName: 'A', usdPerTon: 1_999, evidence: null, saidAt: null },
        { providerId: 'b', providerName: 'B', usdPerTon: 4_400, evidence: 'said', saidAt: null },
        { providerId: 'c', providerName: 'C', usdPerTon: 12_001, evidence: null, saidAt: null },
      ],
      3,
    )
    expect(rows.filter((row) => row.status === 'ranked').map((row) => row.providerId)).toEqual(['b'])
  })
})

describe('P15 — fees and surcharges never make a price cheaper', () => {
  it('keeps effectivePerGal at or above the quoted price', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.01, max: 20, noNaN: true, noDefaultInfinity: true }),
        fc.option(fc.double({ min: 0, max: 500, noNaN: true, noDefaultInfinity: true }), { nil: null }),
        gallonsArb,
        fc.option(fc.integer({ min: 50, max: 500 }), { nil: null }),
        fc.option(fc.double({ min: 0, max: 10, noNaN: true, noDefaultInfinity: true }), { nil: null }),
        fc.boolean(),
        (price, fee, delivery, minimum, surcharge, paysByCard) => {
          const effective = effectivePerGal({
            pricePerGal: price,
            deliveryFee: fee,
            deliveryGallons: delivery,
            minimumGallons: minimum,
            cardSurchargePct: surcharge,
            paysByCard,
          })
          expect(effective).not.toBeNull()
          expect(effective as number).toBeGreaterThanOrEqual(price - 1e-9)
        },
      ),
      { numRuns: 120 },
    )
  })

  it('refuses a price or a delivery size that is not a positive number', () => {
    expect(effectivePerGal({ pricePerGal: 0, deliveryFee: null, deliveryGallons: 150 })).toBeNull()
    expect(effectivePerGal({ pricePerGal: 5, deliveryFee: null, deliveryGallons: 0 })).toBeNull()
  })
})

describe('P16 — the negotiation price always comes from a ranked quote', () => {
  it('cites the best ranked effective price, never an unverified one', () => {
    fc.assert(
      fc.property(fc.array(quoteArb, { minLength: 2, maxLength: 6 }), usageArb, (quotes, usage) => {
        const rows = rankFuelQuotes(withUniqueIds(quotes), usage)
        const target = negotiationTarget(rows)
        if (target === null) return
        const cited = rows.filter((row) => row.status === 'ranked').map((row) => row.effectivePerGal)
        expect(cited).toContain(target.price)
        expect(target.providerIds).not.toContain(rows[0]?.providerId)
      }),
      { numRuns: 80 },
    )
  })

  it('has no target with fewer than two ranked quotes', () => {
    const rows = rankFuelQuotes(
      withUniqueIds([
        {
          providerId: 'a',
          providerName: 'A',
          fuel: 'oil',
          pricePerGal: 5.5,
          deliveryFee: 0,
          minimumGallons: 150,
          cardSurchargePct: null,
          offer: 'cash',
          evidence: null,
          saidAt: null,
        },
        {
          providerId: 'b',
          providerName: 'B',
          fuel: 'oil',
          pricePerGal: 0.99,
          deliveryFee: 0,
          minimumGallons: 150,
          cardSurchargePct: null,
          offer: 'cash',
          evidence: null,
          saidAt: null,
        },
      ]),
      { annualGallons: 800, deliveryGallons: 150, paysByCard: false },
    )
    expect(negotiationTarget(rows)).toBeNull()
  })

  it('asks at most two providers, and never the one whose price it cites', () => {
    const rows = rankFuelQuotes(
      [
        {
          providerId: 'a',
          providerName: 'A',
          fuel: 'oil',
          pricePerGal: 5.5,
          deliveryFee: 0,
          minimumGallons: 150,
          cardSurchargePct: null,
          offer: 'cash',
          evidence: null,
          saidAt: null,
        },
        {
          providerId: 'b',
          providerName: 'B',
          fuel: 'oil',
          pricePerGal: 5.8,
          deliveryFee: 0,
          minimumGallons: 150,
          cardSurchargePct: null,
          offer: 'cash',
          evidence: null,
          saidAt: null,
        },
        {
          providerId: 'c',
          providerName: 'C',
          fuel: 'oil',
          pricePerGal: 0.99,
          deliveryFee: 0,
          minimumGallons: 150,
          cardSurchargePct: null,
          offer: 'cash',
          evidence: null,
          saidAt: null,
        },
      ],
      { annualGallons: 800, deliveryGallons: 150, paysByCard: false },
    )
    const target = negotiationTarget(rows)
    expect(target?.price).toBe(5.5)
    expect(target?.providerIds).toEqual(['c'])
  })
})
