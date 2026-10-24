/**
 * @built F-20 payback years and the 84-month 0% HEAT Loan
 * @built F-21 break-even electric price — the honesty number
 * @built F-37 the monthly cash flow under the loan: payment, saving, difference
 *
 * All of these are single formulas, kept apart from the assembler so the property
 * tests can hit them directly.
 */

import { HEAT_LOAN_APR, HEAT_LOAN_MONTHS, MONTHS_PER_YEAR } from './constants'
import { annualKWh, monthly } from './cost'
import type { CashFlow, HeatLoan } from './types'

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/**
 * Simple payback in years.
 * Input: net cost USD after rebate, annual savings USD (signed). Output: years.
 * Guarantee: `netCost / savings` exactly, or `null` when savings ≤ 0 (no payback
 * exists) or the cost is not a positive quantity.
 */
export function payback(netCost: number, annualSavings: number): number | null {
  if (!isFiniteNumber(netCost) || netCost < 0) return null
  if (!isFiniteNumber(annualSavings) || annualSavings <= 0) return null
  const years = netCost / annualSavings
  if (!isFiniteNumber(years) || years < 0) return null
  return years
}

/**
 * HEAT Loan payment schedule.
 * Input: principal USD, term months (default 84), APR (default 0). Output:
 * monthly payment and total interest. Guarantee: at 0% APR, `monthly` is exactly
 * `principal / months` and interest is exactly 0; `null` for a bad principal.
 */
export function heatLoan(
  netCost: number,
  months: number = HEAT_LOAN_MONTHS,
  apr: number = HEAT_LOAN_APR,
): HeatLoan | null {
  if (!isFiniteNumber(netCost) || netCost < 0) return null
  if (!isFiniteNumber(months) || months <= 0 || !Number.isInteger(months)) return null
  if (!isFiniteNumber(apr) || apr < 0) return null

  if (apr === 0) {
    return { monthly: netCost / months, totalInterest: 0, months, apr }
  }

  const monthlyRate = apr / MONTHS_PER_YEAR
  const factor = Math.pow(1 + monthlyRate, months)
  const payment = (netCost * monthlyRate * factor) / (factor - 1)
  if (!isFiniteNumber(payment)) return null
  return { monthly: payment, totalInterest: payment * months - netCost, months, apr }
}

/**
 * Month-by-month cash flow under the HEAT Loan.
 * Input: net cost USD after rebate, annual savings USD (signed), term months
 * (default 84), APR (default 0). Output: the loan payment, the same savings
 * expressed monthly, and their difference. Guarantee: `monthlyLoan` is exactly
 * `netCost / months` at 0% APR and `monthlyCashFlow` is exactly
 * `monthlySavings − monthlyLoan`; `null` when either side has no honest value.
 */
export function cashFlow(
  netCost: number,
  annualSavings: number,
  months: number = HEAT_LOAN_MONTHS,
  apr: number = HEAT_LOAN_APR,
): CashFlow | null {
  const loan = heatLoan(netCost, months, apr)
  if (!loan) return null
  const perMonth = monthly(annualSavings)
  if (perMonth === null) return null
  const monthlyCashFlow = perMonth - loan.monthly
  if (!isFiniteNumber(monthlyCashFlow)) return null
  return { monthlyLoan: loan.monthly, monthlySavings: perMonth, monthlyCashFlow }
}

/**
 * The $/kWh at which the heat pump stops saving money.
 * Input: delivered BTU/yr, current annual fuel cost USD, SCOP. Output: $/kWh.
 * Guarantee: `oldCost / annualKWh`, so savings are exactly zero at this rate; or
 * `null` when the load or SCOP cannot produce an honest denominator.
 */
export function breakEvenElectricPrice(input: {
  btu: number
  oldCost: number
  scop: number
}): number | null {
  const { btu, oldCost, scop } = input
  if (!isFiniteNumber(oldCost) || oldCost < 0) return null
  const kWh = annualKWh(btu, scop)
  if (kWh === null || kWh <= 0) return null
  const rate = oldCost / kWh
  if (!isFiniteNumber(rate)) return null
  return rate
}
