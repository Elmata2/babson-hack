/**
 * @built F-06 every physical constant and unit conversion, unit in the identifier
 *
 * Source of truth: `.kiro/steering/units-and-conventions.md` (physical constants)
 * and `.kiro/steering/mass-save-rules.md` (program money). Nothing here may be
 * invented: if a number is not in steering, it does not belong in this file.
 *
 * Units are in the identifier and must stay there. A bare `138500` anywhere else
 * in `lib/calc` is a review failure.
 */

import type { Fuel } from './types'

// ---------------------------------------------------------------- energy content

/** BTU in one MMBtu. */
export const BTU_PER_MMBTU = 1_000_000
/** BTU per US gallon of No. 2 heating oil (units-and-conventions). */
export const BTU_PER_GAL_OIL = 138_500
/** BTU per US gallon of propane. */
export const BTU_PER_GAL_PROPANE = 91_500
/** BTU per therm of natural gas. */
export const BTU_PER_THERM_GAS = 100_000
/** BTU per kWh, exact conversion factor. */
export const BTU_PER_KWH = 3_412.14
/** BTU/hr in one ton of cooling capacity. */
export const BTU_PER_TON_COOLING = 12_000

// ------------------------------------------------------- combustion efficiency

/** AFUE, oil-fired boiler or furnace. */
export const AFUE_OIL = 0.8
/** AFUE, natural gas (atmospheric). */
export const AFUE_GAS = 0.85
/** AFUE, propane. */
export const AFUE_PROPANE = 0.85
/** AFUE, electric resistance: 100% by definition. */
export const AFUE_RESISTANCE = 1.0

/**
 * AFUE used when the caller does not supply one. Labelled defaults, always
 * reported in `assumptions[]` — an old boiler in a Wellesley basement is often
 * 0.78, a new condensing gas unit 0.96.
 */
export const AFUE_BY_FUEL: Record<Fuel, number> = {
  oil: AFUE_OIL,
  propane: AFUE_PROPANE,
  gas: AFUE_GAS,
  resistance: AFUE_RESISTANCE,
}

/** BTU of delivered heat per unit of purchased fuel, before AFUE. */
export const BTU_PER_UNIT_BY_FUEL: Record<Fuel, number> = {
  oil: BTU_PER_GAL_OIL,
  propane: BTU_PER_GAL_PROPANE,
  gas: BTU_PER_THERM_GAS,
  resistance: BTU_PER_KWH,
}

// ------------------------------------------------------------ heat pump season

/** Seasonal COP (SCOP) default for MA air-source equipment. */
export const SCOP_DEFAULT = 2.7
/** Low end of the observed field range (2018-era single-stage). */
export const SCOP_MIN = 2.3
/** High end of the observed field range (cold-climate inverter). */
export const SCOP_MAX = 3.2

// -------------------------------------------------------------------- climate

/** Degree-day base temperature, deg F. */
export const BASE_TEMP_F = 65
/** Heating degree days, base 65 deg F, Boston. */
export const HDD65_BOSTON = 5_600
/** Heating degree days, base 65 deg F, Worcester. */
export const HDD65_WORCESTER = 6_500
/** Heating degree days, base 65 deg F, Springfield. */
export const HDD65_SPRINGFIELD = 6_200
/** 99% heating design temperature, deg F (Boston). */
export const DESIGN_TEMP_F = 7
/** Hours per day, for the HDD → UA conversion. */
export const HOURS_PER_DAY = 24
/** Hours in a year, only used to describe an annual load. */
export const HOURS_PER_YEAR = 8_760

/**
 * HDD65 used when the caller supplies no town: Boston, the population-weighted
 * centre of the Mass Save territory. Reported as an assumption every time.
 */
export const HDD65_DEFAULT = HDD65_BOSTON
/** Design temperature used when the caller supplies none, deg F. */
export const DESIGN_TEMP_F_DEFAULT = DESIGN_TEMP_F

// ------------------------------------------------------------------ sizing

/** Tonnage is sold in half-ton steps. */
export const TON_ROUNDING_STEP_TONS = 0.5
/** Smallest equipment that exists: a half ton. */
export const MIN_TONS = 0.5
/** Above this we tell the user to get a Manual J before signing anything. */
export const OVERSIZE_WARN_TONS = 5

// ----------------------------------------------------------- money and loans

/** Mass Save average whole-home install cost, USD (mass-save-rules §2). */
export const DEFAULT_INSTALL_COST_USD = 22_000
/**
 * HEAT Loan term, months. An assumption: the longest term a participating lender
 * lists (Energy Credit Union, read 2026-10-24); masssave.com states no term
 * (mass-save-rules §2). Shorter terms may apply to a given household.
 */
export const HEAT_LOAN_MONTHS = 84
/** HEAT Loan APR: 0% promotional rate (mass-save-rules §2). */
export const HEAT_LOAN_APR = 0
/** HEAT Loan maximum, USD, lifetime (masssave.com, effective 2025-01-01). Not a rebate. */
export const HEAT_LOAN_MAX_USD = 25_000
/** Months in a year, for monthly savings. */
export const MONTHS_PER_YEAR = 12

// --------------------------------------------------------------- verdict gate

/** Beyond this many years, "not yet" is the honest answer. */
export const MAX_PAYBACK_YEARS = 15
/** The year the 2026 rebate table stops applying. */
export const REBATE_STEP_DOWN_YEAR = 2027
/** Years this engine knows rebate tables for. */
export const SUPPORTED_INSTALL_YEARS: readonly number[] = [2026, 2027]

// ------------------------------------------------------- plausibility ceilings

/**
 * Refusal bounds, not program numbers. A residential bill above these is a parse
 * error or a commercial building, and the engine returns `null` rather than a
 * confident wrong answer. Each ceiling is roughly 5–8× the MA household average.
 */
export const MAX_ANNUAL_UNITS_BY_FUEL: Record<Fuel, number> = {
  oil: 5_000, // gal  (MA average ≈ 750)
  propane: 5_000, // gal (MA average ≈ 700)
  gas: 5_000, // therms (MA average ≈ 900)
  resistance: 60_000, // kWh (MA average ≈ 12,000)
}
/** A bill of zero or a negative quantity is a parse error, not a household. */
export const MIN_ANNUAL_UNITS = 0
/** Sanity bound on a delivered price: $/gal, $/therm or $/kWh all fit under this. */
export const MAX_UNIT_PRICE_USD = 50
/** Sanity bound on a residential install quote, USD. */
export const MAX_INSTALL_COST_USD = 250_000
/** Sanity bound on floor area for the envelope fallback, sqft. */
export const MAX_SQFT = 25_000
/** Upper bound on a supplied efficiency: above this it is not an efficiency. */
export const MAX_AFUE = 1.5
/** Upper bound on a supplied HDD65: no MA site is above this. */
export const MAX_HDD65 = 20_000
/** Upper bound on a supplied SCOP: above this it is a typo, not equipment. */
export const MAX_SCOP = 10
/** Upper bound on a supplied tonnage, before we suspect a building instead of a house. */
export const MAX_TONS = 100
/** Coldest design temperature worth accepting, deg F. */
export const MIN_DESIGN_TEMP_F = -60

// ------------------------------------------------------- envelope fallback

/**
 * Delivered heat per heated square foot per year, BTU/sqft/yr.
 *
 * Derived, not invented: design.md §3 assumes 750 gal/household; at 138,500
 * BTU/gal and 0.80 AFUE that is 83.1 MMBtu of delivered heat, which over a
 * 2,075 sqft median MA single-family home is ≈ 40,000 BTU/sqft/yr. Used only
 * when there is no bill, and always reported as an assumption.
 */
export const DELIVERED_BTU_PER_SQFT_YEAR = 40_000
/** Floor area the intensity above was derived from, sqft (documentation only). */
export const ENVELOPE_REFERENCE_SQFT = 2_075

/** Marker for the fuel whose price basis is $/gal rather than $/therm or $/kWh. */
export const UNIT_LABEL_BY_FUEL: Record<Fuel, string> = {
  oil: 'gal',
  propane: 'gal',
  gas: 'therm',
  resistance: 'kWh',
}
