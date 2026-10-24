/**
 * @built F-100 the one-photo contract: what a bill hands the intake form
 *
 * Three modules meet here and none may redefine these shapes:
 *   lib/parse        produces `BillParseExtras` (BillParse extends it)
 *   bill-upload.tsx  turns a parse into one `BillApplied`
 *   onboarding-wizard.tsx  consumes `BillApplied` and carries it to /verdict
 *
 * Everything the bill printed and the advice can use travels in this object.
 * A field the document did not show is `null`, never a default.
 */
import type { AnnualMethod, BillFuel } from './types'

/** Who sent the document. `municipal` covers all 41 light plants. */
export type BillUtility =
  | 'eversource'
  | 'national_grid'
  | 'unitil'
  | 'liberty'
  | 'berkshire_gas'
  | 'municipal'
  | 'oil_dealer'
  | 'propane_dealer'
  | 'other'

/**
 * Massachusetts rate classes as printed. Odd = standard, even = low-income
 * discount. On a gas bill R-3/R-4 means gas is the heating fuel, R-1/R-2 that
 * it is not. `R-2`/`R-4` is a signal of income eligibility, never proof.
 */
export type RateClassV3 = 'R-1' | 'R-2' | 'R-3' | 'R-4' | 'heat pump' | 'other'

/**
 * What the document is *for* in the advice.
 * - `heating`: the fuel that heats the house (oil/propane ticket, heating gas
 *   bill, or an electric bill the user says heats the house).
 * - `electricity`: an electric bill that is not the heat source. It supplies
 *   the household's real $/kWh, the utility and the low-income signal — never a
 *   heating fuel. Before F-100 this case came back as `fuel: "resistance"`.
 */
export type BillRole = 'heating' | 'electricity'

/** Fields added in prompt v3. `BillParse` in ./types extends this. */
export interface BillParseExtras {
  role: BillRole
  utility: BillUtility | null
  /** 5-digit ZIP of the service address. The street is never read. */
  serviceZip: string | null
  /** Town of the service address, as printed. */
  serviceTown: string | null
  /** ISO dates of the service period, when printed. */
  periodStart: string | null
  periodEnd: string | null
  days: number | null
  /** Dollars, as printed. Price is computed from these in code, never by the model. */
  totalCharge: number | null
  supplyCharge: number | null
  deliveryCharge: number | null
  /** Supplier named in the supply section: Basic Service, a competitive supplier, or a town aggregation. */
  supplierName: string | null
  rateClassV3: RateClassV3 | null
  /** True when a rate class R-2/R-4 or a discount line ("Assistance Rate Discount", "Discount 25%") is printed. */
  lowIncomeSignal: boolean
  readType: 'actual' | 'estimated' | null
  budgetBilling: boolean
  /**
   * Annual units that are not space heat (hot water, cooking, appliances), from
   * the summer months of a printed history. `null` without a history.
   */
  baseloadAnnual: number | null
}

/** One bill, applied to the form. The single object `onApply` receives. */
export interface BillApplied {
  role: BillRole
  /** Heating fuel. `null` when `role === 'electricity'`. */
  fuel: BillFuel | null
  /** Annual *space-heating* units as a decimal string (baseload removed when known). */
  units: string
  /** All-in $/unit as a decimal string, computed in code from total ÷ quantity. */
  price: string
  /** One sentence: how the year was worked out. Rendered on /verdict. */
  note: string
  method: AnnualMethod | null
  /** 0–1, the annualisation method's confidence. */
  methodConfidence: number | null
  utility: BillUtility | null
  lowIncomeSignal: boolean
  serviceZip: string | null
  serviceTown: string | null
  /** Set only from an electric bill: the household's all-in $/kWh. */
  electricRate: string | null
}
