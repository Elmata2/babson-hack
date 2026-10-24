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
import type { Fuel, Tier, VerdictResult } from '../calc/types'
import { hdd65ForTown } from '../geo'
import { plausibleElectricRate, queryString } from '../intake/params'
import type { BillUtility } from '../parse/contract'
import type { PricePoint, Prices } from '../prices'
import { basicServiceRate, SUPPLY_LINKS, type BasicServiceRate } from '../supply'
import { resolveUtility, seasonalHeatPumpRate, SPONSOR_NAME, type SponsorKey } from '../utility'
import { bestCase, type BestCaseRow } from './best-case'
import { choicesFor, supplyChoiceAvailable } from './choices'
import type { SwitchChoice } from './types'

export type Raw = Record<string, string | string[] | undefined>

const FUELS: readonly Fuel[] = ['oil', 'propane', 'gas', 'resistance']
const TIERS: readonly Tier[] = ['whole', 'partial', 'basic', 'enhanced']
const BILL_UTILITIES: readonly BillUtility[] = [
  'eversource',
  'national_grid',
  'unitil',
  'liberty',
  'berkshire_gas',
  'municipal',
  'oil_dealer',
  'propane_dealer',
  'other',
]

const BILL_TO_SPONSOR: Partial<Record<BillUtility, SponsorKey>> = {
  eversource: 'eversource',
  national_grid: 'nationalgrid',
  unitil: 'unitil',
  municipal: 'municipal',
}

function first(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function number(value: string | string[] | undefined): number | null {
  const raw = first(value)
  if (raw === null || raw.trim() === '') return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

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
export function buildSwitchModel(params: Raw, prices: Prices): SwitchModel {
  const query = queryString(params)
  const fuel = FUELS.find((candidate) => candidate === first(params.fuel)) ?? null
  const tier = TIERS.find((candidate) => candidate === first(params.tier)) ?? null
  const yearRaw = first(params.year)
  const installYear: 2026 | 2027 | null = yearRaw === '2027' ? 2027 : yearRaw === '2026' ? 2026 : null
  const town = (first(params.town) ?? '').trim()
  const units = number(params.units)
  const unitPrice = number(params.price)
  const yearBuilt = number(params.yb)
  const sqft = number(params.sqft)
  const billUtility = BILL_UTILITIES.find((candidate) => candidate === first(params.ut)) ?? null
  const incomeRaw = first(params.inc)
  const income: SwitchModel['income'] = incomeRaw === 'yes' || incomeRaw === 'no' ? incomeRaw : 'unsure'

  const utility = resolveUtility(town)
  const billRate = plausibleElectricRate(first(params.er))
  const standardRate = billRate ?? prices.elec.usdPerUnit
  const seasonal = seasonalHeatPumpRate(standardRate, town)
  const hdd65 = hdd65ForTown(town) ?? undefined

  const supplyAvailable = supplyChoiceAvailable({ verdict: null, fuel, utility, billUtility })

  const billSaysMunicipal = billUtility === 'municipal'
  const billSaysInvestorOwned = ['eversource', 'national_grid', 'unitil'].includes(billUtility ?? '')
  const noMassSave = billSaysMunicipal || utility.eligibleForMassSave === false
  const asksUtility = !billSaysMunicipal && !billSaysInvestorOwned && utility.eligibleForMassSave === null

  const sponsor: SponsorKey | null =
    billUtility !== null && BILL_TO_SPONSOR[billUtility]
      ? (BILL_TO_SPONSOR[billUtility] as SponsorKey)
      : utility.sponsors.length === 1
        ? utility.sponsors[0]
        : null
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

  if (!fuel || !tier || !installYear || units === null || unitPrice === null || town === '') {
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

  const heating = {
    fuel,
    annualUnits: units,
    unitPrice,
    yearBuilt: yearBuilt ?? undefined,
    sqft: sqft ?? undefined,
    hdd65,
  }
  const upgrade = {
    tier,
    installYear,
    heatPumpRate: seasonal.rate,
    standardRate,
  }

  const result = computeVerdict(heating, upgrade)
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
    incomeEligible: income === 'yes',
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
