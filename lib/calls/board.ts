/**
 * @built F-127 sorting a call board — one comparable number per row, and the flags
 * @built F-128 the price that can be written back into the verdict
 *
 * Ranking is not new work: `lib/switch/quotes.ts` already decides what is ranked,
 * what is `unverified` and what is never ranked at all, and it is property-tested.
 * This module only moves a wire quote (evidence-shaped, every field nullable) into
 * that vocabulary and adds the two things the board needs and the table does not:
 * the DOER yardstick sentence (R20.6) and the "use this price" candidate (R20.7).
 */

import {
  rankFuelQuotes,
  rankInstallerQuotes,
  versusAverage,
  type FuelQuote,
  type InstallerQuote,
  type RankedFuelQuote,
  type RankedInstallerQuote,
} from '../switch/quotes'
import type { CallRecord, FuelQuoteWire, InstallerQuoteWire } from './types'
import { negotiationTarget, type NegotiationTarget } from './negotiation'

export interface BoardUsage {
  /** The household's own yearly gallons for oil or propane. Null: no annual cost is shown. */
  annualGallons: number | null
  /** R18.1's delivery size, which the fee is spread over. */
  deliveryGallons: number
  /** True when the household said it pays by card, so the surcharge applies. */
  paysByCard: boolean
  /** Estimated tons, for an installer row's total. Null: only $/ton is shown. */
  tons: number | null
  /** The DOER statewide average for this fuel, when a dated reading exists. */
  averagePerGal: number | null
}

export interface BoardBest {
  kind: 'fuel' | 'installer'
  providerId: string
  providerName: string
  /** One comparable number: annual cost at this usage, or total install. */
  figure: number | null
  /** $/gal effective, or $/ton for an installer. */
  unit: number | null
  versusAverage: { perGal: number; annual: number } | null
}

export interface CallBoard {
  records: CallRecord[]
  fuel: RankedFuelQuote[]
  installers: RankedInstallerQuote[]
  best: BoardBest | null
  negotiation: NegotiationTarget | null
  /** Providers who asked to be the one calling back (R18.4). */
  callbacks: string[]
  /** True when nothing is still ringing or talking. */
  complete: boolean
}

/** A wire quote is only rankable when it answers the cash price; a cap is a term. */
export function fuelQuoteFrom(wire: FuelQuoteWire, providerName: string, saidAt: string | null = null): FuelQuote {
  const cash = wire.pricePerGal.value
  const cap = wire.priceCapPerGal.value
  const offer: FuelQuote['offer'] = cash !== null ? 'cash' : cap !== null ? 'prebuy' : 'cash'
  return {
    providerId: wire.providerId,
    providerName,
    fuel: 'oil',
    pricePerGal: cash,
    deliveryFee: wire.deliveryFee.value,
    minimumGallons: wire.minGallons.value,
    cardSurchargePct: wire.cardSurchargePct.value,
    offer,
    evidence: wire.pricePerGal.evidence ?? wire.priceCapPerGal.evidence,
    saidAt,
  }
}

export function installerQuoteFrom(wire: InstallerQuoteWire, providerName: string, saidAt: string | null = null): InstallerQuote {
  return {
    providerId: wire.providerId,
    providerName,
    usdPerTon: wire.ballparkPerTon.value,
    evidence: wire.ballparkPerTon.evidence,
    saidAt,
  }
}

const ACTIVE: readonly string[] = ['queued', 'ringing', 'in_progress']

/**
 * Assemble the board.
 * Guarantee: `best` is the first ranked row of its vertical (never an unverified
 * row), `callbacks` lists only providers who finished a call, and a quote with no
 * annual volume is ranked but shows `figure: null` rather than a fabricated total.
 */
export function buildBoard(records: readonly CallRecord[], usage: BoardUsage): CallBoard {
  const fuelQuotes: FuelQuote[] = []
  const installerQuotes: InstallerQuote[] = []

  for (const record of records) {
    const quote = record.quote
    if (!quote) continue
    if (quote.vertical === 'fuel') fuelQuotes.push(fuelQuoteFrom(quote, record.providerName, record.at))
    else installerQuotes.push(installerQuoteFrom(quote, record.providerName, record.at))
  }

  const gallons = usage.annualGallons
  const fuel = rankFuelQuotes(fuelQuotes, {
    annualGallons: gallons ?? 1,
    deliveryGallons: usage.deliveryGallons,
    paysByCard: usage.paysByCard,
  }).map((row) => (gallons === null ? { ...row, annualCost: null } : row))

  const installers = rankInstallerQuotes(installerQuotes, usage.tons ?? 1).map((row) =>
    usage.tons === null ? { ...row, totalInstall: null } : row,
  )

  const bestFuel = fuel.find((row) => row.status === 'ranked' && row.effectivePerGal !== null)
  const bestInstaller = installers.find((row) => row.status === 'ranked' && row.usdPerTon !== null)

  const best: BoardBest | null = bestFuel
    ? {
        kind: 'fuel',
        providerId: bestFuel.providerId,
        providerName: bestFuel.providerName,
        figure: bestFuel.annualCost,
        unit: bestFuel.effectivePerGal,
        versusAverage:
          bestFuel.effectivePerGal !== null && usage.averagePerGal !== null && gallons !== null
            ? versusAverage({
                effectivePerGal: bestFuel.effectivePerGal,
                averagePerGal: usage.averagePerGal,
                annualGallons: gallons,
              })
            : null,
      }
    : bestInstaller
      ? {
          kind: 'installer',
          providerId: bestInstaller.providerId,
          providerName: bestInstaller.providerName,
          figure: bestInstaller.totalInstall,
          unit: bestInstaller.usdPerTon,
          versusAverage: null,
        }
      : null

  return {
    records: [...records],
    fuel,
    installers,
    best,
    negotiation: negotiationTarget(fuel),
    callbacks: records.filter((record) => record.needsCallback).map((record) => record.providerName),
    complete: records.every((record) => !ACTIVE.includes(record.status)),
  }
}
