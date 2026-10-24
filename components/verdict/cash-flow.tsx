/**
 * @built F-37 cash-flow module — the 0% HEAT Loan payment next to the monthly saving
 *
 * R7.3 wants the two monthly numbers side by side, with a sentence either way.
 * A household can be cash-flow negative and still right to switch, so the module
 * never hides that case: it says how many months you are short, at the same
 * visual weight as the case where you are ahead (R6.2).
 */

import type { VerdictResult } from '@/lib/calc/types'
import { one, usd } from '@/lib/verdict/format'
import { loanSentence, loanView } from '@/lib/verdict/money'
import type { ProvenanceEntry } from '@/lib/verdict/provenance'

import { ProvenanceFigure } from './provenance-figure'

export function CashFlow({
  result,
  noMassSave,
  loanEntry = null,
  savingsEntry = null,
}: {
  result: VerdictResult
  noMassSave: boolean
  loanEntry?: ProvenanceEntry | null
  savingsEntry?: ProvenanceEntry | null
}) {
  const loan = loanView(result)
  if (noMassSave || loan === null) return null
  const monthlySavings = Math.abs(result.monthlySavings)
  const scale = Math.max(result.monthlyLoan, monthlySavings, 1)
  const loanWidth = Math.max(2, (result.monthlyLoan / scale) * 100)
  const savingsWidth = Math.max(2, (monthlySavings / scale) * 100)
  const ahead = result.cashFlowPositive

  return (
    <section className="mt-4 rounded-card border border-rule bg-surface p-5 sm:p-6" aria-labelledby="cash-flow-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="cash-flow-heading" className="text-title font-medium">
          Month to month, on the 0% HEAT Loan
        </h2>
      </div>
      <p className="mt-1 max-w-[62ch] text-small text-ink-muted">{loanSentence()}</p>
      {loan.remainder > 0 ? (
        <p className="mt-1 max-w-[62ch] text-small text-ink-muted">
          Your net cost is {usd(result.netCost)}, so the loan covers {usd(loan.amount)} and {usd(loan.remainder)} is
          paid up front.
        </p>
      ) : null}

        <>
          <dl className="mt-5 grid gap-4">
            <Bar
              label="Loan payment"
              value={`${usd(result.monthlyLoan)}/mo`}
              entry={loanEntry}
              width={loanWidth}
              tone="ink"
            />
            <Bar
              label={result.monthlySavings >= 0 ? 'Saved on energy' : 'Extra energy cost'}
              value={`${usd(monthlySavings)}/mo`}
              entry={savingsEntry}
              width={savingsWidth}
              tone={result.monthlySavings >= 0 ? 'gain' : 'loss'}
            />
          </dl>

          <p className="mt-5 border-t border-rule pt-4 text-small text-ink">
            {ahead ? (
              <>
                The loan is <span className="tabular-nums">{usd(result.monthlyLoan)}</span> a month and the heat pump
                saves <span className="tabular-nums">{usd(result.monthlySavings)}</span>, so you are{' '}
                <span className="tabular-nums">{usd(result.monthlyCashFlow)}</span> a month ahead
                from the first payment{loan.remainder > 0 ? `, after the ${usd(loan.remainder)} you pay up front` : ''}.
              </>
            ) : (
              <>
                The loan is <span className="tabular-nums">{usd(result.monthlyLoan)}</span> a month; the energy bill is{' '}
                <span className="tabular-nums">{usd(monthlySavings)}</span> a month{' '}
                {result.monthlySavings >= 0 ? 'saved' : 'higher'}, so you are{' '}
                <span className="tabular-nums">{usd(Math.abs(result.monthlyCashFlow))}</span>{' '}
                a month out of pocket until the loan is repaid
                {result.paybackYears === null ? '.' : `, and the payback is ${one(result.paybackYears)} years.`}
              </>
            )}
          </p>
          <p className="mt-2 text-micro text-ink-muted">
            Simple arithmetic: no discount rate, no inflation, no maintenance. The loan is a programme rate, not an
            offer from a lender.
          </p>
        </>
    </section>
  )
}

function Bar({
  label,
  value,
  width,
  tone,
  entry,
}: {
  label: string
  value: string
  entry: ProvenanceEntry | null
  width: number
  tone: 'ink' | 'gain' | 'loss'
}) {
  const colour =
    tone === 'gain' ? 'bg-[var(--color-switch)]' : tone === 'loss' ? 'bg-[var(--color-loss)]' : 'bg-ink'
  return (
    <div className="grid gap-1.5 sm:grid-cols-[10rem_1fr_7rem] sm:items-center sm:gap-3">
      <dt className="text-micro text-ink-muted">{label}</dt>
      <dd className="order-last sm:order-none">
        <span className="block h-2.5 w-full overflow-hidden rounded-pill bg-paper-sunk" aria-hidden>
          <span className={`block h-full rounded-pill ${colour}`} style={{ width: `${width}%` }} />
        </span>
      </dd>
      <dd className="text-small tabular-nums text-ink sm:text-right">{entry ? <ProvenanceFigure entry={entry}>{value}</ProvenanceFigure> : value}</dd>
    </div>
  )
}
