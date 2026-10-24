/**
 * @built F-143 bestCase — Addendum B §3.5, one row per category, no invented verdicts
 *
 * Four categories per household: electricity supply, heating fuel, the heat pump, and
 * the programs that move the money. Each row is `switch`, `stay`, `check`,
 * `available` or `none`, with the reason and the source date.
 *
 * The disposition is derived from numbers already computed:
 *   - heat pump: `computeVerdict`'s own verdict;
 *   - heating fuel: this household's price against the dated DOER average;
 *   - supply: the published Basic Service rate, or "we do not know what you pay";
 *   - programs: the rebate stack and the loan, or a refusal where Mass Save does not apply.
 *
 * "You're already on the best option" is only said when every row is stay/none —
 * `allStay` is the one function allowed to decide that.
 */

import { HEAT_LOAN_MONTHS } from '../calc/constants'
import type { Fuel, VerdictResult } from '../calc/types'
import type { BasicServiceRate } from '../supply'

export type BestCaseOutcome = 'switch' | 'stay' | 'check' | 'available' | 'none'

export interface BestCaseRow {
  id: 'supply' | 'fuel' | 'heat_pump' | 'programs'
  label: string
  outcome: BestCaseOutcome
  headline: string
  detail: string
  /** Publisher · date. Empty only when the row states that it has no source. */
  source: string
}

export interface BestCaseInput {
  result: VerdictResult | null
  fuel: Fuel | null
  /** The household's own $/unit, from the bill or the form. */
  unitPrice: number | null
  /** Dated DOER statewide average for the same unit, when the fuel is oil or propane. */
  marketPrice: number | null
  marketPeriod: string | null
  /** The household's annual use in the same unit. */
  annualUnits: number | null
  /** False in a municipal light plant town: no supply choice, no Mass Save rebate. */
  supplyAvailable: boolean
  basicService: BasicServiceRate | null
  sponsorLabel: string | null
  noMassSave: boolean
  /** True when the household answered "yes" to the income question. */
  incomeEligible: boolean
  /** True when a seasonal heat-pump rate rule applied to this sponsor. */
  seasonalApplied: boolean
}

const usd = (value: number): string =>
  value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

const unitLabel = (fuel: Fuel): string =>
  fuel === 'gas' ? 'therms' : fuel === 'resistance' ? 'kWh' : 'gal'

/**
 * The rows for this household, in the order the design lists them.
 * Guarantee: gas and resistance homes get no heating-fuel row (there is no dealer);
 * a municipal light plant town gets no supply row; a missing number becomes
 * `check`, never a guessed `switch`.
 */
export function bestCase(input: BestCaseInput): BestCaseRow[] {
  const rows: BestCaseRow[] = []

  if (input.supplyAvailable) {
    rows.push(supplyRow(input))
  }

  if (input.fuel === 'oil' || input.fuel === 'propane') {
    rows.push(fuelRow(input))
  }

  rows.push(heatPumpRow(input))
  rows.push(programsRow(input))
  return rows
}

/** True only when there is nothing left to do: every row says stay, or does not apply. */
export function allStay(rows: readonly BestCaseRow[]): boolean {
  return rows.length > 0 && rows.every((row) => row.outcome === 'stay' || row.outcome === 'none')
}

function supplyRow(input: BestCaseInput): BestCaseRow {
  const source = input.basicService
    ? `${input.basicService.source} · ${input.basicService.sourceDate}`
    : input.sponsorLabel
      ? `${input.sponsorLabel} · MassGIS Electricity Providers`
      : 'MassGIS Electricity Providers'

  if (!input.basicService || input.basicService.centsPerKwh === null) {
    return {
      id: 'supply',
      label: 'Electricity supply',
      outcome: 'check',
      headline: 'No published Basic Service number for this sponsor',
      detail:
        'This build will not invent a supply rate. The state list of municipal aggregation programs and Energy Switch Massachusetts are the places to read your options.',
      source,
    }
  }

  return {
    id: 'supply',
    label: 'Electricity supply',
    outcome: 'check',
    headline: `Basic Service is ${input.basicService.centsPerKwh.toFixed(1)}¢/kWh (supply only)`,
    detail:
      'We do not have your own supply line, so we cannot say whether that is what you pay. Read your bill: if it names the utility as supplier you are on Basic Service; if it names a company, compare that rate — and the contract end — before you move.',
    source,
  }
}

function fuelRow(input: BestCaseInput): BestCaseRow {
  const fuel = input.fuel as 'oil' | 'propane'
  const label = fuel === 'oil' ? 'Heating oil' : 'Propane'
  const period = input.marketPeriod ?? 'the dated survey'
  const source = `MA DOER weekly fuel survey · ${period}`

  if (input.marketPrice === null || input.unitPrice === null || input.unitPrice <= 0) {
    return {
      id: 'fuel',
      label: `${label} price`,
      outcome: 'check',
      headline: 'No price to compare',
      detail: 'A dealer quote is the only real number; the statewide average is the yardstick.',
      source,
    }
  }

  const difference = input.unitPrice - input.marketPrice
  const annual = input.annualUnits !== null && difference > 0 ? difference * input.annualUnits : null
  const annualBelow = input.annualUnits !== null && difference < 0 ? -difference * input.annualUnits : null
  const average = `$${input.marketPrice.toFixed(2)}/gal`

  if (difference <= 0) {
    return {
      id: 'fuel',
      label: `${label} price`,
      outcome: 'stay',
      headline: `You pay $${input.unitPrice.toFixed(2)}/gal — at or below the state average`,
      detail: `The DOER average for the week of ${period} is ${average}.${
        annualBelow !== null
          ? ` At ${input.annualUnits?.toLocaleString('en-US')} gal a year, that is about ${usd(annualBelow)} a year below the average.`
          : ''
      } Nothing here says you are overpaying, so a dealer round has nothing to beat unless you want a second number.`,
      source,
    }
  }

  return {
    id: 'fuel',
    label: `${label} price`,
    outcome: 'switch',
    headline: `You pay $${difference.toFixed(2)}/gal more than the state average`,
    detail: `The DOER average for the week of ${period} is ${average}. At ${input.annualUnits?.toLocaleString('en-US') ?? '—'} ${input.fuel ? unitLabel(input.fuel) : 'gal'} a year that is about ${annual === null ? 'unknown' : usd(annual)} a year. A dealer price is given by phone; the switch kit has the exact question.`,
    source,
  }
}

function heatPumpRow(input: BestCaseInput): BestCaseRow {
  const source = 'Switchpoint calculation · mass-save-rules.md · EIA'

  if (!input.result) {
    return {
      id: 'heat_pump',
      label: 'Heat pump',
      outcome: 'check',
      headline: 'We cannot answer this one honestly',
      detail: 'One of the numbers is outside what this calculator will stand behind. Correct the bill and come back.',
      source,
    }
  }

  const result = input.result
  if (input.noMassSave) {
    return {
      id: 'heat_pump',
      label: 'Heat pump',
      outcome: 'check',
      headline: 'Running cost only — no Mass Save rebate at this address',
      detail: `A municipal light plant serves this town, so the Mass Save electric rebate does not exist here. The same heat would cost ${usd(result.newAnnualCostHeatPumpRate)} a year at this household's rate, against ${usd(result.oldAnnualCost)} for the fuel it replaces. A rebate-adjusted payback is not printed because it would be fiction.`,
      source,
    }
  }

  if (result.verdict === 'DO_NOT_SWITCH_YET') {
    return {
      id: 'heat_pump',
      label: 'Heat pump',
      outcome: 'stay',
      headline: 'At these prices, the heat pump does not pay for this house',
      detail: `${result.reasons[0] ?? ''} Break-even is ${
        result.breakEvenElectricPrice === null ? 'not computable' : `${(result.breakEvenElectricPrice * 100).toFixed(1)}¢/kWh`
      }, and this house is modelled at ${(result.heatPumpRate * 100).toFixed(1)}¢/kWh.`,
      source,
    }
  }

  return {
    id: 'heat_pump',
    label: 'Heat pump',
    outcome: 'switch',
    headline:
      result.verdict === 'SWITCH_BEFORE_DEC31'
        ? `Switch before 31 December — ${usd(result.annualSavings)} a year, and ${usd(result.cliffCost)} of rebate at stake`
        : `Switch now — ${usd(result.annualSavings)} a year`,
    detail: `${result.reasons[0] ?? ''} The ${result.installYear} rebate is ${usd(result.totalRebate)} against ${usd(result.installCost)} installed.`,
    source,
  }
}

function programsRow(input: BestCaseInput): BestCaseRow {
  const source = 'Mass Save program rules · mass-save-rules.md · 2026'

  if (input.noMassSave) {
    return {
      id: 'programs',
      label: 'Programs',
      outcome: 'none',
      headline: 'Mass Save electric rebates do not apply here',
      detail:
        'The town is served by a municipal light plant. Ask the municipal utility what it offers directly; this build quotes no Mass Save number at this address.',
      source,
    }
  }

  if (!input.result) {
    return {
      id: 'programs',
      label: 'Programs',
      outcome: 'check',
      headline: 'Programs depend on the answer above',
      detail: 'The rebate tier and the HEAT Loan only mean something once the heating load is known.',
      source,
    }
  }

  const result = input.result
  const parts = [
    `${usd(result.totalRebate)} rebate for a ${result.installYear} install`,
    `${usd(result.monthlyLoan)}/month at 0% over ${HEAT_LOAN_MONTHS} months (HEAT Loan${result.netCost > result.loanAmount ? `, on the first ${usd(result.loanAmount)}` : ''})`,
    input.incomeEligible ? 'enhanced tier: up to $16,000 or no-cost turnkey, subject to a Home Energy Assessment' : null,
    input.seasonalApplied ? 'seasonal heat-pump rate applied' : 'seasonal rate not published for this sponsor',
  ].filter(Boolean)

  return {
    id: 'programs',
    label: 'Programs',
    outcome: 'available',
    headline: `${usd(result.totalRebate)} of rebate, and a 0% loan`,
    detail: parts.join(' · '),
    source,
  }
}
