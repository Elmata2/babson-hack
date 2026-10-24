'use client'

/**
 * @built F-36 provenance drawer UI — every printed figure is a button; the drawer
 * shows the formula, the values substituted into it, and the dated source
 *
 * R9 is a promise about the screen, not about a module: if a number is visible it
 * must open its own arithmetic. So the trigger is the number itself, not a link
 * beside it, and the drawer is a native `<dialog>` — modal focus, Escape, and
 * focus restoration come from the platform instead of a hand-rolled key handler.
 *
 * The entries are built on the server by `lib/verdict/provenance`. This file only
 * presents them, which keeps the rule that the drawer cannot invent a fact: there
 * is no arithmetic below.
 */

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import type { FigureId, ProvenanceEntry } from '@/lib/verdict/provenance'

const OpenFigure = createContext<(id: FigureId) => void>(() => {})

export interface ProvenanceProviderProps {
  entries: readonly ProvenanceEntry[]
  children: ReactNode
}

/**
 * Holds which figure is open and renders the one drawer.
 * Input: the entries for this verdict plus the page. Output: the page unchanged,
 * with every `Figure` below it wired to the drawer.
 */
export function ProvenanceProvider({ entries, children }: ProvenanceProviderProps) {
  const [openId, setOpenId] = useState<FigureId | null>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const entry = openId === null ? null : (entries.find((candidate) => candidate.id === openId) ?? null)

  const open = useCallback((id: FigureId) => setOpenId(id), [])
  const close = useCallback(() => setOpenId(null), [])

  // Drive the native dialog from state, so Escape and the close button converge
  // on the same path and the trigger keeps its focus.
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (entry && !dialog.open) dialog.showModal()
    else if (entry === null && dialog.open) dialog.close()
  }, [entry])

  return (
    <OpenFigure.Provider value={open}>
      {children}

      <dialog
        ref={dialogRef}
        onClose={close}
        onClick={(event) => {
          // A click on the backdrop targets the dialog element itself.
          if (event.target === dialogRef.current) close()
        }}
        aria-labelledby="provenance-value"
        className="provenance-dialog w-[min(34rem,calc(100vw-2rem))] rounded-card border border-rule-strong bg-surface p-0 text-ink shadow-2xl"
      >
        {entry ? (
          <article className="max-h-[min(85dvh,44rem)] overflow-y-auto p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-eyebrow uppercase text-ink-faint">{entry.label}</p>
                <p id="provenance-value" className="mt-1 text-title font-medium tabular-nums">
                  {entry.value}
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                className="rounded-card border border-rule px-2.5 py-1.5 text-micro text-ink-muted transition-colors hover:border-rule-strong hover:text-ink"
              >
                Close
              </button>
            </div>

            <section className="mt-5 border-t border-rule pt-4">
              <h2 className="text-eyebrow uppercase text-ink-faint">The formula</h2>
              <p className="mt-2 font-mono text-micro leading-relaxed text-ink">{entry.formula}</p>

              <dl className="mt-4 divide-y divide-rule border-y border-rule">
                {entry.substitutes.map((substitution) => (
                  <div
                    key={`${substitution.label}-${substitution.value}`}
                    className="grid grid-cols-[1fr_auto] gap-4 py-2"
                  >
                    <dt className="text-micro text-ink-muted">{substitution.label}</dt>
                    <dd className="text-micro tabular-nums text-ink">{substitution.value}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section className="mt-4 border-t border-rule pt-4">
              <h2 className="text-eyebrow uppercase text-ink-faint">The source</h2>
              <p className="mt-2 text-small font-medium">{entry.source.publisher}</p>
              <p className="mt-0.5 text-micro text-ink-muted">{entry.source.document}</p>
              <p className="mt-1 text-micro tabular-nums text-ink-faint">As of {entry.source.asOf}</p>
            </section>

            {entry.note ? (
              <p className="mt-4 border-t border-rule pt-4 text-micro leading-relaxed text-ink-muted">{entry.note}</p>
            ) : null}
          </article>
        ) : null}
      </dialog>
    </OpenFigure.Provider>
  )
}

export interface FigureProps {
  id: FigureId
  children: ReactNode
  className?: string
}

/**
 * One displayed number, clickable.
 * Input: a figure id that exists in the provider's entries. Output: the same text
 * as a button. Guarantee: an unknown id is a compile error, and the drawer it
 * opens is the entry for that id — never a different figure's arithmetic.
 */
export function Figure({ id, children, className = '' }: FigureProps) {
  const open = useContext(OpenFigure)

  return (
    <button
      type="button"
      onClick={() => open(id)}
      title="Show the formula, the numbers and the source"
      aria-haspopup="dialog"
      className={`cursor-pointer rounded-sm font-[inherit] text-[inherit] leading-[inherit] tracking-[inherit] underline decoration-rule-strong decoration-dotted underline-offset-4 transition-colors hover:decoration-ink ${className}`}
    >
      {children}
    </button>
  )
}
