/**
 * @built F-07 all interfaces for the calculation core, no logic
 * @built F-37 `CashFlow` and the verdict's monthly fields — one month of the
 * loan, one month of saving, and the difference the screen prints
 *
 * Shapes come from design.md §2.1. Additive fields are allowed; nothing from the
 * contract is removed. Every number is full precision USD / BTU / kWh — rounding
 * happens at the display edge, never here.
 */

/** Pre-existing heat source of the house. */
export type Fuel = 'oil' | 'propane' | 'gas' | 'resistance'

/** Mass Save rebate tier. Mutually exclusive in this build. */
export type Tier = 'whole' | 'partial' | 'basic' | 'enhanced'

/** The three decisions the product is allowed to return. */
export type Verdict = 'SWITCH_NOW' | 'SWITCH_BEFORE_DEC31' | 'DO_NOT_SWITCH_YET'

/** Why the engine refused an input. Never a guessed number. */
export type RefusalCode =
  | 'unknown_fuel'
  | 'unsupported_install_year'
  | 'missing_input'
  | 'out_of_range'

/** A typed refusal: the engine has no honest answer for these inputs. */
export interface Refusal {
  code: RefusalCode
  /** Human-readable, safe to show the user. */
  message: string
  /** Which input caused it, for the form to highlight. */
  field: string
}

/** A default that was actually used, with the justification shown in the UI. */
export interface Assumption {
  field: string
  /** Rendered value, e.g. "0.80 AFUE" or "$22,000". */
  value: string
  reason: string
}

/** What the user (or the bill) says the house burns today. */
export interface HeatingInput {
  fuel: Fuel
  /** gallons (oil, propane) | therms (gas) | kWh (resistance) */
  annualUnits: number
  /** $ per gallon | $ per therm | $ per kWh */
  unitPrice: number
  /** Overrides the AFUE table default. */
  afue?: number
  /** deg F heating degree days, base 65. Defaults to the Boston zone. */
  hdd65?: number
  /** deg F, 99% design condition. Defaults to 7. */
  designTempF?: number
  /** Heated floor area, sqft. Only used for the envelope fallback. */
  sqft?: number
  /** Not used for arithmetic in this build; carried for future envelope work. */
  yearBuilt?: number
}

/** What the user is considering buying. */
export interface UpgradeInput {
  tier: Tier
  installYear: 2026 | 2027
  /** Cooling tons. Computed from the design load when absent. */
  tons?: number
  /** Defaults to the Mass Save average, $22,000. */
  installCost?: number
  weatherizationBonus?: boolean
  sizingBonus?: boolean
  /** $/kWh, seasonal heat pump rate (Nov 1 – Apr 30). */
  heatPumpRate: number
  /** $/kWh, all-in standard residential rate. */
  standardRate: number
  /** Defaults to 2.70. */
  scop?: number
}

/** Result of `deliveredHeat`. */
export interface DeliveredHeat {
  /** Delivered heat at the registers, MMBtu/yr. */
  mmBtu: number
  /** Delivered heat at the registers, BTU/yr. */
  btu: number
  /** `bill` = from fuel units; `envelope` = from floor area. */
  source: 'bill' | 'envelope'
  assumptions: Assumption[]
}

/** Result of `designLoad`. */
export interface DesignLoad {
  /** BTU/hr per deg F of indoor-outdoor difference. */
  ua: number
  /** BTU/hr that must be delivered at the design temperature. */
  btuhr: number
  assumptions: Assumption[]
}

/** One line of the rebate stack. */
export interface RebateLine {
  label: string
  amount: number
  /** Where the number came from, e.g. "mass-save-rules.md §1 · 2026". */
  source: string
}

/** Result of `rebate`. */
export interface RebateResult {
  /** What the homeowner actually receives, never above `installCost`. */
  total: number
  /** Per-ton (or cost-capped) award before bonuses, already capped by `cap`. */
  base: number
  /** Weatherization + sizing bonuses actually paid, 0 when not applicable. */
  bonuses: number
  /** Statutory cap before bonuses, USD. */
  cap: number
  /** Cap after bonuses, USD. */
  capAfterBonuses: number
  /** False when the tier is closed to this fuel (enhanced + gas). */
  eligible: boolean
  /** Why it is not eligible, or null when it is. */
  reason: string | null
  breakdown: RebateLine[]
  assumptions: Assumption[]
}

/** Result of `heatLoan`. */
export interface HeatLoan {
  monthly: number
  totalInterest: number
  months: number
  apr: number
}

/** Result of `cashFlow`: one month of the loan next to one month of savings. */
export interface CashFlow {
  /** Net cost after rebate ÷ term. At 0% this is exactly `netCost / months`. */
  monthlyLoan: number
  /** Annual savings ÷ 12. Signed: a losing heat pump saves a negative amount. */
  monthlySavings: number
  /** `monthlySavings − monthlyLoan`. Positive means the household is ahead. */
  monthlyCashFlow: number
}

/** Everything the verdict screen needs. Full precision; round at render time. */
export interface VerdictResult {
  deliveredMMBtu: number
  designBTUhr: number
  tons: number
  annualKWh: number
  oldAnnualCost: number
  newAnnualCostStandard: number
  newAnnualCostHeatPumpRate: number
  /** Headline signed savings at the seasonal heat pump rate. May be < 0. */
  annualSavings: number
  /** Same figure, named for the contract. Always equals `annualSavings`. */
  annualSavingsAtHeatPumpRate: number
  /** Conservative view at the all-in standard rate. Additive field. */
  annualSavingsAtStandardRate: number
  totalRebate: number
  rebateBreakdown: RebateLine[]
  netCost: number
  /** null when annualSavings <= 0: no payback exists. */
  paybackYears: number | null
  /** Amount the HEAT Loan covers: net cost, capped at the program maximum. */
  loanAmount: number
  monthlyLoan: number
  monthlySavings: number
  /** `monthlySavings − monthlyLoan`: the cash-flow line R7.3 asks for. */
  monthlyCashFlow: number
  cashFlowPositive: boolean
  /** $/kWh at which savings reach zero. Computed for every run. */
  breakEvenElectricPrice: number | null
  rebate2026: number
  rebate2027: number
  /** rebate2026 - rebate2027, floored at 0. */
  cliffCost: number
  verdict: Verdict
  reasons: string[]
  caveats: string[]
  assumptions: Assumption[]
  // ---- additive context, so the UI never has to re-derive what was assumed
  fuel: Fuel
  tier: Tier
  installYear: 2026 | 2027
  installCost: number
  scop: number
  hdd65: number
  designTempF: number
  annualUnits: number
  unitPrice: number
  heatPumpRate: number
  standardRate: number
  /** False when the enhanced tier is closed to this fuel. */
  rebateEligible: boolean
}
