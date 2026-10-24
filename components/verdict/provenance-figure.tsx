'use client'

/**
 * @built F-36 provenance drawer — click any figure, get the formula, the values and the date
 *
 * A figure is a button with a dotted underline; the drawer is a native `<dialog>`
 * with the formula, every substituted value, and the publisher/document/date the
 * number came from (R9.1–9.2). The platform supplies what a hand-rolled overlay
 * has to remember: modal focus trap, Escape, and focus restored to the trigger.
 * It closes on Escape, the close button, or a click outside.
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
  const dialog = useRef<HTMLDialogElement>(null)

  // Drive the platform dialog from state, so Escape, the close button and the
  // backdrop all end in the same place — and focus returns to the figure.
  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (open && !element.open) element.showModal()
    else if (!open && element.open) element.close()
  }, [open])

  return (
    <>
      <button
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

      <dialog
        ref={dialog}
        onClose={() => setOpen(false)}
        onClick={(event) => {
          // A click on the backdrop targets the dialog element itself.
          if (event.target === dialog.current) setOpen(false)
        }}
        aria-labelledby={`provenance-${entry.id}`}
        className="provenance-dialog m-auto w-[min(26rem,calc(100vw-2rem))] rounded-card border border-rule bg-surface p-0 text-ink shadow-2xl"
      >
        {open ? (
          <div className="max-h-[min(85dvh,44rem)] overflow-y-auto p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-eyebrow uppercase text-ink-faint">Provenance</p>
                <h2 id={`provenance-${entry.id}`} className="mt-1 text-small font-medium text-ink">
                  {entry.label}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
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
        ) : null}
      </dialog>
    </>
  )
}
