import { HEAT_LOAN_MAX_USD, HEAT_LOAN_MONTHS, MAX_PAYBACK_YEARS } from '../calc/constants'
import type { VerdictResult } from '../calc/types'
import { INSTALL_COST_MAX, INSTALL_COST_MIN, plausibleInstallCost } from '../intake/params'
import { DEFAULT_INSTALL_COST_USD } from '../calc/constants'
import { one, usd } from './format'

type MoneyInput = Pick<
  VerdictResult,
  'annualSavings' | 'netCost' | 'paybackYears' | 'totalRebate' | 'installCost' | 'loanAmount'
>

export type PaybackView =
  | { kind: 'immediate'; value: string; note: string }
  | { kind: 'years'; value: string; note: string }
  | { kind: 'never'; value: string; note: string }

export function paybackView(result: MoneyInput): PaybackView {
  if (result.annualSavings <= 0) {
    return {
      kind: 'never',
      value: "Doesn't pay back",
      note: result.annualSavings < 0 ? 'running costs go up, not down' : 'no yearly saving to repay it',
    }
  }
  if (result.netCost <= 0) {
    return { kind: 'immediate', value: 'Pays for itself immediately', note: 'the rebate covers the whole install cost' }
  }
  if (result.paybackYears === null) {
    return { kind: 'never', value: "Doesn't pay back", note: 'no yearly saving to repay it' }
  }
  const past = result.paybackYears > MAX_PAYBACK_YEARS
  return {
    kind: 'years',
    value: `${one(result.paybackYears)} years`,
    note: past
      ? `past the ${MAX_PAYBACK_YEARS}-year limit we use, so the verdict is "not yet"`
      : 'net cost ÷ yearly saving, undiscounted',
  }
}

export function rebateCapNote(result: Pick<VerdictResult, 'totalRebate' | 'installCost' | 'tier'>): string | null {
  if (result.totalRebate < result.installCost) return null
  return result.tier === 'enhanced'
    ? `enhanced rule: lower of install cost (${usd(result.installCost)}) and the cap`
    : "model: the rebate can't exceed the install cost"
}

export interface LoanView {
  amount: number
  remainder: number
  termYears: number
  maxUsd: number
}

export function loanView(result: MoneyInput): LoanView | null {
  if (result.annualSavings <= 0 || result.loanAmount <= 0) return null
  return {
    amount: result.loanAmount,
    remainder: Math.max(0, result.netCost - result.loanAmount),
    termYears: HEAT_LOAN_MONTHS / 12,
    maxUsd: HEAT_LOAN_MAX_USD,
  }
}

export function loanSentence(): string {
  return `Mass Save's 0% HEAT Loan, up to ${usd(HEAT_LOAN_MAX_USD)}. We assume the longest term, ${HEAT_LOAN_MONTHS} months (${HEAT_LOAN_MONTHS / 12} years): monthly payment vs monthly saving.`
}

export type RejectedQuote = { raw: string; message: string }

export function rejectedQuote(raw: string | null | undefined): RejectedQuote | null {
  if (raw === null || raw === undefined || raw.trim() === '') return null
  if (plausibleInstallCost(raw) !== null) return null
  return {
    raw,
    message: `"${raw}" is outside ${usd(INSTALL_COST_MIN)} to ${usd(INSTALL_COST_MAX)}, so it was ignored and the ${usd(DEFAULT_INSTALL_COST_USD)} Mass Save average is used.`,
  }
}
