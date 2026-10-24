'use client'

/**
 * @built F-33 number flip — the old annual cost turns over into the heat-pump cost in 900ms
 *
 * The screen states two costs, so it shows the move between them rather than a
 * static pair: old fuel cost, then the heat pump's, with the label changing under
 * it. `prefers-reduced-motion` skips the whole thing and renders the destination
 * immediately — the information is never animation-only.
 */

import { useEffect, useState } from 'react'

type Phase = 'from' | 'out' | 'to'

/** Milliseconds on the old value, then the flip, then the new value. Sums to 900. */
const OUT_AT_MS = 560
const DONE_AT_MS = 900

export function NumberFlip({
  from,
  to,
  fromLabel,
  toLabel,
  className = '',
}: {
  from: string
  to: string
  fromLabel: string
  toLabel: string
  className?: string
}) {
  const [phase, setPhase] = useState<Phase>('from')

  useEffect(() => {
    // Reduced motion: land on the destination, but from a callback rather than
    // synchronously in the effect body (a synchronous setState cascades renders).
    if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const immediate = window.setTimeout(() => setPhase('to'), 0)
      return () => window.clearTimeout(immediate)
    }
    const out = window.setTimeout(() => setPhase('out'), OUT_AT_MS)
    const done = window.setTimeout(() => setPhase('to'), DONE_AT_MS)
    return () => {
      window.clearTimeout(out)
      window.clearTimeout(done)
    }
  }, [])

  const showingFrom = phase !== 'to'
  const animation = phase === 'out' ? 'flip-out' : phase === 'to' ? 'flip-in' : ''

  return (
    <div className={`[perspective:900px] ${className}`}>
      <p
        key={phase}
        aria-live="polite"
        aria-atomic="true"
        className={`num text-number font-medium tabular-nums tracking-[-0.03em] text-ink ${animation}`}
      >
        {showingFrom ? from : to}
      </p>
      <p className="mt-1 max-w-[30ch] text-small text-ink-muted" aria-hidden="true">
        {showingFrom ? fromLabel : toLabel}
      </p>
    </div>
  )
}
