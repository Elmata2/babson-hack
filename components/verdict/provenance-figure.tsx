'use client'

/**
 * @built F-36 provenance drawer — click any figure, get the formula, the values and the date
 *
 * A figure is a button with a dotted underline; the drawer is a labelled dialog
 * with the formula, every substituted value, and the publisher/document/date the
 * number came from (R9.1–9.2). It closes on Escape or a click outside, and focus
 * returns to the figure it came from.
 */

import { useEffect, useRef, useState } from 'react'

import type { ProvenanceEntry } from '@/lib/verdict/provenance'

export function ProvenanceFigure({
  entry,
  children,
  className = '',
}: {
  entry: ProvenanceEntry
  children: React.ReactNode
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    closeButton.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      trigger.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  function close() {
    setOpen(false)
    trigger.current?.focus()
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${entry.label}: show how this figure was calculated`}
        aria-haspopup="dialog"
        className={[
          'cursor-help text-left underline decoration-dotted decoration-1 underline-offset-4 hover:decoration-solid',
          className,
        ].join(' ')}
      >
        {children}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-ink/25"
          role="presentation"
          onClick={close}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`provenance-${entry.id}`}
            className="h-dvh w-full max-w-[26rem] overflow-y-auto border-l border-rule bg-surface p-5 shadow-2xl sm:p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-eyebrow uppercase text-ink-faint">Provenance</p>
                <h2 id={`provenance-${entry.id}`} className="mt-1 text-small font-medium text-ink">
                  {entry.label}
                </h2>
              </div>
              <button
                ref={closeButton}
                type="button"
                onClick={close}
                aria-label="Close provenance"
                className="rounded-card border border-rule-strong px-2.5 py-1 text-small leading-none text-ink-muted hover:border-ink hover:text-ink"
              >
                ×
              </button>
            </div>

            <p className="mt-5 text-title font-medium tabular-nums text-ink">{entry.value}</p>

            <p className="mt-5 text-eyebrow uppercase text-ink-faint">Formula</p>
            <p className="mt-1 font-mono text-micro leading-relaxed text-ink">{entry.formula}</p>

            <p className="mt-5 text-eyebrow uppercase text-ink-faint">Substituted values</p>
            <dl className="mt-1 divide-y divide-rule border-y border-rule">
              {entry.substitutes.map((substitution) => (
                <div key={`${substitution.label}-${substitution.value}`} className="flex justify-between gap-4 py-2">
                  <dt className="text-micro text-ink-muted">{substitution.label}</dt>
                  <dd className="text-micro tabular-nums text-ink">{substitution.value}</dd>
                </div>
              ))}
            </dl>

            <p className="mt-5 text-eyebrow uppercase text-ink-faint">Source</p>
            <p className="mt-1 text-small text-ink">{entry.source.publisher}</p>
            <p className="text-micro text-ink-muted">{entry.source.document}</p>
            <p className="text-micro text-ink-faint">As of {entry.source.asOf}</p>

            {entry.note ? <p className="mt-5 border-t border-rule pt-4 text-micro text-ink-muted">{entry.note}</p> : null}
          </div>
        </div>
      ) : null}
    </>
  )
}
