/**
 * @built F-105 plain-question rebate tier + install-year default
 * @built F-143 the install cost in the link: a plausible `ic`, and one pure
 * function that sets or clears it without disturbing any other input
 * @built F-106 verdict round-trip — the form and the verdict speak one query string
 *
 * The URL is the only state this app has, so "Change the numbers" has to hand
 * the exact query back to /start and /start has to read all of it. Everything
 * here is pure so both pages and the tests share one definition.
 */
import { DEFAULT_INSTALL_COST_USD } from '../calc/constants'
import type { AnnualMethod, BillFuel } from '../parse/types'
import type { BillUtility } from '../parse/contract'

export type Scope = 'whole' | 'partial'
export type Income = 'yes' | 'no' | 'unsure'
export type TierValue = 'whole' | 'partial' | 'basic' | 'enhanced'

/** Mass Save's enhanced tier is closed to gas homes, so "yes" only upgrades these. */
const ENHANCED_FUELS: readonly BillFuel[] = ['oil', 'propane', 'resistance']

/**
 * Map the two plain questions to the calculator's tier.
 * Not sure → standard tier: we never promise a rebate on a guess.
 */
export function tierFor(scope: Scope, income: Income, fuel: BillFuel): TierValue {
  if (income === 'yes' && ENHANCED_FUELS.includes(fuel)) return 'enhanced'
  return scope
}

/** Inverse, for hydrating the questions from a saved tier. */
export function questionsFor(tier: string | null, income: string | null): { scope: Scope; income: Income } {
  const scope: Scope = tier === 'partial' ? 'partial' : 'whole'
  const inc: Income = income === 'yes' || income === 'no' || income === 'unsure' ? income : tier === 'enhanced' ? 'yes' : 'unsure'
  return { scope, income: inc }
}

/** 2026 now; 2027 once the calendar says so. The 2027 toggle stays available. */
export function defaultInstallYear(now: Date = new Date()): '2026' | '2027' {
  return now.getUTCFullYear() >= 2027 ? '2027' : '2026'
}

/** A household $/kWh outside this band is a misread, not a rate. */
export const ELECTRIC_RATE_MIN = 0.1
export const ELECTRIC_RATE_MAX = 0.6

export function plausibleElectricRate(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === '') return null
  const value = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(value) && value >= ELECTRIC_RATE_MIN && value <= ELECTRIC_RATE_MAX ? value : null
}

/**
 * The install cost the engine will accept (`MAX_INSTALL_COST_USD`). A cost is
 * typed by the household, not read off a bill, so the band only has to catch a
 * slipped zero — the engine's own ceiling is the bound, so nothing the engine
 * would compute is silently dropped on the way back from `/verdict`.
 */
export const INSTALL_COST_MIN = 1_000
export const INSTALL_COST_MAX = 250_000

export function plausibleInstallCost(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === '') return null
  const value = typeof raw === 'number' ? raw : Number(String(raw).replace(/,/g, ''))
  return Number.isFinite(value) && value >= INSTALL_COST_MIN && value <= INSTALL_COST_MAX ? value : null
}

const METHODS: readonly AnnualMethod[] = ['printed_history', 'degree_days', 'tank_cadence', 'hdd_scaled', 'monthly_x12']
const UTILITIES: readonly BillUtility[] = [
  'eversource', 'national_grid', 'unitil', 'liberty', 'berkshire_gas', 'municipal', 'oil_dealer', 'propane_dealer', 'other',
]
const FUELS: readonly BillFuel[] = ['oil', 'propane', 'gas', 'resistance']
export const NOTE_MAX = 160

/** Everything the form carries to /verdict. All strings, as typed. */
export interface IntakeValues {
  fuel: BillFuel
  units: string
  price: string
  town: string
  tier: TierValue
  income: Income
  year: '2026' | '2027'
  yearBuilt: string
  sqft: string
  src: 'assessor' | 'manual' | null
  /** Residential units in the building when sqft was divided down. */
  buildingUnits: number | null
  method: AnnualMethod | null
  methodConfidence: number | null
  note: string
  utility: BillUtility | null
  electricRate: string
  lowIncome: boolean | null
  /** A contractor quote, if the household has one. Blank means the Mass Save average. */
  installCost: string
}

export function toQuery(v: IntakeValues): URLSearchParams {
  const p = new URLSearchParams({
    fuel: v.fuel,
    units: v.units.trim().replace(/,/g, ''),
    price: v.price.trim().replace(/,/g, ''),
    town: v.town,
    tier: v.tier,
    year: v.year,
    inc: v.income,
  })
  if (v.yearBuilt.trim()) p.set('yb', v.yearBuilt.trim())
  if (v.sqft.trim()) p.set('sqft', v.sqft.trim().replace(/,/g, ''))
  if (v.src) p.set('src', v.src)
  if (v.buildingUnits && v.buildingUnits > 1) p.set('bu', String(v.buildingUnits))
  if (v.method) p.set('m', v.method)
  if (v.methodConfidence !== null) p.set('mc', String(Math.round(v.methodConfidence * 100) / 100))
  if (v.note.trim()) p.set('mn', v.note.trim().slice(0, NOTE_MAX))
  if (v.utility) p.set('ut', v.utility)
  if (plausibleElectricRate(v.electricRate) !== null) p.set('er', v.electricRate.trim())
  if (v.lowIncome !== null) p.set('li', v.lowIncome ? '1' : '0')
  const cost = plausibleInstallCost(v.installCost)
  if (cost !== null) p.set('ic', String(cost))
  return p
}

type Raw = Record<string, string | string[] | undefined>
const one = (r: Raw, k: string): string | null => {
  const v = r[k]
  return (Array.isArray(v) ? v[0] : v) ?? null
}

/** Read a query back into form values. Unknown or out-of-range values drop to the default. */
export function fromSearchParams(r: Raw): Partial<IntakeValues> {
  const out: Partial<IntakeValues> = {}
  const fuel = FUELS.find((f) => f === one(r, 'fuel'))
  if (fuel) out.fuel = fuel
  const units = one(r, 'units')
  if (units) out.units = units
  const price = one(r, 'price')
  if (price) out.price = price
  const town = one(r, 'town')
  if (town) out.town = town
  const tier = one(r, 'tier')
  if (tier === 'whole' || tier === 'partial' || tier === 'basic' || tier === 'enhanced') out.tier = tier
  const year = one(r, 'year')
  if (year === '2026' || year === '2027') out.year = year
  const inc = one(r, 'inc')
  if (inc === 'yes' || inc === 'no' || inc === 'unsure') out.income = inc
  const yb = one(r, 'yb')
  if (yb) out.yearBuilt = yb
  const sqft = one(r, 'sqft')
  if (sqft) out.sqft = sqft
  const src = one(r, 'src')
  if (src === 'assessor' || src === 'manual') out.src = src
  const bu = Number(one(r, 'bu'))
  if (Number.isInteger(bu) && bu > 1) out.buildingUnits = bu
  const m = METHODS.find((x) => x === one(r, 'm'))
  if (m) out.method = m
  const mcRaw = one(r, 'mc')
  const mc = mcRaw === null || mcRaw === '' ? NaN : Number(mcRaw)
  if (Number.isFinite(mc) && mc >= 0 && mc <= 1) out.methodConfidence = mc
  const mn = one(r, 'mn')
  if (mn) out.note = mn.slice(0, NOTE_MAX)
  const ut = UTILITIES.find((x) => x === one(r, 'ut'))
  if (ut) out.utility = ut
  const er = one(r, 'er')
  if (plausibleElectricRate(er) !== null) out.electricRate = er as string
  const li = one(r, 'li')
  if (li === '1' || li === '0') out.lowIncome = li === '1'
  const ic = plausibleInstallCost(one(r, 'ic'))
  if (ic !== null) out.installCost = String(ic)
  return out
}

/** Re-serialise raw search params for the "Change the numbers" link. */
export function queryString(r: Raw): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(r)) {
    const val = Array.isArray(v) ? v[0] : v
    if (val !== undefined) p.set(k, val)
  }
  return p.toString()
}

/**
 * The verdict's query with the install cost set, or with the program average
 * restored. Stateless and pure so the editable field and the tests share one
 * definition: setting the default deletes the key instead of pinning a number
 * the household never typed.
 */
export function withInstallCost(query: string, value: number): string {
  const next = new URLSearchParams(query)
  if (value === DEFAULT_INSTALL_COST_USD) next.delete('ic')
  else next.set('ic', String(value))
  return next.toString()
}

/** Plain-English provenance for the verdict's assumptions area. */
export function provenanceLine(note: string | null, confidence: number | null): string | null {
  if (!note) return null
  const pct = confidence === null ? '' : ` — estimate, ${Math.round(confidence * 100)}% confidence`
  return `${note.replace(/\.\s*$/, '')}${pct}`
}
