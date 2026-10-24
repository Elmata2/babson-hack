/**
 * @built F-15 delivered heat from a bill or from floor area
 * @built F-16 design load from degree days (UA, BTU/hr at design temperature)
 * @built F-17 tonnage rounded to the half ton, with an oversize flag
 *
 * Pure arithmetic only. Every default that reaches the result is pushed into
 * `assumptions[]`; anything that cannot be answered honestly returns `null`.
 */

import {
  AFUE_BY_FUEL,
  BASE_TEMP_F,
  BTU_PER_MMBTU,
  BTU_PER_TON_COOLING,
  BTU_PER_UNIT_BY_FUEL,
  DELIVERED_BTU_PER_SQFT_YEAR,
  ENVELOPE_REFERENCE_SQFT,
  HOURS_PER_DAY,
  MAX_AFUE,
  MAX_ANNUAL_UNITS_BY_FUEL,
  MAX_SQFT,
  MIN_TONS,
  OVERSIZE_WARN_TONS,
  TON_ROUNDING_STEP_TONS,
} from './constants'
import { isFuel } from './rules'
import type { Assumption, DeliveredHeat, DesignLoad, HeatingInput } from './types'

/** A finite number, not NaN and not ±Infinity. */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/**
 * Convert MMBtu to BTU.
 * Input: MMBtu. Guarantee: x → x × 1,000,000 exactly, both directions lossless
 * to within one float ulp (see P12).
 */
export function mmBtuToBtu(mmBtu: number): number {
  return mmBtu * BTU_PER_MMBTU
}

/**
 * Convert BTU to MMBtu.
 * Input: BTU. Guarantee: x → x ÷ 1,000,000; never returns NaN for finite input.
 */
export function btuToMmBtu(btu: number): number {
  return btu / BTU_PER_MMBTU
}

/**
 * The AFUE the engine will actually use, plus the assumption when it is a default.
 * Input: heating input with optional AFUE. Output: efficiency 0–1.5 or `null` when
 * the supplied value is not a real efficiency.
 */
export function resolveAfue(input: HeatingInput): { afue: number; assumption: Assumption | null } | null {
  if (input.afue !== undefined) {
    if (!isFiniteNumber(input.afue) || input.afue <= 0 || input.afue > MAX_AFUE) return null
    return { afue: input.afue, assumption: null }
  }
  const afue = AFUE_BY_FUEL[input.fuel]
  return {
    afue,
    assumption: {
      field: 'afue',
      value: afue.toFixed(2),
      reason: `No AFUE supplied, so the table default for ${input.fuel} is used (0.78–0.86 is the realistic range for oil).`,
    },
  }
}

/**
 * Delivered heat at the registers, from fuel units or (failing that) floor area.
 * Input: fuel, annual units, optional AFUE, optional sqft. Output: MMBtu + BTU per
 * year. Guarantee: positive delivered heat or `null` — never a zero or a NaN.
 */
export function deliveredHeat(input: HeatingInput): DeliveredHeat | null {
  if (!isFuel(input.fuel)) return null

  const units = input.annualUnits
  const hasBill = isFiniteNumber(units) && units > 0
  // A bill above the plausibility ceiling is a parse error, not a fallback case.
  if (hasBill && units > MAX_ANNUAL_UNITS_BY_FUEL[input.fuel]) return null

  if (hasBill) {
    const resolved = resolveAfue(input)
    if (!resolved) return null
    const btu = units * BTU_PER_UNIT_BY_FUEL[input.fuel] * resolved.afue
    if (!isFiniteNumber(btu) || btu <= 0) return null
    const assumptions: Assumption[] = []
    if (resolved.assumption) assumptions.push(resolved.assumption)
    return { mmBtu: btuToMmBtu(btu), btu, source: 'bill', assumptions }
  }

  // Envelope fallback: no usable bill, so derive delivered heat from floor area.
  const sqft = input.sqft
  if (!isFiniteNumber(sqft) || sqft <= 0 || sqft > MAX_SQFT) return null
  const btu = sqft * DELIVERED_BTU_PER_SQFT_YEAR
  if (!isFiniteNumber(btu) || btu <= 0) return null
  return {
    mmBtu: btuToMmBtu(btu),
    btu,
    source: 'envelope',
    assumptions: [
      {
        field: 'deliveredHeat',
        value: `${DELIVERED_BTU_PER_SQFT_YEAR.toLocaleString('en-US')} BTU/sqft/yr`,
        reason: `No usable fuel quantity, so delivered heat is estimated from ${sqft.toLocaleString('en-US')} sqft. The intensity is derived from the 750 gal/household assumption (design §3) over a ${ENVELOPE_REFERENCE_SQFT.toLocaleString('en-US')} sqft home; it ignores age and insulation.`,
      },
    ],
  }
}

/**
 * UA and design load from annual delivered heat and degree days.
 * Input: delivered BTU/yr, HDD65, design temp °F, optional sqft. Output: BTU/hr/°F
 * and BTU/hr. Guarantee: `btuhr = ua × (65 − designTempF)` with a positive UA, or
 * `null` when the degree-day base is not above the design temperature.
 */
export function designLoad(input: {
  btu: number
  hdd65: number
  designTempF: number
  sqft?: number
}): DesignLoad | null {
  const { btu, hdd65, designTempF } = input
  if (!isFiniteNumber(btu) || btu <= 0) return null
  if (!isFiniteNumber(hdd65) || hdd65 <= 0) return null
  if (!isFiniteNumber(designTempF)) return null
  const deltaT = BASE_TEMP_F - designTempF
  if (!(deltaT > 0)) return null
  const ua = btu / (HOURS_PER_DAY * hdd65)
  const btuhr = ua * deltaT
  if (!isFiniteNumber(ua) || !isFiniteNumber(btuhr) || ua <= 0) return null
  return { ua, btuhr, assumptions: [] }
}

/**
 * Equipment size in cooling tons, rounded to the nearest half ton.
 * Input: design load BTU/hr. Guarantee: a positive multiple of 0.5, floored at
 * 0.5 ton, or `null` for a non-positive / non-finite load.
 */
export function sizeTons(btuhr: number): number | null {
  if (!isFiniteNumber(btuhr) || btuhr <= 0) return null
  const rawTons = btuhr / BTU_PER_TON_COOLING
  const stepped = Math.round(rawTons / TON_ROUNDING_STEP_TONS) * TON_ROUNDING_STEP_TONS
  const tons = Math.max(MIN_TONS, stepped)
  if (!isFiniteNumber(tons) || tons <= 0) return null
  return tons
}

/**
 * True when the calculated tonnage is above the residential comfort limit.
 * Input: tons. Guarantee: pure predicate; the UI uses it to demand a Manual J.
 */
export function isOversized(tons: number): boolean {
  return isFiniteNumber(tons) && tons > OVERSIZE_WARN_TONS
}
