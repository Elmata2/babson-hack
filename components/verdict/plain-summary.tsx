/**
 * @built F-50 R14.4 — the plain summary, rendered on the server beside the dial
 *
 * This is the block a reader who stops after ten seconds actually reads: one line
 * for the answer, three short sentences with the two costs and the gap, and the
 * R15.2 disclaimer in its exact words. It is a server component over a pure
 * function, so it is in the first HTML byte — the page's plain-language layer does
 * not depend on `/api/explain`, a model, or a network at the venue.
 *
 * The longer, model-writable three-sentence panel stays where it is, below the
 * fold it belongs under. This block never renders its sentences.
 */

import type { ReactNode } from 'react'

import type { VerdictResult } from '@/lib/calc/types'
import { plainSummary } from '@/lib/verdict/plain-summary'
import { entryFor, type ProvenanceEntry } from '@/lib/verdict/provenance'

import { ProvenanceFigure } from './provenance-figure'

export function PlainSummary({
  result,
  entries,
  children,
}: {
  result: VerdictResult
  entries: readonly ProvenanceEntry[]
  children?: ReactNode
}) {
  const summary = plainSummary(result)

  return (
    <section
      aria-labelledby="in-short"
      className="mt-6 rounded-card border border-rule bg-surface p-4 sm:p-5"
    >
      <h2 id="in-short" className="text-eyebrow uppercase text-ink-muted">
        In short
      </h2>

      <p className="mt-2 max-w-[52ch] text-lede font-medium text-ink">{summary.answer}</p>

      <ul aria-label="Why" className="mt-2 grid gap-1">
        {summary.parts.map((line, index) => (
          <li key={summary.sentences[index]} className="max-w-[62ch] text-small text-ink">
            {line.map((part, at) => {
              if (typeof part === 'string') return part
              const entry = entryFor(entries, part.id)
              return entry ? (
                <ProvenanceFigure key={`${part.id}-${at}`} entry={entry}>
                  {part.text}
                </ProvenanceFigure>
              ) : (
                part.text
              )
            })}
          </li>
        ))}
      </ul>

      {children ? <div className="mt-3 grid gap-2 text-small text-ink">{children}</div> : null}

      <p className="mt-3 border-t border-rule pt-3 text-micro text-ink-muted">{summary.disclaimer}</p>
    </section>
  )
}
