'use client'

/**
 * @built F-36 provenance drawer — click any figure, get the formula, the values and the date
 * @built F-36b the eye in the corner — the same drawer, for a figure that is not
 *   obviously clickable. A number on a summary card reads as text; an eye reads as
 *   "there is more here", which is the whole point of provenance being visible.
 * @built F-50 R14.2 keyboard path — the drawer opens with focus on its close button
 * and gives focus back to the figure it came from, because it is a native `<dialog>`
 *
 * A figure is a button with a dotted underline; the drawer is a native `<dialog>`
 * with the formula, every substituted value, and the publisher/document/date the
 * number came from (R9.1–9.2). The platform supplies what a hand-rolled overlay
 * has to remember: the modal focus trap, Escape, and focus restored to the
 * trigger. It closes on Escape, the close button, or a click outside.
 *
 * `lib/a11y/focus` owns the one piece of logic worth testing — whether to call
 * `showModal()` or `close()` — so this component never has to guess.
 */

import { useEffect, useRef, useState } from 'react'

import { dialogAction, provenanceDialogId } from '@/lib/a11y/focus'
import type { ProvenanceEntry } from '@/lib/verdict/provenance'

export function ProvenanceFigure({
  entry,
  children,
  className = '',
  corner = false,
}: {
  entry: ProvenanceEntry
  children: React.ReactNode
  className?: string
  /**
   * Render a small eye in the top-right of the nearest positioned ancestor as well
   * as the clickable figure. Both share this component's one `<dialog>`, so the
   * heading id exists once and focus goes back to whichever button opened it.
   */
  corner?: boolean
}) {
  const [open, setOpen] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const headingId = provenanceDialogId(entry.id)

  // Drive the platform dialog from state, so Escape, the close button and the
  // backdrop all end in the same place — and focus returns to the figure.
  useEffect(() => {
    const element = dialog.current
    if (!element) return
    const action = dialogAction(element.open, open)
    if (action === 'show') {
      element.showModal()
      // The dialog's content is rendered by now; put the keyboard in it.
      closeButton.current?.focus()
    } else if (action === 'close') {
      element.close()
    }
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

      {corner ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`How we calculated ${entry.label}`}
          aria-haspopup="dialog"
          title={`How we calculated ${entry.label}`}
          className="absolute right-2.5 top-2.5 rounded-full border border-rule bg-surface p-1.5 text-ink-faint transition-colors hover:border-ink hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <EyeIcon />
        </button>
      ) : null}

      <dialog
        ref={dialog}
        onClose={() => setOpen(false)}
        onClick={(event) => {
          // A click on the backdrop targets the dialog element itself.
          if (event.target === dialog.current) setOpen(false)
        }}
        aria-labelledby={headingId}
        className="provenance-dialog m-auto w-[min(26rem,calc(100vw-2rem))] rounded-card border border-rule bg-surface p-0 text-ink shadow-2xl"
      >
        {open ? (
          <div className="max-h-[min(85dvh,44rem)] overflow-y-auto p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-eyebrow uppercase text-ink-faint">Provenance</p>
                <h2 id={headingId} className="mt-1 text-small font-medium text-ink">
                  {entry.label}
                </h2>
              </div>
              <button
                ref={closeButton}
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

/** A 16px eye. Inline so the figure does not pull an icon dependency for one glyph. */
function EyeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <path d="M2.2 12s3.6-6.4 9.8-6.4S21.8 12 21.8 12s-3.6 6.4-9.8 6.4S2.2 12 2.2 12Z" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="2.6" />
    </svg>
  )
}
