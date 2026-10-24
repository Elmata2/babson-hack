/**
 * @built F-38 assumptions strip + disclaimer, always visible
 *
 * R9.3 says assumptions are rendered, not hidden in a tooltip. So the defaults
 * that moved this answer — AFUE, SCOP, install cost, tier, degree days — are
 * chips on the screen before any fold, with their reasoning one disclosure away.
 * The disclaimer is not inside a disclosure at all.
 */

import type { VerdictResult } from '@/lib/calc/types'

export function AssumptionsStrip({ result }: { result: VerdictResult }) {
  return (
    <section
      aria-labelledby="assumptions-heading"
      className="mt-4 rounded-card border border-rule bg-paper-sunk p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="assumptions-heading" className="text-eyebrow uppercase text-ink-muted">
          The defaults behind this answer
        </h2>
        <p className="text-micro text-ink-faint">Shown, not buried. Each one is editable by changing the numbers.</p>
      </div>

      <ul className="mt-3 flex flex-wrap gap-1.5">
        {result.assumptions.map((assumption) => (
          <li
            key={`${assumption.field}-${assumption.value}`}
            className="rounded-pill border border-rule bg-surface px-2.5 py-1 text-micro"
          >
            <span className="text-ink-faint">{assumption.field}</span>{' '}
            <span className="tabular-nums text-ink">{assumption.value}</span>
          </li>
        ))}
      </ul>

      {result.assumptions.length > 0 ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-micro text-ink-muted">Why each default was used</summary>
          <dl className="mt-2 grid gap-2">
            {result.assumptions.map((assumption) => (
              <div key={`${assumption.field}-${assumption.value}-why`}>
                <dt className="text-micro text-ink-faint">
                  {assumption.field} · {assumption.value}
                </dt>
                <dd className="text-micro text-ink-muted">{assumption.reason}</dd>
              </div>
            ))}
          </dl>
        </details>
      ) : null}

      <p className="mt-3 border-t border-rule pt-3 text-micro text-ink-muted">
        <span className="font-medium text-ink">Estimate, not a quote.</span> A Home Energy Assessment determines
        eligibility, sizing and the final price. Nothing on this page is a promise, and no rebate is paid until the
        programme approves it.
      </p>
    </section>
  )
}
