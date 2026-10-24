/**
 * @built F-33b the verdict leads with money — one sentence, one action, a short why
 *
 * Derived only from fields the engine already returned. Every figure in the
 * text is a `Part` carrying the provenance id it belongs to, so the page can
 * make it a button without searching the string for it.
 */

import type { VerdictResult } from '../calc/types'
import { HEAT_LOAN_APR, HEAT_LOAN_MAX_USD, HEAT_LOAN_MONTHS } from '../calc/constants'
import { cents, one, usd } from './format'
import type { FigureId } from './provenance'

export type HeadlineCase = 'save_switch' | 'save_but_wait' | 'lose_stay' | 'save_before_deadline'

export type Part = string | { id: FigureId; text: string }

export interface VerdictHeadline {
  case: HeadlineCase
  money: { annualUsd: number; monthlyUsd: number; sign: 'save' | 'lose' }
  sentence: string
  action: string
  why: string[]
  parts: { sentence: Part[]; monthly: Part[]; why: Part[][]; hedge: Part[] }
}

const fig = (id: FigureId, text: string): Part => ({ id, text })

const flat = (parts: readonly Part[]): string =>
  parts.map((part) => (typeof part === 'string' ? part : part.text)).join('')

function caseOf(result: VerdictResult, savings: number): HeadlineCase {
  if (result.verdict === 'SWITCH_NOW' && savings > 0) return 'save_switch'
  if (result.verdict === 'SWITCH_BEFORE_DEC31' && savings > 0) return 'save_before_deadline'
  return savings > 0 ? 'save_but_wait' : 'lose_stay'
}

function years(value: number): Part {
  return fig('payback', `${one(value)} years`)
}

export function cashFlowLine(result: VerdictResult): Part[] {
  return result.cashFlowPositive
    ? []
    : [
        `On the ${HEAT_LOAN_APR === 0 ? '0% ' : ''}HEAT Loan the payment (`,
        fig('monthlyLoan', `${usd(result.monthlyLoan)}/mo`),
        ') is more than you’d save (',
        fig('monthlySavings', `${usd(result.monthlySavings)}/mo`),
        `) until it’s repaid (assuming the ${HEAT_LOAN_MONTHS}-month term).`,
        ...(result.netCost > result.loanAmount
          ? [` The loan covers the first ${usd(HEAT_LOAN_MAX_USD)}; the other ${usd(result.netCost - result.loanAmount)} is paid up front.`]
          : []),
      ]
}

export function verdictHeadline(result: VerdictResult): VerdictHeadline {
  const savings = Number.isFinite(result.annualSavings) ? result.annualSavings : 0
  const kind = caseOf(result, savings)
  const annualUsd = Math.abs(savings)
  const monthlyUsd = Number.isFinite(result.monthlySavings) ? Math.abs(result.monthlySavings) : annualUsd / 12
  const payback = result.paybackYears !== null && Number.isFinite(result.paybackYears) ? result.paybackYears : null

  const annual = fig('savings', savings > 0 && Math.round(annualUsd) === 0 ? 'less than $1' : usd(annualUsd))
  const perMonth = (suffix: string): Part[] => ['about ', fig('monthlySavings', usd(monthlyUsd)), ` a month${suffix}`]

  let sentence: Part[]
  let action: string
  let monthly: Part[]

  if (savings <= 0 && Math.round(annualUsd) === 0) {
    sentence = ['Heating would cost about the same.']
    action = 'Stay with what you have.'
    monthly = []
  } else if (kind === 'lose_stay') {
    sentence = ['You’d pay ', annual, ' a year more.']
    action = 'Stay with what you have.'
    monthly = perMonth(' more')
  } else if (kind === 'save_but_wait') {
    sentence =
      payback === null
        ? ['You’d save ', annual, ' a year, but it does not pay back.']
        : ['You’d save ', annual, ' a year, but it takes ', years(payback), ' to pay back.']
    action = 'Wait.'
    monthly = perMonth('')
  } else {
    sentence = ['You’d save ', annual, ' a year on heating.']
    action = kind === 'save_before_deadline' ? 'Switch before 31 December.' : 'Switch.'
    monthly = perMonth('')
  }

  const runningCost: Part[] = [
    'Heating costs ',
    fig('oldCost', usd(result.oldAnnualCost)),
    ' a year now. The same heat from a heat pump costs ',
    fig('newCostSeasonal', usd(result.newAnnualCostHeatPumpRate)),
    ' at the seasonal rate, ',
    fig('newCostStandard', usd(result.newAnnualCostStandard)),
    ' at the standard rate.',
  ]
  const netCost: Part[] = result.rebateEligible
    ? [
        `The ${result.installYear} rebate is `,
        fig('rebate', usd(result.totalRebate)),
        ', so the net cost is ',
        fig('netCost', usd(result.netCost)),
        '.',
      ]
    : ['No rebate applies here, so the net cost is ', fig('netCost', usd(result.netCost)), '.']

  const negativeCashFlow = cashFlowLine(result)

  let why: Part[][]
  if (kind === 'save_before_deadline') {
    why = [
      [
        'The rebate drops by ',
        fig('cliff', usd(result.cliffCost)),
        ' on 1 January, from ',
        fig('rebate2026', usd(result.rebate2026)),
        ' to ',
        fig('rebate2027', usd(result.rebate2027)),
        '.',
      ],
      runningCost,
      negativeCashFlow.length ? negativeCashFlow : netCost,
    ]
  } else if (kind === 'save_switch') {
    why = [
      runningCost,
      netCost,
      result.netCost <= 0
        ? ['The rebate covers the whole install, so it pays for itself immediately.']
        : negativeCashFlow.length
          ? negativeCashFlow
          : payback === null
            ? []
            : ['That pays back in ', years(payback), '.'],
    ]
  } else if (kind === 'save_but_wait') {
    why = [
      runningCost,
      netCost,
      [
        payback === null
          ? 'Savings do not cover the net cost, so we say wait until prices or rebates change.'
          : 'Payback runs past the limit we use, so we say wait until prices or rebates change.',
      ],
    ]
  } else {
    why = [
      runningCost,
      result.breakEvenElectricPrice === null
        ? ['Neither rate saves money on this house.']
        : [
            'A heat pump only wins if electricity costs less than ',
            fig('breakEven', cents(result.breakEvenElectricPrice)),
            ' per kWh.',
          ],
      ['After the rebate it would still cost ', fig('netCost', usd(result.netCost)), ' to install.'],
    ]
  }
  const hedge: Part[] =
    savings > 0 && result.annualSavingsAtStandardRate > 0
      ? [
          'At the standard rate you’d save ',
          fig('savingsStandard', usd(result.annualSavingsAtStandardRate)),
          ' a year.',
        ]
      : []
  why = why.filter((line) => line.length > 0)

  return {
    case: kind,
    money: { annualUsd, monthlyUsd, sign: savings > 0 ? 'save' : 'lose' },
    sentence: flat(sentence),
    action,
    why: why.map(flat),
    parts: { sentence, monthly, why, hedge },
  }
}
