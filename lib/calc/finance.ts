/**
 * @built F-20 payback years and the 84-month 0% HEAT Loan
 * @built F-21 break-even electric price — the honesty number
 *
 * All three are single formulas, kept apart from the assembler so the property
 * tests can hit them directly.
 */

import { HEAT_LOAN_APR, HEAT_LOAN_MONTHS } from './constants'
import { annualKWh } from './cost'
import type { HeatLoan } from './types'

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

  const monthlyRate = apr / 12
  const factor = Math.pow(1 + monthlyRate, months)
  const payment = (netCost * monthlyRate * factor) / (factor - 1)
  if (!isFiniteNumber(payment)) return null
  return { monthly: payment, totalInterest: payment * months - netCost, months, apr }
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
