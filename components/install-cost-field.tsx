'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { FreshnessBadge } from './freshness-badge'
import { DEFAULT_INSTALL_COST_USD, HEAT_LOAN_MONTHS } from '@/lib/calc/constants'
import { plausibleInstallCost, withInstallCost } from '@/lib/intake/params'

/**
 * @built F-153 the install cost is editable, and says where the number came from
 *
 * R7.2: the default is the Mass Save average of $22,000, badged as program data,
 * and the household can overwrite it with their own contractor quote. The value
 * travels in the URL (`ic`), so the verdict recomputes on the client navigation
 * without a page reload and "Change the numbers" carries the quote back to the
 * form. Clearing the field restores the badged average rather than guessing.
 */

export interface InstallCostFieldProps {
  /** The number the verdict actually used, USD. */
  value: number
  /** True when the household supplied it instead of the program average. */
  fromQuote: boolean
  /** The verdict's own query string, so nothing else is lost on the round trip. */
  query: string
  /** Why a cost in the link was ignored, when it was outside the accepted band. */
  rejected?: string | null
}

export function InstallCostField({ value, fromQuote, query, rejected = null }: InstallCostFieldProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [draft, setDraft] = useState(String(value))

  const parsed = plausibleInstallCost(draft)
  const invalid = draft.trim() !== '' && parsed === null
  const changed = parsed !== null && parsed !== value

  function go(value: number) {
    const next = withInstallCost(query, value)
    startTransition(() => {
      router.replace(`/verdict?${next}`, { scroll: false })
    })
  }

  function apply(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (parsed === null) return
    go(parsed)
  }

  function reset() {
    setDraft(String(DEFAULT_INSTALL_COST_USD))
    go(DEFAULT_INSTALL_COST_USD)
  }

  return (
    <form onSubmit={apply} className="grid gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <label htmlFor="install-cost" className="text-small font-medium">
          Installed cost, before rebate
        </label>
        {fromQuote ? (
          <FreshnessBadge kind="manual" label="Your quote" />
        ) : (
          <FreshnessBadge kind="baked" label="Mass Save · program average" />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span aria-hidden className="text-small text-ink-muted">
          $
        </span>
        <input
          id="install-cost"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          inputMode="numeric"
          autoComplete="off"
          aria-describedby="install-cost-hint"
          aria-invalid={invalid}
          className="w-32 rounded-card border border-rule-strong bg-surface px-3 py-2 text-small tabular-nums"
        />
        <button
          type="submit"
          disabled={!changed || pending}
          className="rounded-pill border border-rule-strong bg-surface px-3.5 py-1.5 text-small text-ink-muted transition-colors hover:border-ink hover:text-ink disabled:opacity-40"
        >
          {pending ? 'Recalculating…' : 'Use this'}
        </button>
        {fromQuote ? (
          <button
            type="button"
            onClick={reset}
            className="text-micro text-ink-muted underline decoration-rule-strong underline-offset-4 hover:text-ink"
          >
            Back to the {`$${DEFAULT_INSTALL_COST_USD.toLocaleString('en-US')}`} average
          </button>
        ) : null}
      </div>

      <p id="install-cost-hint" className="text-micro text-ink-muted">
        {rejected && !invalid ? (
          <span className="text-deadline">{rejected}</span>
        ) : invalid ? (
          <span className="text-deadline">
            Enter a dollar figure between $1,000 and $250,000 — a slipped zero would change the payback, not the house.
          </span>
        ) : (
          <>
            The Mass Save average for a whole-home install is $
            {DEFAULT_INSTALL_COST_USD.toLocaleString('en-US')}, on installs completed in 2022. Your contractor quote
            replaces it and is the only number that applies to this house. The loan below, when it applies, assumes{' '}
            {HEAT_LOAN_MONTHS} months at 0%.
          </>
        )}
      </p>
    </form>
  )
}
