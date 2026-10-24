import limits from '../../data/rules/income-limits-2026.json'
import type { Income } from '../intake/params'

export const MASS_SAVE_PHONE = '888-714-3990'
export const HOUSEHOLD_SIZE_MAX = 8
const UNSURE_BAND = 0.05

const enhanced: Record<string, number> | undefined = limits.tiers.find(
  (tier) => tier.name === 'Enhanced Incentive',
)?.maxIncomeBySize

export const INCOME_LIMITS_SOURCE = limits.source

/** The top of Mass Save's enhanced-rebate income band for a household size, or null outside 1..17. */
export function enhancedLimitFor(size: number): number | null {
  if (!Number.isInteger(size) || size < 1) return null
  return enhanced?.[String(size)] ?? null
}

/**
 * Whether a household is likely under Mass Save's enhanced-rebate income limit.
 * `unsure` within 5% of the limit, for an answer we cannot read, and for an "8 or more" household
 * over the 8-person limit (larger households have higher limits).
 */
export function eligibilityFor(size: number | null, income: number | null): Income {
  if (size === null || income === null || !Number.isFinite(income) || income <= 0) return 'unsure'
  const limit = enhancedLimitFor(Math.min(size, HOUSEHOLD_SIZE_MAX))
  if (limit === null) return 'unsure'
  if (income <= limit * (1 - UNSURE_BAND)) return 'yes'
  if (income <= limit * (1 + UNSURE_BAND)) return 'unsure'
  return size >= HOUSEHOLD_SIZE_MAX ? 'unsure' : 'no'
}

const usd = (value: number) => `$${Math.round(value).toLocaleString('en-US')}`

/** Plain words for the result, shown as soon as both answers are in. */
export function incomeResultCopy(size: number | null, income: number | null): string | null {
  if (size === null || income === null || income <= 0) return null
  const who = `${usd(income)} for a household of ${size >= HOUSEHOLD_SIZE_MAX ? `${size} or more` : size}`
  const confirm = `Statewide table; limits can vary by ZIP. Mass Save confirms: ${MASS_SAVE_PHONE}`
  switch (eligibilityFor(size, income)) {
    case 'yes':
      return `Based on ${who}, you're likely under Mass Save's limit for enhanced rebates. ${confirm}`
    case 'no':
      return `Based on ${who}, you're likely over Mass Save's limit for enhanced rebates, so we'll use the standard rebate. ${confirm}`
    default:
      return `Based on ${who}, you're close to Mass Save's limit, so we can't say. We'll use the standard rebate until you check. ${confirm}`
  }
}

const INCOME_TEXT = /^\$?\s*(\d[\d,]*(?:\.\d+)?)\s*([kK])?$/

/** `$85,000`, `85000` and `85k` are the same answer; exponent notation and anything else is no answer. */
export function parseIncome(raw: string): number | null {
  const match = INCOME_TEXT.exec(raw.trim())
  if (!match) return null
  const value = Number(match[1].replace(/,/g, '')) * (match[2] ? 1000 : 1)
  return Number.isFinite(value) && value > 0 ? value : null
}
