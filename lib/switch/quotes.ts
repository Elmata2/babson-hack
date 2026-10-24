/**
 * @built F-145 quote arithmetic and ranking — R20, pure and property-testable
 *
 * The model extracts a number from a call; this file decides whether that number
 * is believable and what it costs at the household's usage. Nothing here reads the
 * clock, the network or the environment, so a rank is reproducible from the same
 * quotes and the same usage.
 *
 * Ranked: cash/COD price. Never ranked: prebuy and price-cap offers (a bet on the
 * winter, not a price), out-of-band numbers (`unverified`), and a dealer whose
 * minimum is above the delivery size is ranked at that minimum and flagged.
 */

export type FuelKind = 'oil' | 'propane'

export interface FuelQuote {
  providerId: string
  providerName: string
  fuel: FuelKind
  /** One number per offer: the price at the pump, before fees. */
  pricePerGal: number | null
  deliveryFee: number | null
  minimumGallons: number | null
  cardSurchargePct: number | null
  offer: 'cash' | 'prebuy' | 'price_cap'
  /** The sentence the provider said, for the drawer. */
  evidence: string | null
  /** ISO instant of the call. */
  saidAt: string | null
}

export type QuoteStatus = 'ranked' | 'unverified' | 'not_ranked'

export interface RankedFuelQuote extends FuelQuote {
  effectivePerGal: number | null
  /** Annual cost at the household's usage; null when the quote cannot be ranked. */
  annualCost: number | null
  status: QuoteStatus
  /** Why it is not ranked, or the minimum-delivery flag. */
  note: string | null
}

/** R20.3 plausibility bands. Out of range is shown, never ranked. */
export const OIL_BAND = { min: 4.5, max: 8.5 } as const
export const PROPANE_BAND = { min: 2.0, max: 6.0 } as const
export const INSTALLER_BAND_PER_TON = { min: 2_000, max: 12_000 } as const

export function bandFor(fuel: FuelKind): { min: number; max: number } {
  return fuel === 'oil' ? OIL_BAND : PROPANE_BAND
}

/** Card surcharge, in dollars per gallon, when the household pays by card. */
export function cardSurchargeUsd(pricePerGal: number, surchargePct: number | null): number {
  if (surchargePct === null || !Number.isFinite(surchargePct) || surchargePct <= 0) return 0
  return (pricePerGal * surchargePct) / 100
}

/**
 * R20.2: `pricePerGal + deliveryFee / deliveryGallons` (+ card surcharge).
 * `deliveryGallons` is the household's delivery size, raised to the dealer's
 * minimum when that minimum is larger.
 */
export function effectivePerGal(input: {
  pricePerGal: number
  deliveryFee: number | null
  deliveryGallons: number
  minimumGallons?: number | null
  cardSurchargePct?: number | null
  paysByCard?: boolean
}): number | null {
  const { pricePerGal, deliveryFee, deliveryGallons } = input
  if (!Number.isFinite(pricePerGal) || pricePerGal <= 0) return null
  if (!Number.isFinite(deliveryGallons) || deliveryGallons <= 0) return null
  const minimum = input.minimumGallons ?? null
  const denominator = Math.max(deliveryGallons, Number.isFinite(minimum) && (minimum as number) > 0 ? (minimum as number) : 0)
  const fee = Number.isFinite(deliveryFee) && (deliveryFee as number) > 0 ? (deliveryFee as number) : 0
  const surcharge = input.paysByCard ? cardSurchargeUsd(pricePerGal, input.cardSurchargePct ?? null) : 0
  return pricePerGal + fee / denominator + surcharge
}

export function plausibleFuelPrice(fuel: FuelKind, pricePerGal: number | null): boolean {
  if (pricePerGal === null || !Number.isFinite(pricePerGal)) return false
  const band = bandFor(fuel)
  return pricePerGal >= band.min && pricePerGal <= band.max
}

/**
 * Rank one set of fuel quotes at the household's usage.
 * Guarantee: the returned array is stable (annual cost ascending among ranked
 * rows, then unverified, then the offers that are never ranked), and a quote whose
 * price is null or outside the band never receives an `annualCost`.
 */
export function rankFuelQuotes(
  quotes: readonly FuelQuote[],
  usage: { annualGallons: number; deliveryGallons: number; paysByCard: boolean },
): RankedFuelQuote[] {
  const ranked = quotes.map((quote): RankedFuelQuote => {
    if (quote.offer !== 'cash') {
      return {
        ...quote,
        effectivePerGal: null,
        annualCost: null,
        status: 'not_ranked',
        note:
          quote.offer === 'prebuy'
            ? 'Prebuy is a bet on the winter, not a price. Shown, never ranked.'
            : 'A price cap is a term, not a price. Shown, never ranked.',
      }
    }
    if (!plausibleFuelPrice(quote.fuel, quote.pricePerGal) || quote.pricePerGal === null) {
      const band = bandFor(quote.fuel)
      return {
        ...quote,
        effectivePerGal: null,
        annualCost: null,
        status: 'unverified',
        note: `Outside the plausible band ($${band.min.toFixed(2)}–$${band.max.toFixed(2)}/gal). Shown, never ranked.`,
      }
    }

    const minimumAboveDelivery =
      quote.minimumGallons !== null &&
      Number.isFinite(quote.minimumGallons) &&
      quote.minimumGallons > usage.deliveryGallons

    const perGal = effectivePerGal({
      pricePerGal: quote.pricePerGal,
      deliveryFee: quote.deliveryFee,
      deliveryGallons: usage.deliveryGallons,
      minimumGallons: quote.minimumGallons,
      cardSurchargePct: quote.cardSurchargePct,
      paysByCard: usage.paysByCard,
    })
    if (perGal === null) {
      return { ...quote, effectivePerGal: null, annualCost: null, status: 'unverified', note: 'No usable price.' }
    }

    return {
      ...quote,
      effectivePerGal: perGal,
      annualCost: perGal * usage.annualGallons,
      status: 'ranked',
      note: minimumAboveDelivery
        ? `Minimum delivery is ${quote.minimumGallons} gal, above your ${usage.deliveryGallons} gal, so the fee is spread over the minimum.`
        : null,
    }
  })

  const order: Record<QuoteStatus, number> = { ranked: 0, unverified: 1, not_ranked: 2 }
  return ranked.sort((a, b) => {
    if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status]
    if (a.annualCost === null || b.annualCost === null) return a.providerName.localeCompare(b.providerName)
    return a.annualCost - b.annualCost
  })
}

export interface InstallerQuote {
  providerId: string
  providerName: string
  usdPerTon: number | null
  evidence: string | null
  saidAt: string | null
}

export interface RankedInstallerQuote extends InstallerQuote {
  totalInstall: number | null
  status: 'ranked' | 'unverified'
  note: string | null
}

/** R20.3: installers are gated at $2,000–$12,000 per ton and ranked by total. */
export function rankInstallerQuotes(quotes: readonly InstallerQuote[], tons: number): RankedInstallerQuote[] {
  const ranked = quotes.map((quote): RankedInstallerQuote => {
    const perTon = quote.usdPerTon
    if (
      perTon === null ||
      !Number.isFinite(perTon) ||
      perTon < INSTALLER_BAND_PER_TON.min ||
      perTon > INSTALLER_BAND_PER_TON.max
    ) {
      return {
        ...quote,
        totalInstall: null,
        status: 'unverified',
        note: `Outside the plausible band ($${INSTALLER_BAND_PER_TON.min.toLocaleString('en-US')}–$${INSTALLER_BAND_PER_TON.max.toLocaleString('en-US')}/ton). Shown, never ranked.`,
      }
    }
    return {
      ...quote,
      totalInstall: perTon * tons,
      status: 'ranked',
      note: 'Ballpark, not a quote. A site visit sets the real number.',
    }
  })

  return ranked.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'ranked' ? -1 : 1
    if (a.totalInstall === null || b.totalInstall === null) return a.providerName.localeCompare(b.providerName)
    return a.totalInstall - b.totalInstall
  })
}

/**
 * R20.6: the comparison against the DOER statewide average, in dollars per gallon
 * and dollars a year at this household's volume. Negative means cheaper.
 */
export function versusAverage(input: {
  effectivePerGal: number
  averagePerGal: number
  annualGallons: number
}): { perGal: number; annual: number } | null {
  const { effectivePerGal: price, averagePerGal: average, annualGallons } = input
  if (!Number.isFinite(price) || !Number.isFinite(average) || average <= 0) return null
  if (!Number.isFinite(annualGallons) || annualGallons <= 0) return null
  const perGal = price - average
  return { perGal, annual: perGal * annualGallons }
}
