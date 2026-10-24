/**
 * @built F-148 the switch screen's server model — the verdict, re-read from the URL
 *
 * The URL remains the only state (F-106), so `/switch` parses the same query as
 * `/verdict` and recomputes the same numbers with the same price reader. This file
 * adds only what the switch decision needs: the supply options that exist at this
 * address, the dated fuel yardstick, the four choices, and the best-case rows.
 *
 * It computes nothing new. Every number comes from `lib/calc`, `lib/supply`,
 * `lib/utility` or the dated price envelope, so the switch screen cannot disagree
 * with the verdict it follows.
 */

import { computeVerdict, refusalFor } from '../calc'
import type { Fuel, VerdictResult } from '../calc/types'
import { queryString } from '../intake/params'
import type { PricePoint, Prices } from '../prices'
import { basicServiceRate, SUPPLY_LINKS, type BasicServiceRate } from '../supply'
import { SPONSOR_NAME, sponsorFromBill, type SponsorKey } from '../utility'
import { resolveVerdictInputs, type Raw, type VerdictInputs } from '../verdict/inputs'
import { bestCase, type BestCaseRow } from './best-case'
import { choicesFor, supplyChoiceAvailable } from './choices'
import type { SwitchChoice } from './types'


export interface SwitchSupply {
  /** Sponsor whose Basic Service number applies, when one sponsor owns the town. */
  sponsorLabel: string | null
  basic: BasicServiceRate | null
  /** False in a municipal light plant town: no supply choice to shop. */
  available: boolean
  /** Why supply is not on the table, when it is not. */
  unavailableReason: string | null
  aggregationUrl: string
  energySwitchUrl: string
}

export interface SwitchModel {
  /** False when the query cannot produce a verdict; the page renders a way back. */
  ready: boolean
  /** Plain reason the verdict is missing, safe to render. */
  refusalMessage: string | null
  query: string
  town: string
  fuel: Fuel | null
  annualUnits: number | null
  unitPrice: number | null
  tons: number | null
  sqft: number | null
  result: VerdictResult | null
  choices: SwitchChoice[]
  bestCase: BestCaseRow[]
  /** True when every row says stay or does not apply: "you're already on the best option". */
  alreadyBest: boolean
  supply: SwitchSupply
  noMassSave: boolean
  asksUtility: boolean
  utilityReason: string | null
  standardRate: number
  heatPumpRate: number
  seasonalApplied: boolean
  income: 'yes' | 'no' | 'unsure'
  /** Dated DOER yardstick for the household's own fuel, when there is one. */
  market: { price: number | null; period: string | null; source: string | null; point: PricePoint | null }
  prices: { mode: Prices['mode']; asOf: string }
}

/**
 * Build the screen model from the verdict query.
 * Guarantee: identical query + identical prices → identical model; a missing or
 * out-of-range input yields `ready: false` with a plain sentence, never a NaN.
 */
export function buildSwitchModel(
  params: Raw,
  prices: Prices,
  computed?: { inputs: VerdictInputs; result: VerdictResult | null },
): SwitchModel {
  const query = queryString(params)
  const claimedIncome = Array.isArray(params.inc) ? params.inc[0] : params.inc
  const inputs = computed?.inputs ?? resolveVerdictInputs(params, prices)
  const { fuel, units, unitPrice, sqft, billUtility, income, utility, standardRate, seasonal, heating, upgrade } = inputs
  const town = inputs.town.trim()

  const supplyAvailable = supplyChoiceAvailable({ verdict: null, fuel, utility, billUtility })

  const billSaysMunicipal = billUtility === 'municipal'
  const billSaysInvestorOwned = billUtility === 'eversource' || billUtility === 'national_grid' || billUtility === 'unitil'
  const noMassSave = billSaysMunicipal || utility.eligibleForMassSave === false
  const asksUtility = !billSaysMunicipal && !billSaysInvestorOwned && utility.eligibleForMassSave === null

  const sponsor: SponsorKey | null =
    sponsorFromBill(billUtility) ?? (utility.sponsors.length === 1 ? utility.sponsors[0] : null)
  const basic = sponsor ? basicServiceRate(sponsor) : null

  const supply: SwitchSupply = {
    sponsorLabel: sponsor ? SPONSOR_NAME[sponsor] : utility.sponsors.map((key) => SPONSOR_NAME[key]).join(' · ') || null,
    basic,
    available: supplyAvailable,
    unavailableReason: supplyAvailable
      ? null
      : billUtility === 'municipal' || (utility.found && utility.hasMunicipal)
        ? 'A municipal light plant supplies and delivers here, so there is no supply choice to shop.'
        : 'This address’s sponsor is not settled, so the supply comparison waits until it is.',
    aggregationUrl: SUPPLY_LINKS.municipalAggregation,
    energySwitchUrl: SUPPLY_LINKS.energySwitch,
  }

  const marketPoint =
    fuel === 'oil' ? prices.oil : fuel === 'propane' ? prices.propane : null

  if (!heating || !upgrade || !fuel || units === null || unitPrice === null) {
    return {
      ready: false,
      refusalMessage:
        'The switch screen needs a verdict first: a fuel, how much of it you burn in a year, what you pay, and the town.',
      query,
      town,
      fuel,
      annualUnits: units,
      unitPrice,
      tons: null,
      sqft,
      result: null,
      choices: [],
      bestCase: [],
      alreadyBest: false,
      supply,
      noMassSave,
      asksUtility,
      utilityReason: utility.reason,
      standardRate,
      heatPumpRate: seasonal.rate,
      seasonalApplied: seasonal.applied,
      income,
      market: {
        price: marketPoint?.usdPerUnit ?? null,
        period: marketPoint?.period ?? null,
        source: marketPoint ? `${marketPoint.source} · ${marketPoint.period}` : null,
        point: marketPoint,
      },
      prices: { mode: prices.mode, asOf: prices.asOf },
    }
  }

  const result = computed ? computed.result : computeVerdict(heating, upgrade)
  const refusal = result ? null : refusalFor(heating, upgrade)

  const rows = bestCase({
    result,
    fuel,
    unitPrice,
    marketPrice: marketPoint?.usdPerUnit ?? null,
    marketPeriod: marketPoint?.period ?? null,
    annualUnits: units,
    supplyAvailable,
    basicService: basic,
    sponsorLabel: supply.sponsorLabel,
    noMassSave,
    incomeEligible: claimedIncome === 'yes',
    seasonalApplied: seasonal.applied,
  })

  return {
    ready: result !== null,
    refusalMessage: refusal?.message ?? null,
    query,
    town: utility.found ? utility.town : town,
    fuel,
    annualUnits: units,
    unitPrice,
    tons: result?.tons ?? null,
    sqft,
    result,
    choices: result ? choicesFor({ verdict: result.verdict, fuel, utility, billUtility }) : [],
    bestCase: rows,
    alreadyBest: rows.every((row) => row.outcome === 'stay' || row.outcome === 'none'),
    supply,
    noMassSave,
    asksUtility,
    utilityReason: utility.reason,
    standardRate,
    heatPumpRate: seasonal.rate,
    seasonalApplied: seasonal.applied,
    income,
    market: {
      price: marketPoint?.usdPerUnit ?? null,
      period: marketPoint?.period ?? null,
      source: marketPoint ? `${marketPoint.source} · ${marketPoint.period}` : null,
      point: marketPoint,
    },
    prices: { mode: prices.mode, asOf: prices.asOf },
  }
}
