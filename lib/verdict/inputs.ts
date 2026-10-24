import { DEFAULT_INSTALL_COST_USD } from '../calc/constants'
import type { Fuel, HeatingInput, Tier, UpgradeInput } from '../calc/types'
import { hdd65ForTown } from '../geo'
import {
  bonusOn,
  defaultInstallYear,
  parseBillUtility,
  plausibleElectricRate,
  plausibleInstallCost,
  questionsFor,
  type Income,
} from '../intake/params'
import type { BillUtility } from '../parse/contract'
import type { Prices } from '../prices'
import { resolveUtility, seasonalHeatPumpRate, sponsorFromBill, type UtilityResolution } from '../utility'


export type Raw = Record<string, string | string[] | undefined>

const FUELS: readonly Fuel[] = ['oil', 'propane', 'gas', 'resistance']
const TIERS: readonly Tier[] = ['whole', 'partial', 'basic', 'enhanced']

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

function installYearFor(raw: string | null): 2026 | 2027 | null {
  if (raw === null || raw.trim() === '') return defaultInstallYear() === '2027' ? 2027 : 2026
  return raw === '2027' ? 2027 : raw === '2026' ? 2026 : null
}

export interface VerdictInputs {
  fuel: Fuel | null
  tier: Tier | null
  installYear: 2026 | 2027 | null
  town: string
  units: number | null
  unitPrice: number | null
  yearBuilt: number | null
  sqft: number | null
  quote: number | null
  income: Income
  billUtility: BillUtility | null
  billRate: number | null
  standardRate: number
  seasonal: ReturnType<typeof seasonalHeatPumpRate>
  utility: UtilityResolution
  /** Null until the query carries a fuel, tier, install year, units, price and town. */
  heating: HeatingInput | null
  upgrade: UpgradeInput | null
}

function parseQuery(params: Raw) {
  const fuel = FUELS.find((candidate) => candidate === first(params.fuel)) ?? null
  const tier = TIERS.find((candidate) => candidate === first(params.tier)) ?? null
  const installYear = installYearFor(first(params.year))
  const town = first(params.town) ?? ''
  const units = number(params.units)
  const unitPrice = number(params.price)
  const complete = fuel !== null && tier !== null && installYear !== null && units !== null && unitPrice !== null && town !== ''
  return { fuel, tier, installYear, town, units, unitPrice, complete }
}

/** True when the query carries a fuel, tier, install year, units, price and town. No price fetch needed. */
export function isVerdictQueryComplete(params: Raw): boolean {
  return parseQuery(params).complete
}

/**
 * Everything `computeVerdict` needs, read from the verdict query.
 * Guarantee: `/verdict` and `/switch` call this with the same query and prices, so
 * they compute from identical inputs.
 */
export function resolveVerdictInputs(params: Raw, prices: Prices): VerdictInputs {
  const { fuel, tier, installYear, town, units, unitPrice } = parseQuery(params)
  const yearBuilt = number(params.yb)
  const sqft = number(params.sqft)
  const billRate = plausibleElectricRate(first(params.er))
  const standardRate = billRate ?? prices.elec.usdPerUnit
  const billUtility = parseBillUtility(first(params.ut))
  const seasonal = seasonalHeatPumpRate(standardRate, town, sponsorFromBill(billUtility))
  const quote = plausibleInstallCost(first(params.ic))
  const { income } = questionsFor(tier, first(params.inc))

  const complete = fuel && tier && installYear && units !== null && unitPrice !== null && town !== ''

  return {
    fuel,
    tier,
    installYear,
    town,
    units,
    unitPrice,
    yearBuilt,
    sqft,
    quote,
    income,
    billUtility,
    billRate,
    standardRate,
    seasonal,
    utility: resolveUtility(town),
    heating: complete
      ? {
          fuel,
          annualUnits: units,
          unitPrice,
          yearBuilt: yearBuilt ?? undefined,
          sqft: sqft ?? undefined,
          hdd65: hdd65ForTown(town) ?? undefined,
        }
      : null,
    upgrade: complete
      ? {
          tier,
          installYear,
          installCost: quote ?? DEFAULT_INSTALL_COST_USD,
          weatherizationBonus: bonusOn(params, 'wz'),
          sizingBonus: bonusOn(params, 'sz'),
          heatPumpRate: seasonal.rate,
          standardRate,
        }
      : null,
  }
}
