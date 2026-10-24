import { FreshnessBadge } from './freshness-badge'
import { cashFlowView, type CashFlowInput } from '@/lib/verdict/cash-flow'

/**
 * @built F-37 the 0% HEAT Loan next to the monthly saving, in one block
 *
 * Two figures, one difference, one sentence. The sentence comes from
 * `lib/verdict/cash-flow.ts`, which decides the words from the engine's numbers,
 * so this component cannot render a gain over a negative difference. The loss
 * branch uses the same layout, the same type size and the same border as the
 * gain: R6.2 asks for equal weight, not a footnote.
 *
 * The colour is a second signal, never the only one: the glyph, the label and
 * the sentence all say which way it went.
 */

export interface CashFlowProps {
  input: CashFlowInput
}

/** Whole dollars, the treatment the verdict screen uses for monthly money. */
function usd(value: number): string {
  const abs = Math.abs(value).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  })
  // A monthly cost is written with a real minus sign, not `-$`, so it reads as a
  // loss at a glance and still survives a screen reader.
  return value < 0 ? `−${abs}` : abs
}

export function CashFlow({ input }: CashFlowProps) {
  const view = cashFlowView(input)
  const tone = view.tone === 'ahead' ? 'switch' : view.tone === 'level' ? 'hold' : 'deadline'
  const glyph = view.tone === 'ahead' ? '▲' : view.tone === 'level' ? '=' : '▼'
  const wording = view.tone === 'ahead' ? 'ahead' : view.tone === 'level' ? 'even' : 'behind'

  return (
    <section
      aria-labelledby="cash-flow-heading"
      data-tone={tone}
      className="rounded-card border border-rule bg-surface p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="cash-flow-heading" className="text-small font-medium">
          The 0% HEAT Loan, month by month
        </h2>
        <FreshnessBadge kind="baked" label="Mass Save · HEAT Loan" />
      </div>

      <dl className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-micro text-ink-faint">Loan payment</dt>
          <dd className="mt-1 text-title font-medium tabular-nums text-ink">{usd(input.monthlyLoan)}<span className="text-small font-normal text-ink-muted">/mo</span></dd>
          <dd className="mt-1 text-micro text-ink-muted">
            The net cost after rebate, divided by {input.months} months at {(input.apr * 100).toFixed(0)}%.
          </dd>
        </div>
        <div>
          <dt className="text-micro text-ink-faint">What you save</dt>
          <dd className="mt-1 text-title font-medium tabular-nums text-ink">
            {usd(input.monthlySavings)}<span className="text-small font-normal text-ink-muted">/mo</span>
          </dd>
          <dd className="mt-1 text-micro text-ink-muted">
            Your yearly saving at the seasonal heat-pump rate, divided by twelve.
          </dd>
        </div>
      </dl>

      <p className="mt-4 flex items-start gap-2 border-t border-rule pt-4 text-small">
        <span aria-hidden className="mt-0.5 shrink-0 text-(--tone)">
          {glyph}
        </span>
        <span>
          <span className="font-medium text-(--tone)">
            {view.label}
            <span className="sr-only"> — {wording}</span>.
          </span>{' '}
          <span className="text-ink">{view.sentence}</span>
        </span>
      </p>

      <p className="mt-3 text-micro text-ink-faint">
        Mass Save program data: a HEAT Loan runs up to $25,000 at 0% for qualified improvements. It is a loan, not a
        rebate, and the term above is the 84-month schedule, not a quote from a lender.
      </p>
    </section>
  )
}
